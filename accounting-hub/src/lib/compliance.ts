// Due dates for Compliance Calendar deadlines (benefit remittances, government
// filings). Shared by the API and the top-bar bell so both read the same dates.

export interface ComplianceDef {
  id: string
  name: string
  category: string
  frequency: string
  dueMonth: number | null
  dueDay: number
  periodLagMonths: number
  leadDays: number
  notes: string | null
  isActive: boolean
  lastDoneDue: string | null
  createdAt: Date | string
}

export interface ComplianceDue {
  id: string
  name: string
  category: string
  frequency: string
  notes: string | null
  leadDays: number
  nextDue: string // YYYY-MM-DD of the earliest occurrence not yet marked done
  daysUntil: number // negative = overdue
  periodLabel: string | null // "for September 2026" when the remittance covers an earlier month
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY = 86_400_000

// UTC midnight of `day` in the given month index (year*12 + month0), clamped to the month's last day.
function occurrence(monthIdx: number, day: number): number {
  const y = Math.floor(monthIdx / 12), m = monthIdx % 12
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return Date.UTC(y, m, Math.min(Math.max(day, 1), last))
}

function fallsDue(def: ComplianceDef, monthIdx: number): boolean {
  const m = (monthIdx % 12) + 1
  if (def.frequency === 'ANNUALLY') return m === (def.dueMonth || 1)
  if (def.frequency === 'QUARTERLY') return (((m - (def.dueMonth || 1)) % 3) + 3) % 3 === 0
  return true // MONTHLY
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10)

/**
 * The earliest occurrence after the last one marked done (or after the
 * deadline was created, so a new entry doesn't start out years overdue).
 */
export function computeComplianceDue(def: ComplianceDef, today: Date): ComplianceDue | null {
  if (!def.isActive) return null
  const anchor = def.lastDoneDue
    ? Date.parse(`${def.lastDoneDue}T00:00:00Z`)
    : new Date(def.createdAt).getTime() - DAY
  const start = new Date(anchor)
  let idx = start.getUTCFullYear() * 12 + start.getUTCMonth()
  for (let guard = 0; guard < 40; guard++, idx++) {
    if (!fallsDue(def, idx)) continue
    const due = occurrence(idx, def.dueDay)
    if (due <= anchor) continue
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    const lag = def.frequency === 'MONTHLY' ? def.periodLagMonths : 0
    const periodIdx = idx - lag
    return {
      id: def.id, name: def.name, category: def.category, frequency: def.frequency, notes: def.notes, leadDays: def.leadDays,
      nextDue: iso(due),
      daysUntil: Math.round((due - todayUtc) / DAY),
      periodLabel: lag > 0 ? `for ${MONTHS[periodIdx % 12]} ${Math.floor(periodIdx / 12)}` : null,
    }
  }
  return null
}
