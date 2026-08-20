/**
 * Pull the Branches Registry from HR Platform into the local HrBranch cache.
 *
 * Extracted from the admin-only POST /api/branches/sync so the same code can
 * also run unattended (see /api/branches/sync/cron). That matters because
 * HrBranch is what makes HR Platform the real source of truth for branch
 * contact details — clinic-schedule emails resolve their sending mailbox from
 * HrBranch.emailMain. If the cache is only ever filled by someone clicking a
 * button, an edit in HR Platform never reaches those emails.
 *
 * Full-replace: upsert by id, delete rows no longer present. Branches have no
 * ambiguous-identity problem the way staff do, so no name-matching is needed.
 */
import { prisma } from '@/lib/prisma'

// Try multiple Docker bridge addresses in case HR_PLATFORM_URL is not set —
// same fallback chain as /api/staff/sync.
const HR_URLS = [
  process.env.HR_PLATFORM_URL,
  'http://172.17.0.1:3457',
  'http://172.18.0.1:3457',
  'http://host.docker.internal:3457',
  'http://127.0.0.1:3457',
].filter(Boolean) as string[]

const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

export interface HRBranch {
  id: string
  shortCode: string
  aliases: string[]
  enumValues: {
    opsHubBranch: string | null
    opsHubClassPortalBranch: string | null
    acctHubBranch: string | null
    acctHubServiceBranch: string | null
    teletherapyBranch: string | null
  }
  name: string
  brandName: string
  tin: string
  address: string
  phone: string
  emails: {
    main: string; hr: string; accounting: string
    payslips: string | null; schedules: string | null; sessionNotes: string | null
  }
  departmentsOffered: string[]
  operatingDays: string[]
  operatingHours: { open: string; close: string }
  active: boolean
}

export interface BranchSyncResult {
  ok: boolean
  /** Set only when ok is false — the caller decides the HTTP status. */
  error?: string
  synced: number
  created: number
  updated: number
  deleted: number
  total: number
  errors: string[]
}

export async function syncBranchesFromHr(): Promise<BranchSyncResult> {
  const empty = { synced: 0, created: 0, updated: 0, deleted: 0, total: 0, errors: [] }

  if (!HR_KEY) {
    return { ok: false, error: 'HR Platform API key not configured', ...empty }
  }

  let hrBranches: HRBranch[] = []
  let fetched = false
  let lastErr = ''
  for (const hrUrl of HR_URLS) {
    try {
      const res = await fetch(hrUrl + '/branches/external', {
        headers: { Authorization: 'Bearer ' + HR_KEY },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) {
        lastErr = 'HR returned ' + res.status + ' from ' + hrUrl
        continue
      }
      const data = await res.json()
      hrBranches = data.branches || []
      fetched = true
      break
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
    }
  }
  if (!fetched) {
    return { ok: false, error: 'Cannot reach HR Platform: ' + lastErr, ...empty }
  }

  // An empty payload from a reachable HR Platform would wipe the cache and
  // silently drop every branch back to the hardcoded fallback. Treat it as a
  // fault, not as "there are no branches".
  if (hrBranches.length === 0) {
    return { ok: false, error: 'HR Platform returned no branches — refusing to clear the cache', ...empty }
  }

  const existing = await prisma.hrBranch.findMany({ select: { id: true } })
  const seenIds = new Set<string>()
  let created = 0
  let updated = 0
  const errors: string[] = []

  for (const b of hrBranches) {
    const payload = {
      shortCode: b.shortCode,
      aliases: b.aliases ?? [],
      opsHubBranch: b.enumValues?.opsHubBranch ?? null,
      opsHubClassPortalBranch: b.enumValues?.opsHubClassPortalBranch ?? null,
      acctHubBranch: b.enumValues?.acctHubBranch ?? null,
      acctHubServiceBranch: b.enumValues?.acctHubServiceBranch ?? null,
      teletherapyBranch: b.enumValues?.teletherapyBranch ?? null,
      name: b.name,
      brandName: b.brandName || null,
      tin: b.tin || null,
      address: b.address || null,
      phone: b.phone || null,
      emailMain: b.emails?.main || null,
      emailHr: b.emails?.hr || null,
      emailAccounting: b.emails?.accounting || null,
      emailPayslips: b.emails?.payslips || null,
      emailSchedules: b.emails?.schedules || null,
      emailSessionNotes: b.emails?.sessionNotes || null,
      departmentsOffered: b.departmentsOffered ?? [],
      operatingDays: b.operatingDays ?? [],
      operatingHoursOpen: b.operatingHours?.open || null,
      operatingHoursClose: b.operatingHours?.close || null,
      active: b.active,
      syncedAt: new Date(),
    }
    try {
      await prisma.hrBranch.upsert({
        where: { id: b.id },
        create: { id: b.id, ...payload },
        update: payload,
      })
      seenIds.add(b.id)
      if (existing.some(e => e.id === b.id)) updated++
      else created++
    } catch (err) {
      errors.push(b.id + ': ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  let deleted = 0
  for (const e of existing.filter(e => !seenIds.has(e.id))) {
    try {
      await prisma.hrBranch.delete({ where: { id: e.id } })
      deleted++
    } catch (err) {
      errors.push('Delete ' + e.id + ': ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return {
    ok: true,
    synced: created + updated,
    created,
    updated,
    deleted,
    total: hrBranches.length,
    errors,
  }
}
