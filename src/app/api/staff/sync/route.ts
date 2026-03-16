/**
 * Staff Sync — Pull staff data from HR Platform
 *
 * POST /api/staff/sync  (admin auth required)
 *
 * Fetches from HR Platform's /staff/external endpoint,
 * upserts into local Staff table, preserving IDs for existing records.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { StaffDepartment } from '@prisma/client'

const HR_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

const VALID_DEPTS: Set<string> = new Set([
  'OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS', 'FRONT_DESK',
])

interface HRStaff {
  hrId: string
  firstName: string
  lastName: string
  branch: string
  department: string
  jobTitle: string | null
  employmentType: string | null
  email: string | null
  phone: string | null
}

export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string }).role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (!HR_KEY) {
    return NextResponse.json({ error: 'HR Platform API key not configured' }, { status: 500 })
  }

  // Fetch staff from HR Platform
  let hrStaff: HRStaff[]
  try {
    const res = await fetch(`${HR_URL}/staff/external`, {
      headers: { Authorization: `Bearer ${HR_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json({ error: `HR Platform returned ${res.status}` }, { status: 502 })
    }
    const data = await res.json()
    hrStaff = data.staff || []
  } catch (err) {
    console.error('[staff-sync] Fetch failed:', err)
    return NextResponse.json({ error: 'Cannot reach HR Platform' }, { status: 502 })
  }

  // Get existing staff from local DB
  const existing = await prisma.staff.findMany()
  const existingMap = new Map<string, typeof existing[0]>()
  for (const s of existing) {
    const key = `${s.firstName}|${s.lastName}|${s.branch}`
    existingMap.set(key, s)
  }

  let created = 0
  let updated = 0
  const errors: string[] = []
  const matchedIds = new Set<string>()

  for (const hr of hrStaff) {
    if (!hr.department || !VALID_DEPTS.has(hr.department)) continue
    if (!['SBEA', 'SBGH'].includes(hr.branch)) continue

    const key = `${hr.firstName}|${hr.lastName}|${hr.branch}`
    const match = existingMap.get(key)

    try {
      if (match) {
        // Update existing record (preserve ID and all relations)
        await prisma.staff.update({
          where: { id: match.id },
          data: {
            email: hr.email,
            phone: hr.phone,
            department: hr.department as StaffDepartment,
            jobTitle: hr.jobTitle,
            employmentType: hr.employmentType,
            hrPlatformId: hr.hrId,
          },
        })
        matchedIds.add(match.id)
        updated++
      } else {
        // Create new record
        const newStaff = await prisma.staff.create({
          data: {
            firstName: hr.firstName,
            lastName: hr.lastName,
            email: hr.email,
            phone: hr.phone,
            department: hr.department as StaffDepartment,
            branch: hr.branch,
            jobTitle: hr.jobTitle,
            employmentType: hr.employmentType,
            hrPlatformId: hr.hrId,
          },
        })
        matchedIds.add(newStaff.id)
        created++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${hr.firstName} ${hr.lastName}: ${msg}`)
    }
  }

  // Find staff in Marketing Hub that aren't in HR Platform
  const notInHR = existing
    .filter(s => !matchedIds.has(s.id))
    .map(s => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, branch: s.branch, department: s.department }))

  return NextResponse.json({
    synced: created + updated,
    created,
    updated,
    notInHR,
    errors,
    total: hrStaff.length,
  })
}
