import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postDividend, reverseEquityJournal } from '@/lib/accounting/equity'
import { sendInvestorEmail, dividendEmailHtml } from '@/lib/email'
import { readFile } from 'fs/promises'
import { join } from 'path'

const ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const num = (v: unknown) => Number(v || 0)

function qkOf(y: number, m0: number) { const q = Math.floor(m0 / 3) + 1; return { key: `${y}-Q${q}`, label: `Q${q} ${y}` } }
function qkDate(d: Date) { return qkOf(d.getUTCFullYear(), d.getUTCMonth()) }

// Per-shareholder preferred summary: total shares, quarterly dividend (interest/4),
// and the set of quarters the shareholder is due (from each preferred share's payout
// start over its maturity, quarterly).
async function preferredSummary() {
  const shares = await prisma.preferredShare.findMany({ include: { shareholder: { select: { name: true, email: true } } } })
  const per = new Map<string, { shareholderId: string; name: string; email: string | null; shares: number; quarterly: number; quarters: Set<string> }>()
  for (const p of shares) {
    const invest = num(p.numberOfShares) * num(p.pricePerShare)
    const annual = invest * (num(p.annualInterest) / 100)
    const quarterly = annual / 4
    const cur = per.get(p.shareholderId) || { shareholderId: p.shareholderId, name: p.shareholder.name, email: p.shareholder.email, shares: 0, quarterly: 0, quarters: new Set<string>() }
    cur.shares += num(p.numberOfShares)
    cur.quarterly += quarterly
    // Due quarters = quarterly from the payout start over the maturity. If no explicit
    // payout start, fall back to the acquisition date so the matrix has a denominator.
    const startY = p.payoutStartYear || (p.dateAcquired ? new Date(p.dateAcquired).getUTCFullYear() : null)
    const startM = p.payoutStartMonth || (p.dateAcquired ? new Date(p.dateAcquired).getUTCMonth() + 1 : null)
    if (startY && startM) {
      const n = (p.maturityYears || 5) * 4
      for (let i = 0; i < n; i++) {
        const d = new Date(Date.UTC(startY, (startM - 1) + i * 3, 1))
        cur.quarters.add(qkDate(d).key)
      }
    }
    per.set(p.shareholderId, cur)
  }
  return per
}

