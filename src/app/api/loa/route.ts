// GET  /api/loa — list LOA submissions (branch-scoped by role)
// POST /api/loa — raise a new one, optionally against a Decking HMO slot
//
// Branch is stored as the HR short code ("SBEA" / "SBGH") because that is what
// DeckingSlot.branch and Staff.branch already hold, and a letter is nearly
// always raised from a slot. getBranchOptions() supplies the picker and carries
// the same short code, so a branch added in HR Platform is selectable here on
// its own.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { LOA_READ_ROLES, LOA_WRITE_ROLES, loaBranchScope } from '@/lib/loa-access'

const LIST_SELECT = {
  id: true,
  patientId: true,
  patientName: true,
  deckingSlotId: true,
  hmoName: true,
  branch: true,
  services: true,
  dateOfApproval: true,
  fileUrl: true,
  idFileUrl: true,
  fileMime: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  patient: { select: { id: true, firstName: true, lastName: true } },
  deckingSlot: {
    select: {
      id: true, dayOfWeek: true, startTime: true, endTime: true, department: true,
      staff: { select: { firstName: true, lastName: true } },
    },
  },
} as const

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!LOA_READ_ROLES.includes(role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const { branch, forced } = loaBranchScope(role, searchParams.get('branch'))
  const status = searchParams.get('status') || ''
  const hmo = searchParams.get('hmo') || ''
  const slotId = searchParams.get('slotId') || ''
  const q = (searchParams.get('q') || '').trim()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (branch) where.branch = branch
  if (status) where.status = status
  if (hmo) where.hmoName = hmo
  if (slotId) where.deckingSlotId = slotId
  if (q) {
    where.OR = [
      { patientName: { contains: q, mode: 'insensitive' } },
      { patient: { firstName: { contains: q, mode: 'insensitive' } } },
      { patient: { lastName:  { contains: q, mode: 'insensitive' } } },
    ]
  }

  const submissions = await prisma.loaSubmission.findMany({
    where,
    select: LIST_SELECT,
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  return NextResponse.json({ submissions, branchLocked: forced, branch: branch ?? null })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { role?: string; id?: string }
  const role = user.role ?? ''
  if (!LOA_WRITE_ROLES.includes(role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const {
    patientId, patientName, deckingSlotId, hmoName, services, dateOfApproval, notes,
  } = body as {
    patientId?: string | null; patientName?: string | null; deckingSlotId?: string | null
    hmoName?: string; branch?: string; services?: string[]; dateOfApproval?: string | null
    notes?: string | null
  }

  if (!hmoName || !String(hmoName).trim())
    return NextResponse.json({ error: 'HMO name is required' }, { status: 400 })

  // A branch account's letters land on their own branch whatever the body says.
  const { branch: locked } = loaBranchScope(role, (body as { branch?: string }).branch)
  if (!locked)
    return NextResponse.json({ error: 'Branch is required' }, { status: 400 })

  // Raising from a slot: take the patient and branch from the slot itself
  // rather than trusting the client to have sent a matching pair.
  let resolvedPatientId = patientId ?? null
  let resolvedBranch = locked
  if (deckingSlotId) {
    const slot = await prisma.deckingSlot.findUnique({
      where: { id: deckingSlotId },
      select: { id: true, patientId: true, branch: true },
    })
    if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
    // A front desk account may not reach across to the other branch's board.
    const { forced } = loaBranchScope(role, null)
    if (forced && slot.branch !== locked)
      return NextResponse.json({ error: 'That slot belongs to another branch' }, { status: 403 })
    resolvedPatientId = slot.patientId ?? resolvedPatientId
    resolvedBranch = slot.branch
  }

  const created = await prisma.loaSubmission.create({
    data: {
      patientId: resolvedPatientId,
      patientName: patientName?.trim() || null,
      deckingSlotId: deckingSlotId || null,
      hmoName: String(hmoName).trim(),
      branch: resolvedBranch,
      services: Array.isArray(services) ? services.filter(s => typeof s === 'string' && s.trim()) : [],
      dateOfApproval: dateOfApproval ? new Date(dateOfApproval) : null,
      notes: notes?.trim() || null,
      createdById: user.id ?? null,
    },
    select: LIST_SELECT,
  })

  return NextResponse.json(created, { status: 201 })
}
