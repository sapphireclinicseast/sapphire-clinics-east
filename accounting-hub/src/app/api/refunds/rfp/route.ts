import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postJournalEntry } from '@/lib/accounting/posting'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
// Therapy prepayment refunds only — Verdana merchandise returns go through POS/bulk upload
// and land in 7160 Sales Returns (contra-revenue), not here. See /api/refunds.
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'AURA_INSTITUTE']
const BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD', AURA_INSTITUTE: 'AHI' }

// GET ?branch= → list refund RFPs;  ?id=&items= → billing-voucher lines;  ?id=&entries= → summary rows;  ?id= → pdfData
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const id = sp.get('id')

  if (id && sp.get('items')) {
    const r = await prisma.reimbursementReport.findUnique({ where: { id }, select: { module: true } })
    if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const refunds = await prisma.refund.findMany({ where: { refundRfpId: id }, orderBy: { date: 'asc' } })
    // Refunds carry no VAT/EWT — the payable amount is the net cash returned.
    return NextResponse.json({ lines: refunds.map(rf => {
      const net = Number(rf.netAmount)
      return { account: 'Unearned Revenue', description: `Refund — ${rf.patientName}${rf.reason ? ` (${rf.reason})` : ''}`, payee: rf.patientName, memo: rf.reason || '', gross: net, vat: 0, netVat: net, ewt: 0, netEwt: net }
    }) })
  }

  if (id && sp.get('entries')) {
    const rep = await prisma.reimbursementReport.findUnique({ where: { id }, select: { payableTo: true, refNumber: true, branch: true } })
    if (!rep) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const refunds = await prisma.refund.findMany({ where: { refundRfpId: id }, orderBy: { date: 'asc' } })
    return NextResponse.json({
      payableTo: rep.payableTo, refNumber: rep.refNumber, branch: rep.branch,
      entries: refunds.map(rf => ({
        pcvNumber: '', requestor: rf.patientName, date: rf.date ? rf.date.toISOString().slice(0, 10) : null,
        accountTitle: 'Unearned Revenue', description: `Refund — ${rf.patientName}${rf.reason ? ` (${rf.reason})` : ''}`,
        vatable: 'NV', grossAmount: Number(rf.netAmount), hasEwt: false, ewtRate: null,
      })),
    })
  }

  if (id) {
    const r = await prisma.reimbursementReport.findUnique({ where: { id }, select: { pdfData: true, refNumber: true } })
    if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(r)
  }

  const branch = sp.get('branch') || ''
  if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
  const reports = await prisma.reimbursementReport.findMany({
    where: { branch, module: 'REFUND' },
    select: {
      id: true, refNumber: true, grossTotal: true, status: true, module: true, meta: true, paidAt: true,
      paymentMethod: true, checkNumber: true, debitAccount: true, proofUrl: true, payableTo: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(reports.map(r => ({ ...r, grossTotal: Number(r.grossTotal), payableTotal: Number(r.grossTotal) })))
}

// POST { branch, refundIds, manualSeq } — create a refund RFP, lock the rows
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, refundIds, manualSeq } = await req.json()
    if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    if (!Array.isArray(refundIds) || refundIds.length === 0) return NextResponse.json({ error: 'Select at least one refund' }, { status: 400 })
    const mseq = manualSeq != null && String(manualSeq).trim() !== '' ? parseInt(String(manualSeq), 10) : null

    const report = await prisma.$transaction(async (tx) => {
      const refunds = await tx.refund.findMany({ where: { id: { in: refundIds }, branch, refundRfpId: null, audited: true } })
      if (refunds.length === 0) throw new Error('No eligible refunds (must be audited and not already in an RFP)')
      const grossTotal = refunds.reduce((s, r) => s + Number(r.netAmount), 0)
      const first = [...refunds].sort((a, b) => a.date.getTime() - b.date.getTime())[0]

      let settings = await tx.pettyCashSettings.findUnique({ where: { branch } })
      if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch, nextPcvSeq: 1 } })
      const seq = (mseq != null && !isNaN(mseq) && mseq > 0) ? mseq : settings.nextReimbSeq
      await tx.pettyCashSettings.update({ where: { branch }, data: { nextReimbSeq: Math.max(settings.nextReimbSeq, seq + 1) } })
      const yy = new Date().getFullYear() % 100
      const refNumber = `${BRANCH_CODE[branch]}-RFP${yy}-${String(seq).padStart(6, '0')}-REF`

      const created = await tx.reimbursementReport.create({
        data: { branch, refNumber, refSeq: seq, grossTotal, module: 'REFUND', payableTo: first?.patientName || null, createdById: session.user.id ?? null },
      })
      await tx.refund.updateMany({ where: { id: { in: refunds.map(r => r.id) } }, data: { refundRfpId: created.id } })
      return created
    })
    return NextResponse.json({ id: report.id, refNumber: report.refNumber, grossTotal: Number(report.grossTotal), payableTo: report.payableTo })
  } catch (e) {
    console.error('Refund RFP create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create RFP' }, { status: 500 })
  }
}

