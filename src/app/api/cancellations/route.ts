// GET  /api/cancellations — list all patients with cancellation counts
// POST /api/cancellations — log a new cancellation

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '25', 10)))

  const where = search
    ? {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        patientType: true,
        branches: true,
        maxCancellations: true,
        cancellationsUsed: true,
        cancellationLogs: {
          where: { deletedAt: null },
          orderBy: { loggedAt: 'desc' },
          select: {
            id: true,
            type: true,
            notes: true,
            proofUrl: true,
            loggedBy: true,
            loggedAt: true,
            deletedAt: true,
            deletedBy: true,
            deleteReason: true,
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.patient.count({ where }),
  ])

  return NextResponse.json({
    data: patients,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { patientId, type, notes, proofUrl } = body

  if (!patientId || !type) {
    return NextResponse.json({ error: 'patientId and type are required' }, { status: 400 })
  }

  // Valid types
  const VALID_TYPES = [
    'CANCEL_VALID', 'CANCEL_INVALID',
    'LATE_CANCEL_VALID', 'LATE_CANCEL_INVALID',
    'RETAINER_VALID', 'RETAINER_INVALID',
  ]
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid cancellation type' }, { status: 400 })
  }

  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, cancellationsUsed: true } })
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  // Only INVALID types count towards the cancellation limit
  const isInvalid = type.endsWith('_INVALID')

  const [log] = await prisma.$transaction([
    prisma.cancellationLog.create({
      data: {
        patientId,
        type,
        notes: notes ?? null,
        proofUrl: proofUrl ?? null,
        loggedBy: session.user.name ?? session.user.email ?? 'Unknown',
        loggedById: session.user.id ?? null,
      },
    }),
    ...(isInvalid
      ? [prisma.patient.update({
          where: { id: patientId },
          data: { cancellationsUsed: { increment: 1 } },
        })]
      : []),
  ])

  return NextResponse.json(log, { status: 201 })
}
