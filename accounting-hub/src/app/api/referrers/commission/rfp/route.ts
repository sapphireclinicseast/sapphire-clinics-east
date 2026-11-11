import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { commissionFloor, computeDoctorCommissions } from '@/lib/referral-commission'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH' }
// Fallback when no expense account is configured in the payout settings —
// referral commissions are a patient-acquisition cost.
const DEFAULT_COMMISSION_ACCOUNT = '8120 Marketing and Advertising Expense'

// POST { branch, upTo } → one EXPENSE RFP per EXTERNAL commissioned referrer
// (outside doctor, law firm, partner school) covering their unclaimed sessions
// (or, for per-patient referrers, newly referred patients) from the scheme start through `upTo`. External referrers are not staff, so
// payroll can't pay them — instead each one gets an audited one-time expense
// entry (so the P&L books the cost, under the account chosen in the payout
// settings) wrapped in a standard RFP (so payment, cheques and bank rec all
// work), payable to the referrer. The sessions are stamped in the claim
// ledger against the RFP, so they can never pay again — not here, not in
// payroll. Deleting the RFP (expenses/rfp DELETE) removes its auto-entry and
// releases the sessions for the next run.
// (First built 2026-10-07, rolled back the next day on Hannah's call;
// reinstated 2026-10-16 on her call, widened to law firms/schools with the
// expense account configurable.)
// What each external referrer is owed right now (Hannah 2026-11-11: tick who to
// pay and pay less than the full amount if needed — the rest stays as their
// balance for the next run). owed = unpaid sessions/patients × rate (earned)
// + the balance carried from earlier commission RFPs (Σ earned − Σ paid over
// that referrer's commission RFPs; deleting an RFP releases its sessions and
// its share of the balance).
interface Payable {
  referrerId: string; referrer: string; basis: string; rate: number | null
  units: number; sessions: Awaited<ReturnType<typeof computeDoctorCommissions>>[number]['sessions']
  earned: number; carry: number; owed: number
}
const round2 = (n: number) => Math.round(n * 100) / 100

async function carriedBalances(): Promise<Map<string, number>> {
  const rfps = await prisma.reimbursementReport.findMany({
    where: { module: 'EXPENSE', meta: { path: ['source'], equals: 'REFERRAL_COMMISSION' } },
    select: { grossTotal: true, meta: true },
  })
  const out = new Map<string, number>()
  for (const r of rfps) {
    const m = (r.meta || {}) as { referrerId?: string; earned?: number }
    if (!m.referrerId) continue
    const paid = Number(r.grossTotal)
    // RFPs made before partial payouts paid exactly what they earned.
    const earned = typeof m.earned === 'number' ? m.earned : paid
    out.set(m.referrerId, round2((out.get(m.referrerId) || 0) + earned - paid))
  }
  return out
}

async function payables(to: Date): Promise<Payable[]> {
  const [rows, carry] = await Promise.all([
    computeDoctorCommissions(prisma, { from: commissionFloor(), to, onlyUnclaimed: true }),
    carriedBalances(),
  ])
  const out = new Map<string, Payable>()
  for (const r of rows) {
    if (r.isInhouse || r.rate == null || r.rate <= 0 || !r.sessions.length) continue
    const earned = round2(r.sessions.length * r.rate)
    out.set(r.referrerId, { referrerId: r.referrerId, referrer: r.name, basis: r.basis, rate: r.rate, units: r.sessions.length, sessions: r.sessions, earned, carry: 0, owed: earned })
  }
  // A referrer with only a balance left (no new sessions) still gets a row.
  const carryOnly = [...carry.entries()].filter(([id, bal]) => Math.abs(bal) >= 0.005 && !out.has(id)).map(([id]) => id)
  const names = carryOnly.length ? await prisma.referrer.findMany({ where: { id: { in: carryOnly } }, select: { id: true, name: true, commissionBasis: true, commissionPerSession: true } }) : []
  for (const n of names) {
    out.set(n.id, { referrerId: n.id, referrer: n.name, basis: n.commissionBasis === 'PATIENT' ? 'PATIENT' : 'SESSION', rate: n.commissionPerSession != null ? Number(n.commissionPerSession) : null, units: 0, sessions: [], earned: 0, carry: 0, owed: 0 })
  }
  for (const p of out.values()) {
    p.carry = carry.get(p.referrerId) || 0
    p.owed = round2(p.earned + p.carry)
  }
  return [...out.values()].filter(p => p.owed > 0.005).sort((a, b) => b.owed - a.owed || a.referrer.localeCompare(b.referrer))
}

