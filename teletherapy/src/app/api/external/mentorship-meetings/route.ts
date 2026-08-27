/**
 * Mentorship meetings feed for the Accounting Hub's payroll.
 *
 * GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   MENTORSHIP-context meetings in the range, with every participant resolved
 *   to a Staff row and classified: the participant(s) flagged isClinicalMentor
 *   are the mentor side, everyone else the mentee side. Includes paid state.
 *
 * POST { action: 'mark-paid', meetingIds: string[], cutoffLabel?: string }
 *   Called when the payroll run that included these meetings is locked.
 *   Idempotent; a paid meeting can no longer be deleted in the portal.
 *
 * Auth: Bearer $EXTERNAL_API_KEY (same shared key the other externals use).
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function authorized(req: Request): boolean {
  const key = process.env.EXTERNAL_API_KEY
  return !!key && req.headers.get('authorization') === `Bearer ${key}`
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required (YYYY-MM-DD)' }, { status: 400 })
  }

  const meetings = await prisma.supervisionMeeting.findMany({
    where: {
      context: 'MENTORSHIP',
      date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  })

  // Resolve the creator's staff row (accounts link to staff) and every invitee.
  const accountIds = Array.from(new Set(meetings.map(m => m.createdByAccountId)))
  const accounts = accountIds.length
    ? await prisma.therapistAccount.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, staffId: true },
      })
    : []
  const staffIdByAccount = new Map(accounts.map(a => [a.id, a.staffId]))

  const staffIds = Array.from(new Set([
    ...meetings.flatMap(m => m.inviteeStaffIds),
    ...accounts.map(a => a.staffId),
  ]))
  const staff = staffIds.length
    ? await prisma.staff.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, firstName: true, lastName: true, isClinicalMentor: true, isInternshipSupervisor: true, branch: true },
      })
    : []
  const staffById = new Map(staff.map(s => [s.id, s]))

  const items = meetings.map(m => {
    const ids = Array.from(new Set([
      staffIdByAccount.get(m.createdByAccountId),
      ...m.inviteeStaffIds,
    ].filter((v): v is string => !!v)))
    const participants = ids.map(id => {
      const st = staffById.get(id)
      return {
        staffId: id,
        name: st ? `${st.firstName} ${st.lastName}` : '(unknown)',
        isClinicalMentor: st?.isClinicalMentor ?? false,
        isClinicalSupervisor: st?.isInternshipSupervisor ?? false,
        branch: st?.branch ?? null,
      }
    })
    const mentors = participants.filter(p => p.isClinicalMentor)
    const mentees = participants.filter(p => !p.isClinicalMentor)
    return {
      id: m.id,
      title: m.title,
      date: m.date.toISOString().slice(0, 10),
      timeLabel: m.timeLabel,
      createdByName: m.createdByName,
      paidAt: m.paidAt ? m.paidAt.toISOString() : null,
      paidCutoffLabel: m.paidCutoffLabel,
      participants,
      mentors,
      mentees,
    }
  })

  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { action?: string; meetingIds?: string[]; cutoffLabel?: string } = {}
  try { body = await req.json() } catch { /* handled below */ }

  if (body.action !== 'mark-paid' || !Array.isArray(body.meetingIds) || body.meetingIds.length === 0) {
    return NextResponse.json({ error: 'action must be mark-paid with meetingIds[]' }, { status: 400 })
  }

  const res = await prisma.supervisionMeeting.updateMany({
    where: { id: { in: body.meetingIds }, context: 'MENTORSHIP', paidAt: null },
    data: { paidAt: new Date(), paidCutoffLabel: body.cutoffLabel?.trim() || null },
  })

  return NextResponse.json({ marked: res.count })
}
