// POST /api/public/class-portal/frontdesk-payments — refused: payments are
// recorded only at the Accounting Hub POS (see POST below).
//
// GET /api/public/class-portal/frontdesk-payments
//
// Lets the class portal admin/student see what's still pending vs.
// converted (for the payment-history banner). Admin sees everything;
// students see only their own.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../_cors'

const CLASS_HUB_READ_ONLY = 'Tuition payments are recorded at the Accounting Hub POS. Class Hub shows them once the front desk records the sale.'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

function jsonError(origin: string | null, e: unknown): NextResponse {
  if (e instanceof Response) {
    const headers = new Headers(e.headers)
    for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
    return new NextResponse(e.body, { status: e.status, headers })
  }
  return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
}

// Tuition is recorded only at the Accounting Hub POS (Hannah, 2026-10-31):
// Class Hub shows what the POS recorded and creates no payment rows of its
// own. Parents pay online through PayMongo or at the front desk / by bank
// transfer, and the cashier records it — the accounting hub then writes the
// row through /api/internal/class-portal/frontdesk-payments.
export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    await requireAuth(req)
    return withCors(NextResponse.json({ error: CLASS_HUB_READ_ONLY }, { status: 409 }), origin)
  } catch (e) { return jsonError(origin, e) }
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}
    if (auth.role === 'STUDENT') where.studentId = auth.userId
    if (auth.role === 'FRONTDESK' || auth.role === 'BRANCH_ADMIN') {
      if (auth.branch) where.branch = auth.branch
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma.classPortalFrontDeskPayment as any).findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payments = rows.map((r: any) => ({
      id: r.id,
      classPortalPaymentId: r.classPortalPaymentId,
      studentId: r.studentId,
      studentEmail: r.studentEmail,
      studentName: r.studentName,
      branch: r.branch,
      plan: r.plan,
      tuitionCentavos: r.tuitionCentavos,
      miscCentavos: r.miscCentavos,
      period: r.period,
      method: r.method ?? null,
      methodDetail: r.methodDetail ?? null,
      status: r.status,
      notes: r.notes ?? null,
      isPartialPayment: Boolean(r.isPartialPayment),
      createdAt: r.createdAt.toISOString(),
      convertedAt: r.convertedAt?.toISOString() ?? null,
    }))
    return withCors(NextResponse.json({ payments }), origin)
  } catch (e) { return jsonError(origin, e) }
}
