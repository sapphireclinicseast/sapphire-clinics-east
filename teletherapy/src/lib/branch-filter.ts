import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Interbranch (multi-branch) consultant helpers.
 *
 * A consultant can work at more than one branch. Two data shapes exist:
 *   • NEW  — one merged Staff row with extraBranches[] (all schedules under
 *            a single staffId; a session's branch = its patient's branch).
 *   • LEGACY — the same email maps to one Staff row per branch (distinct
 *            staffIds). Those are filtered by staffId and never reach the
 *            patient-branch filters below.
 *
 * These helpers implement the NEW model's branch filtering, mirroring the
 * ops hub (`src/app/api/clinic-schedule`): scope by the PATIENT's branch.
 *
 * Staff and Patient name branches differently — Staff.branch holds a short
 * code ("SBEA"), Patient.branch holds the ops-hub code ("SANDBOX_EAST") — so
 * everything here is a translation between the two. That mapping used to be a
 * hardcoded object pointing at the Prisma `Branch` enum, which meant a branch
 * created in HR Platform could not be filtered on until someone edited this
 * file. It now comes from the HrBranch registry, which syncs hourly from HR
 * Platform and holds exactly this pairing (shortCode ↔ opsHubBranch).
 */

/** Short cache: these helpers run per-request, HrBranch changes hourly at most. */
const TTL_MS = 5 * 60 * 1000
let cache: { at: number; map: Record<string, string> } | null = null

/** Floor, not ceiling — used before the first sync or if the read fails. */
const STATIC_MAP: Record<string, string> = {
  SBEA: 'SANDBOX_EAST',
  SBGH: 'SANDBOX_GREENHILLS',
}

async function codeMap(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map

  const map: Record<string, string> = { ...STATIC_MAP }
  try {
    const rows = await prisma.hrBranch.findMany({
      where: { opsHubBranch: { not: null } },
      select: { shortCode: true, opsHubBranch: true, aliases: true },
    })
    for (const r of rows) {
      const ops = r.opsHubBranch as string
      map[r.shortCode] = ops
      // A branch can be referred to by an older short code; HR Platform keeps
      // those in `aliases` precisely so renames don't orphan existing data.
      for (const a of r.aliases ?? []) map[a] = ops
    }
  } catch (err) {
    console.error('[branch-filter] HrBranch read failed, using static map:', err)
  }
  // Ops-hub codes map to themselves, so callers can pass either form.
  for (const ops of Object.values({ ...map })) map[ops] = ops

  cache = { at: Date.now(), map }
  return map
}

/** Staff short code (or an ops-hub code) → the Patient.branch value. */
export async function toPatientBranch(code?: string | null): Promise<string | null> {
  if (!code) return null
  return (await codeMap())[code] ?? null
}

/** True when two codes name the same branch, in either short or long form. */
export async function sameBranch(a?: string | null, b?: string | null): Promise<boolean> {
  const pa = await toPatientBranch(a)
  return !!pa && pa === (await toPatientBranch(b))
}

/**
 * Prisma `where` fragment scoping a Schedule query to one branch of an
 * interbranch consultant. A session's branch is its PATIENT's branch. The
 * consultant's PRIMARY branch also owns any session whose patient has no
 * branch set, or that has no patient at all — so none of their sessions
 * vanish when a branch is selected. Non-primary ("extra") branches match
 * strictly. Returns {} when the code can't be mapped (caller then doesn't
 * filter).
 *
 * Matches on `branches` as well as the legacy `branch`, so an interbranch
 * PATIENT — one record ticked for two branches — shows up under both.
 */
export async function scheduleBranchWhere(
  patientBranch: string,
  primaryBranch: string,
): Promise<Prisma.ScheduleWhereInput> {
  const target = await toPatientBranch(patientBranch)
  if (!target) return {}
  const matches = [{ patient: { branch: target } }, { patient: { branches: { has: target } } }]
  if (await sameBranch(patientBranch, primaryBranch)) {
    return { OR: [...matches, { patient: { branch: null, branches: { isEmpty: true } } }, { patientId: null }] }
  }
  return { OR: matches }
}

/**
 * Same idea as a Patient-level filter, for querying patients / assignments
 * directly. The primary branch also matches patients with no branch set.
 */
export async function patientBranchWhere(
  patientBranch: string,
  primaryBranch: string,
): Promise<Prisma.PatientWhereInput> {
  const target = await toPatientBranch(patientBranch)
  if (!target) return {}
  const matches = [{ branch: target }, { branches: { has: target } }]
  if (await sameBranch(patientBranch, primaryBranch)) {
    return { OR: [...matches, { branch: null, branches: { isEmpty: true } }] }
  }
  return { OR: matches }
}
