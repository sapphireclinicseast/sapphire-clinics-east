import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
const BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD' }
const cardLabel = (c: { bank: string; cardNumber: string; bankCode: string }) => `${c.bank} •••• ${c.cardNumber.slice(-4)} (${c.bankCode})`

// GET ?branch=&status=  — list Credit Card SOAs (with card label, entry totals, linked RFP).
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  // Line items for one SOA (used to build the system SOA PDF).
  const itemsFor = sp.get('id')
  if (itemsFor && sp.get('items')) {
    const soa = await prisma.creditCardSOA.findUnique({ where: { id: itemsFor } })
    if (!soa) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const entries = await prisma.pettyCashEntry.findMany({
      where: { soaId: itemsFor },
      select: { date: true, requestor: true, description: true, accountTitle: true, grossAmount: true },
      orderBy: { date: 'asc' },
    })
    return NextResponse.json({
      refNumber: soa.refNumber, bankCode: soa.bankCode,
      items: entries.map(e => ({ date: e.date ? e.date.toISOString().slice(0, 10) : '', payee: e.requestor || '', description: e.description || '', accountTitle: e.accountTitle || '', gross: Number(e.grossAmount) })),
    })
  }
  const branch = sp.get('branch') || ''
  const status = sp.get('status') // OPEN | IN_RFP | PAID | 'active' (OPEN+IN_RFP)
  if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })

  const where: { branch: string; status?: string | { in: string[] } } = { branch }
  if (status === 'PAID') where.status = 'PAID'
  else if (status === 'active') where.status = { in: ['OPEN', 'IN_RFP'] }
  else if (status) where.status = status

  const soas = await prisma.creditCardSOA.findMany({ where, orderBy: { createdAt: 'desc' } })
  if (soas.length === 0) return NextResponse.json([])

  const cards = await prisma.creditCard.findMany({ where: { branch }, select: { id: true, bank: true, cardNumber: true, bankCode: true } })
  const cardById = new Map(cards.map(c => [c.id, c]))

  const entries = await prisma.pettyCashEntry.findMany({
    where: { soaId: { in: soas.map(s => s.id) } },
    select: { soaId: true, grossAmount: true },
  })
  const tot = new Map<string, { count: number; total: number }>()
  for (const e of entries) {
    const t = tot.get(e.soaId!) || { count: 0, total: 0 }
    t.count += 1; t.total += Number(e.grossAmount)
    tot.set(e.soaId!, t)
  }

  const rfpIds = soas.map(s => s.reimbursementId).filter(Boolean) as string[]
  const rfps = rfpIds.length ? await prisma.reimbursementReport.findMany({ where: { id: { in: rfpIds } }, select: { id: true, refNumber: true } }) : []
  const rfpById = new Map(rfps.map(r => [r.id, r.refNumber]))

  return NextResponse.json(soas.map(s => {
    const c = cardById.get(s.cardId)
    const t = tot.get(s.id) || { count: 0, total: 0 }
    return {
      id: s.id, refNumber: s.refNumber, status: s.status, paymentRoute: s.paymentRoute,
      cardId: s.cardId, cardLabel: c ? cardLabel(c) : s.bankCode,
      statementUrl: s.statementUrl, soaDocUrl: s.soaDocUrl, filingStatus: s.filingStatus,
      reimbursementId: s.reimbursementId, rfpRefNumber: s.reimbursementId ? (rfpById.get(s.reimbursementId) || '') : '',
      entryCount: t.count, total: t.total,
      paidAt: s.paidAt, createdAt: s.createdAt,
    }
  }))
}

