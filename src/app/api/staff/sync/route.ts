/**
 * Staff Sync — Pull staff data from HR Platform
 *
 * POST /api/staff/sync  (admin auth required)
 *
 * Matching priority:
 *   1. hrPlatformId  — stable ID; handles name changes, email changes, etc.
 *   2. firstName + lastName + branch — fallback for records not yet linked
 *
 * On every match the following fields are always overwritten from HR:
 *   firstName, lastName, email, phone, dob, department, branch,
 *   jobTitle, employmentType, hrPlatformId
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { StaffDepartment } from '@prisma/client'

const HR_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

const VALID_DEPTS: Set<string> = new Set([
  'OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS', 'FRONT_DESK', 'ADMINISTRATION',
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
  birthday: string | null  // "YYYY-MM-DD" or empty string
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
    console.log('[staff-sync] Fetching from', `${HR_URL}/staff/external`)
    const res = await fetch(`${HR_URL}/staff/external`, {
      headers: { Authorization: `Bearer ${HR_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('[staff-sync] HR returned', res.status)
      return NextResponse.json({ error: `HR Platform returned ${res.status}` }, { status: 502 })
    }
    const data = await res.json()
    hrStaff = data.staff || []
    console.log('[staff-sync] Received', hrStaff.length, 'staff from HR')
  } catch (err) {
    console.error('[staff-sync] Fetch failed:', err)
    return NextResponse.json({ error: 'Cannot reach HR Platform' }, { status: 502 })
  }

  // Build two lookup maps from existing local staff:
  //   1. by hrPlatformId  (primary — survives name/email changes)
  //   2. by firstName|lastName|branch  (fallback for not-yet-linked records)
  const existing = await prisma.staff.findMany()
  const byHrId = new Map<string, typeof existing[0]>()
  const byName = new Map<string, typeof existing[0]>()
  for (const s of existing) {
    if (s.hrPlatformId) byHrId.set(s.hrPlatformId, s)
    byName.set(`${s.firstName}|${s.lastName}|${s.branch}`, s)
  }

  let created = 0
  let updated = 0
  const errors: string[] = []
  const matchedIds = new Set<string>()

  for (const hr of hrStaff) {
    if (!hr.department || !VALID_DEPTS.has(hr.department)) continue
    if (!['SBEA', 'SBGH'].includes(hr.branch)) continue

    // Parse birthday — accept "YYYY-MM-DD" or any ISO-parseable string
    let dob: Date | null = null
    if (hr.birthday) {
      const d = new Date(hr.birthday)
      if (!isNaN(d.getTime())) dob = d
    }

    // Match: hrPlatformId first (stable), then name+branch fallback
    const match = byHrId.get(hr.hrId) ?? byName.get(`${hr.firstName}|${hr.lastName}|${hr.branch}`)

    if (match) {
      const changed = match.firstName !== hr.firstName || match.lastName !== hr.lastName
      if (changed) {
        console.log(`[staff-sync] UPDATE ${match.firstName} ${match.lastName} → ${hr.firstName} ${hr.lastName} (hrId: ${hr.hrId})`)
      }
    } else {
      console.log(`[staff-sync] NEW ${hr.firstName} ${hr.lastName} (hrId: ${hr.hrId})`)
    }

    const payload = {
      firstName:      hr.firstName,
      lastName:       hr.lastName,
      email:          hr.email,
      phone:          hr.phone,
      dob,
      department:     hr.department as StaffDepartment,
      branch:         hr.branch,
      jobTitle:       hr.jobTitle,
      employmentType: hr.employmentType,
      hrPlatformId:   hr.hrId,
    }

    try {
      if (match) {
        await prisma.staff.update({ where: { id: match.id }, data: payload })
        matchedIds.add(match.id)
        updated++
      } else {
        const newStaff = await prisma.staff.create({ data: payload })
        matchedIds.add(newStaff.id)
        created++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${hr.firstName} ${hr.lastName}: ${msg}`)
    }
  }

  // Delete staff not found in HR Platform (only those in synced departments)
  const toDelete = existing.filter(s => !matchedIds.has(s.id))
  let deleted = 0
  for (const s of toDelete) {
    try {
      await prisma.staff.delete({ where: { id: s.id } })
      deleted++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`Delete ${s.firstName} ${s.lastName}: ${msg}`)
    }
  }

  return NextResponse.json({ synced: created + updated, created, updated, deleted, errors, total: hrStaff.length })
}
