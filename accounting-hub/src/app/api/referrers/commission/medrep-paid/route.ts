import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// The med-rep's one-time new-patient incentive, per patient (one MEDREP
// claim-ledger row each, unique per patient, so it can be paid only once):
// - POST { patientKey, referrerId, cutoff: "2026-11-2" } — Record it into that
//   payroll cutoff (Hannah 2026-11-11, like HMO PF Adjustments): the med rep's
//   payslip for that cutoff carries it when generated. 409 { closed } when that
//   payslip is already final/locked; resend with byHand: true if it was added
//   there by hand.
// - POST { patientKey, referrerId } — paid outside payroll (marked by hand).
// - DELETE ?patientKey — Undo: a recorded or hand-marked one, or one on a
//   payslip still in DRAFT (regenerate that payslip to take the line off).
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'PAYROLL_OFFICER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { patientKey, referrerId, cutoff, byHand } = await req.json()
    if (!patientKey?.trim() || !referrerId?.trim()) {
      return NextResponse.json({ error: 'patientKey and referrerId are required' }, { status: 400 })
    }
    if (cutoff !== undefined && (typeof cutoff !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-[12]$/.test(cutoff))) {
      return NextResponse.json({ error: 'Choose the payroll cutoff to add it to' }, { status: 400 })
    }
    const incentive = await prisma.referralIncentiveSettings.findUnique({ where: { id: 'MAIN' } })
    if (cutoff && !byHand) {
      if (!incentive?.staffId) return NextResponse.json({ error: 'Pick the med rep (recipient) first' }, { status: 400 })
      // The recipient's payslip for that cutoff must still be open to take a new line.
      const emp = await prisma.employee.findFirst({ where: { externalStaffId: incentive.staffId, isActive: true }, select: { id: true, firstName: true, lastName: true } })
      if (!emp) return NextResponse.json({ error: `${incentive.staffName || 'The med rep'} isn't an active hub payroll employee, so no payslip can carry it` }, { status: 400 })
      const slip = await prisma.employeePayslip.findFirst({ where: { employeeId: emp.id, cutoffPeriod: cutoff, status: { in: ['FINAL', 'LOCKED'] } }, select: { status: true } })
      if (slip) {
        const [y, m, h] = cutoff.split('-')
        const label = `${new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })} ${h === '1' ? '1st' : '2nd'} cutoff`
        return NextResponse.json({ error: `${emp.firstName} ${emp.lastName}'s ${label} payslip is already ${slip.status.toLowerCase()}, so nothing can be added to it.`, closed: slip.status }, { status: 409 })
      }
    }
    const manila = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    const created = await prisma.referralCommissionItem.create({
      data: {
        kind: 'MEDREP',
        patientKey: patientKey.trim(),
        referrerId: referrerId.trim(),
        amount: incentive ? incentive.amount : new Prisma.Decimal(50),
        // A recorded cutoff is picked up by that payslip; MANUAL-<date> = paid by hand.
        cutoffPeriod: cutoff && !byHand ? cutoff : `MANUAL-${manila}`,
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
  if (!item) return NextResponse.json({ error: 'Not recorded' }, { status: 404 })
  if (item.payslipId) {
    const slip = await prisma.employeePayslip.findUnique({ where: { id: item.payslipId }, select: { status: true } })
    if (slip && slip.status !== 'DRAFT') {
      return NextResponse.json({ error: `It is on a payslip that is already ${slip.status.toLowerCase()} — it can't be undone here` }, { status: 409 })
    }
  }
  await prisma.referralCommissionItem.delete({ where: { id: item.id } })
  return NextResponse.json({ removed: true })
}