// POST { branch, cardId, entryIds } — create one SOA from selected one-time entries.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, cardId, entryIds } = await req.json()
    if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    if (!cardId) return NextResponse.json({ error: 'Select a credit card' }, { status: 400 })
    if (!Array.isArray(entryIds) || entryIds.length === 0) return NextResponse.json({ error: 'Select at least one entry' }, { status: 400 })

    const card = await prisma.creditCard.findFirst({ where: { id: cardId, branch } })
    if (!card) return NextResponse.json({ error: 'Credit card not found for this branch' }, { status: 400 })

    const soa = await prisma.$transaction(async (tx) => {
      const entries = await tx.pettyCashEntry.findMany({
        where: { id: { in: entryIds }, branch, recordType: 'ONE_TIME', reimbursementId: null, soaId: null, paidAt: null },
      })
      if (entries.length === 0) throw new Error('No eligible one-time entries (already in an SOA/RFP or paid?)')

      const last = await tx.creditCardSOA.findFirst({ where: { branch, bankCode: card.bankCode }, orderBy: { refSeq: 'desc' } })
      const seq = (last?.refSeq || 0) + 1
      const refNumber = `${BRANCH_CODE[branch]}-SOA-${card.bankCode}-${String(seq).padStart(6, '0')}`

      const created = await tx.creditCardSOA.create({
        data: { branch, cardId, bankCode: card.bankCode, refNumber, refSeq: seq, status: 'OPEN', createdById: session.user!.id ?? null },
      })
      await tx.pettyCashEntry.updateMany({
        where: { id: { in: entries.map(e => e.id) } },
        data: { soaId: created.id, creditCardId: card.id, creditCard: cardLabel(card), paymentMethod: 'Credit card' },
      })
      return created
    })
    return NextResponse.json({ id: soa.id, refNumber: soa.refNumber })
  } catch (e) {
    console.error('SOA create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create SOA' }, { status: 500 })
  }
}

