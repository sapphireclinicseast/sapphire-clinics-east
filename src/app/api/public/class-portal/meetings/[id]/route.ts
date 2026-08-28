// DELETE /api/public/class-portal/meetings/[id]        — soft-cancel
// DELETE /api/public/class-portal/meetings/[id]?hard=1 — hard-delete
//
// Soft-cancel keeps the row for audit + stops us minting fresh links
// but leaves any already-shared signed link honored by the meet app
// until endsAt (LiveKit can't recall a signed compact token).
//
// Hard-delete wipes the ClassPortalMeeting row AND its
// ClassPortalMeetingParticipant children (cascade). Use for typo
// rows or rows the teacher doesn't want in the history at all. The
// signed link, if already leaked, still verifies until endsAt — the
// hard-delete doesn't recall it either. Both actions are restricted
// to the creator + admin.
//
// A soft-cancelled row can still be hard-deleted afterwards.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  const { id } = await params
  const url = new URL(req.url)
  const hardDelete = url.searchParams.get('hard') === '1' || url.searchParams.get('hard') === 'true'

  try {
    const auth = await requireAuth(req, ['ADMIN', 'BRANCH_ADMIN', 'TEACHER'])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalMeeting as any).findUnique({ where: { id } })
    if (!row) {
      return withCors(NextResponse.json({ error: 'Not found.' }, { status: 404 }), origin)
    }
    // Same authorization rule for cancel + delete: the row owner or a
    // main / branch admin. Front desk isn't allowed to touch meeting
    // records (they aren't visible to that role today anyway).
    if (auth.role === 'TEACHER' && row.teacherId !== auth.userId) {
      const verb = hardDelete ? 'delete' : 'cancel'
      return withCors(NextResponse.json({ error: `You can only ${verb} meetings you created.` }, { status: 403 }), origin)
    }

    if (hardDelete) {
      // Cascade wipes ClassPortalMeetingParticipant rows via the
      // schema-level onDelete: Cascade relation.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.classPortalMeeting as any).delete({ where: { id } })
      return withCors(NextResponse.json({ ok: true, deleted: true }), origin)
    }

    // Soft-cancel path — idempotent.
    if (row.cancelledAt) {
      return withCors(NextResponse.json({ ok: true, alreadyCancelled: true }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalMeeting as any).update({
      where: { id },
      data: { cancelledAt: new Date(), cancelledBy: auth.email },
    })
    return withCors(NextResponse.json({ ok: true, cancelled: true }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
