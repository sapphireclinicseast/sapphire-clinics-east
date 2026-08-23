import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// The pre-Hub CEO petty cash fund, verbatim from the interbranch monitoring
// workbook. Read-only: it is history, already expensed in QuickBooks.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const branch = new URL(req.url).searchParams.get('branch') || ''
  const rows = await prisma.ceoPcfHistory.findMany({
    where: branch ? { branch } : {},
    orderBy: { date: 'asc' },
  })
  let bal = 0
  const out = rows.map(r => {
    bal = Math.round((bal + Number(r.cashIn) - Number(r.cashOut)) * 100) / 100
    return {
      id: r.id, branch: r.branch, date: r.date.toISOString().slice(0, 10),
      particulars: r.particulars, receivedBy: r.receivedBy,
      cashIn: Number(r.cashIn), cashOut: Number(r.cashOut),
      fileName: r.fileName, remarks: r.remarks, qbRecorded: r.qbRecorded, qbRef: r.qbRef,
      running: bal,
    }
  })
  const totals = {
    inn: Math.round(out.reduce((s, r) => s + r.cashIn, 0) * 100) / 100,
    out: Math.round(out.reduce((s, r) => s + r.cashOut, 0) * 100) / 100,
    rows: out.length,
    unrecorded: out.filter(r => !r.qbRecorded && r.cashOut > 0).length,
  }
  return NextResponse.json({ rows: out, totals, branches: ['East', 'Greenhills', 'Verdana'] })
}
