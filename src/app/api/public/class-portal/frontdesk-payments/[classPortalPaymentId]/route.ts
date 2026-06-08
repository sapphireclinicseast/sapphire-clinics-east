// PATCH /api/public/class-portal/frontdesk-payments/[classPortalPaymentId]
//
// Class-portal JWT gated companion to the internal accounting-hub PATCH at
// /api/internal/class-portal/frontdesk-payments/[id]. Lets the FRONTDESK,
// BRANCH_ADMIN, or ADMIN user flip a bank-deposit / cash payment from
// PENDING → CONVERTED right from their portal (no accounting hub needed).
// Branch admins and front desk are scoped to their own branch; main admin
// can confirm any branch.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ classPortalPaymentId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (auth.role !== 'FRONTDESK' && auth.role !== 'BRANCH_ADMIN' && auth.role !== 'ADMIN') {
      return withCors(NextResponse.json({ error: 'Only front desk, branch admin, or main admin can confirm payments.' }, { status: 403 }), origin)
    }
    const { classPortalPaymentId } = await params
    if (!classPortalPaymentId) {
      return withCors(NextResponse.json({ error: 'classPortalPaymentId required.' }, { status: 400 }), origin)
    }
    const body = await req.json().catch(() => ({})) as { status?: 'PENDING' | 'CONVERTED'; notes?: string }
    const status: 'PENDING' | 'CONVERTED' = body.status === 'PENDING' ? 'PENDING' : 'CONVERTED'

    // Branch scoping for non-main-admin roles.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma.classPortalFrontDeskPayment as any).findUnique({ where: { classPortalPaymentId } })
    if (!existing) {
      return withCors(NextResponse.json({ error: 'classPortalPaymentId not found.' }, { status: 404 }), origin)
    }
    if ((auth.role === 'FRONTDESK' || auth.role === 'BRANCH_ADMIN') && auth.branch && existing.branch !== auth.branch) {
      return withCors(NextResponse.json({ error: 'You can only confirm payments for your own branch.' }, { status: 403 }), origin)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma.classPortalFrontDeskPayment as any).update({
      where: { classPortalPaymentId },
      data: {
        status,
        convertedAt: status === 'CONVERTED' ? new Date() : null,
        notes: body.notes ?? undefined,
      },
    })
    return withCors(NextResponse.json({
      payment: {
        id: updated.id,
        classPortalPaymentId: updated.classPortalPaymentId,
        status: updated.status,
        convertedAt: updated.convertedAt?.toISOString() ?? null,
      },
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[public/frontdesk-payments PATCH]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

// DELETE — main-admin-only hard delete of a payment row. PENDING rows
// are typically test entries the admin wants gone. CONVERTED rows
// already have an associated accounting-hub Order — deleting here does
// NOT void that Order, so the admin should also void it in the
// accounting hub when needed. The client surfaces this warning in the
// confirm dialog before the request is sent.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ classPortalPaymentId: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (auth.role !== 'ADMIN') {
      return withCors(NextResponse.json({ error: 'Only the main admin can delete a payment row.' }, { status: 403 }), origin)
    }
    const { classPortalPaymentId } = await params
    if (!classPortalPaymentId) {
      return withCors(NextResponse.json({ error: 'classPortalPaymentId required.' }, { status: 400 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma.classPortalFrontDeskPayment as any).findUnique({ where: { classPortalPaymentId } })
    if (!existing) {
      return withCors(NextResponse.json({ error: 'classPortalPaymentId not found.' }, { status: 404 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalFrontDeskPayment as any).delete({ where: { classPortalPaymentId } })
    return withCors(NextResponse.json({ ok: true, deletedStatus: existing.status }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[public/frontdesk-payments DELETE]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
