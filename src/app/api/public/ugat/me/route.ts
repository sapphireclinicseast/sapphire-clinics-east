// GET /api/public/ugat/me
// Returns the signed-in scholar's profile (Bearer token). Used to restore the
// dashboard on page reload.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest } from '@/lib/ugat-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || tok.role !== 'SCHOLAR' || !tok.scholarId) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }
  const scholar = await prisma.ugatScholar.findUnique({
    where: { id: tok.scholarId },
    select: {
      id: true, email: true, firstName: true, middleName: true, lastName: true,
      school: true, program: true, preferredField: true, expectedGraduationYear: true,
      emailVerifiedAt: true, disabledAt: true,
    },
  })
  if (!scholar || scholar.disabledAt) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 401 })
  }
  return NextResponse.json({ scholar })
}
