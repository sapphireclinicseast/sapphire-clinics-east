// GET /api/public/staff
// Returns a list of staff members suitable for the class portal's admin
// "Add teacher" picker. Optional ?branch=SANDBOX_EAST|SANDBOX_GREENHILLS
// query param filters the list.
//
// Public, read-only, minimal fields. No PII beyond name + work contact.

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { preflight, withCors } from '../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') ?? ''

  const where: Prisma.StaffWhereInput = branch ? { branch } : {}

  const staff = await prisma.staff.findMany({
    where,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      jobTitle: true,
      department: true,
      branch: true,
    },
  })

  // Strip nulls so the JSON stays tidy for the picker UI.
  const list = staff.map(s => ({
    id: s.id,
    firstName: s.firstName ?? '',
    lastName: s.lastName ?? '',
    email: s.email ?? '',
    jobTitle: s.jobTitle ?? '',
    department: s.department ?? '',
    branch: s.branch ?? '',
  }))

  return withCors(NextResponse.json({ staff: list }), origin)
}
