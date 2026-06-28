// POST /api/public/class-portal/students/[id]/issue-registration-letter
//
// Mints a fresh AURA-REG-YYYY-NNNN reference number for the student and
// snapshots the fee figures into ClassPortalRegistrationLetter so the
// same number can be looked up and reproduced later. The client (which
// already has the fee summary) generates the PDF itself using jsPDF.
//
// Sequence: NNNN is the count of letters issued in the current SY +
// 1, zero-padded to 4 digits. YYYY is the SY's starting year (i.e.
// SY 2026-2027 → 2026). Uniqueness is also enforced by the DB constraint.
//
// Auth: requires class-portal JWT and ADMIN or FRONTDESK role. Branch-
// scoped front desk is restricted to students in their branch.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../../_cors'

const MISC_CENTAVOS = 500_000 // ₱5,000.00 per year

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

function currentSchoolYearRange(now: Date): { start: Date; end: Date; startYear: number } {
  const ph = new Date(now.getTime() + 8 * 60 * 60_000)
  const y = ph.getUTCFullYear()
  const m = ph.getUTCMonth()
  const startYear = m >= 5 ? y : y - 1
  return {
    start: new Date(Date.UTC(startYear, 5, 1, 0, 0, 0)),
    end:   new Date(Date.UTC(startYear + 1, 4, 31, 23, 59, 59)),
    startYear,
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (auth.role !== 'ADMIN' && auth.role !== 'FRONTDESK' && auth.role !== 'BRANCH_ADMIN') {
      return withCors(NextResponse.json({ error: 'Only admin, branch admin, or front desk can issue a registration letter.' }, { status: 403 }), origin)
    }
    const { id } = await params
    const student = await prisma.classPortalUser.findUnique({
      where: { id },
      select: { id: true, role: true, branch: true, firstName: true, lastName: true, email: true },
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

    // Compute current annual tuition exactly the same way fee-summary does.
    const sy = currentSchoolYearRange(new Date())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma.classPortalFrontDeskPayment as any).findMany({
      where: {
        studentId: id,
        status: { in: ['PENDING', 'CONVERTED'] },
        createdAt: { gte: sy.start, lte: sy.end },
      },
      select: { tuitionCentavos: true },
    })
    let annualTuitionCentavos = 0
    for (const r of rows) annualTuitionCentavos += r.tuitionCentavos as number
    const annualMiscCentavos = MISC_CENTAVOS
    const annualTotalCentavos = annualTuitionCentavos + annualMiscCentavos

    // Count letters issued in this SY to compute the next sequence
    // number. We retry up to 3 times on unique-constraint collision in
    // case two staff hit the button simultaneously.
    let row: { id: string; referenceNumber: string; issuedAt: Date } | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const issuedThisYear = await (prisma as any).classPortalRegistrationLetter.count({
        where: { issuedAt: { gte: sy.start, lte: sy.end } },
      })
      const seq = String(issuedThisYear + 1 + attempt).padStart(4, '0')
      const referenceNumber = `AURA-REG-${sy.startYear}-${seq}`
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        row = await (prisma as any).classPortalRegistrationLetter.create({
          data: {
            referenceNumber,
            studentId: id,
            issuedBy: auth.email,
            annualTuitionCentavos,
            annualMiscCentavos,
            annualTotalCentavos,
          },
          select: { id: true, referenceNumber: true, issuedAt: true },
        })
        break
      } catch (e) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = e as { code?: string }
        if (err.code === 'P2002') continue
        throw e
      }
    }
    if (!row) {
      return withCors(NextResponse.json({ error: 'Could not assign a unique reference number. Please retry.' }, { status: 500 }), origin)
    }

    return withCors(NextResponse.json({
      letter: {
        id: row.id,
        referenceNumber: row.referenceNumber,
        issuedAt: row.issuedAt.toISOString(),
        issuedBy: auth.email,
        annualTuitionCentavos,
        annualMiscCentavos,
        annualTotalCentavos,
      },
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[issue-registration-letter POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
