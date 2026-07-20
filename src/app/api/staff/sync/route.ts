/**
 * Staff Sync — Pull staff data from HR Platform
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
  employeeId: string | null
  firstName: string
  lastName: string
  branch: string          // primary branch
  branches?: string[]     // all branches — present when profile is merged (interbranch consultant)
  department: string
  jobTitle: string | null
  employmentType: string | null
  email: string | null
  phone: string | null
  birthday: string | null
  sex: string | null
  // Financial / government-ID fields — synced one-way from HR Hub.
  // Sensitive: keep server-side; do NOT surface in non-admin views.
  tin: string | null
  sss: string | null
  pagibig: string | null
  philhealth: string | null
  bankName: string | null
  bankAccountNo: string | null
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
  try {
    console.log('[staff-sync] Fetching from', HR_URL + '/staff/external')
    const res = await fetch(HR_URL + '/staff/external', {
      headers: { Authorization: 'Bearer ' + HR_KEY },
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('[staff-sync] HR returned', res.status)
      return NextResponse.json({ error: 'HR Platform returned ' + res.status }, { status: 502 })
    }
    const data = await res.json()
    hrStaff = data.staff || []
    console.log('[staff-sync] Got', hrStaff.length, 'staff from HR')
  } catch (err) {
    console.error('[staff-sync] Fetch failed:', err)
    return NextResponse.json({ error: 'Cannot reach HR Platform' }, { status: 502 })
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

    // extraBranches is a locally-managed field: only update it from the HR
    // sync when HR explicitly returns a merged-profile branches[] with more
    // than one entry. If HR does not send branches[] (or sends only the
    // primary branch), preserve whatever is already stored locally so that
    // admin-set values are never silently wiped by a sync.
    const VALID_BRANCHES = ['SBEA', 'SBGH', 'VDNA']
    const hrExtraBranches = Array.isArray(hr.branches) && hr.branches.length > 1
      ? hr.branches.filter((b: string) => VALID_BRANCHES.includes(b) && b !== hr.branch)
      : null // null = "HR didn't tell us — leave local value alone"

    const payload = {
      firstName:      hr.firstName,
      lastName:       hr.lastName,
      email:          hr.email,
      phone:          hr.phone,
      dob,
      sex,
      department:     hr.department as StaffDepartment,
      branch:         hr.branch,
      ...(hrExtraBranches !== null ? { extraBranches: hrExtraBranches } : {}),
      jobTitle:       hr.jobTitle,
      employmentType: hr.employmentType,
      employeeId:     hr.employeeId,
      // Financial / gov-ID fields — written one-way from HR. If HR
      // returns null for any of these, the local field is set to null
      // (HR is the single source of truth, so a deletion on HR clears
      // the local copy on the next sync).
      tin:            hr.tin,
      sss:            hr.sss,
      pagibig:        hr.pagibig,
      philhealth:     hr.philhealth,
      bankName:       hr.bankName,
      bankAccountNo:  hr.bankAccountNo,
      hrPlatformId:   hr.hrId,
      active:         true, // present in HR's active feed → (re)activate
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

  // Staff no longer in HR's active feed (inactive or removed in HR). Try a
  // hard delete; if they have history (survey/peer-eval/schedule rows with FK
  // constraints), soft-deactivate instead so they drop out of the Staff Module
  // and Top 5 while their records are preserved.
  const toRemove = existing.filter(s => !matchedIds.has(s.id))
  let deleted = 0
  let deactivated = 0
  for (const s of toRemove) {
    try {
      await prisma.staff.delete({ where: { id: s.id } })
      deleted++
    } catch {
      try {
        if (s.active !== false) {
          await prisma.staff.update({ where: { id: s.id }, data: { active: false } })
        }
        deactivated++
      } catch (err2) {
        const msg = err2 instanceof Error ? err2.message : String(err2)
        errors.push('Deactivate ' + s.firstName + ' ' + s.lastName + ': ' + msg)
      }
    }
  }

  // ── Keep staff-portal logins in step with the synced staff email ──────────
  // Staff emails are managed in HR and flow here on sync. When a staff member's
  // email changes, their Staff Portal login (TherapistAccount, same shared DB —
  // not in this app's Prisma schema, so updated by raw SQL) must follow it
  // automatically, keeping the SAME password. Match by the linked staffId;
  // store lower-cased to match the login lookup; skip any target email that
  // already belongs to a different account (email is unique).
  let loginEmailsUpdated = 0
  try {
    loginEmailsUpdated = await prisma.$executeRaw`
      UPDATE "TherapistAccount" ta
      SET email = lower(btrim(s.email)), "updatedAt" = NOW()
      FROM "Staff" s
      WHERE ta."staffId" = s.id
        AND s.email IS NOT NULL AND btrim(s.email) <> ''
        AND lower(ta.email) <> lower(btrim(s.email))
        AND NOT EXISTS (
          SELECT 1 FROM "TherapistAccount" x
          WHERE lower(x.email) = lower(btrim(s.email)) AND x.id <> ta.id
        )
    `
  } catch (err) {
    errors.push('Login-email reconcile: ' + (err instanceof Error ? err.message : String(err)))
  }

  console.log('[staff-sync] Done:', { created, updated, deleted, deactivated, loginEmailsUpdated, nameChanges, errors: errors.length })
  return NextResponse.json({ synced: created + updated, created, updated, deleted, deactivated, loginEmailsUpdated, nameChanges, errors, total: hrStaff.length })
}
