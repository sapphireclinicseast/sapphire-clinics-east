import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

// Bulk internal-transfer matcher. Money moved between two of our own
// same-currency accounts is a SPENT on one statement and an equal RECEIVED on
// another — electronic transfers land the same banking day, LCK/DEPN check
// transfers are deposited at the receiving bank first and clear at the source
// 1–2 banking days later. The Match dialog pairs these one at a time; this
// pairs every unambiguous couple in one pass: equal amount, both PENDING,
// within 3 banking days, and exactly one possible counterpart on EACH side —
// any ambiguity (two same-amount candidates) is left for the Match dialog.
// Each pair records one FundTransfer and posts both legs, exactly like the
// manual interbank confirm, so undo (unpost) releases both together.
const MIN_AMOUNT = 5000    // small round sums (1,000/2,000) pair by coincidence
const WINDOW_BANKING_DAYS = 3
const MAX_PAIRS = 200

const dayKey = (d: Date) => d.toISOString().slice(0, 10)
function bankingDaysBetween(from: Date, to: Date): number {
  if (+to < +from) return bankingDaysBetween(to, from)
  let n = 0
  const d = new Date(from)
  while (dayKey(d) < dayKey(to)) {
    d.setUTCDate(d.getUTCDate() + 1)
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) n++
  }
  return n
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const dryRun = !!body.dryRun
  const minAmount = Number(body.minAmount) > 0 ? Number(body.minAmount) : MIN_AMOUNT

  const accounts = await prisma.account.findMany({
    where: { isBankAccount: true, isActive: true },
    select: { id: true, accountNumber: true, accountTitle: true, currency: true },
  })
  const acct = new Map(accounts.map(a => [a.id, a]))

  const pending = await prisma.bankTransaction.findMany({
    where: { status: 'PENDING', bankAccountId: { in: accounts.map(a => a.id) } },
    select: { id: true, bankAccountId: true, date: true, spent: true, received: true, description: true },
    orderBy: { date: 'asc' },
  })
  const spends = pending.filter(t => Number(t.spent) >= minAmount)
  const receives = pending.filter(t => Number(t.received) >= minAmount)

  type Line = (typeof pending)[number]
  const candidatesFor = (s: Line) =>
    receives.filter(r =>
      r.bankAccountId !== s.bankAccountId
      && (acct.get(r.bankAccountId)?.currency || 'PHP') === (acct.get(s.bankAccountId)?.currency || 'PHP')
      && Math.abs(Number(r.received) - Number(s.spent)) <= 0.01
      && bankingDaysBetween(r.date, s.date) <= WINDOW_BANKING_DAYS)

  // Mutual uniqueness: the spent line has one possible counterpart AND that
  // counterpart has one possible source. Two same-amount transfers in the same
  // week stay unpaired rather than guessed.
  const claimed = new Set<string>()
  const pairs: { out: Line; inn: Line }[] = []
  for (const s of spends) {
    if (pairs.length >= MAX_PAIRS) break
    if (claimed.has(s.id)) continue
    const cands = candidatesFor(s).filter(r => !claimed.has(r.id))
    if (cands.length !== 1) continue
    const r = cands[0]
    const back = spends.filter(x => !claimed.has(x.id)
      && x.bankAccountId !== r.bankAccountId
      && (acct.get(x.bankAccountId)?.currency || 'PHP') === (acct.get(r.bankAccountId)?.currency || 'PHP')
      && Math.abs(Number(r.received) - Number(x.spent)) <= 0.01
      && bankingDaysBetween(r.date, x.date) <= WINDOW_BANKING_DAYS)
    if (back.length !== 1) continue
    claimed.add(s.id); claimed.add(r.id)
    pairs.push({ out: s, inn: r })
  }

  const results: { refNumber: string; amount: number; from: string; to: string; date: string }[] = []
  if (!dryRun) {
    for (const { out, inn } of pairs) {
      const fromAcct = acct.get(out.bankAccountId)!
      const toAcct = acct.get(inn.bankAccountId)!
      const amount = Number(out.spent)
      const created = await prisma.$transaction(async (tx) => {
        let s = await tx.fundTransferSettings.findUnique({ where: { id: 'singleton' } })
        if (!s) s = await tx.fundTransferSettings.create({ data: { id: 'singleton', nextSeq: 1 } })
        const maxSeq = (await tx.fundTransfer.aggregate({ _max: { refSeq: true } }))._max.refSeq ?? 0
        const seq = Math.max(s.nextSeq, maxSeq + 1)
        await tx.fundTransferSettings.update({ where: { id: 'singleton' }, data: { nextSeq: seq + 1 } })
        const ft = await tx.fundTransfer.create({
          data: {
            refNumber: `FT${new Date().getFullYear() % 100}-${String(seq).padStart(6, '0')}`, refSeq: seq,
            date: out.date, fromAccountId: out.bankAccountId, toAccountId: inn.bankAccountId, amount,
            description: `Internal transfer · ${fromAcct.accountTitle} → ${toAcct.accountTitle}`
              + ([out.description, inn.description].filter(Boolean).length ? ` · ${[out.description, inn.description].filter(Boolean).join(' / ')}` : ''),
            createdById: session.user!.id ?? null,
          },
        })
        const label = `${ft.refNumber} · transfer ${fromAcct.accountNumber} → ${toAcct.accountNumber}`
        for (const t of [out, inn]) {
          await tx.bankTransaction.update({
            where: { id: t.id },
            data: { status: 'POSTED', matchType: 'INTERBANK', matchId: ft.id, matchLabel: label, categoryAccountId: null },
          })
        }
        return ft
      })
      results.push({
        refNumber: created.refNumber, amount,
        from: fromAcct.accountNumber, to: toAcct.accountNumber, date: dayKey(out.date),
      })
    }
  }
  return NextResponse.json({
    success: true, dryRun,
    matched: pairs.length,
    pairs: dryRun
      ? pairs.map(p => ({
          amount: Number(p.out.spent), date: dayKey(p.out.date),
          from: acct.get(p.out.bankAccountId)?.accountNumber, to: acct.get(p.inn.bankAccountId)?.accountNumber,
        }))
      : results,
  })
}
