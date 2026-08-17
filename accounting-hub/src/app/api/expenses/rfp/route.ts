import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
const BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD' }

// GET ?branch=... → list expense RFP reports;  GET ?id=... → pdfData
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const id = sp.get('id')
  // Line items for an RFP (Billing Voucher). EXPENSE → member entries; payroll → meta.items.
  if (id && sp.get('items')) {
    const r = await prisma.reimbursementReport.findUnique({ where: { id }, select: { module: true, meta: true, grossTotal: true } })
    if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (r.module === 'EXPENSE') {
      // Order the Billing-Voucher lines the same way they were entered (PCV sequence),
      // matching the RFP Summary — without this Postgres returns them in arbitrary order.
      const entries = await prisma.pettyCashEntry.findMany({ where: { reimbursementId: id }, orderBy: [{ pcvSeq: 'asc' }, { pcvSub: 'asc' }], select: { accountTitle: true, description: true, requestor: true, grossAmount: true, vatable: true, hasEwt: true, ewtRate: true } })
      // Back-imported RFPs (historical disbursement sheets) carry their lines in
      // meta.items instead of member entries — no PCV rows were created for
      // them, so the P&L never double-counts.
      if (!entries.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = (r.meta || {}) as any
        if (Array.isArray(m.items)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return NextResponse.json({ lines: m.items.map((i: any) => { const g = Number(i.gross || 0); return { account: i.account || '', description: i.description || '', payee: i.payee || '', memo: i.memo || i.description || '', gross: g, vat: 0, netVat: g, ewt: 0, netEwt: g } }) })
        }
      }
      return NextResponse.json({ lines: entries.map(e => {
        const gross = Number(e.grossAmount)
        const netVat = e.vatable === 'VAT' ? gross / 1.12 : gross
        const vat = gross - netVat
        const ewt = e.hasEwt && e.ewtRate ? netVat * (e.ewtRate / 100) : 0
        // Amount payable = GROSS − EWT (full gross is reimbursed; only EWT withheld, not VAT).
        return { account: e.accountTitle || '', description: e.description || e.requestor || '', payee: e.requestor || '', memo: e.description || '', gross, vat, netVat, ewt, netEwt: gross - ewt }
      }) })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (r.meta || {}) as any
    const isSalary = r.module === 'PAYROLL_SALARY'
    const acct = isSalary ? 'Salaries Payable' : 'Benefits Payable'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = Array.isArray(meta.items) ? meta.items.map((i: any) => { const a = Number(i.amount || 0); return { account: acct, description: `${i.name}${meta.cutoffPeriod ? ` — ${meta.cutoffPeriod}` : ''}`, gross: a, vat: 0, netVat: a, netEwt: a } }) : []
    // Benefit RFP "Other Fees" (e.g. online-transfer fees) append as their own lines.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Array.isArray(meta.otherFees)) for (const f of meta.otherFees as any[]) {
      const gross = Number(f.grossAmount || 0)
      if (gross <= 0) continue
      const netVat = f.vatable === 'VAT' ? gross / 1.12 : gross
      const vat = gross - netVat
      const ewt = f.hasEwt && f.ewtRate ? netVat * (Number(f.ewtRate) / 100) : 0
      lines.push({ account: f.accountTitle || 'Other Fees', description: f.description || f.requestor || 'Other fee', payee: f.requestor || '', memo: f.description || '', gross, vat, netVat, ewt, netEwt: gross - ewt })
    }
    return NextResponse.json({ lines })
  }
  // Full member entries for rebuilding the RFP Summary PDF (with current payableTo).
  if (id && sp.get('entries')) {
    const rep = await prisma.reimbursementReport.findUnique({ where: { id }, select: { payableTo: true, refNumber: true, branch: true } })
    if (!rep) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const entries = await prisma.pettyCashEntry.findMany({
      where: { reimbursementId: id },
      select: { pcvNumber: true, requestor: true, date: true, accountTitle: true, description: true, vatable: true, grossAmount: true, hasEwt: true, ewtRate: true },
      orderBy: { pcvSeq: 'asc' },
    })
    return NextResponse.json({ payableTo: rep.payableTo, refNumber: rep.refNumber, branch: rep.branch, entries: entries.map(e => ({ ...e, grossAmount: Number(e.grossAmount), date: e.date ? e.date.toISOString().slice(0, 10) : null })) })
  }
  if (id) {
    const r = await prisma.reimbursementReport.findUnique({ where: { id }, select: { pdfData: true, refNumber: true } })
    if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(r)
  }
  const branch = sp.get('branch') || ''
  if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
  const reports = await prisma.reimbursementReport.findMany({
    where: { branch, module: { in: ['EXPENSE', 'PAYROLL_SALARY', 'PAYROLL_BENEFIT'] } },
    select: {
      id: true, refNumber: true, grossTotal: true, status: true, kind: true, module: true, meta: true, paidAt: true, paymentMethod: true,
      checkNumber: true, transferRef: true, debitAccount: true, creditCardId: true, proofUrl: true, payableTo: true, createdAt: true,
      _count: { select: { entries: true } },
      entries: { select: { vatable: true, grossAmount: true, hasEwt: true, ewtRate: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  // Amount Payable = GROSS − EWT for expense RFPs (VAT is not deducted from the
  // payee — they paid the full gross; only EWT is withheld). Payroll uses netTotal.
  const withPayable = reports.map(r => {
    // Back-imported RFPs have no member entries; grossTotal (mirrored by
    // meta.items) is the paid amount.
    const payableTotal = r.module === 'EXPENSE'
      ? (r.entries.length ? r.entries.reduce((sum, e) => {
          const g = Number(e.grossAmount)
          const net = e.vatable === 'VAT' ? g / 1.12 : g
          const ewt = e.hasEwt && e.ewtRate ? net * (e.ewtRate / 100) : 0
          return sum + (g - ewt)
        }, 0) : Number(r.grossTotal))
      : Number(r.grossTotal)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metaItems = !r._count.entries && Array.isArray((r.meta as any)?.items) ? ((r.meta as any).items as unknown[]).length : 0
    const { entries, ...rest } = r
    void entries
    return { ...rest, payableTotal, _count: { entries: r._count.entries || metaItems } }
  })
  return NextResponse.json(withPayable)
}

// POST { branch, entryIds, kind } → create expense RFP, lock entries (shared RFP counter)
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, entryIds, kind, manualSeq } = await req.json()
    if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    if (!Array.isArray(entryIds) || entryIds.length === 0) return NextResponse.json({ error: 'Select at least one entry' }, { status: 400 })
    const k = kind === 'INVALID' ? 'INVALID' : 'VALID'
    const mseq = manualSeq != null && String(manualSeq).trim() !== '' ? parseInt(String(manualSeq), 10) : null

    const report = await prisma.$transaction(async (tx) => {
      const entries = await tx.pettyCashEntry.findMany({
        where: {
          id: { in: entryIds }, branch, reimbursementId: null, soaId: null, audited: true,
          recordType: { in: ['ONE_TIME', 'RECURRING'] },
          validity: k === 'VALID' ? 'Valid' : 'Invalid',
        },
      })
      if (entries.length === 0) throw new Error(`No eligible audited ${k === 'VALID' ? 'valid' : 'invalid'} expense entries (already in an RFP / not audited?)`)
      const grossTotal = entries.reduce((s, e) => s + Number(e.grossAmount), 0)
      // Auto-fill "Payable to" = the Payee (requestor) of the first line item in the
      // group; fall back to its supplier (registeredName) only if that Payee is blank.
      const firstEntry = [...entries].sort((a, b) => (a.pcvSeq - b.pcvSeq) || ((a.pcvSub || 0) - (b.pcvSub || 0)))[0]
      const firstPayee = firstEntry?.requestor?.trim() || firstEntry?.registeredName?.trim() || null

      let settings = await tx.pettyCashSettings.findUnique({ where: { branch } })
      if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch, nextPcvSeq: 1 } })
      // Manual seq (pre-printed form) overrides the shared counter; keep the counter ahead.
      const seq = (mseq != null && !isNaN(mseq) && mseq > 0) ? mseq : settings.nextReimbSeq
      await tx.pettyCashSettings.update({ where: { branch }, data: { nextReimbSeq: Math.max(settings.nextReimbSeq, seq + 1) } })

      const yy = new Date().getFullYear() % 100
      const suffix = k === 'VALID' ? 'VAL' : 'INV'
      const refNumber = `${BRANCH_CODE[branch]}-RFP${yy}-${String(seq).padStart(6, '0')}-${suffix}`

      const created = await tx.reimbursementReport.create({
        data: { branch, refNumber, refSeq: seq, grossTotal, kind: k, module: 'EXPENSE', payableTo: firstPayee, createdById: session.user.id ?? null },
      })
      await tx.pettyCashEntry.updateMany({ where: { id: { in: entries.map(e => e.id) } }, data: { reimbursementId: created.id } })
      return created
    })
    return NextResponse.json({ id: report.id, refNumber: report.refNumber, grossTotal: report.grossTotal, payableTo: report.payableTo })
  } catch (e) {
    console.error('Expense RFP create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create RFP' }, { status: 500 })
  }
}

