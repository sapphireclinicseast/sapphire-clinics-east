import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const PAYROLL_TO_PC: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', VERDANA: 'VERDANA_STORE' }
const BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VER' }

// POST { source:'salary'|'benefit', payableType:'CONSULTANT'|'EMPLOYEE', ids, branch, cutoffPeriod, manualSeq }
// Creates an Expenses-series RFP for the selected payable payroll items and locks them.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { source, payableType, ids, branch, cutoffPeriod, manualSeq } = await req.json()
    if (source !== 'salary' && source !== 'benefit') return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
    const pcBranch = PAYROLL_TO_PC[branch]
    if (!pcBranch) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'Select at least one entry' }, { status: 400 })
    const moduleName = source === 'salary' ? 'PAYROLL_SALARY' : 'PAYROLL_BENEFIT'
    const idKind = (source === 'salary' && payableType === 'CONSULTANT') ? 'payrollEntry' : 'employeePayslip'
    const mseq = manualSeq != null && String(manualSeq).trim() !== '' ? parseInt(String(manualSeq), 10) : null

    const report = await prisma.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let items: { id: string; name: string; amount: number }[] = []
      if (idKind === 'payrollEntry') {
        const rows = await tx.payrollEntry.findMany({ where: { id: { in: ids }, salariesRemitted: false, salaryRfpId: null, status: 'LOCKED' }, include: { consultant: { select: { name: true } } } })
        items = rows.map(r => ({ id: r.id, name: r.consultant?.name || '—', amount: Number(r.netPay) }))
      } else {
        const rows = await tx.employeePayslip.findMany({ where: { id: { in: ids }, status: 'LOCKED', ...(source === 'salary' ? { salariesRemitted: false, salaryRfpId: null } : { benefitsRemitted: false, benefitRfpId: null }) }, include: { employee: { select: { firstName: true, lastName: true } } } })
        items = rows.map(r => ({
          id: r.id, name: `${r.employee.firstName} ${r.employee.lastName}`,
          amount: source === 'salary' ? Number(r.netPay) : (Number(r.sssDeduction) + Number(r.sssEmployerShare) + Number(r.philhealthDeduction) + Number(r.philhealthEmployerShare) + Number(r.pagibigDeduction) + Number(r.pagibigEmployerShare)),
        }))
      }
      if (items.length === 0) throw new Error('No eligible entries (already in an RFP or remitted?)')
      const netTotal = items.reduce((s, i) => s + i.amount, 0)

      let settings = await tx.pettyCashSettings.findUnique({ where: { branch: pcBranch } })
      if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch: pcBranch, nextPcvSeq: 1 } })
      const seq = (mseq != null && !isNaN(mseq) && mseq > 0) ? mseq : settings.nextReimbSeq
      await tx.pettyCashSettings.update({ where: { branch: pcBranch }, data: { nextReimbSeq: Math.max(settings.nextReimbSeq, seq + 1) } })
      const yy = new Date().getFullYear() % 100
      const refNumber = `${BRANCH_CODE[pcBranch]}-RFP${yy}-${String(seq).padStart(6, '0')}-${source === 'salary' ? 'SAL' : 'BEN'}`

      const created = await tx.reimbursementReport.create({
        data: {
          branch: pcBranch, refNumber, refSeq: seq, grossTotal: netTotal, module: moduleName,
          meta: { source, payableType: payableType || 'EMPLOYEE', payrollBranch: branch, cutoffPeriod: cutoffPeriod || null, idKind, ids: items.map(i => i.id), items, netTotal },
          createdById: session.user.id ?? null,
        },
      })
      const lockData = source === 'salary' ? { salaryRfpId: created.id } : { benefitRfpId: created.id }
      if (idKind === 'payrollEntry') await tx.payrollEntry.updateMany({ where: { id: { in: items.map(i => i.id) } }, data: lockData })
      else await tx.employeePayslip.updateMany({ where: { id: { in: items.map(i => i.id) } }, data: lockData })
      return created
    })
    return NextResponse.json({ id: report.id, refNumber: report.refNumber, grossTotal: report.grossTotal })
  } catch (e) {
    console.error('Payroll RFP create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create RFP' }, { status: 500 })
  }
}
