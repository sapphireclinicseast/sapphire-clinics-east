// Application-cycle management (admin). Powers the "Application timelines"
// settings + the academic-year filter.
//   GET                                       → cycles (+ which is open now)
//   POST   { academicYear, opensAt, closesAt } → create   (full admin)
//   PATCH  { id, academicYear?, opensAt?, closesAt? } → update (full admin)
//   DELETE { id }                              → remove   (full admin)

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, isAdminRole, canViewAdmin } from '@/lib/ugat-auth'
import { getWindow } from '@/lib/ugat-cycle'

export const dynamic = 'force-dynamic'

const AY_RE = /^\d{4}-\d{4}$/

function parse(body: { academicYear?: string; opensAt?: string; closesAt?: string }) {
  const academicYear = String(body.academicYear || '').trim()
  const opensAt = body.opensAt ? new Date(body.opensAt) : null
  const closesAt = body.closesAt ? new Date(body.closesAt) : null
  if (!AY_RE.test(academicYear)) return { error: 'Academic year must look like "2026-2027".' }
  const [a, b] = academicYear.split('-').map(Number)
  if (b !== a + 1) return { error: 'Academic year must be two consecutive years, e.g. "2026-2027".' }
  if (!opensAt || Number.isNaN(opensAt.getTime())) return { error: 'Please set a valid opening date.' }
  if (!closesAt || Number.isNaN(closesAt.getTime())) return { error: 'Please set a valid closing date.' }
  if (closesAt <= opensAt) return { error: 'The closing date must be after the opening date.' }
  return { academicYear, opensAt, closesAt }
}

export async function GET(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !canViewAdmin(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  const cycles = await prisma.ugatApplicationCycle.findMany({ orderBy: { opensAt: 'desc' } })
  const window = await getWindow()
  return NextResponse.json({ cycles, window })
}

export async function POST(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  let body: { academicYear?: string; opensAt?: string; closesAt?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const p = parse(body)
  if ('error' in p) return NextResponse.json({ error: p.error }, { status: 400 })
  try {
    const c = await prisma.ugatApplicationCycle.create({ data: p, select: { id: true } })
    return NextResponse.json({ id: c.id })
  } catch {
    return NextResponse.json({ error: 'A cycle for that academic year already exists.' }, { status: 409 })
  }
}

export async function PATCH(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  let body: { id?: string; academicYear?: string; opensAt?: string; closesAt?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  const p = parse(body)
  if ('error' in p) return NextResponse.json({ error: p.error }, { status: 400 })
  try {
    await prisma.ugatApplicationCycle.update({ where: { id }, data: p })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Could not update (duplicate academic year?).' }, { status: 409 })
  }
}

export async function DELETE(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  let body: { id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  await prisma.ugatApplicationCycle.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
