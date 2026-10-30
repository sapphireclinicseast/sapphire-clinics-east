import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeComplianceDue } from '@/lib/compliance'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'PAYROLL_OFFICER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'VIEWER']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'PAYROLL_OFFICER']
const CATEGORIES = ['BENEFITS', 'GOVERNMENT', 'OTHER']
const FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'ANNUALLY']

export const dynamic = 'force-dynamic'

function clean(body: Record<string, unknown>) {
  const int = (v: unknown, lo: number, hi: number, dflt: number | null) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : dflt
  }
  const frequency = FREQUENCIES.includes(String(body.frequency)) ? String(body.frequency) : 'MONTHLY'
  return {
    name: String(body.name || '').trim().slice(0, 160),
    category: CATEGORIES.includes(String(body.category)) ? String(body.category) : 'GOVERNMENT',
    frequency,
    dueMonth: frequency === 'MONTHLY' ? null : int(body.dueMonth, 1, 12, 1),
    dueDay: int(body.dueDay, 1, 31, 1) as number,
    periodLagMonths: frequency === 'MONTHLY' ? (int(body.periodLagMonths, 0, 3, 0) as number) : 0,
    leadDays: int(body.leadDays, 0, 60, 7) as number,
    notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 500) : null,
    isActive: body.isActive !== false,
  }
}

/**
 * GET /api/compliance-deadlines          → every deadline with its next due date
 * GET /api/compliance-deadlines?due=1    → only those inside their lead window or overdue (the bell)
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const dueOnly = new URL(req.url).searchParams.get('due') === '1'
  const defs = await prisma.complianceDeadline.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] })
  const today = new Date()
  const rows = defs.map(d => ({ ...d, due: computeComplianceDue(d, today) }))
  if (dueOnly) {
    const due = rows.map(r => r.due).filter((d): d is NonNullable<typeof d> => !!d && d.daysUntil <= d.leadDays)
    return NextResponse.json({ due: due.sort((a, b) => a.daysUntil - b.daysUntil) })
  }
  return NextResponse.json({ deadlines: rows })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const data = clean(await req.json())
  if (!data.name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const created = await prisma.complianceDeadline.create({ data })
  return NextResponse.json(created, { status: 201 })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const data = clean(body)
  if (!data.name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const updated = await prisma.complianceDeadline.update({ where: { id: String(body.id) }, data })
  return NextResponse.json(updated)
}

/** PATCH { id, due } — mark the occurrence due on `due` (YYYY-MM-DD) as done. */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { id, due } = await req.json()
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(String(due || ''))) {
    return NextResponse.json({ error: 'id and due (YYYY-MM-DD) are required' }, { status: 400 })
  }
  const updated = await prisma.complianceDeadline.update({
    where: { id: String(id) },
    data: { lastDoneDue: String(due), lastDoneAt: new Date(), lastDoneBy: (session.user.name as string) || null },
  })
  return NextResponse.json(updated)
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await prisma.complianceDeadline.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
