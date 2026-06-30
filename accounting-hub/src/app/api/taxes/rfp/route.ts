import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
// Payroll branch codes → petty-cash branch keys (so tax RFP numbers stay
// continuous with petty cash / expense RFPs, which key the counter by these).
const PAYROLL_TO_PC: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', VERDANA: 'VERDANA_STORE' }
const BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VER' }
// taxType → ReimbursementReport.module + refNumber suffix
const TAX_MODULE: Record<string, string> = { WC: 'TAX_WC', EWT: 'TAX_EWT', VAT: 'TAX_VAT' }

// GET ?id=...  → single report pdfData
// GET ?taxType=WC[&payrollBranch=SBEA] → list tax RFPs of that type
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const id = sp.get('id')
  if (id) {
    const r = await prisma.reimbursementReport.findUnique({ where: { id }, select: { pdfData: true, refNumber: true } })
    if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(r)
  }
  const taxType = sp.get('taxType') || 'WC'
  const moduleName = TAX_MODULE[taxType]
  if (!moduleName) return NextResponse.json({ error: 'Invalid taxType' }, { status: 400 })
  const payrollBranch = sp.get('payrollBranch') || ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { module: moduleName }
  if (payrollBranch && PAYROLL_TO_PC[payrollBranch]) where.branch = PAYROLL_TO_PC[payrollBranch]
  const reports = await prisma.reimbursementReport.findMany({
    where,
    select: {
      id: true, refNumber: true, grossTotal: true, status: true, paidAt: true, paymentMethod: true,
      checkNumber: true, transferRef: true, debitAccount: true, proofUrl: true, meta: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(reports)
}

// POST { taxType:'WC', payrollBranch, ids, manualSeq } → create tax RFP, mark items remitted
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { taxType, payrollBranch, ids, manualSeq } = await req.json()
    const moduleName = TAX_MODULE[taxType]
    if (!moduleName) return NextResponse.json({ error: 'Invalid taxType' }, { status: 400 })
    if (taxType !== 'WC') return NextResponse.json({ error: `${taxType} RFP not yet supported` }, { status: 400 })
    const pcBranch = PAYROLL_TO_PC[payrollBranch]
    if (!pcBranch) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'Select at least one entry' }, { status: 400 })
    const mseq = manualSeq != null && String(manualSeq).trim() !== '' ? parseInt(String(manualSeq), 10) : null

    const report = await prisma.$transaction(async (tx) => {
      // WC = employee withholding (1601-C) from EmployeePayslip.
      const slips = await tx.employeePayslip.findMany({
        where: { id: { in: ids }, branch: payrollBranch, status: 'LOCKED', taxRemitted: false, taxDeduction: { gt: 0 } },
        include: { employee: { select: { firstName: true, lastName: true } } },
      })
      if (slips.length === 0) throw new Error('No eligible unremitted employee withholding entries found')
      const items = slips.map(s => ({
        id: s.id, name: `${s.employee.firstName} ${s.employee.lastName}`,
        period: s.cutoffPeriod, gross: Number(s.grossPay), tax: Number(s.taxDeduction),
      }))
      const grossTotal = items.reduce((sum, i) => sum + i.tax, 0)

      let settings = await tx.pettyCashSettings.findUnique({ where: { branch: pcBranch } })
      if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch: pcBranch, nextPcvSeq: 1 } })
      const seq = (mseq != null && !isNaN(mseq) && mseq > 0) ? mseq : settings.nextReimbSeq
      await tx.pettyCashSettings.update({ where: { branch: pcBranch }, data: { nextReimbSeq: Math.max(settings.nextReimbSeq, seq + 1) } })

      const yy = new Date().getFullYear() % 100
      const refNumber = `${BRANCH_CODE[pcBranch]}-RFP${yy}-${String(seq).padStart(6, '0')}-${taxType}`

      const created = await tx.reimbursementReport.create({
        data: {
          branch: pcBranch, refNumber, refSeq: seq, grossTotal, module: moduleName,
          meta: { taxType, payrollBranch, items }, createdById: session.user.id ?? null,
        },
      })
      await tx.employeePayslip.updateMany({ where: { id: { in: slips.map(s => s.id) } }, data: { taxRemitted: true } })
      return created
    })
    return NextResponse.json({ id: report.id, refNumber: report.refNumber, grossTotal: report.grossTotal })
  } catch (e) {
    console.error('Tax RFP create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create RFP' }, { status: 500 })
  }
}

// PATCH { id, action } — 'pay' | 'unpay' | store pdfData
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const { id, action } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    if (action === 'pay') {
      await prisma.reimbursementReport.update({
        where: { id },
        data: {
          status: 'PAID', paidAt: body.datePaid ? new Date(body.datePaid) : new Date(),
          paymentMethod: body.paymentMethod || null, checkNumber: body.checkNumber || null,
          transferRef: body.transferRef || null, debitAccount: body.debitAccount || null, proofUrl: body.proofUrl || null,
        },
      })
      return NextResponse.json({ success: true })
    }
    if (action === 'unpay') {
      await prisma.reimbursementReport.update({
        where: { id },
        data: { status: 'PENDING', paidAt: null, paymentMethod: null, checkNumber: null, transferRef: null, debitAccount: null, proofUrl: null },
      })
      return NextResponse.json({ success: true })
    }
    await prisma.reimbursementReport.update({ where: { id }, data: { pdfData: body.pdfData || null } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Tax RFP patch error:', e)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

// DELETE ?id=... — revert remitted flags on member items, then delete
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    const report = await prisma.reimbursementReport.findUnique({ where: { id } })
    if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (report.meta || {}) as any
    const itemIds: string[] = Array.isArray(meta.items) ? meta.items.map((i: { id: string }) => i.id) : []
    await prisma.$transaction(async (tx) => {
      if (meta.taxType === 'WC' && itemIds.length) {
        await tx.employeePayslip.updateMany({ where: { id: { in: itemIds } }, data: { taxRemitted: false } })
      }
      await tx.reimbursementReport.delete({ where: { id } })
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Tax RFP delete error:', e)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
