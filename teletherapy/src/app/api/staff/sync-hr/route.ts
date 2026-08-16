/**
 * Staff Sync (staff portal) — pull staff/interns from the HR Platform into the
 * shared Staff table so newly-added people (esp. interns) show up in the Admin
 * Panel's Create Account list without a trip to the Operations Hub.
 *
 * Deliberately UPSERT-ONLY: unlike the Operations Hub's sync
 * (src/app/api/staff/sync/route.ts), this route never deletes local Staff rows.
 * The ops hub remains the single authoritative full-sync (with pruning); this
 * button is a convenience that can only ADD or UPDATE, so it can't wipe anyone.
 *
 * teletherapy runs as a pm2 process on the VPS host (not in Docker), so
 * 127.0.0.1:3457 reaches the HR Platform directly.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { StaffDepartment } from '@prisma/client'

const HR_URLS = [
  process.env.HR_PLATFORM_URL,
  'http://127.0.0.1:3457',    // pm2 host (teletherapy is not containerised)
  'http://172.17.0.1:3457',   // default Docker bridge gateway (fallback)
  'http://host.docker.internal:3457',
].filter(Boolean) as string[]
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

// Departments the staff portal recognises. Interns are pulled regardless of
// department (an intern in a non-clinical dept can still need an account).
const VALID_DEPTS = new Set(['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS', 'FRONT_DESK', 'ADMINISTRATION'])
const VALID_BRANCHES = ['SBEA', 'SBGH', 'VDNA']

interface HRStaff {
  hrId: string
  firstName: string
  lastName: string
  branch: string
  branches?: string[]
  department: string
  jobTitle: string | null
  employmentType: string | null
  email: string | null
  phone: string | null
  birthday: string | null
}

export async function POST() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  if (!HR_KEY) {
    return NextResponse.json({ error: 'HR Platform API key not configured' }, { status: 500 })
  }

  // Fetch from HR, trying each candidate address until one answers.
  let hrStaff: HRStaff[] = []
  let fetched = false
  let lastErr = ''
  for (const hrUrl of HR_URLS) {
    try {
      const res = await fetch(hrUrl + '/staff/external', {
        headers: { Authorization: 'Bearer ' + HR_KEY },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) { lastErr = 'HR returned ' + res.status + ' from ' + hrUrl; continue }
      const data = await res.json()
      hrStaff = data.staff || []
      fetched = true
      break
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
    }
  }
  if (!fetched) {
    return NextResponse.json({ error: 'Cannot reach HR Platform: ' + lastErr }, { status: 502 })
  }

  const existing = await prisma.staff.findMany()
  const byHrId = new Map<string, typeof existing[0]>()
  const byName = new Map<string, typeof existing[0]>()
  for (const s of existing) {
    if (s.hrPlatformId) byHrId.set(s.hrPlatformId, s)
    byName.set(s.firstName + '|' + s.lastName + '|' + s.branch, s)
  }

  let created = 0
  let updated = 0
  const errors: string[] = []

  for (const hr of hrStaff) {
    const isIntern = hr.employmentType === 'intern' || /intern/i.test(hr.jobTitle ?? '')
    // Keep clinical/known-dept staff, plus interns of ANY department.
    if (!isIntern && (!hr.department || !VALID_DEPTS.has(hr.department))) continue
    if (!['SBEA', 'SBGH'].includes(hr.branch)) continue
    // Staff table's department enum can't hold arbitrary strings — skip interns
    // whose department isn't a known StaffDepartment (they'd fail the write).
    if (!hr.department || !VALID_DEPTS.has(hr.department)) {
      errors.push(hr.firstName + ' ' + hr.lastName + ': unknown department "' + hr.department + '"')
      continue
    }

    let dob: Date | null = null
    if (hr.birthday) {
      const d = new Date(hr.birthday)
      if (!isNaN(d.getTime())) dob = d
    }

    const extraBranches = (hr.branches ?? [hr.branch])
      .filter((b) => VALID_BRANCHES.includes(b) && b !== hr.branch)

    const payload = {
      firstName:      hr.firstName,
      lastName:       hr.lastName,
      email:          hr.email,
      phone:          hr.phone,
      dob,
      department:     hr.department as StaffDepartment,
      branch:         hr.branch,
      extraBranches,
      jobTitle:       hr.jobTitle,
      employmentType: hr.employmentType,
      hrPlatformId:   hr.hrId,
    }

    const match = byHrId.get(hr.hrId) ?? byName.get(hr.firstName + '|' + hr.lastName + '|' + hr.branch)
    try {
      if (match) {
        await prisma.staff.update({ where: { id: match.id }, data: payload })
        updated++
      } else {
        await prisma.staff.create({ data: payload })
        created++
      }
    } catch (err) {
      errors.push(hr.firstName + ' ' + hr.lastName + ': ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return NextResponse.json({ synced: created + updated, created, updated, errors, total: hrStaff.length })
}
