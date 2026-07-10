// Scholar monthly-stipend releases.
//   POST   { monthKey, date, awardIds[], bankAccountId?, expenseAccountId?, proofOfDepositUrls? }
//          → one release per award (amount = its monthlyAmount) + DR expense / CR bank JE
//   PUT    { id, action: 'proof' | 'email', ... }
//   DELETE ?id=  → reverse the JE + delete the release
// Access: ADMIN / ACCOUNTANT / BOOKKEEPER.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postScholarship, reverseEquityJournal } from '@/lib/accounting/equity'
import { sendInvestorEmail, scholarshipEmailHtml } from '@/lib/email'
import { mkLabel, isMonthKey } from '@/lib/scholars'
import { readFile } from 'fs/promises'
import { join } from 'path'

export const dynamic = 'force-dynamic'

const ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const num = (v: unknown) => Number(v || 0)

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const awardId = new URL(req.url).searchParams.get('awardId') || ''
  if (!awardId) return NextResponse.json({ error: 'awardId required' }, { status: 400 })
  const releases = await prisma.scholarRelease.findMany({ where: { awardId }, orderBy: { monthKey: 'asc' } })
  return NextResponse.json({
    releases: releases.map(r => ({ ...r, amount: num(r.amount), label: mkLabel(r.monthKey), proofOfDepositUrls: (r.proofOfDepositUrls as string[] | null) || [] })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const monthKey = String(b.monthKey || '')
    if (!isMonthKey(monthKey)) return NextResponse.json({ error: 'Valid monthKey (YYYY-MM) required' }, { status: 400 })
    const date = b.date ? new Date(b.date) : new Date()
    const awardIds: string[] = Array.isArray(b.awardIds) ? b.awardIds : []
    if (awardIds.length === 0) return NextResponse.json({ error: 'Select at least one scholar' }, { status: 400 })
    const proofOfDepositUrls = Array.isArray(b.proofOfDepositUrls) ? b.proofOfDepositUrls : undefined

    const awards = await prisma.scholarAward.findMany({ where: { id: { in: awardIds } } })
    const existing = await prisma.scholarRelease.findMany({ where: { awardId: { in: awardIds }, monthKey }, select: { awardId: true } })
    const already = new Set(existing.map(e => e.awardId))

    const created: string[] = []
    const skipped: string[] = []
    for (const a of awards) {
      if (already.has(a.id)) { skipped.push(a.scholarName); continue }
      const bankAccountId = b.bankAccountId || a.bankAccountId || null
      const expenseAccountId = b.expenseAccountId || a.expenseAccountId || null
      const amount = num(a.monthlyAmount)
      await prisma.$transaction(async (tx) => {
        const rel = await tx.scholarRelease.create({ data: {
          awardId: a.id, monthKey, date, amount,
          bankAccountId, expenseAccountId,
          proofOfDepositUrls, createdById: session.user!.id ?? null,
        } })
        if (bankAccountId && expenseAccountId && amount > 0) {
          const jeId = await postScholarship(tx, { refId: rel.id, date, amount, bankAccountId, expenseAccountId, label: `Scholarship stipend ${mkLabel(monthKey)} — ${a.scholarName}`, createdById: session.user!.id as string })
          if (jeId) await tx.scholarRelease.update({ where: { id: rel.id }, data: { journalEntryId: jeId } })
        }
        created.push(rel.id)
      })
    }
    return NextResponse.json({ created: created.length, skipped })
  } catch (e) {
    console.error('Scholar release create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const rel = await prisma.scholarRelease.findUnique({ where: { id: b.id }, include: { award: true } })
    if (!rel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (b.action === 'proof') {
      await prisma.scholarRelease.update({ where: { id: b.id }, data: { proofOfDepositUrls: Array.isArray(b.proofOfDepositUrls) ? b.proofOfDepositUrls : [] } })
      return NextResponse.json({ success: true })
    }
    if (b.action === 'email') {
      const to = rel.award.email
      if (!to) return NextResponse.json({ error: 'This scholar has no email on file' }, { status: 400 })
      const proofs = Array.isArray(rel.proofOfDepositUrls) ? (rel.proofOfDepositUrls as string[]) : []
      const attachments: { filename: string; content: string }[] = []
      const uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads')
      for (const u of proofs) { try { const fn = u.split('/').pop() || 'proof'; attachments.push({ filename: fn, content: (await readFile(join(uploadsDir, fn))).toString('base64') }) } catch { /* skip */ } }
      const html = scholarshipEmailHtml({ name: rel.award.scholarName, amount: num(rel.amount), date: new Date(rel.date), periodLabel: mkLabel(rel.monthKey), scholarshipType: rel.award.scholarshipType })
      const r = await sendInvestorEmail({ to, subject: `Your scholarship stipend (${mkLabel(rel.monthKey)}) has been released`, html, attachments })
      if (!r.ok) return NextResponse.json({ error: r.error || 'Email failed to send' }, { status: 502 })
      await prisma.scholarRelease.update({ where: { id: rel.id }, data: { emailedAt: new Date() } })
      return NextResponse.json({ success: true, from: r.from })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    console.error('Scholar release update error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.$transaction(async (tx) => {
    await reverseEquityJournal(tx, 'SCHOLAR_RELEASE', id)
    await tx.scholarRelease.delete({ where: { id } })
  })
  return NextResponse.json({ success: true })
}
