// Server-side helpers for the Homecare PT flow (uses Prisma). Keep the pure
// fare math in homecare-fare.ts; this file is the DB glue.

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

// Load the singleton fare settings, creating defaults on first use.
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

// Bookings that still hold a seat (anything not cancelled/rejected).
export async function usedCapacity(openDayId: string): Promise<number> {
  return prisma.patientBooking.count({
    where: { homecareOpenDayId: openDayId, status: { notIn: ['CANCELLED', 'REJECTED'] } },
  })
}

export async function remainingCapacity(openDayId: string, capacity: number): Promise<number> {
  return Math.max(0, capacity - (await usedCapacity(openDayId)))
}

// Upcoming, enabled open days for a city (optionally one branch) with seats left.
export async function upcomingOpenDays(cityId: string, branch?: ShortBranch) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const days = await prisma.homecareOpenDay.findMany({
    where: {
      cityId,
      disabled: false,
      date: { gte: today },
      ...(branch ? { branch } : {}),
    },
    orderBy: { date: 'asc' },
  })
  const withSeats = await Promise.all(
    days.map(async (d) => ({
      id: d.id,
      cityId: d.cityId,
      branch: d.branch as ShortBranch,
      date: d.date.toISOString().slice(0, 10),
      startTime: d.startTime,
      endTime: d.endTime,
      capacity: d.capacity,
      remaining: await remainingCapacity(d.id, d.capacity),
    })),
  )
  return withSeats
}
