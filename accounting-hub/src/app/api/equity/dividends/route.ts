import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postDividend, reverseEquityJournal } from '@/lib/accounting/equity'
import nodemailer from 'nodemailer'
import { readFile } from 'fs/promises'
import { join } from 'path'

const ADMIN = ['ADMIN']
// Emails / proof can also be handled by accountant + bookkeeper (as specified).
const UPLOAD_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const num = (v: unknown) => Number(v || 0)

function transport() {
  return nodemailer.createTransport({ host: 'smtp.resend.com', port: 465, secure: true, auth: { user: 'resend', pass: process.env.RESEND_API_KEY || '' } })
}

// Aggregate available common shares per shareholder (net of buyback).
async function commonHoldings() {
  const commons = await prisma.commonShare.findMany({ include: { shareholder: true } })
  const byShareholder = new Map<string, { name: string; email: string | null; shares: number }>()
  for (const c of commons) {
    const avail = num(c.numberOfShares) - (c.boughtBack ? num(c.buybackShares) : 0)
    const cur = byShareholder.get(c.shareholderId) || { name: c.shareholder.name, email: c.shareholder.email, shares: 0 }
    cur.shares += avail
    byShareholder.set(c.shareholderId, cur)
  }
  return byShareholder
}

export async function GET() {
  const session = await auth()
  if (!session?.user || !UPLOAD_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const releases = await prisma.dividendRelease.findMany({ include: { items: true }, orderBy: { date: 'desc' } })
  const holdings = await commonHoldings()
  const totalCommonShares = [...holdings.values()].reduce((s, h) => s + h.shares, 0)
  return NextResponse.json({
    releases: releases.map(r => ({ ...r, dividendAmount: num(r.dividendAmount), totalAmountPaid: num(r.totalAmountPaid),
      items: r.items.map(i => ({ ...i, shares: num(i.shares), amount: num(i.amount) })) })),
    totalCommonShares,
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Only the main admin can create a dividend release' }, { status: 403 })
  try {
    const b = await req.json()
    const r = await prisma.dividendRelease.create({ data: {
      date: b.date ? new Date(b.date) : new Date(), boardResolutionUrls: Array.isArray(b.boardResolutionUrls) ? b.boardResolutionUrls : undefined,
      dividendAmount: num(b.dividendAmount), dividendType: b.dividendType || 'REGULAR', status: 'DRAFT', createdById: session.user.id ?? null,
    } })
    return NextResponse.json({ id: r.id })
  } catch (e) {
    console.error('Dividend create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !UPLOAD_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const id = b.id
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const rel = await prisma.dividendRelease.findUnique({ where: { id }, include: { items: true } })
    if (!rel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Upload proof of deposit (admin/accountant/bookkeeper)
    if (b.action === 'proof') {
      await prisma.dividendRelease.update({ where: { id }, data: { proofOfDepositUrls: Array.isArray(b.proofOfDepositUrls) ? b.proofOfDepositUrls : [] } })
      return NextResponse.json({ success: true })
    }

    // Email one shareholder (item) their dividend notice, attaching the proof of deposit.
    if (b.action === 'email') {
      const item = rel.items.find(i => i.id === b.itemId)
      if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
      const sh = await prisma.shareholder.findUnique({ where: { id: item.shareholderId }, select: { email: true, name: true } })
      if (!sh?.email) return NextResponse.json({ error: 'This shareholder has no email on file' }, { status: 400 })
      const proofs = Array.isArray(rel.proofOfDepositUrls) ? (rel.proofOfDepositUrls as string[]) : []
      const attachments: { filename: string; content: Buffer }[] = []
      const uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads')
      for (const u of proofs) {
        try { const fn = u.split('/').pop() || 'proof'; attachments.push({ filename: fn, content: await readFile(join(uploadsDir, fn)) }) } catch { /* skip */ }
      }
      const dt = rel.dividendType === 'SPECIAL' ? 'special' : 'regular'
      const html = `<div style="font-family:Arial,sans-serif;color:#111;line-height:1.6">
        <p>Dear ${sh.name},</p>
        <p>We are pleased to share that the Board has declared a <b>${dt}</b> cash dividend of <b>₱${num(rel.dividendAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</b> per share. For your <b>${num(item.shares).toLocaleString('en-PH')}</b> common shares, your dividend is <b>₱${num(item.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</b>, deposited on ${new Date(rel.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}.</p>
        <p>Thank you for standing with us. Your partnership is a quiet but powerful part of everything we're able to do, and we don't take it for granted. We remain dedicated to growing this company thoughtfully and to keeping the trust you've shown us well-placed.</p>
        <p>Your proof of deposit is attached. With gratitude,<br/><b>Sapphire Clinics East Inc.</b></p>
      </div>`
      try {
        await transport().sendMail({
          from: 'Sapphire Clinics East <main@sapphireclinicseast.org>', replyTo: 'main@sapphireclinicseast.org', to: sh.email,
          subject: 'Notice of dividend — thank you for believing in what we’re building', html, attachments,
        })
      } catch (e) { console.error('Dividend email failed:', e); return NextResponse.json({ error: 'Email failed to send' }, { status: 502 }) }
      await prisma.dividendReleaseItem.update({ where: { id: item.id }, data: { emailedAt: new Date() } })
      return NextResponse.json({ success: true })
    }

    if (rel.status === 'FINALIZED' && b.action !== 'proof') return NextResponse.json({ error: 'This dividend release is finalized' }, { status: 409 })

    // Save draft fields
    const base = {
      date: b.date ? new Date(b.date) : rel.date, boardResolutionUrls: Array.isArray(b.boardResolutionUrls) ? b.boardResolutionUrls : undefined,
      dividendAmount: b.dividendAmount != null ? num(b.dividendAmount) : rel.dividendAmount, dividendType: b.dividendType || rel.dividendType,
      bankAccountId: b.bankAccountId || null, retainedAccountId: b.retainedAccountId || null,
    }

    if (b.action === 'finalize') {
      if (!(num(base.dividendAmount) > 0)) return NextResponse.json({ error: 'Enter a dividend amount before finalizing' }, { status: 400 })
      const holdings = await commonHoldings()
      const totalShares = [...holdings.values()].reduce((s, h) => s + h.shares, 0)
      const total = num(base.dividendAmount) * totalShares
      await prisma.$transaction(async (tx) => {
        await tx.dividendReleaseItem.deleteMany({ where: { releaseId: id } })
        await tx.dividendReleaseItem.createMany({ data: [...holdings.entries()].map(([sid, h]) => ({ releaseId: id, shareholderId: sid, shareholderName: h.name, shares: h.shares, amount: num(base.dividendAmount) * h.shares })) })
        await reverseEquityJournal(tx, 'DIVIDEND_COMMON', id)
        const jeId = await postDividend(tx, { refType: 'DIVIDEND_COMMON', refId: id, date: base.date, amount: total, bankAccountId: base.bankAccountId, retainedAccountId: base.retainedAccountId, label: `Common dividend (${base.dividendType})`, createdById: session.user!.id as string })
        await tx.dividendRelease.update({ where: { id }, data: { ...base, totalAmountPaid: total, status: 'FINALIZED', finalizedAt: new Date(), journalEntryId: jeId } })
      })
      return NextResponse.json({ success: true })
    }

    await prisma.dividendRelease.update({ where: { id }, data: base })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Dividend update error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.$transaction(async (tx) => {
    await reverseEquityJournal(tx, 'DIVIDEND_COMMON', id)
    await tx.dividendRelease.delete({ where: { id } })
  })
  return NextResponse.json({ success: true })
}
