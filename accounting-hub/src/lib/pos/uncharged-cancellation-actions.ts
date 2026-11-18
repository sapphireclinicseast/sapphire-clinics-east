// What front desk can do with a flagged (uncharged) cancellation
// (lib/pos/uncharged-cancellations):
//
//   chargeAbsenceToGl  — put the fee on the patient's guarantee letter, dated on
//                        the booking, like the 11/18 retroactive billing. If no
//                        letter has room, the fee is parked for the next one.
//   waiveAbsence       — forgive it (admins/accountants, with a reason).
//   recordAbsenceFees  — after New Payment rang the fee into a sale, tie that
//                        order to the booking so it can never be flagged again.
//
// Every outcome is one ParkedGlCharge row per booking (scheduleId is unique),
// so a booking is charged, parked or waived at most once — even with two
// cashiers clicking at the same moment.
import { prisma as defaultPrisma } from '@/lib/prisma'
import { POST as createPosOrder } from '@/app/api/pos/orders/route'
import { cancelFeeMarker } from '@/lib/pos/retro-cancellation'
import { letterPatientName } from '@/lib/pos/parked-gl-charges'
import { loadFeeBearingAbsences, type FlaggedAbsence } from '@/lib/pos/uncharged-cancellations'

type Db = typeof defaultPrisma

const todayLong = () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })

/** The booking, re-read from the schedule — never trusted from the browser. */
async function findAbsence(db: Db, patientId: string, scheduleId: string): Promise<FlaggedAbsence | null> {
  const rows = await loadFeeBearingAbsences(db, { patientId, since: '2000-01-01' })
  return rows.find(r => r.scheduleId === scheduleId) ?? null
}

const recordData = (a: FlaggedAbsence) => ({
  patientId: a.patientId,
  patientName: a.patientName,
  branch: a.branch,
  scheduleId: a.scheduleId,
  eventDate: new Date(`${a.date}T00:00:00Z`),
  eventType: a.status,
  detail: a.detail,
  department: a.department,
  therapistName: a.therapist || null,
  serviceId: a.feeServiceId!,
  feeName: a.feeName,
  amount: a.amount,
})

export type ChargeOutcome =
  | { ok: true; outcome: 'CHARGED'; orderNumber: number; letter: string }
  | { ok: true; outcome: 'PARKED'; reason: string }
  | { ok: false; error: string; status: number }