export async function GET() {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const [releases, per] = await Promise.all([
    prisma.preferredDividendRelease.findMany({ include: { items: true }, orderBy: { date: 'desc' } }),
    preferredSummary(),
  ])
  const shareholders = [...per.values()].map(h => ({ shareholderId: h.shareholderId, name: h.name, email: h.email, shares: h.shares, quarterly: Math.round(h.quarterly * 100) / 100 }))

  // Per-quarter matrix: due = # shareholders active that quarter, paid = # with a paid item that quarter.
  const dueBy = new Map<string, Set<string>>()
  for (const h of per.values()) for (const q of h.quarters) { if (!dueBy.has(q)) dueBy.set(q, new Set()); dueBy.get(q)!.add(h.shareholderId) }
  const paidBy = new Map<string, Set<string>>()
  for (const r of releases) { const q = r.quarterKey; if (!paidBy.has(q)) paidBy.set(q, new Set()); for (const it of r.items) if (it.paidDate) paidBy.get(q)!.add(it.shareholderId) }
  const quarterKeys = [...new Set([...dueBy.keys(), ...paidBy.keys()])].sort()
  const matrix = quarterKeys.map(q => {
    const [y, qq] = q.split('-Q')
    return { quarterKey: q, label: `Q${qq} ${y}`, due: dueBy.get(q)?.size || 0, paid: [...(paidBy.get(q) || [])].filter(id => dueBy.get(q)?.has(id) ?? true).length }
  })

  return NextResponse.json({
    releases: releases.map(r => ({ ...r, totalAmountPaid: num(r.totalAmountPaid), items: r.items.map(i => ({ ...i, shares: num(i.shares), amount: num(i.amount) })) })),
    shareholders, matrix,
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const date = b.date ? new Date(b.date) : new Date()
    const ids: string[] = Array.isArray(b.shareholderIds) ? b.shareholderIds : []
    if (ids.length === 0) return NextResponse.json({ error: 'Select at least one preferred shareholder' }, { status: 400 })
    const per = await preferredSummary()
    // Per-shareholder amount overrides (for recording past quarters whose amounts
    // may differ from today's computed quarterly). Falls back to the computed value.
    const amounts: Record<string, unknown> = (b.amounts && typeof b.amounts === 'object') ? b.amounts : {}
    const items = ids.map(id => per.get(id)).filter(Boolean).map(h => {
      const ov = amounts[h!.shareholderId]
      const amount = (ov != null && ov !== '' && !isNaN(Number(ov))) ? Math.round(Number(ov) * 100) / 100 : Math.round(h!.quarterly * 100) / 100
      return { shareholderId: h!.shareholderId, shareholderName: h!.name, shares: h!.shares, amount, paidDate: date }
    })
    if (items.length === 0) return NextResponse.json({ error: 'No matching preferred shareholders' }, { status: 400 })
    const total = items.reduce((s, i) => s + i.amount, 0)
    // Explicit quarter (from the picker) wins; otherwise derive from the payout date.
    const derived = qkDate(date)
    const key = typeof b.quarterKey === 'string' && b.quarterKey ? b.quarterKey : derived.key
    const label = typeof b.periodLabel === 'string' && b.periodLabel ? b.periodLabel : derived.label
    const created = await prisma.$transaction(async (tx) => {
      const rel = await tx.preferredDividendRelease.create({ data: {
        date, quarterKey: key, periodLabel: label, bankAccountId: b.bankAccountId || null, expenseAccountId: b.expenseAccountId || null,
        proofOfDepositUrls: Array.isArray(b.proofOfDepositUrls) ? b.proofOfDepositUrls : undefined, totalAmountPaid: total, createdById: session.user!.id ?? null,
      } })
      await tx.preferredDividendItem.createMany({ data: items.map(i => ({ ...i, releaseId: rel.id })) })
      let jeId: string | null = null
      if (b.bankAccountId && b.expenseAccountId && total > 0) {
        jeId = await postDividend(tx, { refType: 'DIVIDEND_PREFERRED', refId: rel.id, date, amount: total, bankAccountId: b.bankAccountId, retainedAccountId: b.expenseAccountId, label: `Preferred dividend ${label}`, createdById: session.user!.id as string })
        await tx.preferredDividendRelease.update({ where: { id: rel.id }, data: { journalEntryId: jeId } })
      }
      return rel
    })
    return NextResponse.json({ id: created.id })
  } catch (e) {
    console.error('Preferred dividend create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const rel = await prisma.preferredDividendRelease.findUnique({ where: { id: b.id }, include: { items: true } })
    if (!rel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (b.action === 'proof') {
      await prisma.preferredDividendRelease.update({ where: { id: b.id }, data: { proofOfDepositUrls: Array.isArray(b.proofOfDepositUrls) ? b.proofOfDepositUrls : [] } })
      return NextResponse.json({ success: true })
    }
    if (b.action === 'email') {
      const item = rel.items.find(i => i.id === b.itemId)
      if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
      const sh = await prisma.shareholder.findUnique({ where: { id: item.shareholderId }, select: { email: true, name: true } })
      if (!sh?.email) return NextResponse.json({ error: 'This shareholder has no email on file' }, { status: 400 })
      const proofs = Array.isArray(rel.proofOfDepositUrls) ? (rel.proofOfDepositUrls as string[]) : []
      const attachments: { filename: string; content: string }[] = []
      const uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads')
      for (const u of proofs) { try { const fn = u.split('/').pop() || 'proof'; attachments.push({ filename: fn, content: (await readFile(join(uploadsDir, fn))).toString('base64') }) } catch { /* skip */ } }
      const shares = num(item.shares), amount = num(item.amount)
      const html = dividendEmailHtml({ name: sh.name, perShare: shares > 0 ? amount / shares : 0, shares, amount, date: new Date(rel.date), type: 'REGULAR' })
      const r = await sendInvestorEmail({ to: sh.email, subject: `Notice of preferred dividend (${rel.periodLabel || ''}) — thank you for your trust`, html, attachments })
      if (!r.ok) return NextResponse.json({ error: r.error || 'Email failed to send' }, { status: 502 })
      await prisma.preferredDividendItem.update({ where: { id: item.id }, data: { emailedAt: new Date() } })
      return NextResponse.json({ success: true, from: r.from })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    console.error('Preferred dividend update error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.$transaction(async (tx) => {
    await reverseEquityJournal(tx, 'DIVIDEND_PREFERRED', id)
    await tx.preferredDividendRelease.delete({ where: { id } }) // items cascade
  })
  return NextResponse.json({ success: true })
}
