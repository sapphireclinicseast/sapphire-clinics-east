import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

// Amounts are pesos with two decimals; compare in centavos so 0.1 + 0.2 never
// decides whether a payslip balances.
const cents = (n: number) => Math.round(n * 100)

type Kind = 'EMPLOYEE' | 'CONSULTANT'
const parentOf = async (kind: Kind, id: string) =>
  kind === 'EMPLOYEE'
    ? prisma.employeePayslip.findUnique({
        where: { id },
        select: { id: true, netPay: true, salariesRemitted: true, salaryRfpId: true, status: true, salarySplits: true },
      })
    : prisma.payrollEntry.findUnique({
        where: { id },
        select: { id: true, netPay: true, salariesRemitted: true, salaryRfpId: true, status: true, salarySplits: true },
      })

// POST { payableType, id, amounts: number[], notes?: string[] }
// Replaces the split set for one payslip. Splits must sum exactly to net pay:
// splitting is about *when* the money goes out, never how much is owed.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { payableType, id, amounts, notes } = await req.json()
    const kind: Kind = payableType === 'CONSULTANT' ? 'CONSULTANT' : 'EMPLOYEE'
    if (!id) return NextResponse.json({ error: 'A payslip is required' }, { status: 400 })
    if (!Array.isArray(amounts) || amounts.length < 2) {
      return NextResponse.json({ error: 'Give at least two amounts — a single split is the same as not splitting' }, { status: 400 })
    }

    const parent = await parentOf(kind, id)
    if (!parent) return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })
    if (parent.salariesRemitted) return NextResponse.json({ error: 'This salary is already remitted — it can no longer be split' }, { status: 409 })
    if (parent.salaryRfpId) return NextResponse.json({ error: 'This salary is already in an RFP. Delete that RFP first, then split it' }, { status: 409 })

    // Never restructure money that has already gone out the door.
    const committed = parent.salarySplits.filter(s => s.salariesRemitted || s.salaryRfpId)
    if (committed.length) {
      return NextResponse.json({ error: 'Some splits are already paid or in an RFP. Only untouched splits can be re-split' }, { status: 409 })
    }

    const nums = amounts.map(Number)
    if (nums.some(a => !Number.isFinite(a) || a <= 0)) {
      return NextResponse.json({ error: 'Every split must be greater than zero' }, { status: 400 })
    }
    const net = Number(parent.netPay)
    const diff = nums.reduce((s, a) => s + cents(a), 0) - cents(net)
    if (diff !== 0) {
      const off = (Math.abs(diff) / 100).toFixed(2)
      return NextResponse.json({
        error: `Splits must add up to the net pay of ₱${net.toFixed(2)} — currently ${diff > 0 ? 'over' : 'short'} by ₱${off}`,
      }, { status: 400 })
    }

    const link = kind === 'EMPLOYEE' ? { employeePayslipId: id } : { payrollEntryId: id }
    const created = await prisma.$transaction(async (tx) => {
      await tx.salaryPayableSplit.deleteMany({ where: link })
      await tx.salaryPayableSplit.createMany({
        data: nums.map((amount, i) => ({
          ...link, seq: i + 1, amount,
          note: Array.isArray(notes) ? (notes[i] || null) : null,
          createdById: (session.user.id as string) ?? null,
        })),
      })
      return tx.salaryPayableSplit.findMany({ where: link, orderBy: { seq: 'asc' } })
    })

    return NextResponse.json({ splits: created })
  } catch (e) {
    console.error('Salary split error:', e)
    return NextResponse.json({ error: 'Failed to save the splits' }, { status: 500 })
  }
}

// DELETE ?payableType=&id=  — back to paying the salary in one go.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  const id = sp.get('id') || ''
  const kind: Kind = sp.get('payableType') === 'CONSULTANT' ? 'CONSULTANT' : 'EMPLOYEE'
  if (!id) return NextResponse.json({ error: 'A payslip is required' }, { status: 400 })

  const parent = await parentOf(kind, id)
  if (!parent) return NextResponse.json({ error: 'Payslip not found' }, { status: 404 })
  if (parent.salarySplits.some(s => s.salariesRemitted || s.salaryRfpId)) {
    return NextResponse.json({ error: 'A split is already paid or in an RFP — the split cannot be undone' }, { status: 409 })
  }

  const link = kind === 'EMPLOYEE' ? { employeePayslipId: id } : { payrollEntryId: id }
  await prisma.salaryPayableSplit.deleteMany({ where: link })
  return NextResponse.json({ success: true })
}
