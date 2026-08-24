/**
 * Staff Sync — Pull staff data from HR Platform
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { StaffDepartment } from '@prisma/client'

// Try multiple Docker bridge addresses in case HR_PLATFORM_URL is not set.
// Inside the sapphire_app container, 127.0.0.1 is the container itself;
// the host gateway is reachable via the Docker bridge IP.
const HR_URLS = [
  process.env.HR_PLATFORM_URL,
  'http://172.17.0.1:3457',   // default Docker bridge gateway
  'http://172.18.0.1:3457',   // compose network gateway
  'http://host.docker.internal:3457',
  'http://127.0.0.1:3457',    // localhost (works outside Docker)
].filter(Boolean) as string[]
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

const VALID_DEPTS: Set<string> = new Set([
  'OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS', 'FRONT_DESK', 'ADMINISTRATION',
])

interface HRBranchEmployment {
  employmentType: string | null
  employeeId: string | null
  department: string | null
  jobTitle: string | null
}

interface HRStaff {
  hrId: string
  employeeId: string | null
  firstName: string
  lastName: string
  branch: string          // primary branch
  branches?: string[]     // all branches — present when profile is merged (interbranch consultant)
  branchEmployment?: Record<string, HRBranchEmployment> // per-branch details (new)
  department: string
  jobTitle: string | null
  employmentType: string | null
  email: string | null
  phone: string | null
  birthday: string | null
  dateHired: string | null
  contractExpiry: string | null
  sex: string | null
  // Financial / government-ID fields — synced one-way from HR Hub.
  // Sensitive: keep server-side; do NOT surface in non-admin views.
  tin: string | null
  sss: string | null
  pagibig: string | null
  philhealth: string | null
  bankName: string | null
  bankAccountNo: string | null
  isInternshipSupervisor?: boolean
}

export async function POST() {
  console.log('[staff-sync] === SYNC CALLED ===')

  const session = await auth()
  if (!session) {
    console.log('[staff-sync] No session - unauthorized')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as { role?: string }).role ?? ''
  console.log('[staff-sync] User role:', role)
  if (!['ADMIN', 'MARKETING_ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN', 'AHEA_FRONT_DESK', 'AHGH_FRONT_DESK'].includes(role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (!HR_KEY) {
    console.log('[staff-sync] No HR_KEY configured')
    return NextResponse.json({ error: 'HR Platform API key not configured' }, { status: 500 })
  }

  let hrStaff: HRStaff[]
  {
    let fetched = false
    let lastErr = ''
    hrStaff = []
    for (const hrUrl of HR_URLS) {
      try {
        console.log('[staff-sync] Trying', hrUrl + '/staff/external')
        const res = await fetch(hrUrl + '/staff/external', {
          headers: { Authorization: 'Bearer ' + HR_KEY },
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) {
          lastErr = 'HR returned ' + res.status + ' from ' + hrUrl
          console.error('[staff-sync]', lastErr)
          continue
        }
        const data = await res.json()
        hrStaff = data.staff || []
        console.log('[staff-sync] Got', hrStaff.length, 'staff via', hrUrl)
        fetched = true
        break
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err)
        console.error('[staff-sync] Failed via', hrUrl + ':', lastErr)
      }
    }
    if (!fetched) {
      return NextResponse.json({ error: 'Cannot reach HR Platform: ' + lastErr }, { status: 502 })
    }
  }

  const existing = await prisma.staff.findMany()
  console.log('[staff-sync] Existing local staff:', existing.length)
  
  const byHrId = new Map<string, typeof existing[0]>()
  const byName = new Map<string, typeof existing[0]>()
  for (const s of existing) {
    if (s.hrPlatformId) byHrId.set(s.hrPlatformId, s)
    byName.set(s.firstName + '|' + s.lastName + '|' + s.branch, s)
  }
  console.log('[staff-sync] byHrId map size:', byHrId.size, 'byName map size:', byName.size)

  let created = 0
  let updated = 0
  const errors: string[] = []
  const matchedIds = new Set<string>()
  const nameChanges: string[] = []

  for (const hr of hrStaff) {
    if (!hr.department || !VALID_DEPTS.has(hr.department)) continue
    if (!['SBEA', 'SBGH'].includes(hr.branch)) continue

    let dob: Date | null = null
    if (hr.birthday) {
      const d = new Date(hr.birthday)
      if (!isNaN(d.getTime())) dob = d
    }

    let dateHired: Date | null = null
    if (hr.dateHired) {
      const d = new Date(hr.dateHired)
      if (!isNaN(d.getTime())) dateHired = d
    }

    let contractExpiry: Date | null = null
    if (hr.contractExpiry) {
      const d = new Date(hr.contractExpiry)
      if (!isNaN(d.getTime())) contractExpiry = d
    }

    const match = byHrId.get(hr.hrId) ?? byName.get(hr.firstName + '|' + hr.lastName + '|' + hr.branch)

    if (match && (match.firstName !== hr.firstName || match.lastName !== hr.lastName)) {
      nameChanges.push(match.firstName + ' ' + match.lastName + ' -> ' + hr.firstName + ' ' + hr.lastName)
    }

    // Normalize sex values from HR: accept "M"/"F"/"Male"/"Female" (case-insensitive)
    // If HR doesn't provide a value, preserve the locally-set one (managed in
    // the Staff Module UI) — don't overwrite to null.
    let sexFromHr: string | null = null
    if (hr.sex) {
      const s = hr.sex.trim().toUpperCase()
      if (s === 'M' || s === 'MALE')   sexFromHr = 'M'
      else if (s === 'F' || s === 'FEMALE') sexFromHr = 'F'
    }
    const sex = sexFromHr ?? match?.sex ?? null

    // Derive extra branches from the HR merged profile's branches[] array.
    // If HR returns branches: ['SBEA', 'SBGH'] for an interbranch consultant,
    // extraBranches becomes ['SBGH'] (all valid branches except the primary).
    const VALID_BRANCHES = ['SBEA', 'SBGH', 'VDNA']
    const extraBranches = (hr.branches ?? [hr.branch])
      .filter(b => VALID_BRANCHES.includes(b) && b !== hr.branch)

    const payload = {
      firstName:        hr.firstName,
      lastName:         hr.lastName,
      email:            hr.email,
      phone:            hr.phone,
      dob,
      dateHired,
      contractExpiry,
      sex,
      department:       hr.department as StaffDepartment,
      branch:           hr.branch,
      extraBranches,
      branchEmployment: hr.branchEmployment ?? {},
      jobTitle:         hr.jobTitle,
      employmentType:   hr.employmentType,
      employeeId:       hr.employeeId,
      // Financial / gov-ID fields — written one-way from HR. If HR
      // returns null for any of these, the local field is set to null
      // (HR is the single source of truth, so a deletion on HR clears
      // the local copy on the next sync).
      tin:              hr.tin,
      sss:              hr.sss,
      pagibig:          hr.pagibig,
      philhealth:       hr.philhealth,
      bankName:         hr.bankName,
      bankAccountNo:    hr.bankAccountNo,
      hrPlatformId:     hr.hrId,
      isInternshipSupervisor: !!hr.isInternshipSupervisor,
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
      errors.push(hr.firstName + ' ' + hr.lastName + ': ' + msg)
    }
  }

  const toDelete = existing.filter(s => !matchedIds.has(s.id))
  let deleted = 0
  for (const s of toDelete) {
    try {
      await prisma.staff.delete({ where: { id: s.id } })
      deleted++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push('Delete ' + s.firstName + ' ' + s.lastName + ': ' + msg)
    }
  }

  console.log('[staff-sync] Done:', { created, updated, deleted, nameChanges, errors: errors.length })
  return NextResponse.json({ synced: created + updated, created, updated, deleted, nameChanges, errors, total: hrStaff.length })
}
