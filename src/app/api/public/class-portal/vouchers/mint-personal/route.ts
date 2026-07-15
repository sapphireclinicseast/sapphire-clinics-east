// POST /api/public/class-portal/vouchers/mint-personal
//
// Admin / branch-admin / front-desk (branch-scoped) mints a
// personalized voucher for one specific student. Powers the "issue
// early-bird voucher" workflow — after the public AURA30 code
// expired, students who availed of the 30% early-bird promo before
// the deadline still need to be able to keep discounting their
// remaining monthly / bi-annual installments through the rest of
// the school year. This endpoint drops a fresh unique code with
// `dedicatedStudentId` set so only that one student can redeem it.
//
// Body: { studentId, discountPercent?=30, validUntil?=end-of-SY }
// Response: { voucher: { id, code, discountPercent, validUntil,
//   dedicatedStudentId, enabled, createdAt } }

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

// Chosen so codes stay easy to read/type but are still hard to guess
// (36^6 ≈ 2 billion possibilities). Excludes 0/O/1/I to reduce misreads.
const RAND_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function randCode(): string {
  let out = ''
  for (let i = 0; i < 6; i += 1) out += RAND_ALPHABET[Math.floor(Math.random() * RAND_ALPHABET.length)]
  return out
}

// End of the current school year, in PH time. SY runs Jun 1 – May 31,
// so if today is Jun-Dec we're in SY YYYY-(YYYY+1); if Jan-May we're
// in SY (YYYY-1)-YYYY. Default expiry = May 31 of the SY-end year at
// 23:59:59 PH time.
function defaultValidUntil(now: Date): Date {
  const ph = new Date(now.getTime() + 8 * 60 * 60_000)
  const y = ph.getUTCFullYear()
  const m = ph.getUTCMonth()
  const endYear = m >= 5 ? y + 1 : y
  return new Date(Date.UTC(endYear, 4, 31, 15, 59, 59)) // May 31 23:59 PH = 15:59 UTC
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (auth.role !== 'ADMIN' && auth.role !== 'BRANCH_ADMIN' && auth.role !== 'FRONTDESK') {
      return withCors(NextResponse.json({ error: 'Only admin / branch admin / front desk can mint personal vouchers.' }, { status: 403 }), origin)
    }
    const body = await req.json().catch(() => ({})) as {
      studentId?: string
      discountPercent?: number
      validUntil?: string
    }
    if (!body.studentId) {
      return withCors(NextResponse.json({ error: 'studentId is required.' }, { status: 400 }), origin)
    }
    const discountPercent = Math.max(0, Math.min(100, Math.round(Number(body.discountPercent ?? 30))))
    if (!Number.isFinite(discountPercent)) {
      return withCors(NextResponse.json({ error: 'discountPercent must be a number 0–100.' }, { status: 400 }), origin)
    }

    const student = await prisma.classPortalUser.findUnique({
      where: { id: body.studentId },
      select: { id: true, role: true, branch: true, firstName: true, lastName: true, disabledAt: true },
    })
    if (!student) {
      return withCors(NextResponse.json({ error: 'Student not found.' }, { status: 404 }), origin)
    }
    if (student.role !== 'STUDENT') {
      return withCors(NextResponse.json({ error: 'Target user is not a student.' }, { status: 400 }), origin)
    }
    if (student.disabledAt) {
      return withCors(NextResponse.json({ error: 'Cannot issue a voucher to a disabled account.' }, { status: 400 }), origin)
    }
    if ((auth.role === 'FRONTDESK' || auth.role === 'BRANCH_ADMIN') && auth.branch && student.branch && student.branch !== auth.branch) {
      return withCors(NextResponse.json({ error: 'Out of branch scope.' }, { status: 403 }), origin)
    }

    const validUntil = body.validUntil ? new Date(body.validUntil) : defaultValidUntil(new Date())
    if (!Number.isFinite(validUntil.getTime())) {
      return withCors(NextResponse.json({ error: 'validUntil is not a valid date.' }, { status: 400 }), origin)
    }

    // Build a stable prefix that hints at who the voucher is for
    // (e.g. "AURA30-SETH-A4K7Q9"). If the discount isn't 30% we drop
    // the AURA30 prefix — the "AURA30" reads as the 30% early-bird
    // brand, using it for other percentages would mislead.
    const brandPrefix = discountPercent === 30 ? 'AURA30' : `AURA${discountPercent}`
    const nameSlug = (student.firstName ?? student.lastName ?? '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 6) || 'STU'

    // Retry on unique-constraint collision (astronomically rare but cheap).
    let row: { id: string; code: string; discountPercent: number; validUntil: Date; enabled: boolean; dedicatedStudentId: string | null; createdAt: Date } | null = null
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = `${brandPrefix}-${nameSlug}-${randCode()}`
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        row = await (prisma as any).classPortalVoucher.create({
          data: {
            code,
            discountPercent,
            validUntil,
            enabled: true,
            dedicatedStudentId: student.id,
            updatedBy: auth.email,
          },
          select: {
            id: true, code: true, discountPercent: true, validUntil: true,
            enabled: true, dedicatedStudentId: true, createdAt: true,
          },
        })
        break
      } catch (e) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((e as any)?.code === 'P2002') continue
        throw e
      }
    }
    if (!row) {
      return withCors(NextResponse.json({ error: 'Could not assign a unique code. Please retry.' }, { status: 500 }), origin)
    }

    return withCors(NextResponse.json({
      voucher: {
        id: row.id,
        code: row.code,
        discountPercent: row.discountPercent,
        validUntil: row.validUntil.toISOString(),
        enabled: row.enabled,
        dedicatedStudentId: row.dedicatedStudentId,
        createdAt: row.createdAt.toISOString(),
      },
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[mint-personal-voucher POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
