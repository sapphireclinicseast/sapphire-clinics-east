// GET /api/public/class-portal/students/[id]/personal-vouchers
//
// Returns every ClassPortalVoucher issued to this student
// (dedicatedStudentId = id). The student can call this to see their
// own personal codes; admin / branch-admin / front-desk (branch-
// scoped) can call it for any student they're allowed to see.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    const { id } = await params
    // STUDENT may only list their own vouchers.
    if (auth.role === 'STUDENT' && auth.userId !== id) {
      return withCors(NextResponse.json({ error: 'You can only view your own vouchers.' }, { status: 403 }), origin)
    }
    // For staff roles: enforce branch scope on non-main-admins.
    if (auth.role === 'FRONTDESK' || auth.role === 'BRANCH_ADMIN') {
      const student = await prisma.classPortalUser.findUnique({ where: { id }, select: { branch: true } })
      if (student && auth.branch && student.branch && student.branch !== auth.branch) {
        return withCors(NextResponse.json({ error: 'Out of branch scope.' }, { status: 403 }), origin)
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).classPortalVoucher.findMany({
      where: { dedicatedStudentId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, code: true, discountPercent: true, validUntil: true,
        enabled: true, dedicatedStudentId: true, createdAt: true, updatedBy: true,
      },
    })
    return withCors(NextResponse.json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vouchers: rows.map((r: any) => ({
        id: r.id,
        code: r.code,
        discountPercent: r.discountPercent,
        validUntil: r.validUntil.toISOString(),
        enabled: r.enabled,
        dedicatedStudentId: r.dedicatedStudentId,
        issuedAt: r.createdAt.toISOString(),
        issuedBy: r.updatedBy ?? null,
      })),
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[personal-vouchers GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
