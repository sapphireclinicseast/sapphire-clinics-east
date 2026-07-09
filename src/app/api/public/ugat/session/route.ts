// GET /api/public/ugat/session
// Restores the signed-in session for ANY role (Bearer token). The portal
// shell calls this on load to decide which sidebar sections to show.
//   → { role, scholar? }  for SCHOLAR
//   → { role, admin }     for MAIN_ADMIN / STAFF_ADMIN

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, isAdminRole } from '@/lib/ugat-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  if (isAdminRole(tok.role)) {
    // Re-verify a staff admin still exists + is enabled.
    if (tok.role === 'STAFF_ADMIN') {
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
        id: true, username: true, professionalEmail: true, personalEmail: true,
        firstName: true, middleName: true, lastName: true, studentNumber: true,
        birthdate: true, school: true, program: true, preferredField: true,
        expectedGraduationYear: true, status: true,
        permAddress1: true, permAddress2: true, permCity: true, permRegion: true, permZip: true,
        presAddress1: true, presAddress2: true, presCity: true, presRegion: true, presZip: true,
        emailVerifiedAt: true, disabledAt: true, createdAt: true,
      },
    })
    if (!scholar || scholar.disabledAt) return NextResponse.json({ error: 'Account not found.' }, { status: 401 })
    return NextResponse.json({ role: 'SCHOLAR', scholar })
  }

  return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
}
