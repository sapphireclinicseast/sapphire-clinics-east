/**
 * Branches Registry sync — pulls the per-branch config (incl. the email
 * automation senders) from HR Platform into the shared HrBranch cache.
 *
 * Shared by the admin "Sync Branches" endpoint (full replace, incl. deletes)
 * and an opportunistic throttled background refresh (upsert-only) fired from
 * the email path — so a sender changed in HR Hub propagates automatically,
 * without anyone having to click Sync.
 */
import { prisma } from './prisma'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'
const HR_KEY = process.env.HR_API_KEY ?? ''
const SERVICE_KEY = process.env.TELETHERAPY_HR_API_KEY ?? ''
const HR_BRANCH_URLS = [
  `${HR_API_BASE}/branches/external`,
  'http://127.0.0.1:3457/branches/external', // direct pm2 fallback (same key)
]

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

export async function fetchHrBranches(): Promise<HRBranch[]> {
  let lastErr = ''
  for (const url of HR_BRANCH_URLS) {
    try {
      const res = await fetch(url, {
        headers: {
          'x-api-key': SERVICE_KEY,
          ...(HR_KEY ? { Authorization: 'Bearer ' + HR_KEY } : {}),
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) { lastErr = 'HR returned ' + res.status + ' from ' + url; continue }
      const data = await res.json()
      return (data.branches || []) as HRBranch[]
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
    }
  }
  throw new Error('Cannot reach HR Platform: ' + lastErr)
}

function toPayload(b: HRBranch) {
  return {
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
}

export interface SyncResult {
  synced: number; created: number; updated: number; deleted: number; errors: string[]; total: number
}

// deleteMissing=true is the admin full-replace; the background refresh passes
// false so a transient partial HR response can't wipe rows.
export async function syncBranchesFromHr({ deleteMissing = true } = {}): Promise<SyncResult> {
  const hrBranches = await fetchHrBranches()
  const existing = await prisma.hrBranch.findMany({ select: { id: true } })
  const seenIds = new Set<string>()
  let created = 0, updated = 0, deleted = 0
  const errors: string[] = []

  for (const b of hrBranches) {
    const payload = toPayload(b)
    try {
      await prisma.hrBranch.upsert({
        where: { id: b.id },
        create: { id: b.id, ...payload },
        update: payload,
      })
      seenIds.add(b.id)
      if (existing.some((e) => e.id === b.id)) updated++
      else created++
    } catch (err) {
      errors.push(b.id + ': ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  if (deleteMissing) {
    for (const e of existing.filter((e) => !seenIds.has(e.id))) {
      try { await prisma.hrBranch.delete({ where: { id: e.id } }); deleted++ }
      catch (err) { errors.push('Delete ' + e.id + ': ' + (err instanceof Error ? err.message : String(err))) }
    }
  }

  return { synced: created + updated, created, updated, deleted, errors, total: hrBranches.length }
}

// Opportunistic, throttled, fire-and-forget refresh of the branch cache so
// sender changes in HR Hub show up without a manual sync. Safe to call on hot
// paths: it no-ops within the throttle window and never throws.
const AUTO_SYNC_MS = 30 * 60 * 1000 // at most once per 30 min per process
let lastAutoSync = 0
let inFlight = false
export function maybeSyncBranches(): void {
  const now = Date.now()
  if (inFlight || now - lastAutoSync < AUTO_SYNC_MS) return
  lastAutoSync = now
  inFlight = true
  syncBranchesFromHr({ deleteMissing: false })
    .catch((e) => console.error('[branch-sync] auto refresh failed:', e instanceof Error ? e.message : e))
    .finally(() => { inFlight = false })
}
