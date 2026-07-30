import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET [?q=] — lightweight RFP list for linking a freight batch to the Expense
// RFPs that paid the manufacturer and the freight forwarder. Searches across all
// branches by reference number / payee.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = (new URL(req.url).searchParams.get('q') || '').trim()
  const rfps = await prisma.reimbursementReport.findMany({
    where: q ? { OR: [
      { refNumber: { contains: q, mode: 'insensitive' } },
      { payableTo: { contains: q, mode: 'insensitive' } },
    ] } : {},
    select: { id: true, refNumber: true, grossTotal: true, status: true, module: true, branch: true, payableTo: true, paidAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  return NextResponse.json(rfps.map(r => ({
    id: r.id, refNumber: r.refNumber, grossTotal: Number(r.grossTotal), status: r.status,
    module: r.module, branch: r.branch, payableTo: r.payableTo,
    paidAt: r.paidAt ? r.paidAt.toISOString().slice(0, 10) : null,
  })))
}
