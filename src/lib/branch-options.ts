/**
 * The list of branches a patient can belong to.
 *
 * Single source of truth for every patient-facing branch picker and every
 * server-side branch validation. It reads the HrBranch registry, which syncs
 * hourly from HR Platform (see /api/branches/sync/cron), so a branch created
 * in HR Platform becomes a selectable patient branch within the hour — no
 * code change, no deploy, no migration.
 *
 * That only works because Patient.branch / Patient.branches are plain text.
 * They used to be a Prisma enum, which is why this file could not have existed
 * before: a Postgres enum cannot gain a value at runtime, so the branch list
 * was necessarily hardcoded in the client and duplicated across every route
 * that validated one.
 *
 * FALLBACK exists for the window before the first sync, or if HR Platform is
 * unreachable. It carries exactly the three values the enum used to hold, so
 * behaviour cannot silently regress — but it is a floor, never a ceiling: a
 * branch present in HrBranch is always offered even if it is not listed here.
 */
import { prisma } from '@/lib/prisma'

export interface BranchOption {
  /** Stored on Patient.branch / Patient.branches, e.g. "SANDBOX_EAST". */
  value: string
  /** Human label for pickers, e.g. "Aura Health Rehab – East". */
  label: string
  /** HR Platform short code, e.g. "SBEA" — used by staff/report joins. */
  shortCode: string
}

const FALLBACK: BranchOption[] = [
  { value: 'SANDBOX_EAST',       label: 'Aura Health East',       shortCode: 'SBEA' },
  { value: 'SANDBOX_GREENHILLS', label: 'Aura Health Greenhills', shortCode: 'SBGH' },
  { value: 'VERDANA_STORE',      label: 'Verdana Store',          shortCode: 'VDNA' },
]

export async function getBranchOptions(): Promise<BranchOption[]> {
  try {
    const rows = await prisma.hrBranch.findMany({
      where: { active: true, opsHubBranch: { not: null } },
      select: { opsHubBranch: true, brandName: true, name: true, shortCode: true },
      orderBy: { shortCode: 'asc' },
    })
    if (rows.length === 0) return FALLBACK

    const opts = rows.map((r) => ({
      value: r.opsHubBranch as string,
      label: r.brandName || r.name,
      shortCode: r.shortCode,
    }))

    // Keep any fallback value HR Platform doesn't know about rather than
    // dropping it — patients may already be filed under it, and a picker that
    // omits a value in use makes those records uneditable.
    for (const f of FALLBACK) {
      if (!opts.some((o) => o.value === f.value)) opts.push(f)
    }
    return opts
  } catch (err) {
    console.error('[branch-options] HrBranch read failed, using fallback:', err)
    return FALLBACK
  }
}

/**
 * Filters a submitted list down to branches that actually exist.
 *
 * Returns the accepted values and whatever was rejected, so callers can 400
 * with a specific message instead of silently discarding a typo'd branch.
 */
export async function validateBranches(
  submitted: unknown,
): Promise<{ valid: string[]; invalid: string[] }> {
  const list = Array.isArray(submitted) ? submitted.map(String) : []
  const allowed = new Set((await getBranchOptions()).map((o) => o.value))
  const valid: string[] = []
  const invalid: string[] = []
  for (const b of list) {
    if (!b) continue
    if (allowed.has(b)) { if (!valid.includes(b)) valid.push(b) }
    else invalid.push(b)
  }
  return { valid, invalid }
}
