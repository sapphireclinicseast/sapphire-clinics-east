// Admin CRUD for the signup dropdown options (School / Program / Field).
// Gated by an ADMIN-role Bearer token (minted via /auth/sign-in with the
// main@ SCEI credentials). Powers the /ugatfellow/admin settings tab.
//
//   GET                       → all options grouped by kind (incl. disabled)
//   POST   { kind, label }    → create
//   PATCH  { id, label?, sortOrder?, disabled? } → update / enable / disable
//   DELETE { id }             → hard delete

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, isAdminRole } from '@/lib/ugat-auth'

export const dynamic = 'force-dynamic'

// SCHOOL is legacy (kept valid for old data); the sign-up dropdowns now use the
// per-track lists SCHOOL_ARAL / SCHOOL_TINDIG.
const KINDS = ['SCHOOL', 'SCHOOL_ARAL', 'SCHOOL_TINDIG', 'PROGRAM', 'FIELD', 'BRANCH'] as const
type Kind = (typeof KINDS)[number]

async function requireAdmin(req: Request): Promise<NextResponse | null> {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) {
    return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  }
  return null
}

export async function GET(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const rows = await prisma.ugatOption.findMany({
    orderBy: [{ kind: 'asc' }, { label: 'asc' }], // alphabetical by label
  })
  const group = (k: Kind) =>
    rows
      .filter((r) => r.kind === k)
      .map((r) => ({ id: r.id, label: r.label, sortOrder: r.sortOrder, disabled: !!r.disabledAt }))
  return NextResponse.json({
    SCHOOL: group('SCHOOL'),
    SCHOOL_ARAL: group('SCHOOL_ARAL'),
    SCHOOL_TINDIG: group('SCHOOL_TINDIG'),
    PROGRAM: group('PROGRAM'),
    FIELD: group('FIELD'),
    BRANCH: group('BRANCH'),
  })
}

export async function POST(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  let body: { kind?: string; label?: string; sortOrder?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const kind = String(body.kind || '') as Kind
  const label = String(body.label || '').trim()
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'Invalid option type.' }, { status: 400 })
  if (!label) return NextResponse.json({ error: 'Label is required.' }, { status: 400 })

  try {
    const existing = await prisma.ugatOption.aggregate({ where: { kind }, _max: { sortOrder: true } })
    const created = await prisma.ugatOption.create({
      data: {
        kind,
        label,
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : (existing._max.sortOrder ?? 0) + 10,
      },
    })
    return NextResponse.json({ id: created.id })
  } catch {
    return NextResponse.json({ error: 'That option already exists.' }, { status: 409 })
  }
}

export async function PATCH(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  let body: { id?: string; label?: string; sortOrder?: number; disabled?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.label === 'string' && body.label.trim()) data.label = body.label.trim()
  if (typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder
  if (typeof body.disabled === 'boolean') data.disabledAt = body.disabled ? new Date() : null
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  try {
    await prisma.ugatOption.update({ where: { id }, data })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Could not update (duplicate label?).' }, { status: 409 })
  }
}

export async function DELETE(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  let body: { id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  await prisma.ugatOption.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
