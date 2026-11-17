import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { COVERAGE_KEY_RX, readSiBranch } from '@/lib/payroll/si-coverage'
import { AmountError, applyInvoiceAmount, readAmountInput, undoInvoiceEffects } from '@/lib/payroll/si-amounts-server'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const MONTH_RX = /^\d{4}-\d{2}$/

// GET /api/payroll/si-submissions?from=YYYY-MM&to=YYYY-MM[&consultantId=]
// Service-invoice submissions in a month range. A row's `month` is a whole
// month ("YYYY-MM") or a single cutoff ("YYYY-MM-1" / "YYYY-MM-2") — see
// lib/payroll/si-coverage.ts. The Service Invoice screen reads si-tracking.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const from = sp.get('from') || ''
  const to = sp.get('to') || from
  const consultantId = sp.get('consultantId') || ''
  if (!MONTH_RX.test(from) || !MONTH_RX.test(to)) {
    return NextResponse.json({ error: 'from/to must be YYYY-MM' }, { status: 400 })
  }
  const rows = await prisma.consultantSiSubmission.findMany({
    where: {
      // "-9" keeps the last month's half-month rows ("YYYY-MM-2" > "YYYY-MM").
      month: { gte: from <= to ? from : to, lte: `${from <= to ? to : from}-9` },
      ...(consultantId ? { consultantId } : {}),
    },
    select: { consultantId: true, month: true, branch: true, siUrl: true, uploadedAt: true, siNumber: true, invoiceAmount: true, expectedAmount: true },
    orderBy: [{ month: 'asc' }],
  })
  return NextResponse.json({ submissions: rows })
}

// POST { consultantId, keys: ["YYYY-MM" | "YYYY-MM-1" | "YYYY-MM-2", ...], siUrl, branch?,
//        siNumber?, invoiceAmount?, carry?: { targetCutoff | null, note? }, skipAdjustmentIds? }
// `branch` (SBEA/SBGH/VERDANA) = the branch an interbranch consultant issued
// the invoice to; it is checked against that branch's payroll only. Omitted
// = all branches together, as for everyone else.
// Records a received Service Invoice. One invoice covering several periods
// upserts one row per whole month or half month, all pointing at the same
// uploaded copy and stamped with the same time, so the screen can show them
// as one invoice. `months` (whole months only) is still accepted.
// With invoiceAmount, the amount is checked against finalized payroll less
// any differences carried into these cutoffs; a mismatch needs `carry` (a
// cutoff whose invoice absorbs it, or null to just flag it) — see
// lib/payroll/si-amounts-server.ts.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const { consultantId, months, keys, siUrl } = body
    if (!consultantId) return NextResponse.json({ error: 'consultantId is required' }, { status: 400 })
    const raw = Array.isArray(keys) ? keys : Array.isArray(months) ? months : []
    const list: string[] = [...new Set(raw.map((m: unknown) => String(m)).filter((m: string) => COVERAGE_KEY_RX.test(m)))]
    if (!list.length) return NextResponse.json({ error: 'Pick the period the invoice covers' }, { status: 400 })
    const url = typeof siUrl === 'string' && siUrl.trim() ? siUrl.trim() : null
    const consultant = await prisma.consultant.findUnique({ where: { id: consultantId }, select: { id: true } })
    if (!consultant) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 })
    const branch = readSiBranch(body.branch)

    const amount = readAmountInput(body)
    const userId = session.user.id as string
    const uploadedAt = new Date()
    const check = await prisma.$transaction(async tx => {
      // A re-recorded invoice replaces the old one, differences included.
      await undoInvoiceEffects(tx, consultantId, list, branch)
      for (const month of list) {
        await tx.consultantSiSubmission.upsert({
          where: { consultantId_branch_month: { consultantId, branch, month } },
          update: { siUrl: url, uploadedAt, createdById: userId, siNumber: null, invoiceAmount: null, expectedAmount: null },
          create: { consultantId, branch, month, siUrl: url, uploadedAt, createdById: userId },
        })
      }
      return amount ? applyInvoiceAmount(tx, { consultantId, branch, keys: list, siUrl: url, userId, input: amount }) : null
    })
    return NextResponse.json({ ok: true, keys: list, branch, uploadedAt: uploadedAt.toISOString(), check })
  } catch (e) {
    if (e instanceof AmountError) return NextResponse.json({ error: e.message, ...(e.detail || {}) }, { status: e.status })
    console.error('SI submission save error:', e)
    return NextResponse.json({ error: 'Failed to record submission' }, { status: 500 })
  }
}

// DELETE ?consultantId=&keys=k1,k2 (or &month=k)[&branch=SBGH] — remove a
// wrongly recorded invoice: the rows it covers.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  const consultantId = sp.get('consultantId') || ''
  const list = (sp.get('keys') || sp.get('month') || '').split(',').map(k => k.trim()).filter(k => COVERAGE_KEY_RX.test(k))
  if (!consultantId || !list.length) return NextResponse.json({ error: 'consultantId and keys are required' }, { status: 400 })
  const branch = readSiBranch(sp.get('branch'))
  await prisma.$transaction(async tx => {
    await undoInvoiceEffects(tx, consultantId, list, branch)
    await tx.consultantSiSubmission.deleteMany({ where: { consultantId, branch, month: { in: list } } })
  })
  return NextResponse.json({ ok: true })
}

// PATCH { consultantId, keys, branch?, siNumber?, invoiceAmount, carry?, skipAdjustmentIds? }
// Enter or correct the amount (and SI number) of an invoice already recorded —
// e.g. ones saved before amounts were asked for. Same check as POST.
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const consultantId = String(body.consultantId || '')
    const list: string[] = [...new Set((Array.isArray(body.keys) ? body.keys : []).map((k: unknown) => String(k)).filter((k: string) => COVERAGE_KEY_RX.test(k)))] as string[]
    const amount = readAmountInput(body)
    const branch = readSiBranch(body.branch)
    if (!consultantId || !list.length) return NextResponse.json({ error: 'consultantId and keys are required' }, { status: 400 })
    if (!amount) return NextResponse.json({ error: 'Enter the amount on the invoice' }, { status: 400 })
    const rows = await prisma.consultantSiSubmission.findMany({ where: { consultantId, branch, month: { in: list } }, select: { month: true, siUrl: true } })
    if (rows.length !== list.length) return NextResponse.json({ error: 'That invoice is no longer recorded — refresh the page' }, { status: 404 })
    const check = await prisma.$transaction(async tx => {
      await undoInvoiceEffects(tx, consultantId, list, branch)
      return applyInvoiceAmount(tx, { consultantId, branch, keys: list, siUrl: rows[0].siUrl, userId: session.user.id as string, input: amount })
    })
    return NextResponse.json({ ok: true, check })
  } catch (e) {
    if (e instanceof AmountError) return NextResponse.json({ error: e.message, ...(e.detail || {}) }, { status: e.status })
    console.error('SI amount save error:', e)
    return NextResponse.json({ error: 'Failed to save the amount' }, { status: 500 })
  }
}
