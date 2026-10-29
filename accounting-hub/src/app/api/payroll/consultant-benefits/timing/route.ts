import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']
const TIMINGS = ['HALF_HALF', 'FIRST_CUTOFF', 'SECOND_CUTOFF']

// GET — when the consultant (EE) share of SSS/PhilHealth/Pag-IBIG is deducted each month
export async function GET() {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const settings = await prisma.employeeSettings.findFirst({ select: { consultantBenefitDeductionTiming: true } })
  return NextResponse.json({ timing: settings?.consultantBenefitDeductionTiming || 'HALF_HALF' })
}

// PUT { timing }
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { timing } = await req.json()
  if (!TIMINGS.includes(timing)) {
    return NextResponse.json({ error: 'Invalid deduction timing' }, { status: 400 })
  }
  const existing = await prisma.employeeSettings.findFirst({ select: { id: true } })
  const saved = existing
    ? await prisma.employeeSettings.update({ where: { id: existing.id }, data: { consultantBenefitDeductionTiming: timing } })
    : await prisma.employeeSettings.create({ data: { consultantBenefitDeductionTiming: timing } })
  return NextResponse.json({ timing: saved.consultantBenefitDeductionTiming })
}
