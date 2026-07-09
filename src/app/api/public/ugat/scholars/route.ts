// Admin scholar directory — powers Profile (admin student list), the admin
// Application review, Dashboard, and User Access.
//   GET                                                   → scholars (enriched) + counts
//   PATCH { id, status?|disabled?|initialDecision?|newPassword? }  → update (full admins)
//   DELETE { id }                                         → remove (MAIN_ADMIN only)
// GET is allowed for any admin tier (incl. read-only university admin);
// writes require a full admin (MAIN_ADMIN / STAFF_ADMIN).

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, isAdminRole, canViewAdmin, hashPassword } from '@/lib/ugat-auth'

export const dynamic = 'force-dynamic'

const STATUSES = ['APPLIED', 'ACCEPTED', 'WAITLISTED', 'REJECTED'] as const
const DECISIONS = ['NOT_CONSIDERED', 'PENDING', 'FOR_INTERVIEW'] as const

function ageFrom(birthdate: Date | null): number | null {
  if (!birthdate) return null
  const now = new Date()
  let a = now.getFullYear() - birthdate.getFullYear()
  const m = now.getMonth() - birthdate.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birthdate.getDate())) a--
  return a >= 0 && a < 120 ? a : null
}

export async function GET(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !canViewAdmin(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })

  const rows = await prisma.ugatScholar.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, username: true, professionalEmail: true, personalEmail: true,
      firstName: true, middleName: true, lastName: true, studentNumber: true, birthdate: true,
      school: true, program: true, preferredField: true, expectedGraduationYear: true,
      permCity: true, status: true, emailVerifiedAt: true, disabledAt: true, createdAt: true,
      application: true,
      uploads: { select: { id: true, kind: true } },
    },
  })

  type Up = { id: string; kind: string }
  const scholars = rows.map(({ uploads, birthdate, ...r }) => ({
    ...r,
    age: ageFrom(birthdate),
    photoId: (uploads as Up[]).find((u) => u.kind === 'PHOTO')?.id || null,
    uploadKinds: (uploads as Up[]).reduce<Record<string, string>>((m, u) => { m[u.kind] = u.id; return m }, {}),
  }))

  const counts: Record<string, number> = { TOTAL: rows.length, VERIFIED: 0, APPLIED: 0, ACCEPTED: 0, WAITLISTED: 0, REJECTED: 0 }
  for (const r of rows) {
    if (r.emailVerifiedAt) counts.VERIFIED++
    counts[r.status] = (counts[r.status] || 0) + 1
  }
  return NextResponse.json({ scholars, counts })
}

export async function PATCH(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })

  let body: { id?: string; status?: string; disabled?: boolean; initialDecision?: string; newPassword?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
    data.status = body.status
  }
  if (typeof body.disabled === 'boolean') {
    data.disabledAt = body.disabled ? new Date() : null
    data.disabledBy = body.disabled ? (tok.username || 'admin') : null
  }
  if (typeof body.newPassword === 'string') {
    if (body.newPassword.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    data.passwordHash = await hashPassword(body.newPassword)
    data.passwordPlain = body.newPassword
  }
  if (Object.keys(data).length) await prisma.ugatScholar.update({ where: { id }, data }).catch(() => {})

  // Application decision lives on the related row.
  if (typeof body.initialDecision === 'string') {
    if (!DECISIONS.includes(body.initialDecision as (typeof DECISIONS)[number])) return NextResponse.json({ error: 'Invalid decision.' }, { status: 400 })
    await prisma.ugatApplication.updateMany({ where: { scholarId: id }, data: { initialDecision: body.initialDecision } })
  }

  if (Object.keys(data).length === 0 && typeof body.initialDecision !== 'string') {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || tok.role !== 'MAIN_ADMIN') return NextResponse.json({ error: 'Only the main administrator can delete accounts.' }, { status: 403 })
  let body: { id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  await prisma.ugatScholar.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
