import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const paymentType = searchParams.get('paymentType') || 'CONSULTANT'

  const payments = await prisma.taxPayment.findMany({
    where: { paymentType },
    include: {
      fromAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
      entries: { select: { id: true, taxAmount: true } },
    },
    orderBy: { paymentDate: 'desc' },
  })

  return NextResponse.json(payments.map(p => ({
    id: p.id,
    paymentDate: p.paymentDate.toISOString(),
    totalAmount: Number(p.totalAmount),
    fromAccount: p.fromAccount,
    proofUrl: p.proofUrl,
    notes: p.notes,
    paymentType: p.paymentType,
    status: p.status,
    entryCount: p.entries.length,
    createdAt: p.createdAt.toISOString(),
  })))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { payrollEntryIds, paymentDate, fromAccountId, proofUrl, notes, paymentType } = await req.json()

    if (!payrollEntryIds?.length || !paymentDate || !fromAccountId) {
      return NextResponse.json({ error: 'payrollEntryIds, paymentDate, and fromAccountId are required' }, { status: 400 })
    }

    // Get entries and sum tax amounts
    const entries = await prisma.payrollEntry.findMany({
      where: { id: { in: payrollEntryIds }, taxRemitted: false },
      select: { id: true, taxAmount: true },
    })

    if (!entries.length) {
      return NextResponse.json({ error: 'No valid unremitted entries found' }, { status: 400 })
    }

    const totalAmount = entries.reduce((s, e) => s + Number(e.taxAmount), 0)

    // Create payment and mark entries as remitted
    const payment = await prisma.$transaction(async (tx) => {
      const taxPayment = await tx.taxPayment.create({
        data: {
          paymentDate: new Date(paymentDate),
          totalAmount,
          fromAccountId,
          proofUrl: proofUrl || null,
          notes: notes || null,
          paymentType: paymentType || 'CONSULTANT',
          createdById: session.user.id,
          entries: {
            create: entries.map(e => ({ payrollEntryId: e.id, taxAmount: e.taxAmount })),
          },
        },
        include: { fromAccount: { select: { id: true, accountNumber: true, accountTitle: true } } },
      })

      // Mark entries as remitted
      await tx.payrollEntry.updateMany({
        where: { id: { in: entries.map(e => e.id) } },
        data: { taxRemitted: true },
      })

      return taxPayment
    })

    return NextResponse.json({ id: payment.id, totalAmount, entryCount: entries.length }, { status: 201 })
  } catch (err) {
    console.error('Tax payment error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
