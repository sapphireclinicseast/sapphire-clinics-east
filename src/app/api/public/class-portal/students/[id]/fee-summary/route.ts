// GET /api/public/class-portal/students/[id]/fee-summary
//
// Returns the annualized tuition + misc breakdown for a student so the
// registration-letter and fee-schedule PDFs can be generated client-
// side. Tuition is the SUM of `tuitionCentavos` across every CONVERTED-
// or-PENDING ClassPortalFrontDeskPayment row in the current school year
// — i.e. exactly what the front desk has recorded, including any
// overrides they made via the per-row Edit modal. Voided rows are
// skipped.
//
// Auth: requires class-portal JWT and ADMIN or FRONTDESK role. Branch-
// scoped front desk is restricted to students in their branch.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../../_cors'

const MISC_CENTAVOS = 500_000 // ₱5,000.00 per year, hardcoded for now

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

// Current school year window in Asia/Manila. SY starts Jun 1, ends May 31.
// If today is Jan-May we're in the second half of the SY that started last
// year; otherwise we're in the first half of the SY that started this year.
function currentSchoolYearRange(now: Date): { start: Date; end: Date; label: string } {
  const ph = new Date(now.getTime() + 8 * 60 * 60_000)
  const y = ph.getUTCFullYear()
  const m = ph.getUTCMonth()
  const startYear = m >= 5 ? y : y - 1
  return {
    start: new Date(Date.UTC(startYear, 5, 1, 0, 0, 0)),   // Jun 1 startYear
    end:   new Date(Date.UTC(startYear + 1, 4, 31, 23, 59, 59)), // May 31 startYear+1
    label: `${startYear}–${startYear + 1}`,
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (auth.role !== 'ADMIN' && auth.role !== 'FRONTDESK' && auth.role !== 'BRANCH_ADMIN') {
      return withCors(NextResponse.json({ error: 'Only admin, branch admin, or front desk can pull a fee summary.' }, { status: 403 }), origin)
    }
    const { id } = await params
    const student = await prisma.classPortalUser.findUnique({
      where: { id },
      select: { id: true, role: true, email: true, firstName: true, lastName: true, level: true, branch: true, enrollment: true, disabledAt: true },
    })
    if (!student) {
      return withCors(NextResponse.json({ error: 'Student not found.' }, { status: 404 }), origin)
    }
    if (student.role !== 'STUDENT') {
      return withCors(NextResponse.json({ error: 'Target user is not a student.' }, { status: 400 }), origin)
    }
    if ((auth.role === 'FRONTDESK' || auth.role === 'BRANCH_ADMIN') && auth.branch && student.branch && student.branch !== auth.branch) {
      return withCors(NextResponse.json({ error: 'Out of branch scope.' }, { status: 403 }), origin)
    }

    const sy = currentSchoolYearRange(new Date())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma.classPortalFrontDeskPayment as any).findMany({
      where: {
        studentId: id,
        status: { in: ['PENDING', 'CONVERTED'] },
        createdAt: { gte: sy.start, lte: sy.end },
      },
      select: { tuitionCentavos: true, miscCentavos: true, plan: true, period: true, status: true, createdAt: true, convertedAt: true },
      orderBy: { createdAt: 'asc' },
    })

    // Sum tuition. Front-desk-edit overrides are already baked into
    // `tuitionCentavos` because the PATCH endpoint writes there directly.
    let annualTuitionCentavos = 0
    for (const r of rows) annualTuitionCentavos += r.tuitionCentavos as number

    // Plan = most recent row's plan, falling back to "ANNUAL" if no
    // rows yet (newly enrolled students will see 0 tuition until staff
    // records the first payment, which is the intended behaviour —
    // the letter shouldn't lie about a fee they haven't been billed for).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plan = (rows.length > 0 ? (rows[rows.length - 1] as any).plan : 'ANNUAL') as string
    const annualMiscCentavos = MISC_CENTAVOS
    const annualTotalCentavos = annualTuitionCentavos + annualMiscCentavos

    return withCors(NextResponse.json({
      student: {
        id: student.id,
        email: student.email,
        firstName: student.firstName,
        lastName: student.lastName,
        fullName: [student.firstName, student.lastName].filter(Boolean).join(' ') || student.email,
        level: student.level,
        branch: student.branch,
      },
      schoolYear: sy.label,
      plan,
      annualTuitionCentavos,
      annualMiscCentavos,
      annualTotalCentavos,
      paymentRowCount: rows.length,
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[fee-summary GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
