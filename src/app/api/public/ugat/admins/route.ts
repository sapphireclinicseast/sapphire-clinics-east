// Staff-admin management — powers the User Access section.
//   GET                                        → list staff admins (any admin)
//   POST   { username, password, name }         → create (MAIN_ADMIN only)
//   PATCH  { id, disabled?, name?, password? }   → update (MAIN_ADMIN only)
//   DELETE { id }                               → remove (MAIN_ADMIN only)
// The single MAIN admin (`main`) is virtual and never appears in this list.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, isAdminRole, hashPassword, UGAT_MAIN_ADMIN_USERNAME } from '@/lib/ugat-auth'

export const dynamic = 'force-dynamic'

async function tok(req: Request) {
  const t = await tokenFromRequest(req)
  return t && isAdminRole(t.role) ? t : null
}

export async function GET(req: Request) {
  const t = await tok(req)
  if (!t) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  const admins = await prisma.ugatAdmin.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, username: true, name: true, kind: true, passwordPlain: true, createdAt: true, createdBy: true, disabledAt: true },
  })
  return NextResponse.json({ admins })
}

export async function POST(req: Request) {
  const t = await tok(req)
  if (!t) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  if (t.role !== 'MAIN_ADMIN') return NextResponse.json({ error: 'Only the main administrator can add staff admins.' }, { status: 403 })

  let body: { username?: string; password?: string; name?: string; kind?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const username = String(body.username || '').trim().toLowerCase()
  const password = String(body.password || '')
  const name = String(body.name || '').trim()
  const kind = body.kind === 'UNIVERSITY' ? 'UNIVERSITY' : 'STAFF'

  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    return NextResponse.json({ error: 'Username must be 3–30 characters (letters, numbers, and . _ - only).' }, { status: 400 })
  }
  if (username === UGAT_MAIN_ADMIN_USERNAME) {
    return NextResponse.json({ error: 'That username is reserved.' }, { status: 409 })
  }
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })

  // Avoid colliding with a scholar username (sign-in resolves by username).
  const clashScholar = await prisma.ugatScholar.findUnique({ where: { username }, select: { id: true } })
  if (clashScholar) return NextResponse.json({ error: 'That username is already used by a scholar account.' }, { status: 409 })

  try {
    const created = await prisma.ugatAdmin.create({
      data: { username, name, kind, passwordHash: await hashPassword(password), passwordPlain: password, createdBy: t.username || 'main' },
      select: { id: true },
    })
    return NextResponse.json({ id: created.id })
  } catch {
    return NextResponse.json({ error: 'That admin username already exists.' }, { status: 409 })
  }
}

export async function PATCH(req: Request) {
  const t = await tok(req)
  if (!t) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })

  let body: { id?: string; disabled?: boolean; name?: string; password?: string; kind?: string; self?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  // A non-main admin (staff / university) may change ONLY their own password.
  if (t.role !== 'MAIN_ADMIN') {
    if (!body.self || !t.adminId) {
      return NextResponse.json({ error: 'You can only change your own password.' }, { status: 403 })
    }
    const pw = String(body.password || '')
    if (pw.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    await prisma.ugatAdmin.update({ where: { id: t.adminId }, data: { passwordHash: await hashPassword(pw), passwordPlain: pw } }).catch(() => {})
    return NextResponse.json({ ok: true })
  }

  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.disabled === 'boolean') data.disabledAt = body.disabled ? new Date() : null
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (body.kind === 'STAFF' || body.kind === 'UNIVERSITY') data.kind = body.kind
  if (typeof body.password === 'string' && body.password) {
    if (body.password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    data.passwordHash = await hashPassword(body.password)
    data.passwordPlain = body.password
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  await prisma.ugatAdmin.update({ where: { id }, data }).catch(() => {})
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const t = await tok(req)
  if (!t) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  if (t.role !== 'MAIN_ADMIN') return NextResponse.json({ error: 'Only the main administrator can remove staff admins.' }, { status: 403 })

  let body: { id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  await prisma.ugatAdmin.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
