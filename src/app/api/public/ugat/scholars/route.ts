// Admin-only scholar directory — powers the Dashboard + User Access sections.
//   GET                                   → all scholars (+ status counts)
//   PATCH { id, status?, disabled? }       → update application status / enable-disable
// Gated by an admin Bearer token (MAIN_ADMIN or STAFF_ADMIN).

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, isAdminRole } from '@/lib/ugat-auth'

export const dynamic = 'force-dynamic'

const STATUSES = ['APPLIED', 'ACCEPTED', 'WAITLISTED', 'REJECTED'] as const

async function requireAdmin(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return null
  return tok
}

export async function GET(req: Request) {
  const tok = await requireAdmin(req)
  if (!tok) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })

  const rows = await prisma.ugatScholar.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, username: true, professionalEmail: true, personalEmail: true,
      firstName: true, middleName: true, lastName: true, studentNumber: true,
      school: true, program: true, preferredField: true, expectedGraduationYear: true,
      status: true, emailVerifiedAt: true, disabledAt: true, createdAt: true,
    },
  })

  const counts: Record<string, number> = { TOTAL: rows.length, VERIFIED: 0, APPLIED: 0, ACCEPTED: 0, WAITLISTED: 0, REJECTED: 0 }
  for (const r of rows) {
    if (r.emailVerifiedAt) counts.VERIFIED++
    counts[r.status] = (counts[r.status] || 0) + 1
  }

  return NextResponse.json({ scholars: rows, counts })
}

export async function PATCH(req: Request) {
  const tok = await requireAdmin(req)
  if (!tok) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })

  let body: { id?: string; status?: string; disabled?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
    }
    data.status = body.status
  }
  if (typeof body.disabled === 'boolean') {
    data.disabledAt = body.disabled ? new Date() : null
    data.disabledBy = body.disabled ? (tok.username || 'admin') : null
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  await prisma.ugatScholar.update({ where: { id }, data }).catch(() => {})
  return NextResponse.json({ ok: true })
}
