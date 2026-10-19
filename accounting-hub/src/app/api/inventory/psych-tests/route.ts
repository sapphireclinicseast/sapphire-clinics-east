import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Inventory → Psych Tests: the register of psychological test kits per branch,
 * each marked HARD_COPY or ONLINE. The psych heads edit the same rows through
 * the public token page (/api/public/psych-tests/[token]); this route is the
 * hub side, following the Forms routes' shape.
 */

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS']
const FORMATS = ['HARD_COPY', 'ONLINE']

export const dynamic = 'force-dynamic'

function shape(body: Record<string, unknown>) {
  const name = String(body.name ?? '').trim()
  const branch = String(body.branch ?? '')
  const format = String(body.format ?? '')
  if (!name) return { error: 'Test name is required' }
  if (!BRANCHES.includes(branch)) return { error: 'Branch must be East or Greenhills' }
  if (!FORMATS.includes(format)) return { error: 'Format must be HARD_COPY or ONLINE' }
  const qty = body.quantity == null || body.quantity === '' ? null : Number(body.quantity)
  if (qty != null && (!Number.isFinite(qty) || qty < 0)) return { error: 'Quantity must be a non-negative number' }
  return {
    data: {
      name, branch, format,
      quantity: qty == null ? null : Math.round(qty),
      supplier: String(body.supplier ?? '').trim() || null,
      acquiredDate: body.acquiredDate ? new Date(String(body.acquiredDate)) : null,
      remarks: String(body.remarks ?? '').trim() || null,
    },
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const branch = new URL(req.url).searchParams.get('branch') || ''
  const data = await prisma.psychTest.findMany({
    where: branch ? { branch } : {},
    orderBy: [{ branch: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json({ data })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const shaped = shape(await req.json())
    if ('error' in shaped) return NextResponse.json({ error: shaped.error }, { status: 400 })
    const row = await prisma.psychTest.create({
      data: { ...shaped.data, createdById: session.user.id as string, updatedByName: session.user.name as string },
    })
    return NextResponse.json({ data: row }, { status: 201 })
  } catch (e) {
    console.error('[psych-tests] create failed:', e)
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const id = String(body.id ?? '')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const shaped = shape(body)
    if ('error' in shaped) return NextResponse.json({ error: shaped.error }, { status: 400 })
    const row = await prisma.psychTest.update({
      where: { id },
      data: { ...shaped.data, updatedByName: session.user.name as string },
    })
    return NextResponse.json({ data: row })
  } catch (e) {
    console.error('[psych-tests] update failed:', e)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    await prisma.psychTest.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[psych-tests] delete failed:', e)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
