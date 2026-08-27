// /api/intern-supervision/meetings
//   GET  ?context=INTERNSHIP|MENTORSHIP  — meetings I created OR am invited to
//   POST                                — create one; mints a HOST meet link
//                                         (so either side can record) + invites.

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { meetHostLink } from '@/lib/meet-link'

const CONTEXTS = ['INTERNSHIP', 'MENTORSHIP']

function sessionUser(session: { user?: unknown } | null) {
  return session?.user as unknown as {
    id: string; role?: string; staffId?: string; name?: string | null
    branches?: { staffId: string }[]
  } | undefined
}

export async function GET(req: Request) {
  const session = await auth()
  const u = sessionUser(session)
  if (!u) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const context = new URL(req.url).searchParams.get('context') ?? 'INTERNSHIP'
  if (!CONTEXTS.includes(context)) return NextResponse.json({ error: 'Invalid context' }, { status: 400 })

  const myStaffIds = Array.from(new Set([...(u.branches ?? []).map((b) => b.staffId), u.staffId].filter(Boolean))) as string[]

  const meetings = await prisma.supervisionMeeting.findMany({
    where: {
      context,
      OR: [
        { createdByAccountId: u.id },
        myStaffIds.length ? { inviteeStaffIds: { hasSome: myStaffIds } } : { id: '__none__' },
      ],
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  })

  return NextResponse.json({ meetings, currentAccountId: u.id })
}

export async function POST(req: Request) {
  const session = await auth()
  const u = sessionUser(session)
  if (!u) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    context?: string; title?: string; date?: string; timeLabel?: string
    invitees?: { staffId?: string; name?: string }[]
  } = {}
  try { body = await req.json() } catch { /* handled below */ }

  const context = body.context ?? 'INTERNSHIP'
  if (!CONTEXTS.includes(context)) return NextResponse.json({ error: 'Invalid context' }, { status: 400 })
  const dateStr = (body.date ?? '').trim()
  const timeLabel = (body.timeLabel ?? '').trim()
  const title = (body.title ?? '').trim() || null
  const invitees = (Array.isArray(body.invitees) ? body.invitees : [])
    .filter((i) => i && typeof i.staffId === 'string' && i.staffId)
    .map((i) => ({ staffId: i.staffId as string, name: (i.name ?? '').toString() }))

  if (!dateStr || !timeLabel) return NextResponse.json({ error: 'Date and time are required.' }, { status: 400 })
  // Invitees are optional: "Just create a link" can mint a link with no one
  // ticked (the creator gets the host link and can share it however they like).
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: 'Invalid date.' }, { status: 400 })

  const room = `${context === 'MENTORSHIP' ? 'mentorship' : 'internship'}-${randomUUID().slice(0, 12)}`
  const meetLink = meetHostLink(room, undefined, 60)
  if (!meetLink) return NextResponse.json({ error: 'Meeting links are not configured on the server (MEET_LINK_SECRET).' }, { status: 500 })

  // Creator's display name (prefer their Staff name).
  let createdByName = u.name ?? 'Staff'
  if (u.staffId) {
    const me = await prisma.staff.findUnique({ where: { id: u.staffId }, select: { firstName: true, lastName: true } }).catch(() => null)
    if (me) createdByName = `${me.firstName} ${me.lastName}`
  }

  const meeting = await prisma.supervisionMeeting.create({
    data: {
      context, title, date, timeLabel, room, meetLink,
      createdByAccountId: u.id, createdByName,
      inviteeStaffIds: invitees.map((i) => i.staffId),
      inviteeNames: invitees.map((i) => i.name),
    },
  })

  return NextResponse.json({ meeting })
}
