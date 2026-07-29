/**
 * Accounting's own copy of the staff feed.
 *
 * Operations and HR list only current staff, so a resignation reaches Payroll as an absence —
 * which on its own is indistinguishable from a feed that failed halfway. Keeping a local row
 * per person ever synced turns that absence into a fact: we know we used to see them, we know
 * when they stopped appearing, and we know what the feed last said about them.
 *
 * Two different signals mean "gone", and they deserve different confidence:
 *
 *   activeUpstream: false — the feed still carries them and says they are inactive. Explicit,
 *                           trustworthy, act on it immediately.
 *   missing from the feed — could be a resignation, a changed id, or a broken fetch. Recorded
 *                           on the first sync, acted on only if they are still missing on a
 *                           later one.
 *
 * Nothing here touches payslips. Payroll history is keyed to Consultant/Employee rows, so a
 * person retired through this table keeps every payslip they were ever paid.
 */

import { prisma } from '@/lib/prisma'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExternalStaff = Record<string, any>

export type StaffFeedSource = 'OPERATIONS' | 'HR'

export type StaffDirectoryResult = {
  /** externalStaffIds the feed explicitly marks inactive — resigned, act now */
  inactiveIds: Set<string>
  /** externalStaffIds absent from this feed AND from an earlier one — resigned, act now */
  goneIds: Set<string>
  /** externalStaffIds absent for the first time — recorded, not yet acted on */
  firstMissIds: Set<string>
}

const nameOf = (s: ExternalStaff) => `${s.firstName || ''} ${s.lastName || ''}`.trim().toUpperCase()

/**
 * Record one sync run against the directory and report who is gone.
 *
 * Pass the staff exactly as the feed returned them, including any the feed flags inactive —
 * a feed filtered to active-only can still be passed, it just means resignations arrive as
 * absences and take two syncs to confirm instead of one.
 */
export async function recordStaffSync(
  staff: ExternalStaff[],
  source: StaffFeedSource,
): Promise<StaffDirectoryResult> {
  const result: StaffDirectoryResult = { inactiveIds: new Set(), goneIds: new Set(), firstMissIds: new Set() }
  if (staff.length === 0) return result   // a failed fetch must never read as "everyone left"

  const now = new Date()
  const seenIds: string[] = []

  for (const s of staff) {
    const id = String(s.id || '')
    if (!id) continue
    seenIds.push(id)
    const activeUpstream = s.active !== false
    if (!activeUpstream) result.inactiveIds.add(id)

    const row = {
      source,
      name: nameOf(s),
      branch: String(s.branch || ''),
      department: s.department ? String(s.department) : null,
      employmentType: s.employmentType ? String(s.employmentType) : null,
      activeUpstream,
      lastSeenAt: now,
      missingSince: null,
      // Someone listed again after an absence is back on the roster, whatever we concluded.
      resignedAt: activeUpstream ? null : now,
    }
    await prisma.staffDirectory.upsert({
      where: { externalStaffId: id },
      update: row,
      create: { externalStaffId: id, firstSeenAt: now, ...row },
    })
  }

  // Everyone this source told us about before, who is not in the feed at all this time.
  const absent = await prisma.staffDirectory.findMany({
    where: { source, externalStaffId: { notIn: seenIds } },
    select: { externalStaffId: true, missingSince: true },
  })
  for (const row of absent) {
    if (row.missingSince) {
      result.goneIds.add(row.externalStaffId)
      await prisma.staffDirectory.update({
        where: { externalStaffId: row.externalStaffId },
        data: { activeUpstream: false, resignedAt: row.missingSince },
      })
    } else {
      result.firstMissIds.add(row.externalStaffId)
      await prisma.staffDirectory.update({
        where: { externalStaffId: row.externalStaffId },
        data: { missingSince: now },
      })
    }
  }

  return result
}
