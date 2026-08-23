// PATCH /api/patients/[id]/plush-toy — mark the Aura the Alpaca plush toy as
// given to this patient. One piece per patient; idempotent (re-marking just
// keeps the original given-at/by unless explicitly undone via DELETE).
//
// DELETE /api/patients/[id]/plush-toy — undo an accidental mark.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const patient = await prisma.patient.findUnique({
    where: { id },
    select: { id: true, plushToyGivenAt: true },
  })
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  // Idempotent — don't overwrite an existing given-at timestamp with "now"
  // if this fires twice (double-click, retry after a flaky response).
  if (patient.plushToyGivenAt) {
    return NextResponse.json({ plushToyGivenAt: patient.plushToyGivenAt })
  }

  const givenBy = session.user?.name ?? session.user?.email ?? 'Unknown'
  const updated = await prisma.patient.update({
    where: { id },
    data: { plushToyGivenAt: new Date(), plushToyGivenBy: givenBy },
    select: { plushToyGivenAt: true, plushToyGivenBy: true },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const patient = await prisma.patient.findUnique({ where: { id }, select: { id: true } })
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  await prisma.patient.update({
    where: { id },
    data: { plushToyGivenAt: null, plushToyGivenBy: null },
  })
  return NextResponse.json({ ok: true })
}
