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

  // Create/update assignment for the current clinician as ENDORSED
  await prisma.patientAssignment.upsert({
    where: {
      patientId_therapistAccountId_status: {
        patientId,
        therapistAccountId: session.user.id,
        status: 'ACTIVE',
      },
    },
    update: {
      status: 'ENDORSED',
      endorsedToId: endorseToAccountId,
      endorsedAt: new Date(),
    },
    create: {
      patientId,
      therapistAccountId: session.user.id,
      status: 'ENDORSED',
      endorsedToId: endorseToAccountId,
      endorsedAt: new Date(),
    },
  })

  // Create an ACTIVE assignment for the new clinician
  await prisma.patientAssignment.upsert({
    where: {
      patientId_therapistAccountId_status: {
        patientId,
        therapistAccountId: endorseToAccountId,
        status: 'ACTIVE',
      },
    },
    update: {},
    create: {
      patientId,
      therapistAccountId: endorseToAccountId,
      status: 'ACTIVE',
    },
  })

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
