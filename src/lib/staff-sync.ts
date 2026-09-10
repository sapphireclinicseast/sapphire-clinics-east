// Staff sync — pull the roster from HR Platform into this database.
//
// Lifted out of the route so the nightly cron and the Staff module's Sync
// button run byte-for-byte the same code. They used to be the same thing only
// because there was one caller; a second caller is exactly how those drift.
//
// HR is the source of truth throughout: it omits anyone deactivated from
// /staff/external, so absence from the feed is what marks a leaver. See the
// leaver block below for why they are deactivated rather than deleted.
/**
 * Staff Sync — Pull staff data from HR Platform
 */
import { prisma } from '@/lib/prisma'
import { StaffDepartment } from '@prisma/client'
import { normalizeArrangement } from '@/lib/work-arrangement'

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
  /** Per-branch Work Arrangement — authoritative over the staff-level value,
   *  which disagrees with it for most of the roster. */
  arrangement?: string | null
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
  isClinicalMentor?: boolean
  /** Work Arrangement slug from HR: on-site | hybrid | wfh | teletherapy |
   *  homecare | on-site-teletherapy | on-site-homecare. Absent/empty when the
   *  consultant has not been tagged. */
  arrangement?: string | null
  /** HR has been seen to use either spelling; accept both rather than silently
   *  syncing every consultant as untagged if the field is renamed. */
  workArrangement?: string | null
  menteeIds?: string[] // HR's OWN staff ids — translated to local Staff.id below
}

export interface StaffSyncResult {
  synced: number
  created: number
  updated: number
  deactivated: number
  menteesSynced: number
  nameChanges: string[]
  errors: string[]
  total: number
}

/** Thrown for the conditions the callers turn into HTTP status codes. */
export class StaffSyncError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export async function syncStaffFromHr(): Promise<StaffSyncResult> {
  if (!HR_KEY) {
    throw new StaffSyncError('HR Platform API key not configured', 500)
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
      throw new StaffSyncError('Cannot reach HR Platform: ' + lastErr, 502)
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
  // HR's own staff id -> this table's local Staff.id. Built during the main
  // loop below, consumed after the leaver pass (so it reflects final
  // post-sync state) to translate menteeIds — see the pass after `missing`.
  const hrIdToLocalId = new Map<string, string>()

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
      // In the feed = employed. HR is the source of truth for this (the staff
      // handbook has said so all along) but the payload never carried it, so a
      // deactivation in HR never reached here and the person stayed on the
      // Decking board indefinitely. Also brings a returning consultant back.
      active:           true,
      isInternshipSupervisor: !!hr.isInternshipSupervisor,
      isClinicalMentor: !!hr.isClinicalMentor,
      // Raw HR slug — the Decking board owns the grouping, so a label reword
      // in HR must not regroup boards here. Empty string means untagged; store
      // null so "untagged" is one value rather than two.
      workArrangement: normalizeArrangement(hr.arrangement ?? hr.workArrangement),
    }

    try {
      if (match) {
        await prisma.staff.update({ where: { id: match.id }, data: payload })
        matchedIds.add(match.id)
        hrIdToLocalId.set(hr.hrId, match.id)
        updated++
      } else {
        const newStaff = await prisma.staff.create({ data: payload })
        matchedIds.add(newStaff.id)
        hrIdToLocalId.set(hr.hrId, newStaff.id)
        created++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(hr.firstName + ' ' + hr.lastName + ': ' + msg)
    }
  }

  // ── Leavers ──────────────────────────────────────────────────────
  // HR omits deactivated staff from the feed entirely — there is no status
  // field to read — so "absent from the feed" is how a leaver arrives here.
  //
  // They are DEACTIVATED, not deleted. This used to call staff.delete(), and
  // every relation onto Staff cascades: Schedule, DeckingSlot,
  // DeckingTherapistConfig, SurveyResponse, PeerEval. At the time this was
  // written that meant one click of Sync would have destroyed 4,933 clinical
  // schedule rows, 143 decked sessions and 29 survey responses belonging to 13
  // people who had simply left. A consultant leaving does not un-happen the
  // sessions she ran.
  //
  // active:false is enough to achieve what the delete was for: every roster
  // read — /api/staff, /api/decking/staff, the Decking boards — filters on it.
  //
  // Self-registered providers (from the patient app) are never in the HR feed,
  // so they would always look like leavers. Left alone.
  const missing = existing.filter(s => !matchedIds.has(s.id) && s.source !== 'SELF_SIGNUP')

  // A partial feed must not empty the roster. HR returning a handful of staff
  // because of a bad query or a half-finished migration would otherwise
  // deactivate everyone, and the sync reports success either way.
  const activeLocal = existing.filter(s => s.active).length
  const feedTooSmall = activeLocal > 0 && hrStaff.length < activeLocal / 2

  let deactivated = 0
  if (feedTooSmall) {
    errors.push(
      'Skipped deactivating ' + missing.length + ' staff: HR returned only ' + hrStaff.length +
      ' against ' + activeLocal + ' active here, which looks like a partial feed rather than ' +
      missing.length + ' departures. Nothing was changed for them.',
    )
  } else {
    for (const s of missing) {
      if (!s.active) continue                 // already gone; nothing to do
      try {
        await prisma.staff.update({ where: { id: s.id }, data: { active: false } })
        deactivated++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push('Deactivate ' + s.firstName + ' ' + s.lastName + ': ' + msg)
      }
    }
  }

  // ── menteeIds translation ────────────────────────────────────────
  // Must run after the leaver pass above: hrIdToLocalId needs to reflect
  // the FINAL post-sync state (a just-created mentee's local id, and no
  // stale id for anyone just deactivated). HR sends its own staff ids; the
  // notes-visibility queries in Teletherapy key off local Staff.id, so
  // every id gets translated (or dropped if unresolvable — e.g. a mentee
  // who left and was never synced this run) before being written here.
  let menteesSynced = 0
  for (const hr of hrStaff) {
    if (!hr.menteeIds || !hr.menteeIds.length) continue
    const localMentorId = hrIdToLocalId.get(hr.hrId)
    if (!localMentorId) continue // mentor's own row wasn't synced this run
    const localMenteeIds = hr.menteeIds
      .map(id => hrIdToLocalId.get(id))
      .filter((id): id is string => !!id)
    try {
      await prisma.staff.update({ where: { id: localMentorId }, data: { menteeIds: localMenteeIds } })
      menteesSynced++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(hr.firstName + ' ' + hr.lastName + ' (mentees): ' + msg)
    }
  }

  console.log('[staff-sync] Done:', { created, updated, deactivated, menteesSynced, nameChanges, errors: errors.length })
  console.log('[staff-sync] Done:', { created, updated, deactivated, menteesSynced, nameChanges, errors: errors.length })
  return { synced: created + updated, created, updated, deactivated, menteesSynced, nameChanges, errors, total: hrStaff.length }
}
