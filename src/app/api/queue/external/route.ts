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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tuitionItems = pending.map((p: any) => {
        const total = (p.tuitionCentavos ?? 0) + (p.miscCentavos ?? 0)
        return {
          // Prefix the id so the accounting hub can recognize tuition-from-class-portal
          // items if it ever wants to wire a callback to mark them CONVERTED.
          id:          `clsp_${p.classPortalPaymentId}`,
          startTime:   '',
          endTime:     '',
          sessionType: `Tuition (${p.plan}) ₱${peso(total)} — ${p.period}`,
          status:      'CONFIRMED',
          department:  'CLASS_PORTAL',
          branch,
          clinician:   '— (class portal)',
          patientId:   null,
          patientName: p.studentName,
        }
      })
    } catch (e) {
      // Don't take down the whole queue if the class-portal table is missing
      // (e.g. before the migration ran on a particular environment).
      console.warn('[queue/external] class-portal tuition payments unavailable:', e)
    }
  }

  return NextResponse.json({ date: dateStr, branch, items: [...tuitionItems, ...items] })
}
