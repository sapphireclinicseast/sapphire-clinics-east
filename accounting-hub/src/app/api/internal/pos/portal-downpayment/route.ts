// POST /api/internal/pos/portal-downpayment
//
// Called by the operations hub when front desk clicks "Recorded in Accounting
// Hub" for a non-teletherapy portal booking. Creates a POS SERVICE order so
// the downpayment appears in the cashier without requiring a separate queue
// conversion step.
//
// Auth: Authorization: Bearer EXTERNAL_API_KEY (shared inter-hub key).
//
// Body: {
//   patientName:       string           — full name for the order
//   branch:            string           — accounting hub Branch enum key
//   department:        string           — ops hub department string
//   downpaymentAmount: number           — amount paid via PayMongo
//   transactionDate:   string           — YYYY-MM-DD (from booking.paidAt)
//   referenceNumber?:  string           — ops hub booking ID (for tracing)
// }
//
// Returns: { ok: true, orderId, orderNumber }

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { postOrderJournal } from '@/lib/accounting/post-order'

const DEPT_LABELS: Record<string, string> = {
  OCCUPATIONAL_THERAPY:     'Occupational Therapy',
  SPEECH_LANGUAGE_PATHOLOGY: 'Speech-Language Pathology',
  PHYSICAL_THERAPY:         'Physical Therapy',
  BEHAVIORAL_THERAPY:       'Behavioral Therapy',
  EDUCATIONAL_THERAPY:      'Educational Therapy',
  SPECIAL_EDUCATION:        'Special Education',
  PSYCH:                    'Psychology',
}

function verifyKey(req: NextRequest): boolean {
  const key = process.env.EXTERNAL_API_KEY
  if (!key) return false
  return req.headers.get('authorization') === `Bearer ${key}`
}

export async function POST(req: NextRequest) {
  if (!verifyKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    patientName?: string
    branch?: string
    department?: string
    downpaymentAmount?: number
    transactionDate?: string
    referenceNumber?: string
  }
  try { body = await req.json() } catch { body = {} }

  const { patientName, branch, department, downpaymentAmount, transactionDate, referenceNumber } = body

  if (!branch || !downpaymentAmount || !transactionDate) {
    return NextResponse.json(
      { error: 'branch, downpaymentAmount, and transactionDate are required' },
      { status: 400 },
    )
  }

  const amount = Number(downpaymentAmount)
  if (!isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'downpaymentAmount must be a positive number' }, { status: 400 })
  }

  // Use the first admin user as the system creator for this programmatic order.
  const systemUser = await prisma.user.findFirst({
    where: { role: { in: ['ADMIN', 'ACCOUNTANT', 'AHEA_ADMIN', 'AHGH_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!systemUser) {
    return NextResponse.json({ error: 'No accountant user found to attribute order to' }, { status: 500 })
  }

  const deptLabel = DEPT_LABELS[department ?? ''] ?? (department ?? 'Therapy')
  const itemName  = `${deptLabel} — Portal Downpayment`

  const order = await prisma.order.create({
    data: {
      orderType:       'SERVICE',
      branch,
      patientName:     patientName || null,
      clinicianName:   null,
      transactionDate: new Date(`${transactionDate}T08:00:00+08:00`),
      subtotal:        amount,
      discountType:    'NONE',
      discountAmount:  0,
      netAmount:       amount,
      revenueType:     'UNEARNED', // downpayment = unearned until service is rendered
      referenceNumber: referenceNumber ?? null,
      notes:           referenceNumber ? `Portal booking ${referenceNumber}` : 'Portal booking downpayment',
      createdById:     systemUser.id,
      items: {
        createMany: {
          data: [
            {
              name:      itemName,
              quantity:  1,
              unitPrice: amount,
              lineTotal: amount,
            },
          ],
        },
      },
      payments: {
        createMany: {
          data: [
            {
              method: 'GCASH', // portal downpayments collected via PayMongo (GCash/card)
              amount,
            },
          ],
        },
      },
    },
    select: { id: true, orderNumber: true },
  })

  // Attempt GL posting — non-fatal (same pattern as regular POS route).
  try {
    const posting = await postOrderJournal(prisma, order.id, systemUser.id)
    if (posting.posted) {
      console.log(`[portal-downpayment] GL posted JE for order ${order.orderNumber}`)
    }
  } catch (err) {
    console.error(`[portal-downpayment] GL posting failed for order ${order.orderNumber}:`, err)
  }

  await prisma.auditLog.create({
    data: {
      userId:   systemUser.id,
      action:   'CREATE',
      entity:   'order',
      entityId: order.id,
      details:  {
        orderNumber: order.orderNumber,
        source:      'portal-downpayment',
        referenceNumber: referenceNumber ?? null,
        amount,
        branch,
      },
    },
  })

  return NextResponse.json({ ok: true, orderId: order.id, orderNumber: order.orderNumber })
}
