// Waiting-room announcements for the queue TV.
//
// GET is public, like /api/queue-ads: the TV display is an unauthenticated page
// on a screen in the waiting room, so it cannot carry a session. Nothing here is
// confidential — it is the text already up on a screen facing the public.
//
// PUT replaces all three boxes of one scope in a single call, because that is
// how front desk edit them: three fields and one save. Sending them one at a
// time would let a half-saved set reach the screen.

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { branchForRole } from '@/lib/role-branch'
import { prisma } from '@/lib/prisma'

export const MAX_ANNOUNCEMENTS = 3
const MAX_LEN = 160          // about two lines at TV size; past that nobody reads it
const SCOPES = ['ALL', 'SBEA', 'SBGH']

/**
 * GET /api/queue-announcements            → every scope, for the manager
 * GET /api/queue-announcements?branch=SBEA → what that TV should show
 *
 * For a TV, the branch's own lines come first and "ALL" fills whatever slots are
 * left, never exceeding three. Front desk can therefore put something on one
 * screen without it displacing the clinic-wide notices unless they fill all
 * three boxes — and the screen can never silently grow a fourth line.
 */
export async function GET(req: NextRequest) {
  const branch = req.nextUrl.searchParams.get('branch')
  const rows = await prisma.queueAnnouncement.findMany({ orderBy: [{ branch: 'asc' }, { slot: 'asc' }] })

  if (!branch) return NextResponse.json(rows)

  const mine = rows.filter(r => r.branch === branch && r.text.trim()).sort((a, b) => a.slot - b.slot)
  const all = rows.filter(r => r.branch === 'ALL' && r.text.trim()).sort((a, b) => a.slot - b.slot)
  const shown = [...mine, ...all].slice(0, MAX_ANNOUNCEMENTS)
  return NextResponse.json(shown.map(r => ({ id: r.id, text: r.text, branch: r.branch })))
}

/**
 * PUT — save one scope's three boxes.
 *
 * Body: { branch: 'ALL' | 'SBEA' | 'SBGH', texts: string[] }
 *
 * An empty box deletes its row rather than storing '', so "is anything up on the
 * screen" is answerable without every reader having to filter blanks.
 */
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { branch?: string; texts?: unknown } | null
  const branch = String(body?.branch ?? '')
  if (!SCOPES.includes(branch)) {
    return NextResponse.json({ error: `branch must be one of ${SCOPES.join(', ')}` }, { status: 400 })
  }

  // A branch-restricted account edits its own branch and nothing else. Without
  // this, Greenhills front desk could clear what East has on its screen.
  const role = (session.user as { role?: string } | undefined)?.role ?? ''
  const ownBranch = branchForRole(role)
  if (ownBranch && branch !== ownBranch) {
    return NextResponse.json({ error: `This account can only change ${ownBranch} announcements.` }, { status: 403 })
  }

  if (!Array.isArray(body?.texts)) {
    return NextResponse.json({ error: 'texts must be an array' }, { status: 400 })
  }
  const texts = (body.texts as unknown[]).slice(0, MAX_ANNOUNCEMENTS)
    .map(t => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN))

  // One transaction: three boxes are one edit, and a half-applied save would put
  // a stale line next to a fresh one on a screen facing the waiting room.
  const writes: Prisma.PrismaPromise<unknown>[] = texts.map((text, slot) => text
    ? prisma.queueAnnouncement.upsert({
        where: { branch_slot: { branch, slot } },
        update: { text },
        create: { branch, slot, text },
      })
    : prisma.queueAnnouncement.deleteMany({ where: { branch, slot } }))
  // Boxes the caller did not send at all are cleared too, so shortening the
  // list cannot leave an orphan line on the screen.
  writes.push(prisma.queueAnnouncement.deleteMany({ where: { branch, slot: { gte: texts.length } } }))
  await prisma.$transaction(writes)

  const saved = await prisma.queueAnnouncement.findMany({ where: { branch }, orderBy: { slot: 'asc' } })
  return NextResponse.json(saved)
}
