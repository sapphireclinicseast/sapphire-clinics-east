import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: patientId } = await params
  const { endorseToAccountId } = await req.json()

  if (!endorseToAccountId) {
    return NextResponse.json({ error: 'Target clinician is required' }, { status: 400 })
  }

  if (endorseToAccountId === session.user.id) {
    return NextResponse.json({ error: 'Cannot endorse to yourself' }, { status: 400 })
  }

  // Verify target account exists and is active
  const targetAccount = await prisma.therapistAccount.findUnique({
    where: { id: endorseToAccountId },
    include: { staff: true },
  })

  if (!targetAccount || !targetAccount.isActive) {
    return NextResponse.json({ error: 'Target clinician not found or inactive' }, { status: 404 })
  }

  // Enforce same department for endorsement (admin can bypass)
  if (session.user.role !== 'ADMIN' && targetAccount.staff.department !== session.user.department) {
    return NextResponse.json({ error: 'Can only endorse to clinicians in the same department' }, { status: 403 })
  }

  // New endorsement model:
  //   - Exactly ONE row per (patient, therapist).
  //   - The current clinician's row flips to DEACTIVATED (read-only,
  //     can still see past notes they personally delivered).
  //   - The receiving clinician's row is created ACTIVE, OR if they
  //     already had a DEACTIVATED row from a previous cycle it flips
  //     back to ACTIVE.
  //   - All SessionNotes the endorser authored for this patient get
  //     stamped with lockedAt=now. This is permanent: even if the
  //     patient is endorsed back to them later, those notes stay
  //     read-only because they were signed at a specific point in
  //     time and that signature shouldn't be retroactively editable.
  // Wrapped in a transaction so a partial failure doesn't leave the
  // patient with two ACTIVE owners or unlocked stale notes.
  const lockStamp = new Date()
  await prisma.$transaction([
    prisma.patientAssignment.upsert({
      where: {
        patientId_therapistAccountId: {
          patientId,
          therapistAccountId: session.user.id,
        },
      },
      update: {
        status: 'DEACTIVATED',
        endorsedToId: endorseToAccountId,
        endorsedAt: lockStamp,
      },
      create: {
        patientId,
        therapistAccountId: session.user.id,
        status: 'DEACTIVATED',
        endorsedToId: endorseToAccountId,
        endorsedAt: lockStamp,
      },
    }),
    prisma.patientAssignment.upsert({
      where: {
        patientId_therapistAccountId: {
          patientId,
          therapistAccountId: endorseToAccountId,
        },
      },
      update: {
        status: 'ACTIVE',
        // Clear stale endorsement metadata when re-activating.
        endorsedToId: null,
        endorsedAt: null,
      },
      create: {
        patientId,
        therapistAccountId: endorseToAccountId,
        status: 'ACTIVE',
      },
    }),
    // Permanently freeze the endorser's notes for this patient.
    // updateMany skips already-locked rows (lockedAt: null filter)
    // so the original lock timestamp is preserved across cycles.
    prisma.sessionNote.updateMany({
      where: {
        therapistAccountId: session.user.id,
        schedule: { patientId },
        lockedAt: null,
      },
      data: { lockedAt: lockStamp },
    }),
    // Same freeze for IE / PR / Other documents the endorser uploaded.
    // The receiving clinician (and admins) can still SEE them; they
    // just can't re-upload over them or delete them. New uploads by
    // the new active owner stay unlocked.
    prisma.patientDocument.updateMany({
      where: {
        uploadedById: session.user.id,
        patientId,
        lockedAt: null,
      },
      data: { lockedAt: lockStamp },
    }),
  ])

  return NextResponse.json({
    success: true,
    message: `Patient endorsed to ${targetAccount.staff.firstName} ${targetAccount.staff.lastName}`,
  })
}

// GET: list eligible staff for endorsement (same department)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await params // consume params

  const department = session.user.department

  // Get all active therapist accounts in the same department, excluding self
  const accounts = await prisma.therapistAccount.findMany({
    where: {
      isActive: true,
      id: { not: session.user.id },
      staff: { department: department as any },
    },
    include: {
      staff: {
        select: { firstName: true, lastName: true, department: true, branch: true },
      },
    },
    orderBy: { staff: { lastName: 'asc' } },
  })

  return NextResponse.json({
    staff: accounts.map((a) => ({
      accountId: a.id,
      name: `${a.staff.firstName} ${a.staff.lastName}`,
      department: a.staff.department,
      branch: a.staff.branch,
    })),
  })
}
