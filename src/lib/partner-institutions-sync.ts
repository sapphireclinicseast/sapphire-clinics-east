// Partner Institutions sync — pull the partnership list from HR Platform into
// this database. Same shape as staff-sync.ts (lifted out of the route so a
// future nightly cron and the manual "Sync" button run identical code), and
// the same leaver reasoning: HR is authoritative, and an institution missing
// from the feed is DEACTIVATED rather than deleted — a partial/broken feed
// must never look like every partnership just ended.
import { prisma } from '@/lib/prisma'

// Same multi-bridge fallback as staff-sync.ts — try whatever HR_PLATFORM_URL
// is configured, then the common Docker bridge addresses.
const HR_URLS = [
  process.env.HR_PLATFORM_URL,
  'http://172.17.0.1:3457',
  'http://172.18.0.1:3457',
  'http://host.docker.internal:3457',
  'http://127.0.0.1:3457',
].filter(Boolean) as string[]
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

interface HRDiscount {
  serviceId: string
  serviceLabel: string
  discountType: string
  value: number
  note: string
}

interface HRService {
  id: string
  label: string
}

interface HRPartnerInstitution {
  id: string
  name: string
  type: string
  typeLabel: string
  pointOfContact: string
  email: string
  mobile: string
  telephone: string
  services: HRService[]
  discounts: HRDiscount[]
  agreementType: string
  effectivityFrom: string
  effectivityTo: string
  hasCommission: boolean
  commissionType: string
  commissionValue: number
  commissionNote: string
  hasDocument: boolean
  photoCount: number
  remarks: string
  updatedAt: string
}

export interface PartnerInstitutionSyncResult {
  synced: number
  created: number
  updated: number
  deactivated: number
  errors: string[]
  total: number
}

/** Thrown for the conditions the callers turn into HTTP status codes. */
export class PartnerInstitutionSyncError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export async function syncPartnerInstitutionsFromHr(): Promise<PartnerInstitutionSyncResult> {
  if (!HR_KEY) {
    throw new PartnerInstitutionSyncError('HR Platform API key not configured', 500)
  }

  let hrInstitutions: HRPartnerInstitution[]
  {
    let fetched = false
    let lastErr = ''
    hrInstitutions = []
    for (const hrUrl of HR_URLS) {
      try {
        console.log('[partner-institutions-sync] Trying', hrUrl + '/partner-institutions/external')
        const res = await fetch(hrUrl + '/partner-institutions/external', {
          headers: { Authorization: 'Bearer ' + HR_KEY },
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) {
          lastErr = 'HR returned ' + res.status + ' from ' + hrUrl
          console.error('[partner-institutions-sync]', lastErr)
          continue
        }
        const data = await res.json()
        hrInstitutions = data.institutions || []
        console.log('[partner-institutions-sync] Got', hrInstitutions.length, 'institutions via', hrUrl)
        fetched = true
        break
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err)
        console.error('[partner-institutions-sync] Failed via', hrUrl + ':', lastErr)
      }
    }
    if (!fetched) {
      throw new PartnerInstitutionSyncError('Cannot reach HR Platform: ' + lastErr, 502)
    }
  }

  const existing = await prisma.partnerInstitution.findMany()
  const byHrId = new Map(existing.map(i => [i.hrPlatformId, i]))

  let created = 0
  let updated = 0
  const errors: string[] = []
  const matchedIds = new Set<string>()

  for (const hr of hrInstitutions) {
    const parseDate = (s: string) => {
      if (!s) return null
      const d = new Date(s)
      return isNaN(d.getTime()) ? null : d
    }

    const payload = {
      hrPlatformId: hr.id,
      name: hr.name,
      type: hr.type,
      typeLabel: hr.typeLabel,
      pointOfContact: hr.pointOfContact || null,
      email: hr.email || null,
      mobile: hr.mobile || null,
      telephone: hr.telephone || null,
      services: hr.services || [],
      discounts: hr.discounts || [],
      agreementType: hr.agreementType,
      effectivityFrom: parseDate(hr.effectivityFrom),
      effectivityTo: parseDate(hr.effectivityTo),
      hasCommission: !!hr.hasCommission,
      commissionType: hr.commissionType || 'percent',
      commissionValue: hr.commissionValue || 0,
      commissionNote: hr.commissionNote || null,
      hasDocument: !!hr.hasDocument,
      photoCount: hr.photoCount || 0,
      remarks: hr.remarks || null,
      active: true,
      hrUpdatedAt: parseDate(hr.updatedAt) ?? new Date(),
    }

    try {
      const match = byHrId.get(hr.id)
      if (match) {
        await prisma.partnerInstitution.update({ where: { id: match.id }, data: payload })
        matchedIds.add(match.id)
        updated++
      } else {
        const created_ = await prisma.partnerInstitution.create({ data: payload })
        matchedIds.add(created_.id)
        created++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(hr.name + ': ' + msg)
    }
  }

  // ── Leavers — same partial-feed guard as staff-sync.ts: an HR outage or a
  // half-broken query returning a handful of rows must not read as "every
  // partnership ended," so deactivation is skipped (and reported) when the
  // feed looks implausibly small next to what is active here already.
  const missing = existing.filter(i => !matchedIds.has(i.id))
  const activeLocal = existing.filter(i => i.active).length
  const feedTooSmall = activeLocal > 0 && hrInstitutions.length < activeLocal / 2

  let deactivated = 0
  if (feedTooSmall) {
    errors.push(
      'Skipped deactivating ' + missing.length + ' institutions: HR returned only ' + hrInstitutions.length +
      ' against ' + activeLocal + ' active here, which looks like a partial feed rather than ' +
      missing.length + ' real removals. Nothing was changed for them.',
    )
  } else {
    for (const inst of missing) {
      if (!inst.active) continue
      try {
        await prisma.partnerInstitution.update({ where: { id: inst.id }, data: { active: false } })
        deactivated++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push('Deactivate ' + inst.name + ': ' + msg)
      }
    }
  }

  console.log('[partner-institutions-sync] Done:', { created, updated, deactivated, errors: errors.length })
  return { synced: created + updated, created, updated, deactivated, errors, total: hrInstitutions.length }
}
