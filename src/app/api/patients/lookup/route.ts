/**
 * External patient lookup by ID — Bearer token auth
 * GET /api/patients/lookup?id=xxx
 * Returns { patient: {...} } or { patient: null }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = new URL(req.url).searchParams.get('id')?.trim()
  if (!id) return NextResponse.json({ patient: null })

  try {
    const patient = await prisma.patient.findUnique({
      where: { id },
      select: {
        id: true, firstName: true, lastName: true,
        email: true, phone: true, dob: true,
        sex: true, address: true, city: true,
      },
    })
    return NextResponse.json({ patient: patient ?? null })
  } catch (err) {
    console.error('[patient-lookup] error:', err)
    return NextResponse.json({ patient: null })
  }
}
