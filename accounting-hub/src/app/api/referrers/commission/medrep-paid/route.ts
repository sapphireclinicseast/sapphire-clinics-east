import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Manual "paid" marks for the med-rep's one-time new-patient incentive.
// Marking creates the same MEDREP claim-ledger row payroll writes, so a
// hand-paid incentive can never be claimed a second time through a payslip
// (payroll's computeMedrepNewPatients honours onlyUnclaimed). Unmarking is
// allowed only for manual rows — a payslip-carried claim is undone through
// payroll, not here.
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'PAYROLL_OFFICER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { patientKey, referrerId } = await req.json()
    if (!patientKey?.trim() || !referrerId?.trim()) {
      return NextResponse.json({ error: 'patientKey and referrerId are required' }, { status: 400 })
    }
    const incentive = await prisma.referralIncentiveSettings.findUnique({ where: { id: 'MAIN' } })
    const manila = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    const created = await prisma.referralCommissionItem.create({
      data: {
        kind: 'MEDREP',
        patientKey: patientKey.trim(),
        referrerId: referrerId.trim(),
        amount: incentive ? incentive.amount : new Prisma.Decimal(50),
        cutoffPeriod: `MANUAL-${manila}`,
      },
    })
    return NextResponse.json(created)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Already marked paid (or already claimed through payroll)' }, { status: 409 })
    }
    console.error('medrep-paid mark error:', err)
    return NextResponse.json({ error: 'Failed to mark as paid' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const patientKey = new URL(req.url).searchParams.get('patientKey') || ''
  if (!patientKey) return NextResponse.json({ error: 'patientKey is required' }, { status: 400 })
  const item = await prisma.referralCommissionItem.findUnique({ where: { kind_patientKey: { kind: 'MEDREP', patientKey } } })
  if (!item) return NextResponse.json({ error: 'Not marked as paid' }, { status: 404 })
  if (item.payslipId) {
    return NextResponse.json({ error: 'This incentive was paid through a payslip — undo it in payroll, not here' }, { status: 409 })
  }
  await prisma.referralCommissionItem.delete({ where: { id: item.id } })
  return NextResponse.json({ removed: true })
}
