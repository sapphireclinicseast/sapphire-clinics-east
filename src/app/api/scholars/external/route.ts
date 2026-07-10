/**
 * External Approved-Scholars API — Bearer token auth.
 *
 * Consumed by the Accounting Hub "Scholars" section, which fetches the live
 * roster of APPROVED (ACCEPTED) fellowship scholars and layers the award /
 * disbursement terms on top (those financial fields live in Accounting, not
 * here). Any scholar the admins accept/disable in the portal is reflected
 * automatically on the next fetch.
 *
 * Env: EXTERNAL_API_KEY — shared secret (same token the Accounting Hub already
 * uses for the staff/patient external APIs).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const API_KEY = process.env.EXTERNAL_API_KEY

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await prisma.ugatScholar.findMany({
    where: { status: 'ACCEPTED', disabledAt: null },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      firstName: true, middleName: true, lastName: true,
      studentNumber: true, expectedGraduationYear: true,
      school: true, program: true, preferredField: true,
      professionalEmail: true, personalEmail: true,
      status: true, createdAt: true,
    },
  })

  const scholars = rows.map((r) => {
    const fullName = [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    return {
      id: r.id,
      fullName,
      firstName: r.firstName,
      middleName: r.middleName,
      lastName: r.lastName,
      studentNumber: r.studentNumber,
      expectedGraduationYear: r.expectedGraduationYear,
      school: r.school,
      program: r.program,
      preferredField: r.preferredField,
      email: r.professionalEmail || r.personalEmail || null,
      professionalEmail: r.professionalEmail,
      personalEmail: r.personalEmail,
      status: r.status,
      approvedAt: r.createdAt,
    }
  })

  return NextResponse.json({ scholars, count: scholars.length })
}
