/**
 * Payroll → Consultants → Mentorship Meetings.
 *
 * Bridges the staff portal's MENTORSHIP meetings into consultant payroll:
 * ticking a meeting charges the mentee the configured fee and pays it to the
 * mentor in the selected cutoff. One charge per (meeting, mentee); the unique
 * key stops a meeting from being included twice across runs, and a charge is
 * locked once its payroll is finalized.
 *
 * GET  ?cutoffPeriod=2026-08-2&branch=SBEA
 *   Meetings whose date falls inside the cutoff, joined with their charge
 *   state (this cutoff or any other) + the fee setting.
 * POST { action: 'tick',   meetingId, cutoffPeriod, branch }
 *      { action: 'untick', meetingId, cutoffPeriod, branch }
 *      { action: 'set-fee', fee }
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']

import { cutoffDates, fetchPortalMeetings } from '@/lib/mentorship'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const cutoffPeriod = searchParams.get('cutoffPeriod') || ''
  const branch = searchParams.get('branch') || ''
  const range = cutoffDates(cutoffPeriod)
  if (!range || !branch) {
    return NextResponse.json({ error: 'cutoffPeriod (YYYY-MM-1|2) and branch are required' }, { status: 400 })
  }

  const [meetings, feeRow] = await Promise.all([
    fetchPortalMeetings(range.from, range.to),
    prisma.mentorshipFeeSetting.findUnique({ where: { id: 1 } }),
  ])
  if (meetings === null) {
    return NextResponse.json({ error: 'Could not reach the staff portal — try again shortly.' }, { status: 502 })
  }

  const meetingIds = meetings.map(m => m.id)
  const charges = meetingIds.length
    ? await prisma.mentorshipMeetingCharge.findMany({ where: { externalMeetingId: { in: meetingIds } } })
    : []
  const chargesByMeeting = new Map<string, typeof charges>()
  for (const c of charges) {
    const arr = chargesByMeeting.get(c.externalMeetingId) || []
    arr.push(c); chargesByMeeting.set(c.externalMeetingId, arr)
  }

  // Resolve portal staff → consultants once for the whole page.
  const staffIds = Array.from(new Set(meetings.flatMap(m => [...m.mentors, ...m.mentees].map(p => p.staffId))))
  const consultants = staffIds.length
    ? await prisma.consultant.findMany({
        where: { externalStaffId: { in: staffIds } },
        select: { id: true, externalStaffId: true, name: true, branch: true, extraBranches: true },
      })
    : []
  const byStaffId = new Map(consultants.map(c => [c.externalStaffId as string, c]))

  return NextResponse.json({
    range,
    fee: Number(feeRow?.meetingFee ?? 0),
    meetings: meetings.map(m => ({
      ...m,
      mentors: m.mentors.map(p => ({ ...p, consultant: byStaffId.get(p.staffId) || null })),
      mentees: m.mentees.map(p => ({ ...p, consultant: byStaffId.get(p.staffId) || null })),
      charges: (chargesByMeeting.get(m.id) || []).map(c => ({
        id: c.id, menteeName: c.menteeName, mentorName: c.mentorName,
        fee: Number(c.fee), cutoffPeriod: c.cutoffPeriod, branch: c.branch,
        locked: !!c.lockedAt, paidNotified: !!c.paidNotifiedAt,
      })),
    })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()

  if (body.action === 'set-fee') {
    const fee = Number(body.fee)
    if (!isFinite(fee) || fee < 0) return NextResponse.json({ error: 'Fee must be a positive number' }, { status: 400 })
    const row = await prisma.mentorshipFeeSetting.upsert({
      where: { id: 1 }, update: { meetingFee: fee }, create: { id: 1, meetingFee: fee },
    })
    return NextResponse.json({ fee: Number(row.meetingFee) })
  }

  const { meetingId, cutoffPeriod, branch } = body
  const range = cutoffPeriod ? cutoffDates(String(cutoffPeriod)) : null
  if (!meetingId || !range || !branch) {
    return NextResponse.json({ error: 'meetingId, cutoffPeriod and branch are required' }, { status: 400 })
  }

  if (body.action === 'untick') {
    const existing = await prisma.mentorshipMeetingCharge.findMany({ where: { externalMeetingId: meetingId } })
    if (existing.some(c => c.lockedAt)) {
      return NextResponse.json({ error: 'This meeting is locked — its payroll run has been finalized.' }, { status: 400 })
    }
    await prisma.mentorshipMeetingCharge.deleteMany({ where: { externalMeetingId: meetingId } })
    return NextResponse.json({ removed: existing.length })
  }

  if (body.action !== 'tick') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  // Re-fetch the meeting from the portal so what we charge is what it says now.
  const meetings = await fetchPortalMeetings(range.from, range.to)
  if (meetings === null) return NextResponse.json({ error: 'Could not reach the staff portal.' }, { status: 502 })
  const meeting = meetings.find(m => m.id === meetingId)
  if (!meeting) return NextResponse.json({ error: 'That meeting is not inside this cutoff.' }, { status: 400 })
  if (meeting.mentors.length === 0) {
    return NextResponse.json({ error: 'No participant in this meeting is flagged as a Clinical Mentor — sync the clinician database first, or fix the HR profile.' }, { status: 400 })
  }
  if (meeting.mentees.length === 0) {
    return NextResponse.json({ error: 'This meeting has no mentee participants.' }, { status: 400 })
  }

  const already = await prisma.mentorshipMeetingCharge.findFirst({ where: { externalMeetingId: meetingId } })
  if (already) {
    return NextResponse.json({ error: `Already included in cutoff ${already.cutoffPeriod} (${already.branch}).` }, { status: 400 })
  }

  const feeRow = await prisma.mentorshipFeeSetting.findUnique({ where: { id: 1 } })
  const fee = Number(feeRow?.meetingFee ?? 0)
  if (!(fee > 0)) {
    return NextResponse.json({ error: 'Set the mentorship meeting fee first (Settings).' }, { status: 400 })
  }

  const mentor = meeting.mentors[0]
  const consultantFor = async (staffId: string) =>
    prisma.consultant.findUnique({ where: { externalStaffId: staffId }, select: { id: true } })
  const mentorConsultant = await consultantFor(mentor.staffId)

  const created = []
  for (const mentee of meeting.mentees) {
    const menteeConsultant = await consultantFor(mentee.staffId)
    created.push(await prisma.mentorshipMeetingCharge.create({
      data: {
        externalMeetingId: meeting.id,
        meetingDate: new Date(`${meeting.date}T00:00:00+08:00`),
        title: meeting.title,
        mentorConsultantId: mentorConsultant?.id ?? null,
        mentorName: mentor.name,
        menteeConsultantId: menteeConsultant?.id ?? null,
        menteeName: mentee.name,
        fee,
        cutoffPeriod, branch,
      },
    }))
  }
  return NextResponse.json({ created: created.length, fee })
}
