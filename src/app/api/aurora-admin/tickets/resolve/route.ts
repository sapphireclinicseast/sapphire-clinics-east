// POST /api/aurora-admin/tickets/resolve — admin resolves (or reopens) a ticket.
// Body: { id, response?, reopen? }. Setting RESOLVED with an optional response
// makes the resolution visible in the patient's "My tickets". Token-authed.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkAdminToken } from '@/lib/aurora-admin'

export async function POST(req: NextRequest) {
  if (!checkAdminToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    response?: string
    reopen?: boolean
  }
  const id = (body.id ?? '').trim()
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.patientTicket.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const reopen = body.reopen === true
  const updated = await prisma.patientTicket.update({
    where: { id },
    data: reopen
      ? { status: 'OPEN', resolvedAt: null }
      : {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          adminResponse: (body.response ?? '').trim() ? body.response!.trim().slice(0, 3000) : null,
        },
    select: { id: true, status: true },
  })

  return NextResponse.json({ ok: true, id: updated.id, status: updated.status })
}
