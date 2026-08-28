// GET  /api/public/class-portal/meetings — list meetings visible to the caller
// POST /api/public/class-portal/meetings — teacher creates a meeting
//
// The meeting record lives on the ops-hub DB (this app) so it stays
// alongside the rest of the class-portal data. The signed link comes
// from meet-link.ts (signCompact + MEET_LINK_SECRET) so it's
// verifiable by meet.sapphireclinicseast.org without a round trip.

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { meetRoomUrl } from '@/lib/meet-link'
import { withCors, corsHeaders } from '../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

function jsonError(origin: string | null, e: unknown): NextResponse {
  if (e instanceof Response) {
    const headers = new Headers(e.headers)
    for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
    return new NextResponse(e.body, { status: e.status, headers })
  }
  return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
}

/** Room ids are UUID-like — short, unpredictable, no PII. */
function generateRoomId(): string {
  return 'clx-' + crypto.randomBytes(8).toString('hex')
}

/** Serialise a Prisma row → the JSON shape the client expects. Signed
 *  links are minted at read time so a teacher opening the meeting the
 *  next day still gets a fresh (still-valid) token, and so we never
 *  persist the token itself. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toApi(row: any) {
  const endsAtSec = Math.floor(new Date(row.endsAt).getTime() / 1000)
  const hostName = row.teacherName || 'Teacher'
  const hostLink = row.cancelledAt ? null : meetRoomUrl(row.room, { role: 'host', name: hostName }, endsAtSec)
  const guestLink = row.cancelledAt ? null : meetRoomUrl(row.room, { role: 'guest' }, endsAtSec)
  return {
    id: row.id,
    teacherId: row.teacherId,
    teacherEmail: row.teacherEmail,
    teacherName: row.teacherName,
    room: row.room,
    title: row.title,
    notes: row.notes ?? null,
    scheduledAt: row.scheduledAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    hostLink,
    guestLink,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    participants: (row.participants ?? []).map((p: any) => ({
      id: p.id,
      studentId: p.studentId,
      studentEmail: p.studentEmail,
      studentName: p.studentName,
      invitedAt: p.invitedAt ? p.invitedAt.toISOString() : null,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}
    if (auth.role === 'TEACHER') where.teacherId = auth.userId
    if (auth.role === 'STUDENT') where.participants = { some: { studentId: auth.userId } }
    // ADMIN / BRANCH_ADMIN / FRONTDESK see everything for now; a branch
    // filter can be layered on later via the teacher's assignment records.

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma.classPortalMeeting as any).findMany({
      where,
      orderBy: [{ scheduledAt: 'desc' }],
      include: { participants: true },
      take: 200,
    })
    return withCors(NextResponse.json({ meetings: rows.map(toApi) }), origin)
  } catch (e) { return jsonError(origin, e) }
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    // Only staff roles can mint links. Students see meetings they were
    // tagged into but can't create them.
    const auth = await requireAuth(req, ['ADMIN', 'BRANCH_ADMIN', 'TEACHER'])
    const body = await req.json() as {
      title?: string
      scheduledAt?: string       // ISO
      endsAt?: string            // ISO — optional; defaults to +90 min
      notes?: string
      /** ClassPortalUser ids of tagged students. Deduped server-side. */
      participantIds?: string[]
    }
    const title = (body.title ?? '').trim()
    if (!title) return withCors(NextResponse.json({ error: 'title is required.' }, { status: 400 }), origin)
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date()
    if (isNaN(scheduledAt.getTime())) {
      return withCors(NextResponse.json({ error: 'Invalid scheduledAt.' }, { status: 400 }), origin)
    }
    const endsAt = body.endsAt ? new Date(body.endsAt) : new Date(scheduledAt.getTime() + 90 * 60_000)
    if (isNaN(endsAt.getTime()) || endsAt.getTime() <= scheduledAt.getTime()) {
      return withCors(NextResponse.json({ error: 'endsAt must be after scheduledAt.' }, { status: 400 }), origin)
    }

    // Resolve the teacher record for the denormalised snapshot.
    let teacherEmail = auth.email
    let teacherName  = auth.firstName || 'Teacher'
    if (auth.userId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u = await (prisma.classPortalUser as any).findUnique({ where: { id: auth.userId } })
      if (u) {
        teacherEmail = u.email || teacherEmail
        teacherName  = [u.firstName, u.lastName].filter(Boolean).join(' ') || teacherName
      }
    }

    const participantIds = Array.from(new Set((body.participantIds ?? []).filter(Boolean)))
    // Look up the tagged students for the snapshot columns. Silently
    // drop ids that don't resolve (stale local cache on the client).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const participants = participantIds.length ? await (prisma.classPortalUser as any).findMany({
      where: { id: { in: participantIds }, role: 'STUDENT', disabledAt: null },
      select: { id: true, email: true, firstName: true, lastName: true },
    }) : []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalMeeting as any).create({
      data: {
        teacherId: auth.userId ?? '',
        teacherEmail,
        teacherName,
        room: generateRoomId(),
        title,
        notes: body.notes?.trim() || null,
        scheduledAt,
        endsAt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        participants: participants.length ? {
          create: participants.map((p: { id: string; email: string; firstName: string | null; lastName: string | null }) => ({
            studentId: p.id,
            studentEmail: p.email,
            studentName: [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email,
          })),
        } : undefined,
      },
      include: { participants: true },
    })

    return withCors(NextResponse.json({ meeting: toApi(row) }), origin)
  } catch (e) { return jsonError(origin, e) }
}
