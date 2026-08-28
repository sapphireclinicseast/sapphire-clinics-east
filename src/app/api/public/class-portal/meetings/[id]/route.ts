// DELETE /api/public/class-portal/meetings/[id] — soft-cancel a meeting
//
// Soft-cancel because we cannot recall a signed compact link — the
// meet.sapphireclinicseast.org verifier still honors it until endsAt.
// The cancel just hides the row from the teacher/student list and
// stops us minting fresh links on subsequent GETs.

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
  try {
    const auth = await requireAuth(req, ['ADMIN', 'BRANCH_ADMIN', 'TEACHER'])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalMeeting as any).findUnique({ where: { id } })
    if (!row) {
      return withCors(NextResponse.json({ error: 'Not found.' }, { status: 404 }), origin)
    }
    // Teachers can only cancel their own meetings; admins can cancel any.
    if (auth.role === 'TEACHER' && row.teacherId !== auth.userId) {
      return withCors(NextResponse.json({ error: 'You can only cancel meetings you created.' }, { status: 403 }), origin)
    }
    if (row.cancelledAt) {
      return withCors(NextResponse.json({ ok: true, alreadyCancelled: true }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.classPortalMeeting as any).update({
      where: { id },
      data: { cancelledAt: new Date(), cancelledBy: auth.email },
    })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