export async function chargeAbsenceToGl(db: Db, patientId: string, scheduleId: string, walletId: string | null, userId: string | null): Promise<ChargeOutcome> {
  const a = await findAbsence(db, patientId, scheduleId)
  if (!a) return { ok: false, status: 404, error: 'That booking has no fee owed on it.' }
  if (a.state !== 'UNCHARGED') return { ok: false, status: 409, error: `This fee is already ${a.state.toLowerCase()}.` }
  if (!a.feeServiceId || a.amount <= 0) return { ok: false, status: 400, error: `No active ${a.feeName} service for ${a.department}.` }
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) return { ok: false, status: 500, error: 'NEXTAUTH_SECRET not set' }

  // Which letter: the one picked, else the one in use at the booking, else the
  // patient's next application with room.
  const letters = await db.digitalWallet.findMany({
    where: { patientId, walletType: 'GL', isActive: true, usedUpAt: null },
    select: { id: true, patientName: true, balance: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const fits = (w: { balance: unknown }) => Number(w.balance) + 0.005 >= a.amount
  let letter = walletId ? letters.find(w => w.id === walletId) : undefined
  if (walletId && (!letter || !fits(letter))) return { ok: false, status: 400, error: 'That letter is closed or has too little left for this fee.' }
  let movedOn = false
  if (!letter) {
    letter = a.gl ? letters.find(w => w.id === a.gl!.walletId && fits(w)) : undefined
    if (!letter) {
      letter = letters.find(w => w.id !== a.gl?.walletId && fits(w))
      movedOn = !!letter && !!a.gl
    }
  }

  if (!letter) {
    const reason = a.gl ? 'letter used up or too little left' : 'no guarantee letter on file'
    try {
      await db.parkedGlCharge.create({ data: { ...recordData(a), status: 'PARKED', reason, sourceWalletId: a.gl?.walletId ?? null, createdById: userId } })
    } catch {
      return { ok: false, status: 409, error: 'This booking was just charged, parked or waived by someone else.' }
    }
    return { ok: true, outcome: 'PARKED', reason }
  }

  // Claim the booking first (scheduleId is unique), then make the order.
  let claimId: string
  try {
    claimId = (await db.parkedGlCharge.create({ data: { ...recordData(a), status: 'CHARGING', sourceWalletId: a.gl?.walletId ?? null, createdById: userId } })).id
  } catch {
    return { ok: false, status: 409, error: 'This booking was just charged, parked or waived by someone else.' }
  }
  const notes = `${cancelFeeMarker(a.date)} — ${a.detail}; charged from the uncharged-cancellations list on ${todayLong()}.`
    + (movedOn ? ` Charged to this letter because ${a.gl!.letter} had no balance left.` : '')
  const body = {
    orderType: 'SERVICE', branch: a.branch, patientId, patientName: letterPatientName(letter.patientName), clinicianName: null,
    transactionDate: a.date,
    items: [{ serviceId: a.feeServiceId, name: a.feeName, quantity: 1, unitPrice: a.amount, lineTotal: a.amount }],
    payments: [{ method: 'GL', amount: a.amount, walletId: letter.id }],
    revenueType: 'EARNED', notes,
  }
  let created: { id?: string; orderNumber?: number; error?: string } = {}
  let status = 0
  try {
    const res = await createPosOrder(new Request('http://internal/api/pos/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret }, body: JSON.stringify(body),
    }))
    status = res.status
    created = await res.json().catch(() => ({}))
  } catch (e) {
    created = { error: e instanceof Error ? e.message : String(e) }
  }
  if (status !== 201 || !created.id) {
    await db.parkedGlCharge.delete({ where: { id: claimId } }).catch(() => {})
    return { ok: false, status: 400, error: `Could not charge the letter: ${created.error || status}` }
  }
  await db.parkedGlCharge.update({
    where: { id: claimId },
    data: { status: 'CHARGED', orderId: created.id, chargedWalletId: letter.id, chargedAt: new Date(), chargedById: userId },
  })
  return { ok: true, outcome: 'CHARGED', orderNumber: created.orderNumber ?? 0, letter: letter.patientName }
}

export async function waiveAbsence(db: Db, patientId: string, scheduleId: string, reason: string, userId: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const existing = await db.parkedGlCharge.findUnique({ where: { scheduleId } })
  if (existing) {
    if (existing.status !== 'PARKED') return { ok: false, status: 409, error: `This fee is already ${existing.status.toLowerCase()}.` }
    await db.parkedGlCharge.update({ where: { id: existing.id }, data: { status: 'WAIVED', waivedAt: new Date(), waivedById: userId, waiveReason: reason } })
    return { ok: true }
  }
  const a = await findAbsence(db, patientId, scheduleId)
  if (!a) return { ok: false, status: 404, error: 'That booking has no fee owed on it.' }
  if (a.state !== 'UNCHARGED') return { ok: false, status: 409, error: `This fee is already ${a.state.toLowerCase()}.` }
  try {
    await db.parkedGlCharge.create({
      data: { ...recordData(a), serviceId: a.feeServiceId ?? '', status: 'WAIVED', waivedAt: new Date(), waivedById: userId, waiveReason: reason, createdById: userId },
    })
  } catch {
    return { ok: false, status: 409, error: 'This booking was just charged, parked or waived by someone else.' }
  }
  return { ok: true }
}

/** After New Payment: the fee lines on `orderId` settle these bookings. */
export async function recordAbsenceFees(db: Db, orderId: string, scheduleIds: string[], userId: string | null): Promise<{ recorded: number }> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, patientId: true, status: true } })
  if (!order?.patientId || order.status === 'VOIDED' || !scheduleIds.length) return { recorded: 0 }
  const rows = await loadFeeBearingAbsences(db, { patientId: order.patientId, since: '2000-01-01' })
  let recorded = 0
  for (const a of rows.filter(r => scheduleIds.includes(r.scheduleId) && r.feeServiceId)) {
    try {
      await db.parkedGlCharge.create({
        data: { ...recordData(a), status: 'CHARGED', orderId, chargedAt: new Date(), chargedById: userId, createdById: userId, reason: 'Rung up at New Payment' },
      })
      recorded++
    } catch { /* already has a record — charged, parked or waived */ }
  }
  return { recorded }
}
