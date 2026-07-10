// Announcement management (admin). Powers the portal's Announcements section.
//   GET                                        → all announcements (incl. unpublished)
//   POST   { title, details, published? }      → create   (full admin)
//   PATCH  { id, title?, details?, published? } → update   (full admin)
//   DELETE { id }                              → remove    (full admin)

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, isAdminRole, canViewAdmin } from '@/lib/ugat-auth'

export const dynamic = 'force-dynamic'

const TITLE_MAX = 160
const DETAILS_MAX = 4000

export async function GET(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !canViewAdmin(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  const announcements = await prisma.ugatAnnouncement.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ announcements })
}

export async function POST(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  let body: { title?: string; details?: string; published?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const title = String(body.title || '').trim()
  const details = String(body.details || '').trim()
  if (!title) return NextResponse.json({ error: 'Please enter a title.' }, { status: 400 })
  if (!details) return NextResponse.json({ error: 'Please enter the announcement details.' }, { status: 400 })
  const a = await prisma.ugatAnnouncement.create({
    data: {
      title: title.slice(0, TITLE_MAX),
      details: details.slice(0, DETAILS_MAX),
      published: body.published !== false,
      createdBy: tok.username || null,
    },
    select: { id: true },
  })
  return NextResponse.json({ id: a.id })
}

export async function PATCH(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  let body: { id?: string; title?: string; details?: string; published?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  const data: { title?: string; details?: string; published?: boolean } = {}
  if (body.title !== undefined) {
    const t = String(body.title).trim()
    if (!t) return NextResponse.json({ error: 'Title cannot be empty.' }, { status: 400 })
    data.title = t.slice(0, TITLE_MAX)
  }
  if (body.details !== undefined) {
    const d = String(body.details).trim()
    if (!d) return NextResponse.json({ error: 'Details cannot be empty.' }, { status: 400 })
    data.details = d.slice(0, DETAILS_MAX)
  }
  if (body.published !== undefined) data.published = !!body.published
  await prisma.ugatAnnouncement.update({ where: { id }, data }).catch(() => {})
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  let body: { id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  await prisma.ugatAnnouncement.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
