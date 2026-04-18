// GET /api/public/therapists?branch=SBEA&department=PT
// Returns minimal, non-PII therapist info for the patient portal.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { preflight, withCors } from '../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') ?? ''
  const department = searchParams.get('department') ?? ''

  if (!branch || !department) {
    return withCors(
      NextResponse.json({ error: 'branch and department are required' }, { status: 400 }),
      origin,
    )
  }

  const staff = await prisma.staff.findMany({
    where: { branch, department: department as never },
    select: { id: true, firstName: true, lastName: true, sex: true },
  })

  const therapists = staff.map((s) => {
    const raw = (s.sex ?? '').trim().toUpperCase()
    const sex: 'M' | 'F' | null = raw === 'M' ? 'M' : raw === 'F' ? 'F' : null
    return {
      id: s.id,
      initials: `${s.firstName?.[0] ?? '?'}${s.lastName?.[0] ?? '?'}`.toUpperCase(),
      sex,
    }
  })

  return withCors(NextResponse.json({ therapists }), origin)
}
