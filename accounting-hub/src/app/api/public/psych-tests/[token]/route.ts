import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * PUBLIC (no auth) — the psych heads' side of the Psych Tests register.
 *
 * The two branch psych heads have no hub logins; the token in the URL is the
 * whole credential (issued and revocable from Inventory → Psych Tests). They
 * see and edit BOTH branches, name themselves on every save, and the same
 * rows render in the hub immediately. Server-validated: branch and format
 * are whitelisted, never trusted from the page.
 */

const BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS']
const FORMATS = ['HARD_COPY', 'ONLINE']

export const dynamic = 'force-dynamic'

async function validToken(token: string) {
  if (!token) return false
  const row = await prisma.psychTestSettings.findUnique({ where: { id: 'singleton' } })
  return !!row && row.editToken === token
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!(await validToken(token))) {
    return NextResponse.json({ error: 'This link is not available.' }, { status: 404 })
  }
  const tests = await prisma.psychTest.findMany({
    orderBy: [{ branch: 'asc' }, { name: 'asc' }],
    select: {
      id: true, branch: true, name: true, format: true, quantity: true,
      supplier: true, acquiredDate: true, remarks: true, updatedByName: true, updatedAt: true,
    },
  })
  return NextResponse.json({ tests })
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!(await validToken(token))) {
    return NextResponse.json({ error: 'This link is not available.' }, { status: 404 })
  }
  try {
    const body = await req.json()
    const editor = String(body.editorName ?? '').trim()
    if (!editor) return NextResponse.json({ error: 'Please enter your name first.' }, { status: 400 })

    if (body.action === 'delete') {
      const id = String(body.id ?? '')
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
      await prisma.psychTest.delete({ where: { id } }).catch(() => {})
      return NextResponse.json({ success: true })
    }

    const name = String(body.name ?? '').trim()
    const branch = String(body.branch ?? '')
    const format = String(body.format ?? '')
    if (!name) return NextResponse.json({ error: 'Test name is required.' }, { status: 400 })
    if (!BRANCHES.includes(branch)) return NextResponse.json({ error: 'Pick East or Greenhills.' }, { status: 400 })
    if (!FORMATS.includes(format)) return NextResponse.json({ error: 'Pick hard copy or online.' }, { status: 400 })
    const qtyRaw = body.quantity
    const qty = qtyRaw == null || qtyRaw === '' ? null : Number(qtyRaw)
    if (qty != null && (!Number.isFinite(qty) || qty < 0)) {
      return NextResponse.json({ error: 'Quantity must be a non-negative number.' }, { status: 400 })
    }
    const data = {
      name, branch, format,
      quantity: qty == null ? null : Math.round(qty),
      supplier: String(body.supplier ?? '').trim() || null,
      acquiredDate: body.acquiredDate ? new Date(String(body.acquiredDate)) : null,
      remarks: String(body.remarks ?? '').trim() || null,
      updatedByName: editor.slice(0, 80),
    }
    const id = String(body.id ?? '')
    const row = id
      ? await prisma.psychTest.update({ where: { id }, data })
      : await prisma.psychTest.create({ data })
    return NextResponse.json({ success: true, id: row.id })
  } catch (e) {
    console.error('[public psych-tests] save failed:', e)
    return NextResponse.json({ error: 'Could not save — please try again.' }, { status: 500 })
  }
}
