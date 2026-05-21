// PATCH /api/internal/class-portal/frontdesk-payments/[classPortalPaymentId]
//
// Called by the accounting hub via the shared EXTERNAL_API_KEY when a
// cashier converts a class-portal tuition queue item to an Order. Marks
// the row CONVERTED so the student's class-portal payment record flips
// from PENDING to PAID on next hydrate.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY || ''

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ classPortalPaymentId: string }> }) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { classPortalPaymentId } = await params
  if (!classPortalPaymentId) {
    return NextResponse.json({ error: 'classPortalPaymentId required' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({})) as {
    status?: 'PENDING' | 'CONVERTED' | 'VOIDED'
    notes?: string
  }
  // PENDING is used by the accounting hub when an order is voided/reopened —
  // the cashier item should re-appear in the queue and the student portal
  // should flip back from PAID to PENDING.
  const status: 'PENDING' | 'CONVERTED' | 'VOIDED' =
    body.status === 'VOIDED'  ? 'VOIDED'
    : body.status === 'PENDING' ? 'PENDING'
    : 'CONVERTED'

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma.classPortalFrontDeskPayment as any).update({
      where: { classPortalPaymentId },
      data: {
        status,
        // Only CONVERTED carries a real timestamp; VOIDED and PENDING clear it.
        convertedAt: status === 'CONVERTED' ? new Date() : null,
        notes: body.notes ?? undefined,
      },
    })
    return NextResponse.json({
      payment: {
        id: updated.id,
        classPortalPaymentId: updated.classPortalPaymentId,
        status: updated.status,
        convertedAt: updated.convertedAt?.toISOString() ?? null,
      },
    })
  } catch (e) {
    const msg = (e as Error).message
    if (msg.includes('Record to update not found')) {
      return NextResponse.json({ error: 'classPortalPaymentId not found' }, { status: 404 })
    }
    console.error('[internal/frontdesk-payments] PATCH error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
