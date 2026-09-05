// Take a daily reading of the decking board, per branch and department.
//
// The board is a weekly template with no dates, so it can only describe today.
// This writes today down so the History chart has something to draw next month.
//
// The arithmetic deliberately mirrors the Slots card on the board — cells not
// rows, stored config times not clinic defaults, classes excluded. If the two
// ever disagree, the chart quietly contradicts the number front desk are
// looking at, which is worse than having no chart.

import { prisma } from '@/lib/prisma'

/** Hours in a consultant's day. Same rule the grid draws its rows from. */
export function hoursBetween(startTime: string, endTime: string): string[] {
  const out: string[] = []
  if (!startTime || !endTime) return out
  const [sh] = startTime.split(':').map(Number)
  const [eh] = endTime.split(':').map(Number)
  if (Number.isNaN(sh) || Number.isNaN(eh)) return out
  for (let h = sh; h < eh; h++) out.push(`${String(h).padStart(2, '0')}:00`)
  return out
}

export interface SnapshotRow {
  branch: string
  department: string
  totalSlots: number
  booked: number
  blocked: number
  open: number
}

/**
 * Compute the current reading for every branch+department that has capacity or
 * bookings. Pure — it reads, it does not write, so it can be called to preview
 * what a snapshot would record.
 */
export async function computeDeckingSnapshot(): Promise<SnapshotRow[]> {
  const [configs, slots, staff] = await Promise.all([
    prisma.deckingTherapistConfig.findMany({
      select: { staffId: true, workDays: true, startTime: true, endTime: true, branch: true, department: true },
    }),
    prisma.deckingSlot.findMany({
      where: { isClass: false },
      select: { staffId: true, branch: true, department: true, dayOfWeek: true, startTime: true, disabled: true, patientId: true },
    }),
    prisma.staff.findMany({ where: { active: true }, select: { id: true, department: true } }),
  ])

  const deptOfStaff = new Map(staff.map(s => [s.id, s.department]))
  const key = (b: string, d: string) => `${b}||${d}`
  const acc = new Map<string, SnapshotRow>()
  const row = (b: string, d: string) => {
    const k = key(b, d)
    if (!acc.has(k)) acc.set(k, { branch: b, department: d, totalSlots: 0, booked: 0, blocked: 0, open: 0 })
    return acc.get(k)!
  }

  // Capacity: work days x configured hours, per consultant.
  for (const cfg of configs) {
    const dept = cfg.department || deptOfStaff.get(cfg.staffId) || 'UNKNOWN'
    const hours = hoursBetween(cfg.startTime, cfg.endTime).length
    const days = Array.isArray(cfg.workDays) ? (cfg.workDays as string[]).length : 0
    row(cfg.branch, dept).totalSlots += days * hours
  }

  // Booked and blocked, collapsed to CELLS: a cell holding three children is
  // one filled slot, which is how the board reads and how the card counts.
  const cells = new Map<string, { branch: string; dept: string; booked: boolean; blocked: boolean }>()
  for (const s of slots) {
    const dept = s.department || deptOfStaff.get(s.staffId) || 'UNKNOWN'
    const k = `${s.branch}||${dept}||${s.staffId}||${s.dayOfWeek}||${s.startTime}`
    const cur = cells.get(k) ?? { branch: s.branch, dept, booked: false, blocked: false }
    if (s.disabled) cur.blocked = true
    else if (s.patientId) cur.booked = true
    cells.set(k, cur)
  }
  for (const c of cells.values()) {
    // Booked wins over blocked, so the buckets stay mutually exclusive and
    // total = booked + blocked + open holds.
    if (c.booked) row(c.branch, c.dept).booked += 1
    else if (c.blocked) row(c.branch, c.dept).blocked += 1
  }

  for (const r of acc.values()) {
    // A session can be decked onto a consultant with no configured work days,
    // or outside the hours they did configure — front desk book what the
    // consultant agreed to, and the config is not always updated to match. That
    // leaves booked + blocked exceeding the declared capacity.
    //
    // The recorded total is therefore the greater of the two. A stacked chart
    // whose parts sum past its own total is simply wrong, and reporting less
    // capacity than is demonstrably in use would be the bigger lie of the two.
    r.totalSlots = Math.max(r.totalSlots, r.booked + r.blocked)
    r.open = r.totalSlots - r.booked - r.blocked
  }

  return [...acc.values()].sort((a, b) =>
    a.branch.localeCompare(b.branch) || a.department.localeCompare(b.department))
}

/**
 * Write today's reading. Upserts on (date, branch, department), so a retried
 * cron or a manual run replaces the day rather than appending to it.
 *
 * `at` exists for tests and for backfilling a specific day by hand; it is not
 * a way to reconstruct the past, which the board simply does not hold.
 */
export async function recordDeckingSnapshot(at?: Date): Promise<{ date: string; written: number }> {
  const now = at ?? new Date()
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const rows = await computeDeckingSnapshot()

  for (const r of rows) {
    await prisma.deckingSnapshot.upsert({
      where: { date_branch_department: { date, branch: r.branch, department: r.department } },
      create: { date, ...r },
      update: { totalSlots: r.totalSlots, booked: r.booked, blocked: r.blocked, open: r.open },
    })
  }

  return { date: date.toISOString().slice(0, 10), written: rows.length }
}
