// POST /api/loa/invite
//
// Staff do not fill in LOA details — the patient does. This creates the empty
// letter the patient's form will populate, and returns the link + QR to hand
// over. Everything the form asks for (HMO, branch, date of approval, services,
// the document itself) arrives from the patient side.
//
// The record exists up front so the letter is visible as "Awaiting document"
// the moment it is requested, rather than appearing out of nowhere later — the
// front desk needs to see what they are still chasing.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import QRCode from 'qrcode'
import { LOA_WRITE_ROLES, loaBranchScope } from '@/lib/loa-access'

const TTL_MS = 12 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { role?: string; id?: string }
  const role = user.role ?? ''
  if (!LOA_WRITE_ROLES.includes(role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { patientName, deckingSlotId } = (body ?? {}) as {
    patientName?: string | null; deckingSlotId?: string | null
  }

  // A branch account's letters land on their own branch. For an unrestricted
  // account the branch stays blank and the patient picks it on the form — that
  // is why Branch is one of the form's fields.
  const { branch: locked } = loaBranchScope(role, (body as { branch?: string })?.branch)

  let resolvedBranch = locked ?? ''
  let resolvedPatientId: string | null = null
  if (deckingSlotId) {
    const slot = await prisma.deckingSlot.findUnique({
      where: { id: deckingSlotId },
      select: { patientId: true, branch: true },
    })
    if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
    const { forced } = loaBranchScope(role, null)
    if (forced && slot.branch !== locked)
      return NextResponse.json({ error: 'That slot belongs to another branch' }, { status: 403 })
    resolvedPatientId = slot.patientId
    resolvedBranch = slot.branch
  }

  const loa = await prisma.loaSubmission.create({
    data: {
      patientId: resolvedPatientId,
      patientName: patientName?.trim() || null,
      deckingSlotId: deckingSlotId || null,
      // Placeholders the patient's form replaces. 'UNSPECIFIED' rather than an
      // empty string so a half-finished letter is obvious in the list.
      hmoName: 'UNSPECIFIED',
      branch: resolvedBranch,
      services: [],
      createdById: user.id ?? null,
    },
    select: { id: true },
  })

  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + TTL_MS)
  await prisma.loaUploadToken.create({ data: { token, loaId: loa.id, expiresAt } })

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://operations.sapphireclinicseast.org'
  const uploadUrl = `${baseUrl}/loa/${token}`
  const qrDataUrl = await QRCode.toDataURL(uploadUrl, {
    width: 300, margin: 2, color: { dark: '#1C2B30', light: '#FFFFFF' },
  })

  return NextResponse.json({
    id: loa.id, token, uploadUrl, qrDataUrl, expiresAt: expiresAt.toISOString(),
  }, { status: 201 })
}
