import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchAllowed } from '@/lib/branch-scope'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

// POST /api/petty-cash/entries/transfer { id }
// Moves an entry between Petty Cash and One-Time Expense (either direction),
// keeping its PCV number and history. The record type drives which side the
// reports credit — a PETTY_CASH row settles against the branch float, a
// ONE_TIME row against its payment bank account — so a billing wrongly logged
// in PCF becomes RFP-payable by moving it here, and vice versa.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const entry = await prisma.pettyCashEntry.findUnique({ where: { id } })
    if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    if (!branchAllowed((session.user as { branch?: string }).branch, entry.branch)) {
      return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
    }
    if (entry.recordType !== 'PETTY_CASH' && entry.recordType !== 'ONE_TIME') {
      return NextResponse.json({ error: 'Only Petty Cash and One-Time Expense entries can be transferred' }, { status: 400 })
    }
    // A row already in an RFP/SOA or paid is settled where it stands.
    if (entry.reimbursementId || entry.soaId || entry.paidAt) {
      return NextResponse.json({ error: 'Locked: this entry is already in an RFP/SOA or paid — it cannot be transferred' }, { status: 409 })
    }
    const to = entry.recordType === 'PETTY_CASH' ? 'ONE_TIME' : 'PETTY_CASH'
    const updated = await prisma.pettyCashEntry.update({
      where: { id },
      data: {
        recordType: to,
        // PCF status is a petty-cash concept; a row moving to One-Time drops it.
        ...(to === 'ONE_TIME' ? { pcfStatus: null } : {}),
      },
    })
    return NextResponse.json({ entry: updated, to })
  } catch (e) {
    console.error('Entry transfer error:', e)
    return NextResponse.json({ error: 'Failed to transfer entry' }, { status: 500 })
  }
}