// GET ?upTo=YYYY-MM-DD → what each external referrer is owed (nothing written).
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const upTo = new URL(req.url).searchParams.get('upTo')
  const to = upTo ? new Date(`${upTo}T23:59:59.999+08:00`) : new Date()
  if (isNaN(to.getTime())) return NextResponse.json({ error: 'upTo must be YYYY-MM-DD' }, { status: 400 })
  const list = await payables(to)
  return NextResponse.json({
    preview: list.map(p => ({ referrerId: p.referrerId, referrer: p.referrer, basis: p.basis, units: p.units, rate: p.rate, earned: p.earned, carry: p.carry, owed: p.owed, amount: p.owed })),
  })
}

// POST { branch, upTo, items?: [{ referrerId, pay }] } → one EXPENSE RFP per
// ticked external referrer, for `pay` (default: everything owed). All their
// unpaid sessions are stamped against the RFP; whatever isn't paid now stays
// as their balance for the next run.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, upTo, items } = await req.json()
    if (!BRANCH_CODE[branch]) return NextResponse.json({ error: 'branch must be SANDBOX_EAST or SANDBOX_GREENHILLS (the branch disbursing the payout)' }, { status: 400 })
    const to = upTo ? new Date(`${upTo}T23:59:59.999+08:00`) : new Date()
    if (isNaN(to.getTime())) return NextResponse.json({ error: 'upTo must be YYYY-MM-DD' }, { status: 400 })

    const [list, incentive] = await Promise.all([
      payables(to),
      prisma.referralIncentiveSettings.findUnique({ where: { id: 'MAIN' } }),
    ])
    const account = incentive?.commissionExpenseAccount?.trim() || DEFAULT_COMMISSION_ACCOUNT
    const picked = Array.isArray(items) ? (items as { referrerId?: string; pay?: unknown }[]) : null
    const plan: { p: Payable; pay: number }[] = []
    for (const p of list) {
      if (!picked) { plan.push({ p, pay: p.owed }); continue }
      const it = picked.find(i => i.referrerId === p.referrerId)
      if (!it) continue
      const pay = round2(Number(it.pay))
      if (!Number.isFinite(pay) || pay <= 0) return NextResponse.json({ error: `Enter an amount above ₱0 for ${p.referrer}` }, { status: 400 })
      if (pay > p.owed + 0.005) return NextResponse.json({ error: `${p.referrer} is owed ₱${p.owed.toLocaleString('en-PH', { minimumFractionDigits: 2 })} — pay that or less` }, { status: 400 })
      plan.push({ p, pay })
    }
    if (!plan.length) return NextResponse.json({ created: [], note: 'Nothing ticked, or nothing owed to the ticked referrers in that window.' })

    const yy = new Date().getFullYear() % 100
    const created: { referrer: string; refNumber: string; sessions: number; basis: string; amount: number; balanceAfter: number }[] = []

    for (const { p: ref, pay } of plan) {
      const rate = ref.rate || 0
      const perPatient = ref.basis === 'PATIENT'
      const unit = perPatient ? 'patient' : 'session'
      const total = pay
      const balanceAfter = round2(ref.owed - pay)
      const upToLabel = to.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
      const what = [
        ref.units ? `${ref.units} ${unit}${ref.units === 1 ? '' : 's'} × ₱${rate.toLocaleString('en-PH')} (through ${upToLabel})` : '',
        Math.abs(ref.carry) >= 0.005 ? `${ref.carry > 0 ? 'balance' : 'credit'} from earlier ₱${Math.abs(ref.carry).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '',
      ].filter(Boolean).join(' + ')
      const description = `Referral commission — ${what}${balanceAfter >= 0.005 ? `; paying ₱${pay.toLocaleString('en-PH', { minimumFractionDigits: 2 })} now, ₱${balanceAfter.toLocaleString('en-PH', { minimumFractionDigits: 2 })} left as balance` : ''}`

      const refNumber = await prisma.$transaction(async (tx) => {
        let settings = await tx.pettyCashSettings.findUnique({ where: { branch } })
        if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch, nextPcvSeq: 1 } })

        // Expense entry numbering: same continuous-per-branch rule as the grid.
        const maxAgg = await tx.pettyCashEntry.aggregate({ where: { branch }, _max: { pcvSeq: true } })
        const pcvSeq = (maxAgg._max.pcvSeq || 0) + 1
        const entry = await tx.pettyCashEntry.create({
          data: {
            branch,
            recordType: 'ONE_TIME',
            pcvNumber: `${BRANCH_CODE[branch]}-PCV${yy}-${String(pcvSeq).padStart(6, '0')}`,
            pcvSeq,
            pcvSub: 1,
            date: new Date(),
            requestor: ref.referrer,
            description,
            accountTitle: account,
            vatable: 'Non-VAT',
            validity: 'Valid',
            audited: true,
            grossAmount: total,
            createdById: session.user.id ?? null,
          },
        })

        // RFP on the shared per-branch running number, exactly like the grid's
        // Generate RFP (payableTo = the referrer; one member entry).
        const seq = Math.max(settings.nextReimbSeq, 1)
        await tx.pettyCashSettings.update({ where: { branch }, data: { nextPcvSeq: Math.max(settings.nextPcvSeq, pcvSeq + 1), nextReimbSeq: seq + 1 } })
        const refNo = `${BRANCH_CODE[branch]}-RFP${yy}-${String(seq).padStart(6, '0')}-VAL`
        const rfp = await tx.reimbursementReport.create({
          data: {
            branch, refNumber: refNo, refSeq: seq, grossTotal: total, kind: 'VALID', module: 'EXPENSE',
            payableTo: ref.referrer,
            // earned = what this RFP's sessions are worth; grossTotal = what it pays.
            // Σ earned − Σ paid over a referrer's commission RFPs is their balance.
            meta: { source: 'REFERRAL_COMMISSION', referrerId: ref.referrerId, basis: ref.basis, sessions: ref.sessions.length, rate, upTo: upTo || null, account, earned: ref.earned, carryIn: ref.carry, balanceAfter },
            createdById: session.user.id ?? null,
          },
        })
        await tx.pettyCashEntry.update({ where: { id: entry.id }, data: { reimbursementId: rfp.id } })

        // Stamp every paid session against this RFP — a session another payout
        // or payroll already claimed stays theirs (unique per order).
        if (ref.sessions.length) await tx.referralCommissionItem.createMany({
          data: ref.sessions.map(s => perPatient
            ? { kind: 'PATIENT', patientKey: s.patientKey, referrerId: ref.referrerId, amount: rate, cutoffPeriod: `RFP:${refNo}`, rfpId: rfp.id }
            : { kind: 'DOCTOR', orderId: s.orderId, referrerId: ref.referrerId, amount: rate, cutoffPeriod: `RFP:${refNo}`, rfpId: rfp.id }),
          skipDuplicates: true,
        })
        return refNo
      })
      created.push({ referrer: ref.referrer, refNumber, sessions: ref.sessions.length, basis: ref.basis, amount: total, balanceAfter })
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'referral-commission-rfp',
        details: { branch, upTo: upTo || null, account, created },
      },
    })

    return NextResponse.json({ created })
  } catch (e) {
    console.error('Commission RFP payout error:', e)
    return NextResponse.json({ error: 'Failed to generate commission RFPs' }, { status: 500 })
  }
}
