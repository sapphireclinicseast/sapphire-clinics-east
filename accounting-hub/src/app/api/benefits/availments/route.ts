import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

const BENEFIT_TYPES = ['MATERNITY', 'SICKNESS', 'ECC', 'OTHER']

/** Where the claim stands, derived from what has come back rather than stored:
 *  a stored status drifts the moment a reimbursement is edited. */
function statusOf(advanced: number, reimbursed: number) {
  if (reimbursed <= 0.005) return 'ADVANCED'
  if (reimbursed + 0.005 >= advanced) return 'REIMBURSED'
  return 'PARTIAL'
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || undefined
  const rows = await prisma.benefitAvailment.findMany({
    where: { ...(branch && branch !== 'ALL' ? { branch } : {}) },
    orderBy: [{ datePaidToEmployee: 'desc' }, { createdAt: 'desc' }],
  })
  const out = rows.map(r => {
    const advanced = Number(r.amountAdvanced)
    const reimbursed = Number(r.reimbursedAmount)
    return {
      ...r,
      amountAdvanced: advanced,
      companyShare: Number(r.companyShare),
      reimbursedAmount: reimbursed,
      // What SSS still owes. The company's own grant is never receivable, so it
      // is excluded — it is a cost the company chose to carry.
      outstanding: Math.max(0, Math.round((advanced - reimbursed) * 100) / 100),
      status: statusOf(advanced, reimbursed),
    }
  })
  return NextResponse.json({
    availments: out,
    totals: {
      advanced: out.reduce((s, r) => s + r.amountAdvanced, 0),
      companyShare: out.reduce((s, r) => s + r.companyShare, 0),
      reimbursed: out.reduce((s, r) => s + r.reimbursedAmount, 0),
      outstanding: out.reduce((s, r) => s + r.outstanding, 0),
    },
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const b = await req.json()
  if (!b.employeeName || !b.branch) {
    return NextResponse.json({ error: 'employeeName and branch are required' }, { status: 400 })
  }
  if (b.benefitType && !BENEFIT_TYPES.includes(b.benefitType)) {
    return NextResponse.json({ error: `benefitType must be one of ${BENEFIT_TYPES.join(', ')}` }, { status: 400 })
  }
  const row = await prisma.benefitAvailment.create({
    data: {
      branch: b.branch,
      employeeId: b.employeeId || null,
      employeeName: String(b.employeeName).trim(),
      benefitType: b.benefitType || 'MATERNITY',
      periodFrom: b.periodFrom ? new Date(b.periodFrom) : null,
      periodTo: b.periodTo ? new Date(b.periodTo) : null,
      amountAdvanced: Number(b.amountAdvanced) || 0,
      companyShare: Number(b.companyShare) || 0,
      datePaidToEmployee: b.datePaidToEmployee ? new Date(b.datePaidToEmployee) : null,
      advanceRfpId: b.advanceRfpId || null,
      reimbursedAmount: Number(b.reimbursedAmount) || 0,
      reimbursedDate: b.reimbursedDate ? new Date(b.reimbursedDate) : null,
      reimbursementRfpId: b.reimbursementRfpId || null,
      notes: b.notes || null,
      createdById: session.user.id as string,
    },
  })
  return NextResponse.json({ availment: row })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const b = await req.json()
  if (!b.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (b.benefitType && !BENEFIT_TYPES.includes(b.benefitType)) {
    return NextResponse.json({ error: `benefitType must be one of ${BENEFIT_TYPES.join(', ')}` }, { status: 400 })
  }
  // Only the fields actually sent are written, so a partial edit from one screen
  // cannot blank out what another screen filled in.
  const data: Record<string, unknown> = {}
  for (const k of ['branch', 'employeeId', 'employeeName', 'benefitType', 'advanceRfpId', 'reimbursementRfpId', 'notes']) {
    if (b[k] !== undefined) data[k] = b[k] || null
  }
  for (const k of ['amountAdvanced', 'companyShare', 'reimbursedAmount']) {
    if (b[k] !== undefined) data[k] = Number(b[k]) || 0
  }
  for (const k of ['periodFrom', 'periodTo', 'datePaidToEmployee', 'reimbursedDate']) {
    if (b[k] !== undefined) data[k] = b[k] ? new Date(b[k]) : null
  }
  const row = await prisma.benefitAvailment.update({ where: { id: b.id }, data })
  return NextResponse.json({ availment: row })
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await prisma.benefitAvailment.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
