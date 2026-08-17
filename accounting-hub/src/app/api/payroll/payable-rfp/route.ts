import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const PAYROLL_TO_PC: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', VERDANA: 'VERDANA_STORE', AHI: 'AURA_INSTITUTE' }
const BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD', AURA_INSTITUTE: 'AHI' }

// Extra "Other Fees" line entered when generating a Salaries/Benefits-Payable RFP (e.g. online-transfer fees).
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
    const { source, payableType, benefitType, benefitTypes, ids, branch, cutoffPeriod, manualSeq, otherFees } = await req.json()
    if (source !== 'salary' && source !== 'benefit') return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
    const pcBranch = PAYROLL_TO_PC[branch]
    if (!pcBranch) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'Select at least one entry' }, { status: 400 })
    const moduleName = source === 'salary' ? 'PAYROLL_SALARY' : 'PAYROLL_BENEFIT'
    // Consultants live in PayrollEntry (both salary & benefit); employees in EmployeePayslip.
    const idKind = payableType === 'CONSULTANT' ? 'payrollEntry' : 'employeePayslip'
    const mseq = manualSeq != null && String(manualSeq).trim() !== '' ? parseInt(String(manualSeq), 10) : null
    const fees = normFees(otherFees)
    const feesTotal = fees.reduce((s, f) => s + f.grossAmount, 0)

    // Per-agency benefit RFP config. Each agency has its own EE/ER fields, its own
    // per-row lock field, and its own ref-number code.
    const AGENCY: Record<string, { ee: string; er: string; lock: string; code: string }> = {
      SSS: { ee: 'sssDeduction', er: 'sssEmployerShare', lock: 'sssRfpId', code: 'SSS' },
      PHILHEALTH: { ee: 'philhealthDeduction', er: 'philhealthEmployerShare', lock: 'philhealthRfpId', code: 'PHIC' },
      PAGIBIG: { ee: 'pagibigDeduction', er: 'pagibigEmployerShare', lock: 'pagibigRfpId', code: 'HDMF' },
    }
    const ALL_AGENCIES = ['SSS', 'PHILHEALTH', 'PAGIBIG']
    // One bank transfer often settles several agencies at once (commonly PHIC + HDMF),
    // and three separate RFPs can never reconcile against a single bank line. So an RFP
    // covers a SET of agencies: `benefitTypes` for a combined one, `benefitType` for a
    // single (kept for older callers), and neither means all three.
    const requested: string[] = Array.isArray(benefitTypes) && benefitTypes.length
      ? benefitTypes
      : (benefitType ? [benefitType] : ALL_AGENCIES)
    const types = source === 'benefit'
      ? requested.filter((t: string) => AGENCY[t])
      : []
    if (source === 'benefit' && types.length === 0) {
      return NextResponse.json({ error: 'Select at least one agency (SSS / PHILHEALTH / PAGIBIG)' }, { status: 400 })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const benefitAmount = (r: any) => types.reduce((s: number, t: string) =>
      s + Number(r[AGENCY[t].ee]) + Number(r[AGENCY[t].er]), 0)
    // A row is eligible only when EVERY agency in this RFP is still unclaimed for it.
    // Checking `benefitRfpId` too closes a real double-payment hole: the per-agency and
    // legacy-combined locks were previously blind to each other, so a row already sitting
    // in an SSS RFP could be pulled into a combined RFP that includes SSS again — and be
    // remitted twice. Neither lock alone is sufficient; both must be clear.
    const benefitEligible: Record<string, null> = { benefitRfpId: null }
    for (const t of types) benefitEligible[AGENCY[t].lock] = null

    const report = await prisma.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let items: { id: string; name: string; amount: number }[] = []
      let splitIds: string[] = []
      let entryIds: string[] = []
      let payslipIds: string[] = []
      let rowIds: string[] = []
      if (source === 'salary') {
        // A selection can mix whole salaries with instalments of split ones, so
        // resolve the ids against both and keep whatever each turns out to be.
        // Anything that resolves to neither is left out and caught by the count
        // check below rather than being quietly dropped from the total.
        const splits = await tx.salaryPayableSplit.findMany({
          where: { id: { in: ids }, salariesRemitted: false, salaryRfpId: null },
          include: {
            employeePayslip: { include: { employee: { select: { firstName: true, lastName: true } } } },
            payrollEntry: { include: { consultant: { select: { name: true } } } },
          },
          orderBy: { seq: 'asc' },
        })
        splitIds = splits.map(x => x.id)
        for (const x of splits) {
          const who = x.employeePayslip
            ? `${x.employeePayslip.employee.firstName} ${x.employeePayslip.employee.lastName}`
            : (x.payrollEntry?.consultant?.name || '—')
          items.push({ id: x.id, name: `${who} (part ${x.seq})`, amount: Number(x.amount) })
        }
        // One bank transfer can cover both employees and consultants, so resolve
        // the remaining ids against both tables rather than assuming the tab
        // they were ticked on.
        const rest = ids.filter((i: string) => !splitIds.includes(i))
        if (rest.length) {
          const [cons, emps] = await Promise.all([
            tx.payrollEntry.findMany({ where: { id: { in: rest }, status: 'LOCKED', salariesRemitted: false, salaryRfpId: null }, include: { consultant: { select: { name: true } } } }),
            tx.employeePayslip.findMany({ where: { id: { in: rest }, status: 'LOCKED', salariesRemitted: false, salaryRfpId: null }, include: { employee: { select: { firstName: true, lastName: true } } } }),
          ])
          entryIds = cons.map(r => r.id)
          payslipIds = emps.map(r => r.id)
          items.push(...cons.map(r => ({ id: r.id, name: r.consultant?.name || '—', amount: Number(r.netPay) })))
          items.push(...emps.map(r => ({ id: r.id, name: `${r.employee.firstName} ${r.employee.lastName}`, amount: Number(r.netPay) })))
        }
      } else if (idKind === 'payrollEntry') {
        const rows = await tx.payrollEntry.findMany({ where: { id: { in: ids }, status: 'LOCKED', benefitsRemitted: false, ...benefitEligible }, include: { consultant: { select: { name: true } } } })
        rowIds = rows.map(r => r.id)
        items = rows.map(r => ({ id: r.id, name: r.consultant?.name || '—', amount: benefitAmount(r) }))
      } else {
        const rows = await tx.employeePayslip.findMany({ where: { id: { in: ids }, status: 'LOCKED', benefitsRemitted: false, ...benefitEligible }, include: { employee: { select: { firstName: true, lastName: true } } } })
        rowIds = rows.map(r => r.id)
        items = rows.map(r => ({ id: r.id, name: `${r.employee.firstName} ${r.employee.lastName}`, amount: benefitAmount(r) }))
      }
      items = items.filter(i => source === 'salary' || i.amount > 0)
      if (items.length === 0) throw new Error('No eligible entries (already in an RFP or remitted?)')
      const netTotal = items.reduce((s, i) => s + i.amount, 0) + feesTotal

      let settings = await tx.pettyCashSettings.findUnique({ where: { branch: pcBranch } })
      if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch: pcBranch, nextPcvSeq: 1 } })
      const seq = (mseq != null && !isNaN(mseq) && mseq > 0) ? mseq : settings.nextReimbSeq
      await tx.pettyCashSettings.update({ where: { branch: pcBranch }, data: { nextReimbSeq: Math.max(settings.nextReimbSeq, seq + 1) } })
      const yy = new Date().getFullYear() % 100
      // BEN-SSS for one agency, BEN-PHIC-HDMF for a combined pair, BEN-ALL for all three
      // — so the ref number on the voucher says what the payment actually covers.
      const suffix = source === 'salary'
        ? 'SAL'
        : types.length === ALL_AGENCIES.length ? 'BEN-ALL'
        : `BEN-${types.map((t: string) => AGENCY[t].code).join('-')}`
      const refNumber = `${BRANCH_CODE[pcBranch]}-RFP${yy}-${String(seq).padStart(6, '0')}-${suffix}`

      const created = await tx.reimbursementReport.create({
        data: {
          branch: pcBranch, refNumber, refSeq: seq, grossTotal: netTotal, module: moduleName,
          // benefitTypes is the authoritative list; benefitType stays populated for a
          // single-agency RFP so anything still reading the old field keeps working.
          meta: { source, payableType: payableType || 'EMPLOYEE', benefitType: types.length === 1 ? types[0] : null, benefitTypes: types, payrollBranch: branch, cutoffPeriod: cutoffPeriod || null, idKind, splitIds, entryIds, payslipIds, rowIds, ids: items.map(i => i.id), items, otherFees: fees, feesTotal, netTotal },
          createdById: session.user.id ?? null,
        },
      })
      // Lock every agency this RFP covers, so no later RFP — single or combined — can
      // claim the same contribution again.
      const lockData: Record<string, string> = source === 'salary'
        ? { salaryRfpId: created.id }
        : Object.fromEntries(types.map((t: string) => [AGENCY[t].lock, created.id]))
      // Lock each kind in its own table so neither can be pulled into a second RFP.
      if (splitIds.length) await tx.salaryPayableSplit.updateMany({ where: { id: { in: splitIds } }, data: { salaryRfpId: created.id } })
      if (entryIds.length) await tx.payrollEntry.updateMany({ where: { id: { in: entryIds } }, data: lockData })
      if (payslipIds.length) await tx.employeePayslip.updateMany({ where: { id: { in: payslipIds } }, data: lockData })
      if (rowIds.length) {
        // Benefits still lock in the single table their tab implies.
        if (idKind === 'payrollEntry') await tx.payrollEntry.updateMany({ where: { id: { in: rowIds } }, data: lockData })
        else await tx.employeePayslip.updateMany({ where: { id: { in: rowIds } }, data: lockData })
      }
      return created
    })
    return NextResponse.json({ id: report.id, refNumber: report.refNumber, grossTotal: report.grossTotal })
  } catch (e) {
    console.error('Payroll RFP create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create RFP' }, { status: 500 })
  }
}
