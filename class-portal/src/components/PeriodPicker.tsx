'use client'

/**
 * PeriodPicker — plan-aware dropdown that emits the canonical period
 * label the badge system + payment-reminder cron already understand.
 *
 * Why: the record-payment + edit-payment + record-PayMongo modals used
 * to have a free-text "Period covered" input. Staff would type strings
 * like "AY 2026 - 2027" or "Aug 2026" — some of which the badge logic
 * couldn't match (it's an exact-string test against
 * "August 2026" / "First half SY 2026–2027" / "Annual SY 2026–2027"
 * produced by the cron's monthlyPeriodLabel / biannualPeriodLabel).
 * A mis-typed period silently left the student showing OWES even
 * though staff had recorded a payment. This picker eliminates the
 * typo surface for the common case while keeping an "Other (type)"
 * escape hatch for edge cases (registration fees, plan-change
 * credits, back balances, etc.).
 *
 * Canonical formats matched here — DO NOT drift without updating the
 * cron code and the badge derivation together:
 *   MONTHLY  → "August 2026"                    (full month + year)
 *   BIANNUAL → "First half SY 2026–2027"       (en-dash!)
 *              "Second half SY 2026–2027"
 *   ANNUAL   → "Annual SY 2026–2027"           (en-dash!)
 */

import { useMemo } from 'react'
import type { PaymentPlan } from '@/lib/session'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** School year starts in June (month index 5). Anything Apr–May sits
 *  between SYs and is treated as still-inside the year that started
 *  the previous June — matches /pay/page.tsx's syStartYear logic. */
function schoolYearStart(today: Date = new Date()): number {
  const m = today.getMonth()
  const y = today.getFullYear()
  return m >= 5 ? y : y - 1
}

/** All monthly period labels for one school year, in tuition-cycle
 *  order (June → May of next year). Emits the same string
 *  monthlyPeriodLabel in the cron produces. */
function monthlyLabelsForSchoolYear(syStart: number): string[] {
  const labels: string[] = []
  // June → December of syStart
  for (let m = 5; m <= 11; m++) labels.push(`${MONTH_NAMES[m]} ${syStart}`)
  // January → May of syStart + 1
  for (let m = 0; m <= 4; m++) labels.push(`${MONTH_NAMES[m]} ${syStart + 1}`)
  return labels
}

/** Options served to a monthly plan: current SY first, then the
 *  previous SY collapsed to catch late-recorded back-payments. */
function monthlyOptions(today: Date): Array<{ value: string; label: string; group: string }> {
  const syStart = schoolYearStart(today)
  const currentSY = monthlyLabelsForSchoolYear(syStart)
  const previousSY = monthlyLabelsForSchoolYear(syStart - 1)
  return [
    ...currentSY.map(v => ({ value: v, label: v, group: `School year ${syStart}–${syStart + 1}` })),
    ...previousSY.map(v => ({ value: v, label: v, group: `School year ${syStart - 1}–${syStart}` })),
  ]
}

function biannualOptions(today: Date): Array<{ value: string; label: string; group: string }> {
  const syStart = schoolYearStart(today)
  return [
    { value: `First half SY ${syStart}–${syStart + 1}`,  label: `First half SY ${syStart}–${syStart + 1}`,  group: `School year ${syStart}–${syStart + 1}` },
    { value: `Second half SY ${syStart}–${syStart + 1}`, label: `Second half SY ${syStart}–${syStart + 1}`, group: `School year ${syStart}–${syStart + 1}` },
    { value: `First half SY ${syStart - 1}–${syStart}`,  label: `First half SY ${syStart - 1}–${syStart}`,  group: `School year ${syStart - 1}–${syStart}` },
    { value: `Second half SY ${syStart - 1}–${syStart}`, label: `Second half SY ${syStart - 1}–${syStart}`, group: `School year ${syStart - 1}–${syStart}` },
  ]
}

function annualOptions(today: Date): Array<{ value: string; label: string; group: string }> {
  const syStart = schoolYearStart(today)
  return [
    { value: `Annual SY ${syStart}–${syStart + 1}`,     label: `Annual SY ${syStart}–${syStart + 1}`,     group: 'School year' },
    { value: `Annual SY ${syStart - 1}–${syStart}`,     label: `Annual SY ${syStart - 1}–${syStart}`,     group: 'School year' },
  ]
}

/** Sentinel value the <select> uses when the current period doesn't
 *  match any option (e.g. legacy "AY 2026 - 2027" strings) — this
 *  flips the picker to a free-text input so staff can either fix the
 *  legacy label or keep it as-is. */
const OTHER = '__OTHER__'

export function PeriodPicker({ plan, value, onChange, disabled }: {
  plan: PaymentPlan
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}) {
  const today = useMemo(() => new Date(), [])
  const options = useMemo(() => {
    if (plan === 'MONTHLY')  return monthlyOptions(today)
    if (plan === 'BIANNUAL') return biannualOptions(today)
    return annualOptions(today)
  }, [plan, today])

  // Group the options into <optgroup> blocks so the school-year split
  // is visually obvious in the dropdown.
  const grouped = useMemo(() => {
    const map = new Map<string, Array<{ value: string; label: string }>>()
    for (const o of options) {
      const arr = map.get(o.group) ?? []
      arr.push({ value: o.value, label: o.label })
      map.set(o.group, arr)
    }
    return Array.from(map.entries())
  }, [options])

  const selectValue = options.some(o => o.value === value) ? value : (value ? OTHER : '')

  function handleSelect(next: string) {
    if (next === OTHER) {
      // Preserve whatever's already in `value` — the input just becomes
      // free-text-editable. If it was empty, start with a hint.
      onChange(value || '')
      return
    }
    onChange(next)
  }

  return (
    <div className="space-y-1.5">
      <select
        className="select"
        value={selectValue}
        onChange={e => handleSelect(e.target.value)}
        disabled={disabled}
      >
        <option value="" disabled>— Pick the {plan === 'MONTHLY' ? 'month' : plan === 'BIANNUAL' ? 'semester' : 'school year'} —</option>
        {grouped.map(([groupLabel, items]) => (
          <optgroup key={groupLabel} label={groupLabel}>
            {items.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </optgroup>
        ))}
        <option value={OTHER}>Other (type your own — e.g. registration fee, back balance)</option>
      </select>
      {selectValue === OTHER && (
        <input
          type="text"
          className="input"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Free-text period (won't match the badge — use only for one-offs)"
          disabled={disabled}
        />
      )}
      {selectValue !== OTHER && plan === 'MONTHLY' && (
        <p className="text-[10.5px] text-[color:var(--mid-gray)]">
          Tip: pick the exact month this payment covers — the student's portal badge (Paid for …) matches the label above.
        </p>
      )}
    </div>
  )
}

/** Test-only re-export so the audit script + unit tests can assert the
 *  canonical shapes without duplicating the strings. */
export const __periodPickerInternals = { monthlyLabelsForSchoolYear, schoolYearStart }