// PATCH { id, action } — 'pay' (records payment + propagates to entries) | 'unpay' | store pdfData
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
      const paidAt = body.datePaid ? new Date(body.datePaid) : new Date()
      const pm = body.paymentMethod || null
      await prisma.$transaction(async (tx) => {
        await tx.reimbursementReport.update({
          where: { id },
          data: {
            status: 'PAID', paidAt, paymentMethod: pm,
            checkNumber: body.checkNumber || null,
            debitAccount: body.paymentBankAccount || null,
            creditCardId: body.creditCardId || null,
            proofUrl: body.proofUrl || null,
          },
        })
        // Propagate payment to member entries so CC Report / Expense Report read them.
        await tx.pettyCashEntry.updateMany({
          where: { reimbursementId: id },
          data: {
            paidAt, paymentMethod: pm,
            checkNumber: body.checkNumber || null,
            paymentBankAccount: body.paymentBankAccount || null,
            creditCard: body.creditCard || null,
            creditCardId: body.creditCardId || null,
            payrollAccount: body.payrollAccount || null,
          },
        })
        // If this RFP was created from a Credit Card SOA, mark the SOA paid → it surfaces in the Credit Card Report.
        await tx.creditCardSOA.updateMany({
          where: { reimbursementId: id },
          data: { status: 'PAID', paymentRoute: 'RFP', paidAt },
        })
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'set-payable') {
      await prisma.reimbursementReport.update({ where: { id }, data: { payableTo: (body.payableTo ?? '').trim() || null } })
      return NextResponse.json({ success: true })
    }

    // Payroll RFP paid via the salary/benefit-payments endpoint; record on the RFP + stash the payment id.
    if (action === 'pay-payroll') {
      const rep = await prisma.reimbursementReport.findUnique({ where: { id } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = { ...((rep?.meta || {}) as any), paymentId: body.paymentId || null }
      await prisma.reimbursementReport.update({
        where: { id },
        data: { status: 'PAID', paidAt: body.datePaid ? new Date(body.datePaid) : new Date(),
          paymentMethod: body.paymentMethod || null,
          // Cheques go in checkNumber, wires in transferRef — same split the
          // rest of the system uses, so cheque monitoring and bank rec see these.
          checkNumber: body.checkNumber || null,
          transferRef: body.transferRef || null,
          debitAccount: body.debitAccount || null,
          proofUrl: body.proofUrl || null, meta },
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'unpay') {
      const rep = await prisma.reimbursementReport.findUnique({ where: { id } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = (rep?.meta || {}) as any
      const isPayroll = rep?.module === 'PAYROLL_SALARY' || rep?.module === 'PAYROLL_BENEFIT'
      await prisma.$transaction(async (tx) => {
        await tx.reimbursementReport.update({
          where: { id },
          data: { status: 'PENDING', paidAt: null, paymentMethod: null, checkNumber: null, debitAccount: null, creditCardId: null, proofUrl: null, ...(isPayroll ? { meta: { ...meta, paymentId: null } } : {}) },
        })
        if (!isPayroll) await tx.pettyCashEntry.updateMany({
          where: { reimbursementId: id },
          data: { paidAt: null, paymentMethod: null, checkNumber: null, paymentBankAccount: null, creditCard: null, creditCardId: null, payrollAccount: null },
        })
        // A Credit Card SOA behind this RFP returns to IN_RFP (payment reversed).
        await tx.creditCardSOA.updateMany({ where: { reimbursementId: id }, data: { status: 'IN_RFP', paymentRoute: null, paidAt: null } })
      })
      return NextResponse.json({ success: true })
    }

    await prisma.reimbursementReport.update({ where: { id }, data: { pdfData: body.pdfData || null } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Expense RFP patch error:', e)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

// DELETE ?id=... — clear propagated payment, then delete (entries unlock via FK SetNull)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    const rep = await prisma.reimbursementReport.findUnique({ where: { id } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (rep?.meta || {}) as any
    if (rep?.module === 'PAYROLL_SALARY' || rep?.module === 'PAYROLL_BENEFIT') {
      // Reactivate the locked payroll entries. (A paid payroll RFP must be unpaid first.)
      const ids: string[] = Array.isArray(meta.ids) ? meta.ids : []
      // Benefit RFPs lock one field per agency covered (sss/philhealth/pagibigRfpId);
      // legacy ones use the single combined benefitRfpId. A combined RFP locks several,
      // so release every field it holds — clearing only one would strand the rest as
      // permanently unselectable.
      const AGENCY_LOCK: Record<string, string> = { SSS: 'sssRfpId', PHILHEALTH: 'philhealthRfpId', PAGIBIG: 'pagibigRfpId' }
      const types: string[] = Array.isArray(meta.benefitTypes) && meta.benefitTypes.length
        ? meta.benefitTypes
        : (meta.benefitType ? [meta.benefitType] : [])
      const fields = rep.module === 'PAYROLL_SALARY'
        ? ['salaryRfpId']
        : (types.length ? types.map(t => AGENCY_LOCK[t]).filter(Boolean) : ['benefitRfpId'])
      const clear = Object.fromEntries(fields.map(f => [f, null]))
      if (ids.length) {
        if (meta.idKind === 'payrollEntry') await prisma.payrollEntry.updateMany({ where: { id: { in: ids } }, data: clear })
        else await prisma.employeePayslip.updateMany({ where: { id: { in: ids } }, data: clear })
      }
      await prisma.reimbursementReport.delete({ where: { id } })
      return NextResponse.json({ success: true })
    }
    await prisma.pettyCashEntry.updateMany({
      where: { reimbursementId: id },
      data: { paidAt: null, paymentMethod: null, checkNumber: null, paymentBankAccount: null, creditCard: null, creditCardId: null, payrollAccount: null },
    })
    // A Credit Card SOA behind this RFP returns to OPEN so it can be re-requested; its entries stay tagged to the SOA.
    await prisma.creditCardSOA.updateMany({ where: { reimbursementId: id }, data: { status: 'OPEN', reimbursementId: null, paymentRoute: null, paidAt: null } })
    await prisma.reimbursementReport.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Expense RFP delete error:', e)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
