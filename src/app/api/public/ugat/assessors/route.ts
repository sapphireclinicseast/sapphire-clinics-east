// Assessor assignments (MAIN_ADMIN only). Assign Staff Admins as assessors for
// an academic year, each with a weight (%).
//   GET  ?academicYear=YYYY-YYYY → { assessors:[{id,adminId,name,username,weightPercent}], staff:[{id,name,username}] }
//   POST { adminId, academicYear, weightPercent }  → assign / update weight
//   DELETE { id }                                  → remove an assignment

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest } from '@/lib/ugat-auth'

export const dynamic = 'force-dynamic'

async function requireMain(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || tok.role !== 'MAIN_ADMIN') return null
  return tok
}

export async function GET(req: Request) {
  if (!(await requireMain(req))) return NextResponse.json({ error: 'Only the main administrator can manage assessors.' }, { status: 403 })
  const academicYear = new URL(req.url).searchParams.get('academicYear') || ''
  const [staff, rows] = await Promise.all([
    prisma.ugatAdmin.findMany({ where: { kind: 'STAFF', disabledAt: null }, select: { id: true, name: true, username: true }, orderBy: { name: 'asc' } }),
    academicYear ? prisma.ugatAssessor.findMany({ where: { academicYear } }) : Promise.resolve([]),
  ])
  const byId = new Map(staff.map((s) => [s.id, s]))
  const assessors = rows
    .map((r) => ({ id: r.id, adminId: r.adminId, name: byId.get(r.adminId)?.name || '(removed staff)', username: byId.get(r.adminId)?.username || '', weightPercent: r.weightPercent }))
    .sort((a, b) => b.weightPercent - a.weightPercent)
  return NextResponse.json({ assessors, staff })
}

export async function POST(req: Request) {
  if (!(await requireMain(req))) return NextResponse.json({ error: 'Only the main administrator can manage assessors.' }, { status: 403 })
  let body: { adminId?: string; academicYear?: string; weightPercent?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const adminId = String(body.adminId || '')
  const academicYear = String(body.academicYear || '').trim()
  const weightPercent = Math.max(0, Math.min(100, Math.round(Number(body.weightPercent) || 0)))
  if (!adminId || !academicYear) return NextResponse.json({ error: 'adminId and academicYear are required.' }, { status: 400 })
  const admin = await prisma.ugatAdmin.findFirst({ where: { id: adminId, kind: 'STAFF' } })
  if (!admin) return NextResponse.json({ error: 'That staff admin was not found.' }, { status: 404 })
  await prisma.ugatAssessor.upsert({
    where: { adminId_academicYear: { adminId, academicYear } },
    create: { adminId, academicYear, weightPercent },
    update: { weightPercent },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  if (!(await requireMain(req))) return NextResponse.json({ error: 'Only the main administrator can manage assessors.' }, { status: 403 })
  let body: { id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  await prisma.ugatAssessor.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
