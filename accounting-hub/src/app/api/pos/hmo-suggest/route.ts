import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET ?patientId=..&patientName=.. → the HMO this patient's most recent HMO
// sale was billed to, so the POS can offer it first and flag a different payer.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const patientId = (sp.get('patientId') || '').trim()
  const patientName = (sp.get('patientName') || '').trim()
  if (!patientId && !patientName) return NextResponse.json(null)

  const patientMatch = [
    ...(patientId ? [{ patientId }] : []),
    ...(patientName ? [{ patientName: { equals: patientName, mode: 'insensitive' as const } }] : []),
  ]

  const pay = await prisma.orderPayment.findFirst({
    where: {
      method: 'HMO',
      walletId: { not: null },
      order: { status: { notIn: ['VOIDED'] }, OR: patientMatch },
    },
    orderBy: [{ order: { transactionDate: 'desc' } }, { createdAt: 'desc' }],
    select: {
      walletId: true,
      wallet: { select: { patientName: true } },
      order: { select: { orderNumber: true, transactionDate: true } },
    },
  })
  if (!pay?.walletId || !pay.wallet) return NextResponse.json(null)

  return NextResponse.json({
    walletId: pay.walletId,
    name: pay.wallet.patientName,
    lastDate: pay.order.transactionDate,
    orderNumber: pay.order.orderNumber,
  })
}
