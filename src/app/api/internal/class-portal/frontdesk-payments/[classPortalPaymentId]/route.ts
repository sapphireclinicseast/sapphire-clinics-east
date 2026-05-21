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
    status?: 'CONVERTED' | 'VOIDED'
    notes?: string
  }
  const status = body.status === 'VOIDED' ? 'VOIDED' : 'CONVERTED'

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma.classPortalFrontDeskPayment as any).update({
      where: { classPortalPaymentId },
      data: {
        status,
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
