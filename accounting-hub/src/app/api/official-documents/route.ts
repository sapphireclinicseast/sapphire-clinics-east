import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'PAYROLL_OFFICER']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const DELETE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const CATEGORIES = ['BUSINESS', 'SEC', 'BIR', 'BENEFITS', 'OTHER']
const BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
const EXPIRY_WINDOW_DAYS = 30

export const dynamic = 'force-dynamic'

const dateOrNull = (v: unknown) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  return new Date(`${v}T00:00:00Z`)
}

function clean(body: Record<string, unknown>) {
  const files = Array.isArray(body.fileUrls) ? body.fileUrls.filter((u): u is string => typeof u === 'string' && u.startsWith('/api/files/')).slice(0, 30) : []
  return {
    category: CATEGORIES.includes(String(body.category)) ? String(body.category) : 'OTHER',
    title: String(body.title || '').trim().slice(0, 200),
    branch: BRANCHES.includes(String(body.branch)) ? String(body.branch) : null,
    referenceNo: typeof body.referenceNo === 'string' && body.referenceNo.trim() ? body.referenceNo.trim().slice(0, 120) : null,
    issuedDate: dateOrNull(body.issuedDate),
    expiryDate: dateOrNull(body.expiryDate),
    fileUrls: files,
    notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 1000) : null,
  }
}

/**
 * GET /api/official-documents             → every document, newest first
 * GET /api/official-documents?expiring=1  → expired or expiring within 30 days (the bell)
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  if (new URL(req.url).searchParams.get('expiring') === '1') {
    const horizon = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 86_400_000)
    const docs = await prisma.officialDocument.findMany({
      where: { expiryDate: { not: null, lte: horizon } },
      orderBy: { expiryDate: 'asc' },
      select: { id: true, title: true, category: true, branch: true, referenceNo: true, expiryDate: true },
    })
    return NextResponse.json({ documents: docs })
  }
  const docs = await prisma.officialDocument.findMany({ orderBy: [{ category: 'asc' }, { title: 'asc' }] })
  return NextResponse.json({ documents: docs })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const data = clean(await req.json())
  if (!data.title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  const created = await prisma.officialDocument.create({
    data: { ...data, uploadedById: session.user.id as string, uploadedByName: (session.user.name as string) || null },
  })
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
  if (!data.title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  const updated = await prisma.officialDocument.update({ where: { id: String(body.id) }, data })
  return NextResponse.json(updated)
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !DELETE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await prisma.officialDocument.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
