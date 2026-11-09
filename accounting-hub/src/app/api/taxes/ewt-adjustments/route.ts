// /api/taxes/ewt-adjustments — Taxes → Expanded Withholding "Overdeclared
// adjustment": EWT overdeclared for a payee in one month, offset from a later
// month (lib/taxes/ewt-adjustments). GET lists a branch's adjustments; POST
// adds, PUT edits, DELETE removes. A half already ticked into an EWT RFP is
// locked: its amount and month can't change and the adjustment can't be
// removed until that RFP is deleted.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isYm, ymLabel } from '@/lib/taxes/ewt-adjustments'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const BRANCHES = ['SBEA', 'SBGH', 'VERDANA', 'AHI']
const r2 = (n: number) => Math.round(n * 100) / 100

interface Body { id?: string; payrollBranch?: string; payeeName?: string; overMonth?: string; offsetMonth?: string; amount?: number | string; note?: string | null }

function validate(b: Body): { error: string } | { payrollBranch: string; payeeName: string; overMonth: string; offsetMonth: string; amount: number; note: string | null } {
  const payrollBranch = String(b.payrollBranch || '')
  if (!BRANCHES.includes(payrollBranch)) return { error: 'Pick a branch' }
  const payeeName = String(b.payeeName || '').replace(/\s+/g, ' ').trim()
  if (!payeeName) return { error: 'Enter the payee' }
  if (!isYm(b.overMonth)) return { error: 'Pick the month the tax was overdeclared' }
  if (!isYm(b.offsetMonth)) return { error: 'Pick the month to offset it from' }
  if (b.offsetMonth <= b.overMonth) return { error: `The offset month must come after ${ymLabel(b.overMonth)}` }
  const amount = r2(Number(b.amount))
  if (!(amount > 0)) return { error: 'Enter the additional (overdeclared) amount' }
  const note = b.note != null && String(b.note).trim() ? String(b.note).trim() : null
  return { payrollBranch, payeeName, overMonth: b.overMonth, offsetMonth: b.offsetMonth, amount, note }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payrollBranch = new URL(req.url).searchParams.get('payrollBranch') || ''
  const rows = await prisma.ewtAdjustment.findMany({
    where: payrollBranch ? { payrollBranch } : {},
    orderBy: [{ overMonth: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ adjustments: rows.map(r => ({ ...r, amount: Number(r.amount) })) })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const v = validate(await req.json().catch(() => ({})))
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
  const row = await prisma.ewtAdjustment.create({
    data: { ...v, createdById: session.user.id as string, createdByName: session.user.name ?? null },
  })
  await prisma.auditLog.create({
    data: { userId: session.user.id as string, action: 'CREATE', entity: 'EwtAdjustment', entityId: row.id, details: { ...v } },
  }).catch(() => {})
  return NextResponse.json({ ...row, amount: Number(row.amount) })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const body: Body = await req.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const cur = await prisma.ewtAdjustment.findUnique({ where: { id: body.id } })
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const v = validate({ payrollBranch: cur.payrollBranch, ...body })
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
  if (v.payrollBranch !== cur.payrollBranch) return NextResponse.json({ error: 'The branch of an adjustment cannot change' }, { status: 400 })
  // A half already in an RFP keeps its month and amount — that RFP carries them.
  const amountChanged = r2(Number(cur.amount)) !== v.amount
  if (cur.overRemitted && (amountChanged || v.overMonth !== cur.overMonth || v.payeeName !== cur.payeeName)) {
    return NextResponse.json({ error: `The ${ymLabel(cur.overMonth)} additional is already in an EWT RFP. Delete that RFP first to change the payee, amount or month.` }, { status: 409 })
  }
  if (cur.offsetRemitted && (amountChanged || v.offsetMonth !== cur.offsetMonth || v.payeeName !== cur.payeeName)) {
    return NextResponse.json({ error: `The ${ymLabel(cur.offsetMonth)} offset is already in an EWT RFP. Delete that RFP first to change the payee, amount or month.` }, { status: 409 })
  }
  const row = await prisma.ewtAdjustment.update({
    where: { id: cur.id },
    data: { payeeName: v.payeeName, overMonth: v.overMonth, offsetMonth: v.offsetMonth, amount: v.amount, note: v.note },
  })
  const before = { payeeName: cur.payeeName, overMonth: cur.overMonth, offsetMonth: cur.offsetMonth, amount: Number(cur.amount), note: cur.note }
  await prisma.auditLog.create({
    data: { userId: session.user.id as string, action: 'UPDATE', entity: 'EwtAdjustment', entityId: row.id, details: { before, after: { payeeName: v.payeeName, overMonth: v.overMonth, offsetMonth: v.offsetMonth, amount: v.amount, note: v.note } } },
  }).catch(() => {})
  return NextResponse.json({ ...row, amount: Number(row.amount) })
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  const cur = id ? await prisma.ewtAdjustment.findUnique({ where: { id } }) : null
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (cur.overRemitted || cur.offsetRemitted) {
    const which = [cur.overRemitted && `the ${ymLabel(cur.overMonth)} additional`, cur.offsetRemitted && `the ${ymLabel(cur.offsetMonth)} offset`].filter(Boolean).join(' and ')
    return NextResponse.json({ error: `This adjustment can't be removed while ${which} is in an EWT RFP. Delete that RFP first.` }, { status: 409 })
  }
  await prisma.ewtAdjustment.delete({ where: { id } })
  await prisma.auditLog.create({
    data: { userId: session.user.id as string, action: 'DELETE', entity: 'EwtAdjustment', entityId: id, details: { payeeName: cur.payeeName, overMonth: cur.overMonth, offsetMonth: cur.offsetMonth, amount: Number(cur.amount), note: cur.note, payrollBranch: cur.payrollBranch } },
  }).catch(() => {})
  return NextResponse.json({ success: true })
}
