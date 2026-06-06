import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY || ''

// Authenticated — returns full patient names for POS / Accounting Hub
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch')?.toUpperCase()   // SBEA | SBGH
  const date   = searchParams.get('date')                    // YYYY-MM-DD
  const statusFilter = searchParams.get('status')?.toUpperCase()

  if (!branch) return NextResponse.json({ error: 'branch required' }, { status: 400 })

  const dateStr = date ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`)
  const dayEnd   = new Date(`${dateStr}T23:59:59.999Z`)

  const schedules = await prisma.schedule.findMany({
    where: {
      date: { gte: dayStart, lte: dayEnd },
      staff: { branch },
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: {
      staff:   { select: { firstName: true, lastName: true, department: true, branch: true } },
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { startTime: 'asc' },
  })

  const items = schedules.map(s => ({
    id:          s.id,
    startTime:   s.startTime,
    endTime:     s.endTime,
    sessionType: s.sessionType,
    status:      s.status,
    department:  s.staff.department,
    branch:      s.staff.branch,
    clinician:   `${s.staff.lastName}, ${s.staff.firstName}`,
    patientId:   s.patient?.id ?? null,
    patientName: s.patient
      ? `${s.patient.firstName} ${s.patient.lastName}`
      : '—',
  }))

  // ── Class portal "Pay at front desk" notifications ─────────────
  // Parents on /pay → cash → "Notify front desk" land in ClassPortalFrontDeskPayment.
  // Surface PENDING rows for the matching branch as virtual queue items so the
  // existing accounting hub Cashier ("Services > Cashier") picks them up
  // without any accounting-hub code changes.
  //
  //   SBEA branch in schedules == EAST in ClassPortalBranch
  //   SBGH branch in schedules == GREENHILLS
  //
  // Class portal payments don't have an appointment date — we show every
  // PENDING tuition row regardless of the date filter so the cashier can
  // settle it whenever the parent shows up.
  const classBranch = branch === 'SBEA' ? 'EAST' : branch === 'SBGH' ? 'GREENHILLS' : null
  let tuitionItems: typeof items = []
  if (classBranch) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pending = await (prisma.classPortalFrontDeskPayment as any).findMany({
        where: { branch: classBranch, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      })
      const peso = (cents: number) => (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

      // Pre-resolve a Patient.id for each pending row by matching on email
      // (the same dedupe key the class-portal sync uses). With patientId
      // populated, the cashier's "Convert to Order" pre-fills patient
      // details from the CRM record instead of treating the tuition item
      // as a walk-in. Group lookups by unique email to avoid N+1.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const emails = Array.from(new Set(pending.map((p: any) => (p.studentEmail || '').toLowerCase()).filter(Boolean)))
      const patients = emails.length
        ? await prisma.patient.findMany({
            where: { email: { in: emails as string[] } },
            select: { id: true, email: true },
          })
        : []
      const patientIdByEmail = new Map(patients.map(p => [(p.email ?? '').toLowerCase(), p.id]))

      // Method tag so the cashier knows *not* to collect cash for a
      // PayMongo row — the parent already paid through the gateway, the
      // cashier just needs to Convert to Order so the receipt + ledger
      // are correct. Bank-deposit rows still need the cashier to sight
      // the deposit slip. Empty for cash so the existing UX is unchanged.
      const methodTag = (m: string | null | undefined): string => {
        if (m === 'PAYMONGO') return '[PayMongo · pre-paid] '
        if (m === 'BANK_DEPOSIT') return '[Bank deposit] '
        return ''
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tuitionItems = pending.map((p: any) => {
        const total = (p.tuitionCentavos ?? 0) + (p.miscCentavos ?? 0)
        const email = (p.studentEmail ?? '').toLowerCase()
        return {
          // Prefix the id so the accounting hub can recognize tuition-from-class-portal
          // items if it ever wants to wire a callback to mark them CONVERTED.
          id:          `clsp_${p.classPortalPaymentId}`,
          startTime:   '',
          endTime:     '',
          sessionType: `${methodTag(p.method)}Tuition (${p.plan}) ₱${peso(total)} — ${p.period}`,
          status:      'CONFIRMED',
          department:  'CLASS_PORTAL',
          branch,
          clinician:   '— (class portal)',
          patientId:   patientIdByEmail.get(email) ?? null,
          patientName: p.studentName,
        }
      })
    } catch (e) {
      // Don't take down the whole queue if the class-portal table is missing
      // (e.g. before the migration ran on a particular environment).
      console.warn('[queue/external] class-portal tuition payments unavailable:', e)
    }
  }

  // ── Patient bookings awaiting cashier conversion ─────────────────
  // Patients book sessions via client.sapphireclinicseast.org and pay the
  // downpayment through PayMongo. When the webhook flips the booking to
  // PAID, surface it in the cashier appointment queue as a virtual item
  // (id prefix `pbk_`). The cashier converts → existing POS order flow
  // auto-creates a downpayment DigitalWallet on the accounting side; the
  // marketing hub itself never creates a wallet.
  //
  // Filter:
  //   - PAID only (PENDING patients haven't paid; COMPLETED are done)
  //   - not yet accountingRecorded (the order POST handler in accounting-hub
  //     flips this back via /api/decking/bookings/:id/mark-accounted-external
  //     once the booking is converted, so the row drops off the queue)
  //   - the booking's APPOINTMENT date matches the cashier's selected date.
  //     Previously this block ignored the date filter, so a booking for a
  //     future appointment (e.g. May 25) appeared in the cashier on every
  //     day until converted. Patients arrive on their appointment date, so
  //     the downpayment should only surface in the queue for that day.
  let bookingItems: typeof items = []
  try {
    const paidBookings = await prisma.patientBooking.findMany({
      where: {
        branch,
        status: 'PAID',
        accountingRecorded: false,
        date: { gte: dayStart, lte: dayEnd },
      },
      include: {
        staff:   { select: { firstName: true, lastName: true, department: true } },
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { paidAt: 'asc' },
    })
    const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    bookingItems = paidBookings.map(b => {
      const dp = b.downpayment ? Number(b.downpayment) : 0
      const dateLabel = b.date.toISOString().slice(0, 10)
      return {
        id:          `pbk_${b.id}`,
        startTime:   b.startTime,
        endTime:     b.endTime,
        sessionType: `Booking ${dateLabel} ${b.startTime} — Downpayment ₱${peso(dp)}`,
        // Emit CONFIRMED so the accounting-hub queue route (which filters
        // schedules by status=CONFIRMED) lets these pass through unchanged.
        status:      'CONFIRMED',
        department:  b.department,
        branch,
        clinician:   `${b.staff.lastName}, ${b.staff.firstName}`,
        patientId:   b.patient?.id ?? null,
        patientName: b.patient ? `${b.patient.firstName} ${b.patient.lastName}` : '—',
      }
    })
  } catch (e) {
    console.warn('[queue/external] patient bookings unavailable:', e)
  }

  return NextResponse.json({ date: dateStr, branch, items: [...tuitionItems, ...bookingItems, ...items] })
}
