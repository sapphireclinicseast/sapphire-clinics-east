/**
 * External Patient API — Bearer token auth
 *
 * Used by HR Platform (full list) and Accounting Hub (search + id lookup).
 * Env: EXTERNAL_API_KEY — shared secret token
 *
 * ?search=xxx  → text search (name/email)
 * ?id=xxx      → direct lookup by patient ID
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY

const PATIENT_SELECT = {
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
} as const

export async function GET(req: NextRequest) {
  // Validate bearer token
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const id     = searchParams.get('id')?.trim()
  const search = searchParams.get('search')?.trim()

  try {
    // Direct lookup by ID — returns single patient or null
    if (id) {
      const patient = await prisma.patient.findUnique({
        where: { id },
        select: PATIENT_SELECT,
      })
      return NextResponse.json({ patient: patient ?? null })
    }

    // Text search
    const patients = await prisma.patient.findMany({
      where: search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: PATIENT_SELECT,
      orderBy: { lastName: 'asc' },
      take: search ? 20 : undefined,
    })

    return NextResponse.json({ patients })
  } catch (err) {
    console.error('[external-patients] Query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
