// Server-side helpers for the Homecare PT flow (uses Prisma). Keep the pure
// fare math in homecare-fare.ts; this file is the DB glue.
//
// Open days are RECURRING WEEKLY rules (HomecareOpenDay.dayOfWeek). The public
// flow expands each rule into the next few concrete dates so patients pick an
// actual upcoming day; capacity is counted per (rule, concrete date).

import { prisma } from '@/lib/prisma'
import { toFareSettings, type FareSettings } from '@/lib/homecare-fare'

export type ShortBranch = 'SBEA' | 'SBGH'

export const OPS_TO_SHORT: Record<string, ShortBranch> = {
  SANDBOX_EAST: 'SBEA',
  SANDBOX_GREENHILLS: 'SBGH',
}
export const SHORT_TO_OPS: Record<ShortBranch, string> = {
  SBEA: 'SANDBOX_EAST',
  SBGH: 'SANDBOX_GREENHILLS',
}

export function isShortBranch(v: unknown): v is ShortBranch {
  return v === 'SBEA' || v === 'SBGH'
}

// How many upcoming occurrences of each weekly rule to offer.
export const OCCURRENCE_COUNT = 6
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

// Today's calendar date (YYYY-MM-DD) in Asia/Manila.
export function manilaTodayYmd(): string {
  return new Date(Date.now() + MANILA_OFFSET_MS).toISOString().slice(0, 10)
}

// A ymd date-string ("2026-09-07") → its UTC-midnight Date (how we store the
// booked date). We treat the calendar date as branchless — the day itself.
export function ymdToDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`)
}
export function dateToYmd(d: Date): string {
  return d.toISOString().slice(0, 10)
}
// Weekday (0=Sun..6=Sat) of a ymd calendar date.
export function ymdWeekday(ymd: string): number {
  return ymdToDate(ymd).getUTCDay()
}

// The next `count` calendar dates (ymd) landing on `dayOfWeek`, from today on.
export function nextOccurrences(dayOfWeek: number, count: number, fromYmd = manilaTodayYmd()): string[] {
  const out: string[] = []
  const start = ymdToDate(fromYmd).getTime()
  for (let i = 0; out.length < count && i < count * 7 + 7; i++) {
    const d = new Date(start + i * 86400000)
    if (d.getUTCDay() === dayOfWeek) out.push(dateToYmd(d))
  }
  return out
}

// ── Settings / clinics ──────────────────────────────────────────────────────
export async function loadHomecareSettings() {
  const existing = await prisma.homecareSettings.findUnique({ where: { id: 'default' } })
  if (existing) return existing
  return prisma.homecareSettings.create({ data: { id: 'default' } })
}
export async function loadFareSettings(): Promise<FareSettings> {
  return toFareSettings(await loadHomecareSettings())
}
export async function loadClinic(branch: ShortBranch) {
  return prisma.homecareClinic.findUnique({ where: { id: branch } })
}

// ── Capacity ────────────────────────────────────────────────────────────────
// Seats taken on ONE concrete occurrence (rule + calendar date).
export async function usedCapacityOn(openDayId: string, date: Date): Promise<number> {
  return prisma.patientBooking.count({
    where: { homecareOpenDayId: openDayId, date, status: { notIn: ['CANCELLED', 'REJECTED'] } },
  })
}
// All-time seats taken on a weekly rule (any date) — for the admin indicator.
export async function usedCapacity(openDayId: string): Promise<number> {
  return prisma.patientBooking.count({
    where: { homecareOpenDayId: openDayId, status: { notIn: ['CANCELLED', 'REJECTED'] } },
  })
}

export interface Occurrence {
  openDayId: string
  cityId: string
  branch: ShortBranch
  dayOfWeek: number
  date: string // ymd
  startTime: string
  endTime: string
  capacity: number
  remaining: number
}

// Expand a city's weekly rules into upcoming concrete dated occurrences (with
// remaining seats), sorted by date. Optionally filter to one branch.
export async function upcomingOccurrences(cityId: string, branch?: ShortBranch): Promise<Occurrence[]> {
  const rules = await prisma.homecareOpenDay.findMany({
    where: { cityId, disabled: false, ...(branch ? { branch } : {}) },
  })
  const out: Occurrence[] = []
  for (const rule of rules) {
    for (const ymd of nextOccurrences(rule.dayOfWeek, OCCURRENCE_COUNT)) {
      const remaining = Math.max(0, rule.capacity - (await usedCapacityOn(rule.id, ymdToDate(ymd))))
      out.push({
        openDayId: rule.id,
        cityId: rule.cityId,
        branch: rule.branch as ShortBranch,
        dayOfWeek: rule.dayOfWeek,
        date: ymd,
        startTime: rule.startTime,
        endTime: rule.endTime,
        capacity: rule.capacity,
        remaining,
      })
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}
