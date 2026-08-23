import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { chequeDigits, chequeKey } from '@/lib/cheque-number'

/**
 * Check Release Monitoring — GET /api/fund-transfers/checks?accountId=<id|all>
 *
 * Aggregates every check drawn from a CHECKING account (Account.isCheckingAccount)
 * across the four payment sources, enumerated by check number:
 * Only genuine cheques are listed. Petty cash / RFP rows also store a reference in
 * checkNumber for other payment methods — a Telegraphic Transfer keeps its bank
 * reference there (e.g. "PAYROLL BOB Reference # 1-00762002") — so those are excluded
 * by payment method rather than by guessing at the shape of the number.
 *
 *   - Petty Cash / Expenses (PettyCashEntry.paymentBankAccount)
 *   - RFP / Tax payments     (ReimbursementReport.debitAccount | depositAccount)
 *   - Fund Transfers         (FundTransfer.fromAccountId)
 * Not branch-scoped — Fund Transfer shows all transactions regardless of branch.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountId = new URL(req.url).searchParams.get('accountId') || 'all'

  // Payment method that actually means a cheque was written.
  const CHECK_METHOD = 'Check deposit'

  // The dropdown must always list ALL checking accounts. Only the check ROWS are
  // scoped to the selected account — filtering the account list itself made the
  // other accounts vanish once one was picked.
  const allChecking = await prisma.account.findMany({
    where: { isCheckingAccount: true },
    select: { id: true, accountNumber: true, accountTitle: true },
  })
  const accountsList = allChecking.map(a => ({ id: a.id, label: `${a.accountNumber} ${a.accountTitle}` }))
  if (allChecking.length === 0) return NextResponse.json({ checks: [], accounts: [] })

  const checking = accountId !== 'all' ? allChecking.filter(a => a.id === accountId) : allChecking
  if (checking.length === 0) return NextResponse.json({ checks: [], accounts: accountsList })

  const idSet = new Set(checking.map(a => a.id))
  // Petty cash / RFP store the bank as the "<accountNumber> <accountTitle>" string.
  const strMap = new Map<string, { id: string; label: string }>()
  for (const a of checking) {
    strMap.set(`${a.accountNumber} ${a.accountTitle}`, { id: a.id, label: `${a.accountNumber} ${a.accountTitle}` })
  }
  const strKeys = [...strMap.keys()]
  const labelFor = (s: string | null) => (s && strMap.has(s) ? strMap.get(s)!.label : s || '')

  type Group = Omit<Row, 'id' | 'kind'> & { id?: string; kind?: Row['kind'] | 'REGISTER'; items: Row[]; registeredAmount?: number; registerStatus?: string; cleared?: boolean; clearedOn?: string | null }
  type Row = { cleared?: boolean; clearedOn?: string | null; id?: string; kind?: 'PETTY_CASH' | 'RFP' | 'FUND_TRANSFER' | 'CANCELLED' | 'REGISTER'; source: string; checkNumber: string; date: string | null; amount: number; reference: string; payee: string; bankAccount: string; proofUrls?: string[] }
  const rows: Row[] = []

  // 1. Petty Cash + Expenses
  const pce = await prisma.pettyCashEntry.findMany({
    where: { checkNumber: { not: null }, paymentBankAccount: { in: strKeys }, paymentMethod: CHECK_METHOD },
    select: { id: true, checkNumber: true, paidAt: true, date: true, grossAmount: true, requestor: true, registeredName: true, accountTitle: true, pcvNumber: true, recordType: true, paymentBankAccount: true },
  })
  for (const e of pce) {
    rows.push({
      id: e.id, kind: 'PETTY_CASH',
      source: e.recordType === 'PETTY_CASH' ? 'Petty Cash' : 'Expense',
      checkNumber: e.checkNumber || '',
      date: (e.paidAt || e.date)?.toISOString().slice(0, 10) || null,
      amount: Number(e.grossAmount || 0),
      reference: e.pcvNumber || '',
      payee: e.registeredName || e.requestor || e.accountTitle || '',
      bankAccount: labelFor(e.paymentBankAccount),
    })
  }

  // 2. RFP / Tax payments (amount = sum of linked entries)
  const rfps = await prisma.reimbursementReport.findMany({
    where: { checkNumber: { not: null }, paymentMethod: CHECK_METHOD, OR: [{ debitAccount: { in: strKeys } }, { depositAccount: { in: strKeys } }] },
    select: { id: true, checkNumber: true, paidAt: true, refNumber: true, debitAccount: true, depositAccount: true, entries: { select: { grossAmount: true } } },
  })
  for (const r of rfps) {
    const bank = strMap.has(r.debitAccount || '') ? r.debitAccount : r.depositAccount
    rows.push({
      id: r.id, kind: 'RFP',
      source: 'RFP / Tax',
      checkNumber: r.checkNumber || '',
      date: r.paidAt?.toISOString().slice(0, 10) || null,
      amount: r.entries.reduce((s, e) => s + Number(e.grossAmount || 0), 0),
      reference: r.refNumber || '',
      payee: '',
      bankAccount: labelFor(bank),
    })
  }

  // 3. Fund Transfers (drawn from the checking account)
  const fts = await prisma.fundTransfer.findMany({
    where: { checkNumber: { not: null }, fromAccountId: { in: [...idSet] } },
    select: { id: true, checkNumber: true, date: true, amount: true, description: true, refNumber: true, fromAccountId: true },
  })
  const acctById = new Map(checking.map(a => [a.id, `${a.accountNumber} ${a.accountTitle}`]))
  for (const f of fts) {
    rows.push({
      id: f.id, kind: 'FUND_TRANSFER',
      source: 'Fund Transfer',
      checkNumber: f.checkNumber || '',
      date: f.date?.toISOString().slice(0, 10) || null,
      amount: Number(f.amount || 0),
      reference: f.refNumber || '',
      payee: f.description || '',
      bankAccount: acctById.get(f.fromAccountId) || '',
    })
  }

  // 4a. Which records has bank reconciliation actually matched a bank line to?
  // A cheque has cleared when the bank shows the money leaving — that is exactly
  // what a bank-rec match records. Without one the cheque was written but has not
  // been seen on the statement: still outstanding, stopped, or never presented.
  const matched = await prisma.bankTransaction.findMany({
    where: { bankAccountId: { in: [...idSet] }, matchId: { not: null }, status: 'POSTED' },
    select: { matchId: true, date: true },
  })
  const clearedById = new Map<string, Date>()
  // A MULTI match stores several record ids comma-joined in one matchId; each
  // of those records cleared on that line. Earliest date wins when a record
  // spans several bank lines.
  for (const m of matched) {
    if (!m.matchId) continue
    for (const id of m.matchId.split(',')) {
      const key = id.trim()
      if (!key) continue
      const prev = clearedById.get(key)
      if (!prev || m.date < prev) clearedById.set(key, m.date)
    }
  }

  // 4b. The chequebook register — every leaf, including cancelled and unused.
  const register = await prisma.issuedCheque.findMany({
    where: { accountId: { in: [...idSet] } },
    select: { id: true, checkNumber: true, date: true, amount: true, payee: true, status: true, note: true, accountId: true },
  })

  // 4. Manually-recorded cancelled checks
  const cancelled = await prisma.cancelledCheck.findMany({
    where: { accountId: { in: [...idSet] } },
    select: { id: true, checkNumber: true, date: true, amount: true, reason: true, payee: true, accountId: true, proofUrls: true },
  })
  for (const cc of cancelled) {
    rows.push({
      id: cc.id,
      source: 'Cancelled',
      checkNumber: cc.checkNumber || '',
      date: cc.date?.toISOString().slice(0, 10) || null,
      amount: Number(cc.amount || 0),
      reference: cc.reason || '',
      payee: cc.payee || '',
      bankAccount: acctById.get(cc.accountId) || '',
      proofUrls: Array.isArray(cc.proofUrls) ? (cc.proofUrls as string[]) : [],
    })
  }

  // The register is the spine: it says which cheque leaves exist and what each
  // was written for. Rows from petty cash / RFP / fund transfers describe what
  // the cheque PAID, so they become the breakdown beneath it rather than
  // separate cheques — and the register's own amount is what the cheque was for,
  // never the sum of the lines, which may be incomplete.
  const regByNumber = new Map<string, typeof register[number]>()
  for (const r of register) regByNumber.set(`${chequeKey(r.checkNumber) || r.checkNumber}|${acctById.get(r.accountId) || ''}`, r)

  // A cheque book lists cheques. Anything whose reference names another
  // instrument — a telegraphic transfer keeps its bank reference in the same
  // column — is dropped here rather than shown as a cheque with no number.
  const cheques = rows
    .map(r => ({
      ...r,
      checkNumber: chequeDigits(r.checkNumber) || '',
      cleared: r.id ? clearedById.has(r.id) : false,
      clearedOn: r.id ? clearedById.get(r.id)?.toISOString().slice(0, 10) || null : null,
    }))
    .filter(r => r.checkNumber !== '')

  // One cheque, one row. The same cheque appears once per expense line when the
  // lines sit under different account titles; those are the SAME payment, so
  // they are folded into a single row whose amount is the cheque's total and
  // whose `items` carry what made it up.
  const byCheque = new Map<string, Group>()
  for (const r of cheques) {
    // Identity ignores zero-padding: the book writes 273801, the hub stores
    // 0000273801, and those are the same cheque.
    const key = `${chequeKey(r.checkNumber) || r.checkNumber}|${r.bankAccount}`
    const g = byCheque.get(key)
    if (!g) {
      byCheque.set(key, {
        checkNumber: r.checkNumber, bankAccount: r.bankAccount, date: r.date,
        amount: r.amount, source: r.source, reference: r.reference, payee: r.payee,
        id: r.id, kind: r.kind, proofUrls: r.proofUrls, items: [r],
        cleared: r.cleared, clearedOn: r.clearedOn,
      })
      continue
    }
    g.amount += r.amount
    g.items.push(r)
    // Show the fullest form of the number that any record carries.
    if (r.checkNumber.length > g.checkNumber.length) g.checkNumber = r.checkNumber
    // One matched line is enough: the cheque was seen leaving the account.
    if (r.cleared) { g.cleared = true; g.clearedOn = g.clearedOn || r.clearedOn }
    if (!g.date || (r.date && r.date < g.date)) g.date = r.date
    if (g.source !== r.source) g.source = 'Multiple'
    if (g.payee !== r.payee) g.payee = g.payee || r.payee
    // A grouped row is no longer one record, so it cannot be edited as one.
    g.id = undefined; g.kind = undefined
  }

  // Fold the register in: a leaf with recorded payments keeps them as its
  // breakdown; a leaf with none is still listed, so gaps in the book show up.
  for (const [key, r] of regByNumber) {
    const digits = chequeDigits(r.checkNumber) || r.checkNumber
    const bank = acctById.get(r.accountId) || ''
    const g = byCheque.get(key)
    const registered = {
      checkNumber: digits, bankAccount: bank,
      date: r.date?.toISOString().slice(0, 10) || null,
      amount: Number(r.amount || 0),
      payee: r.payee || '',
      note: r.note || '',
      status: r.status,
    }
    if (!g) {
      byCheque.set(key, {
        ...registered, kind: 'REGISTER', id: r.id, items: [],
        source: r.status === 'CANCELLED' ? 'Cancelled' : r.status === 'UNUSED' ? 'Unused' : 'Chequebook',
        reference: r.note || '',
      } as Group)
      continue
    }
    // Recorded payments exist — the register still owns the cheque's own facts.
    g.registeredAmount = registered.amount
    g.registerStatus = r.status
    g.payee = g.payee || registered.payee
    if (!g.date) g.date = registered.date
    if (r.status === 'CANCELLED') g.source = 'Cancelled'
  }

  const grouped = [...byCheque.values()].map(g => {
    const single = g.items.length === 1 && g.registeredAmount === undefined
    const base = single ? { ...g.items[0], items: [] as Row[] } : { ...g, reference: g.items.length > 1 ? `${g.items.length} entries` : g.reference }
    if (g.registeredAmount === undefined) return base
    const lines = g.items.reduce((s, x) => s + x.amount, 0)
    return {
      ...base,
      // What the cheque was written for, per the chequebook.
      amount: g.registeredAmount,
      recordedTotal: g.items.length ? lines : undefined,
      // Flagged when the recorded expenses do not add up to the cheque.
      mismatch: g.items.length > 0 && Math.round(lines * 100) !== Math.round(g.registeredAmount * 100),
      registerStatus: g.registerStatus,
    }
  })

  // Enumerate by check number (numeric — they are all digits now)
  grouped.sort((a, b) => {
    const na = parseInt(a.checkNumber, 10), nb = parseInt(b.checkNumber, 10)
    return na !== nb ? na - nb : a.checkNumber.localeCompare(b.checkNumber)
  })

  return NextResponse.json({ checks: grouped, accounts: accountsList })
}

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

// POST — record a cancelled check for a checking account.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes((session.user as { role?: string }).role || '')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { accountId, checkNumber, date, reason, payee, amount, proofUrls } = await req.json()
    if (!accountId || !checkNumber?.trim() || !date) {
      return NextResponse.json({ error: 'Checking account, check number and date are required' }, { status: 400 })
    }
    const acct = await prisma.account.findFirst({ where: { id: accountId, isCheckingAccount: true } })
    if (!acct) return NextResponse.json({ error: 'Not a valid checking account' }, { status: 400 })
    const created = await prisma.cancelledCheck.create({
      data: {
        accountId,
        checkNumber: String(checkNumber).trim(),
        date: new Date(date),
        reason: reason?.trim() || null,
        payee: payee?.trim() || null,
        amount: Number(amount) || 0,
        proofUrls: Array.isArray(proofUrls) && proofUrls.length ? proofUrls : undefined,
        createdById: session.user.id as string,
      },
    })
    return NextResponse.json({ ok: true, id: created.id })
  } catch (e) {
    console.error('Cancelled check create error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — remove a mistakenly-recorded cancelled check by id.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes((session.user as { role?: string }).role || '')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await prisma.cancelledCheck.deleteMany({ where: { id } })
  return NextResponse.json({ ok: true })
}


/**
 * PATCH — correct a cheque number at its source.
 *
 * The number lives on the originating record (petty cash / expense entry, RFP, fund
 * transfer or cancelled cheque); the journal entry does not hold a copy — it points at
 * the source through referenceType/referenceId — so fixing the source is the whole job
 * and the ledger follows automatically.
 */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
  if (!WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { kind, id, checkNumber } = await req.json()
    const next = typeof checkNumber === 'string' ? checkNumber.trim() : ''
    if (!kind || !id) return NextResponse.json({ error: 'kind and id are required' }, { status: 400 })
    if (!next) return NextResponse.json({ error: 'Enter the corrected cheque number' }, { status: 400 })

    let before: string | null = null
    let entity = ''
    if (kind === 'PETTY_CASH') {
      const row = await prisma.pettyCashEntry.findUnique({ where: { id }, select: { checkNumber: true } })
      if (!row) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
      before = row.checkNumber; entity = 'pettyCashEntry'
      await prisma.pettyCashEntry.update({ where: { id }, data: { checkNumber: next } })
    } else if (kind === 'RFP') {
      const row = await prisma.reimbursementReport.findUnique({ where: { id }, select: { checkNumber: true } })
      if (!row) return NextResponse.json({ error: 'RFP not found' }, { status: 404 })
      before = row.checkNumber; entity = 'reimbursementReport'
      await prisma.reimbursementReport.update({ where: { id }, data: { checkNumber: next } })
    } else if (kind === 'FUND_TRANSFER') {
      const row = await prisma.fundTransfer.findUnique({ where: { id }, select: { checkNumber: true } })
      if (!row) return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
      before = row.checkNumber; entity = 'fundTransfer'
      await prisma.fundTransfer.update({ where: { id }, data: { checkNumber: next } })
    } else if (kind === 'CANCELLED') {
      const row = await prisma.cancelledCheck.findUnique({ where: { id }, select: { checkNumber: true } })
      if (!row) return NextResponse.json({ error: 'Cancelled cheque not found' }, { status: 404 })
      before = row.checkNumber; entity = 'cancelledCheck'
      await prisma.cancelledCheck.update({ where: { id }, data: { checkNumber: next } })
    } else {
      return NextResponse.json({ error: `Unknown source: ${kind}` }, { status: 400 })
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id, action: 'UPDATE', entity, entityId: id,
        details: { field: 'checkNumber', from: before, to: next, via: 'Check Release Monitoring' },
      },
    })

    return NextResponse.json({ ok: true, checkNumber: next, previous: before })
  } catch (e) {
    console.error('Check number update failed:', e)
    return NextResponse.json({ error: 'Failed to update the cheque number' }, { status: 500 })
  }
}