// PATCH { id, action } — 'pay' (posts DR Unearned Revenue / CR Cash) | 'unpay' | 'set-payable' | store pdfData
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
      const rep = await prisma.reimbursementReport.findUnique({ where: { id } })
      if (!rep) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const bankAccountId: string = body.paymentBankAccountId || ''
      if (!bankAccountId) return NextResponse.json({ error: 'A cash/bank account is required to post the refund' }, { status: 400 })
      const bank = await prisma.account.findUnique({ where: { id: bankAccountId }, select: { id: true, accountNumber: true, accountTitle: true } })
      if (!bank) return NextResponse.json({ error: 'Bank account not found' }, { status: 400 })
      // Therapy refunds return money that was PREPAID and never recognised as revenue, so they
      // must not touch revenue — 7160 Sales Returns is contra-revenue for merchandise/sales that
      // WERE earned (Verdana product returns). Debiting it here would understate income.
      // Instead we debit 4055 Refunds of Unearned Revenue, a contra account to 4050 Unearned
      // Revenue: it nets against the liability on the balance sheet while keeping refunds visible
      // as their own line. Falls back to 4050 itself if 4055 hasn't been created.
      const unearned = await prisma.account.findFirst({ where: { accountNumber: '4055' }, select: { id: true } })
        ?? await prisma.account.findFirst({ where: { OR: [{ accountNumber: '4050' }, { accountTitle: { contains: 'Unearned', mode: 'insensitive' } }] }, select: { id: true } })
      if (!unearned) return NextResponse.json({ error: 'Unearned Revenue account (4050/4055) not found in Chart of Accounts' }, { status: 400 })

      const paidAt = body.datePaid ? new Date(body.datePaid) : new Date()
      const refunds = await prisma.refund.findMany({ where: { refundRfpId: id } })
      const grossTotal = refunds.reduce((s, r) => s + Number(r.refundAmount), 0)
      const chargesTotal = refunds.reduce((s, r) => s + Number(r.chargesDeducted), 0)
      const total = refunds.reduce((s, r) => s + Number(r.netAmount), 0)   // cash actually returned
      if (total <= 0) return NextResponse.json({ error: 'Nothing to pay' }, { status: 400 })

      // Charges withheld are retained by the clinic → earned income, credited to 7220.
      // Without this the charge would stay stranded in Unearned Revenue forever.
      let chargesAccountId: string | null = null
      if (chargesTotal > 0) {
        const chargesAcct = await prisma.account.findFirst({ where: { accountNumber: '7220' }, select: { id: true } })
        if (!chargesAcct) return NextResponse.json({ error: 'Account 7220 (Other Comprehensive Income) not found — needed to book the charges deducted' }, { status: 400 })
        chargesAccountId = chargesAcct.id
      }

      await prisma.$transaction(async (tx) => {
        const je = await postJournalEntry(tx, {
          entryDate: paidAt,
          description: `Patient refund${refunds.length > 1 ? `s (${refunds.length})` : ` — ${refunds[0]?.patientName || ''}`} · ${rep.refNumber}`,
          referenceType: 'REFUND_PAYMENT',
          referenceId: id,
          branch: rep.branch,
          createdById: session.user!.id as string,
          // DR Unearned Revenue (gross released) / CR Cash (net to patient) + CR Income (charges kept)
          lines: [
            { accountId: unearned.id, debit: grossTotal, credit: 0, description: 'Refund of unearned revenue — patient prepayment' },
            { accountId: bank.id, debit: 0, credit: total, description: `Cash refund via ${bank.accountTitle}` },
            ...(chargesAccountId && chargesTotal > 0
              ? [{ accountId: chargesAccountId, debit: 0, credit: chargesTotal, description: 'Refund charges retained' }]
              : []),
          ],
        })
        await tx.reimbursementReport.update({
          where: { id },
          data: { status: 'PAID', paidAt, paymentMethod: body.paymentMethod || null, checkNumber: body.checkNumber || null, debitAccount: bank.accountNumber, proofUrl: body.proofUrl || null },
        })
        await tx.refund.updateMany({
          where: { refundRfpId: id },
          data: { paidAt, paymentMethod: body.paymentMethod || null, checkNumber: body.checkNumber || null, paymentBankAccount: `${bank.accountNumber} · ${bank.accountTitle}`, journalEntryId: je.id },
        })
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'set-payable') {
      await prisma.reimbursementReport.update({ where: { id }, data: { payableTo: (body.payableTo ?? '').trim() || null } })
      return NextResponse.json({ success: true })
    }

    if (action === 'unpay') {
      await prisma.$transaction(async (tx) => {
        // Reverse the posted JE (delete it), clear payment on the RFP + member refunds.
        const refunds = await tx.refund.findMany({ where: { refundRfpId: id }, select: { journalEntryId: true } })
        const jeIds = Array.from(new Set(refunds.map(r => r.journalEntryId).filter(Boolean))) as string[]
        if (jeIds.length) await tx.journalEntry.deleteMany({ where: { id: { in: jeIds } } })
        await tx.reimbursementReport.update({ where: { id }, data: { status: 'PENDING', paidAt: null, paymentMethod: null, checkNumber: null, debitAccount: null, proofUrl: null } })
        await tx.refund.updateMany({ where: { refundRfpId: id }, data: { paidAt: null, paymentMethod: null, checkNumber: null, paymentBankAccount: null, journalEntryId: null } })
      })
      return NextResponse.json({ success: true })
    }

    await prisma.reimbursementReport.update({ where: { id }, data: { pdfData: body.pdfData || null } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Refund RFP patch error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to update' }, { status: 500 })
  }
}

// DELETE ?id=... — reverse JE if paid, unlock the refund rows, delete the RFP
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    await prisma.$transaction(async (tx) => {
      const refunds = await tx.refund.findMany({ where: { refundRfpId: id }, select: { journalEntryId: true } })
      const jeIds = Array.from(new Set(refunds.map(r => r.journalEntryId).filter(Boolean))) as string[]
      if (jeIds.length) await tx.journalEntry.deleteMany({ where: { id: { in: jeIds } } })
      await tx.refund.updateMany({ where: { refundRfpId: id }, data: { refundRfpId: null, paidAt: null, paymentMethod: null, checkNumber: null, paymentBankAccount: null, journalEntryId: null } })
      await tx.reimbursementReport.delete({ where: { id } })
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Refund RFP delete error:', e)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
