import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const PAYROLL_TO_PC: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', VERDANA: 'VERDANA_STORE', AHI: 'AURA_INSTITUTE' }
const BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD', AURA_INSTITUTE: 'AHI' }

// Extra "Other Fees" line entered when generating a Benefits-Payable RFP (e.g. online-transfer fees).
interface OtherFee { accountTitle?: string; description?: string; requestor?: string; grossAmount?: number | string; vatable?: string; hasEwt?: boolean; ewtRate?: number | null }
function normFees(raw: unknown): { accountTitle: string; description: string; requestor: string; grossAmount: number; vatable: string; hasEwt: boolean; ewtRate: number | null }[] {
  if (!Array.isArray(raw)) return []
  return raw.map((f: OtherFee) => ({
    accountTitle: (f.accountTitle || '').trim(),
    description: (f.description || '').trim(),
    requestor: (f.requestor || '').trim(),
    grossAmount: Number(f.grossAmount) || 0,
    vatable: f.vatable === 'VAT' ? 'VAT' : 'NV',
    hasEwt: !!f.hasEwt,
    ewtRate: f.ewtRate != null && !isNaN(Number(f.ewtRate)) ? Number(f.ewtRate) : null,
  })).filter(f => f.grossAmount > 0)
}

// POST { source:'salary'|'benefit', payableType:'CONSULTANT'|'EMPLOYEE', ids, branch, cutoffPeriod, manualSeq, otherFees? }
// Creates an Expenses-series RFP for the selected payable payroll items and locks them.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { source, payableType, benefitType, ids, branch, cutoffPeriod, manualSeq, otherFees } = await req.json()
    if (source !== 'salary' && source !== 'benefit') return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
    const pcBranch = PAYROLL_TO_PC[branch]
    if (!pcBranch) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'Select at least one entry' }, { status: 400 })
    const moduleName = source === 'salary' ? 'PAYROLL_SALARY' : 'PAYROLL_BENEFIT'
    // Consultants live in PayrollEntry (both salary & benefit); employees in EmployeePayslip.
    const idKind = payableType === 'CONSULTANT' ? 'payrollEntry' : 'employeePayslip'
    const mseq = manualSeq != null && String(manualSeq).trim() !== '' ? parseInt(String(manualSeq), 10) : null
    const fees = source === 'benefit' ? normFees(otherFees) : []
    const feesTotal = fees.reduce((s, f) => s + f.grossAmount, 0)

    // Per-agency benefit RFP config. SSS/PHIC/HDMF are remitted separately so each
    // uses its own EE/ER fields, its own per-row lock field, and its own ref suffix.
    const AGENCY: Record<string, { ee: string; er: string; lock: string; code: string }> = {
      SSS: { ee: 'sssDeduction', er: 'sssEmployerShare', lock: 'sssRfpId', code: 'SSS' },
      PHILHEALTH: { ee: 'philhealthDeduction', er: 'philhealthEmployerShare', lock: 'philhealthRfpId', code: 'PHIC' },
      PAGIBIG: { ee: 'pagibigDeduction', er: 'pagibigEmployerShare', lock: 'pagibigRfpId', code: 'HDMF' },
    }
    const agency = source === 'benefit' && benefitType && AGENCY[benefitType] ? AGENCY[benefitType] : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const benefitAmount = (r: any) => agency
      ? Number(r[agency.ee]) + Number(r[agency.er])
      : (Number(r.sssDeduction) + Number(r.sssEmployerShare) + Number(r.philhealthDeduction) + Number(r.philhealthEmployerShare) + Number(r.pagibigDeduction) + Number(r.pagibigEmployerShare))
    // Only pick up rows not already in an RFP for THIS agency (or the combined lock, legacy).
    const benefitEligible = agency ? { [agency.lock]: null } : { benefitRfpId: null }

    const report = await prisma.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let items: { id: string; name: string; amount: number }[] = []
      if (idKind === 'payrollEntry') {
        const rows = await tx.payrollEntry.findMany({ where: { id: { in: ids }, status: 'LOCKED', ...(source === 'salary' ? { salariesRemitted: false, salaryRfpId: null } : { benefitsRemitted: false, ...benefitEligible }) }, include: { consultant: { select: { name: true } } } })
        items = rows.map(r => ({ id: r.id, name: r.consultant?.name || '—', amount: source === 'salary' ? Number(r.netPay) : benefitAmount(r) }))
      } else {
        const rows = await tx.employeePayslip.findMany({ where: { id: { in: ids }, status: 'LOCKED', ...(source === 'salary' ? { salariesRemitted: false, salaryRfpId: null } : { benefitsRemitted: false, ...benefitEligible }) }, include: { employee: { select: { firstName: true, lastName: true } } } })
        items = rows.map(r => ({ id: r.id, name: `${r.employee.firstName} ${r.employee.lastName}`, amount: source === 'salary' ? Number(r.netPay) : benefitAmount(r) }))
      }
      items = items.filter(i => source === 'salary' || i.amount > 0)
      if (items.length === 0) throw new Error('No eligible entries (already in an RFP or remitted?)')
      const netTotal = items.reduce((s, i) => s + i.amount, 0) + feesTotal

      let settings = await tx.pettyCashSettings.findUnique({ where: { branch: pcBranch } })
      if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch: pcBranch, nextPcvSeq: 1 } })
      const seq = (mseq != null && !isNaN(mseq) && mseq > 0) ? mseq : settings.nextReimbSeq
      await tx.pettyCashSettings.update({ where: { branch: pcBranch }, data: { nextReimbSeq: Math.max(settings.nextReimbSeq, seq + 1) } })
      const yy = new Date().getFullYear() % 100
      const suffix = source === 'salary' ? 'SAL' : (agency ? `BEN-${agency.code}` : 'BEN')
      const refNumber = `${BRANCH_CODE[pcBranch]}-RFP${yy}-${String(seq).padStart(6, '0')}-${suffix}`

      const created = await tx.reimbursementReport.create({
        data: {
          branch: pcBranch, refNumber, refSeq: seq, grossTotal: netTotal, module: moduleName,
          meta: { source, payableType: payableType || 'EMPLOYEE', benefitType: agency ? benefitType : null, payrollBranch: branch, cutoffPeriod: cutoffPeriod || null, idKind, ids: items.map(i => i.id), items, otherFees: fees, feesTotal, netTotal },
          createdById: session.user.id ?? null,
        },
      })
      const lockData = source === 'salary'
        ? { salaryRfpId: created.id }
        : (agency ? { [agency.lock]: created.id } : { benefitRfpId: created.id })
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
