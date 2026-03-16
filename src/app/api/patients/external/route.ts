/**
 * External Patient API — Bearer token auth (for HR Platform integration)
 *
 * This endpoint bypasses NextAuth and uses a simple bearer token
 * to allow the HR Platform to fetch patient data for seminar attendee selection.
 *
 * Env: EXTERNAL_API_KEY — shared secret token
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY

export async function GET(req: NextRequest) {
  // Validate bearer token
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const patients = await prisma.patient.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        dob: true,
        patientType: true,
        branches: true,
        sex: true,
        diagnosis: true,
        address: true,
        city: true,
      },
      orderBy: { lastName: 'asc' },
    })

    return NextResponse.json({ patients })
  } catch (err) {
    console.error('[external-patients] Query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