// PATCH { id, action } — upload-statement | request-rfp | pay-petty-cash | set-filing
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const { id, action } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const soa = await prisma.creditCardSOA.findUnique({ where: { id } })
    if (!soa) return NextResponse.json({ error: 'SOA not found' }, { status: 404 })

    if (action === 'upload-statement') {
      await prisma.creditCardSOA.update({ where: { id }, data: { statementUrl: body.statementUrl || null } })
      return NextResponse.json({ success: true })
    }

    if (action === 'set-filing') {
      await prisma.creditCardSOA.update({ where: { id }, data: { filingStatus: body.filingStatus === 'FILED' ? 'FILED' : 'FOR_FILING' } })
      return NextResponse.json({ success: true })
    }

    if (action === 'request-rfp') {
      if (soa.status !== 'OPEN') return NextResponse.json({ error: 'SOA is not open' }, { status: 400 })
      const rfp = await prisma.$transaction(async (tx) => {
        const entries = await tx.pettyCashEntry.findMany({ where: { soaId: id, reimbursementId: null } })
        if (entries.length === 0) throw new Error('SOA has no entries to request')
        const grossTotal = entries.reduce((s, e) => s + Number(e.grossAmount), 0)

        // An RFP is one kind: the reference suffix (VAL/INV) must reflect the entries'
        // audited validity, not a hardcoded VALID — a SOA of invalid receipts makes an
        // INV RFP. Mixed or unvalidated entries have no honest suffix, so refuse.
        const validCount = entries.filter(e => e.validity === 'Valid').length
        const invalidCount = entries.filter(e => e.validity === 'Invalid').length
        if (validCount + invalidCount < entries.length || (validCount > 0 && invalidCount > 0)) {
          throw new Error(
            `SOA entries are mixed or unvalidated (${validCount} valid, ${invalidCount} invalid, `
            + `${entries.length - validCount - invalidCount} unvalidated) — set every entry to the same `
            + `validity in One-time expense before requesting an RFP.`)
        }
        const kind = invalidCount > 0 ? 'INVALID' : 'VALID'

        let settings = await tx.pettyCashSettings.findUnique({ where: { branch: soa.branch } })
        if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch: soa.branch, nextPcvSeq: 1 } })
        const seq = settings.nextReimbSeq
        await tx.pettyCashSettings.update({ where: { branch: soa.branch }, data: { nextReimbSeq: seq + 1 } })
        const yy = new Date().getFullYear() % 100
        const refNumber = `${BRANCH_CODE[soa.branch]}-RFP${yy}-${String(seq).padStart(6, '0')}-${kind === 'INVALID' ? 'INV' : 'VAL'}`

        const created = await tx.reimbursementReport.create({
          data: { branch: soa.branch, refNumber, refSeq: seq, grossTotal, kind, module: 'EXPENSE', payableTo: soa.bankCode, meta: { soaId: id, soaRef: soa.refNumber } as object, createdById: session.user!.id ?? null },
        })
        await tx.pettyCashEntry.updateMany({ where: { id: { in: entries.map(e => e.id) } }, data: { reimbursementId: created.id } })
        await tx.creditCardSOA.update({ where: { id }, data: { status: 'IN_RFP', reimbursementId: created.id } })
        return created
      })
      return NextResponse.json({ success: true, rfpId: rfp.id, refNumber: rfp.refNumber })
    }

    if (action === 'pay-petty-cash') {
      if (soa.status === 'PAID') return NextResponse.json({ error: 'SOA is already paid' }, { status: 400 })
      const paidAt = body.datePaid ? new Date(body.datePaid) : new Date()
      const pcEntry = await prisma.$transaction(async (tx) => {
        const entries = await tx.pettyCashEntry.findMany({ where: { soaId: id } })
        const grossTotal = entries.reduce((s, e) => s + Number(e.grossAmount), 0)

        // Settlement petty-cash entry: records the cash outflow + holds the SOA doc as proof.
        // accountTitle stays null so the income-statement petty-cash fold skips it (the underlying
        // one-time entries carry the real expense detail — no double count).
        let settings = await tx.pettyCashSettings.findUnique({ where: { branch: soa.branch } })
        if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch: soa.branch, nextPcvSeq: 1 } })
        const baseSeq = settings.nextPcvSeq
        await tx.pettyCashSettings.update({ where: { branch: soa.branch }, data: { nextPcvSeq: baseSeq + 1 } })
        const yy = new Date().getFullYear() % 100
        const pcvNumber = `${BRANCH_CODE[soa.branch]}-PCV${yy}-${String(baseSeq).padStart(6, '0')}-01`
        const pc = await tx.pettyCashEntry.create({
          data: {
            branch: soa.branch, recordType: 'PETTY_CASH', pcvNumber, pcvSeq: baseSeq, pcvSub: 1,
            date: paidAt, grossAmount: grossTotal, description: `Credit Card SOA ${soa.refNumber}`,
            proofUrl: body.soaDocUrl || soa.soaDocUrl || soa.statementUrl || null,
            pcfStatus: 'For Replenishment', createdById: session.user!.id ?? null,
          },
        })
        // Underlying one-time entries become paid (via petty cash) so they surface in the Expense Report.
        await tx.pettyCashEntry.updateMany({ where: { soaId: id }, data: { paidAt, paymentMethod: 'Petty Cash (Credit Card SOA)' } })
        await tx.creditCardSOA.update({
          where: { id },
          data: { status: 'PAID', paymentRoute: 'PETTY_CASH', paidAt, pettyCashEntryId: pc.id, soaDocUrl: body.soaDocUrl || soa.soaDocUrl || null },
        })
        return pc
      })
      return NextResponse.json({ success: true, pettyCashEntryId: pcEntry.id })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    console.error('SOA patch error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to update SOA' }, { status: 500 })
  }
}

// DELETE ?id= — only when OPEN; releases its entries back to editable.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    const soa = await prisma.creditCardSOA.findUnique({ where: { id } })
    if (!soa) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (soa.status !== 'OPEN') return NextResponse.json({ error: 'Only an open SOA can be deleted' }, { status: 400 })
    await prisma.$transaction(async (tx) => {
      await tx.pettyCashEntry.updateMany({ where: { soaId: id }, data: { soaId: null, creditCardId: null, creditCard: null, paymentMethod: null } })
      await tx.creditCardSOA.delete({ where: { id } })
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('SOA delete error:', e)
    return NextResponse.json({ error: 'Failed to delete SOA' }, { status: 500 })
  }
}
