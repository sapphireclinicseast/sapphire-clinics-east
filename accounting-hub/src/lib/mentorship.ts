/**
 * Shared helpers for mentorship meeting charges (Payroll → Consultants →
 * Mentorship Meetings) — the payroll-side bridge to the staff portal.
 */

import { prisma } from '@/lib/prisma'
import { cutoffRange } from '@/lib/payroll-cutoff'

// staff.* is the canonical host — teletherapy.* 301s to it, and a redirect
// strips the Authorization header, so the alias must not be used here.
export const TELETHERAPY_URL = process.env.TELETHERAPY_URL || 'https://staff.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

/**
 * Calendar bounds for a cutoff period. Delegates to the shared payroll cutoff
 * so meetings are collected over exactly the fortnight the payroll run pays.
 *
 * This used to compute 1st-15th / 16th-end of month, which is not what a cutoff
 * is: the run labelled "2026-08-2" pays Aug 11-25, so meetings on Aug 11-15 were
 * never offered on the run that pays them, and Aug 26-31 meetings were offered
 * on a run that had already closed.
 */
export function cutoffDates(cutoffPeriod: string): { from: string; to: string } | null {
  return cutoffRange(cutoffPeriod)
}

export interface PortalPerson { staffId: string; name: string; isClinicalMentor: boolean; branch: string | null }
export interface PortalMeeting {
  id: string; title: string | null; date: string; timeLabel: string
  createdByName: string; paidAt: string | null; paidCutoffLabel: string | null
  mentors: PortalPerson[]; mentees: PortalPerson[]
}

/**
 * Why a portal read failed. The distinction is not cosmetic: a rejected key is
 * a missing EXTERNAL_API_KEY on THIS server and needs an env fix, while a
 * genuine network failure is the portal's problem and clears on its own. Both
 * used to surface as "could not reach the staff portal", which sent us looking
 * at the wrong machine.
 */
export type PortalFetch =
  | { ok: true; items: PortalMeeting[] }
  | { ok: false; kind: 'auth' | 'http' | 'network'; status?: number; message: string }

export async function fetchPortalMeetings(from: string, to: string): Promise<PortalFetch> {
  try {
    const res = await fetch(`${TELETHERAPY_URL}/api/external/mentorship-meetings?from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${EXTERNAL_API_KEY}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
    if (res.status === 401 || res.status === 403) {
      // Name the variable and the file, because the person reading this message
      // is standing in front of a payroll screen, not a deploy log.
      console.error(`[mentorship] portal rejected our key (${res.status})`)
      return {
        ok: false, kind: 'auth', status: res.status,
        message: EXTERNAL_API_KEY
          ? 'The staff portal rejected our API key. EXTERNAL_API_KEY in /opt/accounting/docker/.env does not match the portal\'s.'
          : 'EXTERNAL_API_KEY is not set on this server, so the staff portal rejected the request. Add it to /opt/accounting/docker/.env.',
      }
    }
    if (!res.ok) {
      console.error(`[mentorship] portal returned ${res.status}`)
      return { ok: false, kind: 'http', status: res.status, message: `The staff portal returned an error (${res.status}).` }
    }
    const data = await res.json()
    return { ok: true, items: data.items || [] }
  } catch (e) {
    console.error('[mentorship] portal fetch failed:', e)
    return { ok: false, kind: 'network', message: 'Could not reach the staff portal — try again shortly.' }
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
