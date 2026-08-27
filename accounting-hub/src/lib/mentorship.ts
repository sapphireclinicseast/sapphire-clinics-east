/**
 * Shared helpers for mentorship meeting charges (Payroll → Consultants →
 * Mentorship Meetings) — the payroll-side bridge to the staff portal.
 */

import { prisma } from '@/lib/prisma'

export const TELETHERAPY_URL = process.env.TELETHERAPY_URL || 'https://teletherapy.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

/** Cutoff "YYYY-MM-1" → [1st..15th]; "YYYY-MM-2" → [16th..end of month]. */
export function cutoffDates(cutoffPeriod: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})-([12])$/.exec(cutoffPeriod)
  if (!m) return null
  const [, y, mo, half] = m
  if (half === '1') return { from: `${y}-${mo}-01`, to: `${y}-${mo}-15` }
  const last = new Date(Date.UTC(Number(y), Number(mo), 0)).getUTCDate()
  return { from: `${y}-${mo}-16`, to: `${y}-${mo}-${String(last).padStart(2, '0')}` }
}

export interface PortalPerson { staffId: string; name: string; isClinicalMentor: boolean; branch: string | null }
export interface PortalMeeting {
  id: string; title: string | null; date: string; timeLabel: string
  createdByName: string; paidAt: string | null; paidCutoffLabel: string | null
  mentors: PortalPerson[]; mentees: PortalPerson[]
}

export async function fetchPortalMeetings(from: string, to: string): Promise<PortalMeeting[] | null> {
  try {
    const res = await fetch(`${TELETHERAPY_URL}/api/external/mentorship-meetings?from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${EXTERNAL_API_KEY}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.items || []
  } catch (e) {
    console.error('[mentorship] portal fetch failed:', e)
    return null
  }
}

/**
 * Called after a consultant payroll run is finalized: locks this cutoff's
 * charges and tells the staff portal to badge the meetings "Paid". Portal
 * unreachability is non-fatal — paidNotifiedAt stays null and the next
 * finalize of the same cutoff retries those.
 */
export async function lockAndNotifyMentorshipCharges(cutoffPeriod: string, branch: string): Promise<void> {
  const charges = await prisma.mentorshipMeetingCharge.findMany({
    where: { cutoffPeriod, branch },
  })
  if (charges.length === 0) return

  await prisma.mentorshipMeetingCharge.updateMany({
    where: { cutoffPeriod, branch, lockedAt: null },
    data: { lockedAt: new Date() },
  })

  const toNotify = Array.from(new Set(charges.filter(c => !c.paidNotifiedAt).map(c => c.externalMeetingId)))
  if (toNotify.length === 0) return
  try {
    const res = await fetch(`${TELETHERAPY_URL}/api/external/mentorship-meetings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${EXTERNAL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark-paid', meetingIds: toNotify, cutoffLabel: `${cutoffPeriod} · ${branch}` }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      await prisma.mentorshipMeetingCharge.updateMany({
        where: { cutoffPeriod, branch, externalMeetingId: { in: toNotify } },
        data: { paidNotifiedAt: new Date() },
      })
    } else {
      console.error(`[mentorship] portal mark-paid returned ${res.status} — will retry on next finalize`)
    }
  } catch (e) {
    console.error('[mentorship] portal mark-paid failed — will retry on next finalize:', e)
  }
}
