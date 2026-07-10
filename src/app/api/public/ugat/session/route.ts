// GET /api/public/ugat/session
// Restores the signed-in session for ANY role (Bearer token). The portal
// shell calls this on load to decide which sidebar sections to show.
//   → { role, scholar? }  for SCHOLAR
//   → { role, admin }     for MAIN_ADMIN / STAFF_ADMIN

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, canViewAdmin } from '@/lib/ugat-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  if (canViewAdmin(tok.role)) {
    // Re-verify a DB-backed admin (staff / university) still exists + enabled.
    if (tok.role === 'STAFF_ADMIN' || tok.role === 'UNIVERSITY_ADMIN') {
      const admin = tok.adminId
        ? await prisma.ugatAdmin.findUnique({ where: { id: tok.adminId }, select: { username: true, name: true, disabledAt: true } })
        : null
      if (!admin || admin.disabledAt) return NextResponse.json({ error: 'Session expired.' }, { status: 401 })
      return NextResponse.json({ role: tok.role, admin: { username: admin.username, name: admin.name } })
    }
    return NextResponse.json({ role: tok.role, admin: { username: tok.username || 'main', name: tok.name || 'Main Administrator' } })
  }

  if (tok.role === 'SCHOLAR' && tok.scholarId) {
    const scholar = await prisma.ugatScholar.findUnique({
      where: { id: tok.scholarId },
      select: {
        id: true, username: true, track: true, professionalEmail: true, personalEmail: true,
        firstName: true, middleName: true, lastName: true, studentNumber: true,
        birthdate: true, school: true, program: true, preferredField: true,
        expectedGraduationYear: true, status: true,
        awardMonthly: true, awardMonths: true,
        permAddress1: true, permAddress2: true, permCity: true, permRegion: true, permZip: true,
        presAddress1: true, presAddress2: true, presCity: true, presRegion: true, presZip: true,
        emailVerifiedAt: true, disabledAt: true, createdAt: true,
        application: true,
        uploads: { select: { id: true, kind: true } },
      },
    })
    if (!scholar || scholar.disabledAt) return NextResponse.json({ error: 'Account not found.' }, { status: 401 })
    const { uploads, application, ...rest } = scholar
    type Up = { id: string; kind: string }
    const photoId = (uploads as Up[]).find((u) => u.kind === 'PHOTO')?.id || null
    const uploadKinds = (uploads as Up[]).reduce<Record<string, string>>((m, u) => { m[u.kind] = u.id; return m }, {})
    return NextResponse.json({ role: 'SCHOLAR', scholar: { ...rest, photoId }, application, uploadKinds })
  }

  return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
}
