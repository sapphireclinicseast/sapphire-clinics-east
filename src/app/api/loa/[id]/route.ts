// PATCH  /api/loa/[id] — edit a letter (fields, status, upload from the desk)
// DELETE /api/loa/[id] — remove one raised by mistake
//
// Every handler re-reads the row and checks its branch against the caller's,
// so a branch account cannot reach another branch's letter by guessing an id.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { LOA_WRITE_ROLES, loaBranchScope } from '@/lib/loa-access'

const STATUSES = new Set(['AWAITING', 'SUBMITTED', 'APPROVED', 'REJECTED'])

async function guard(id: string) {
  const session = await auth()
  if (!session?.user) return { error: 'Unauthorized', status: 401 as const }
  const role = (session.user as { role?: string }).role ?? ''
  if (!LOA_WRITE_ROLES.includes(role)) return { error: 'Forbidden', status: 403 as const }

  const row = await prisma.loaSubmission.findUnique({
    where: { id },
    select: { id: true, branch: true, fileUrl: true },
  })
  if (!row) return { error: 'Not found', status: 404 as const }

  const { branch: locked, forced } = loaBranchScope(role, null)
  if (forced && row.branch !== locked)
    return { error: 'Forbidden', status: 403 as const }

  return { row, role }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guard(id)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const data: Record<string, unknown> = {}
  const { hmoName, services, dateOfApproval, status, notes, patientName } = body as {
    hmoName?: string; services?: string[]; dateOfApproval?: string | null
    status?: string; notes?: string | null; patientName?: string | null
  }

  if (typeof hmoName === 'string' && hmoName.trim()) data.hmoName = hmoName.trim()
  if (Array.isArray(services)) data.services = services.filter(s => typeof s === 'string' && s.trim())
  if (dateOfApproval !== undefined) data.dateOfApproval = dateOfApproval ? new Date(dateOfApproval) : null
  if (notes !== undefined) data.notes = notes?.trim() || null
  if (patientName !== undefined) data.patientName = patientName?.trim() || null
  if (typeof status === 'string') {
    if (!STATUSES.has(status)) return NextResponse.json({ error: 'Unknown status' }, { status: 400 })
    data.status = status
  }

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const updated = await prisma.loaSubmission.update({ where: { id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guard(id)
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  await prisma.loaSubmission.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
