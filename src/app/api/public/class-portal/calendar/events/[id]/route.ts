// PATCH  /api/public/class-portal/calendar/events/[id] — admin/teacher only.
// DELETE /api/public/class-portal/calendar/events/[id] — admin/teacher only.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../../_cors'

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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    await requireAuth(req, ['ADMIN', 'TEACHER'])
    const { id } = await params
    const body = await req.json() as {
      date?: string
      endDate?: string | null
      title?: string
      description?: string | null
      type?: 'CLASS_CANCELLED' | 'HOLIDAY' | 'FIELD_TRIP' | 'IEP_REVIEW' | 'EVENT'
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { updatedAt: new Date() }
    if (body.date !== undefined) data.date = new Date(body.date + 'T00:00:00Z')
    if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate + 'T00:00:00Z') : null
    if (body.title !== undefined) data.title = body.title.trim()
    if (body.description !== undefined) data.description = body.description?.trim() || null
    if (body.type !== undefined) data.type = body.type
    const updated = await prisma.classPortalCalendarEvent.update({ where: { id }, data })
    return withCors(NextResponse.json({
      event: {
        id: updated.id,
        date: updated.date.toISOString().slice(0, 10),
        endDate: updated.endDate ? updated.endDate.toISOString().slice(0, 10) : null,
        title: updated.title,
        description: updated.description,
        type: updated.type,
        createdBy: updated.createdBy,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    }), origin)
  } catch (e) { return jsonError(origin, e) }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    await requireAuth(req, ['ADMIN', 'TEACHER'])
    const { id } = await params
    await prisma.classPortalCalendarEvent.delete({ where: { id } })
    return withCors(NextResponse.json({ ok: true }), origin)
  } catch (e) { return jsonError(origin, e) }
}
