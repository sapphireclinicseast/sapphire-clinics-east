import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']

function allowedBranches(role: string): string[] | null {
  if (role === 'SBEA_ADMIN') return ['SBEA', 'VERDANA']
  if (role === 'SBGH_ADMIN') return ['SBGH', 'VERDANA']
  if (role === 'VERDANA_ADMIN') return ['VERDANA']
  return null
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''
  const employeeId = searchParams.get('employeeId') || ''
  const branch = searchParams.get('branch') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (status) where.status = status
  if (employeeId) where.employeeId = employeeId

  // Enforce branch restriction based on role
  const allowed = allowedBranches(session.user.role as string)
  if (branch) {
    if (allowed && !allowed.includes(branch)) {
      return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
    }
    where.employee = { branch }
  } else if (allowed) {
    where.employee = { branch: { in: allowed } }
  }

  const requests = await prisma.employeeRequest.findMany({
    where,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(requests)
}

// Create a request (can also be called from public QR form)
export async function POST(req: Request) {
  const body = await req.json()
  const { employeeId, requestType, leaveType, startDate, endDate, reason, attachment } = body

  if (!employeeId || !requestType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const request = await prisma.employeeRequest.create({
    data: {
      employeeId,
      requestType,
      leaveType: leaveType || null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      reason: reason || null,
      attachment: attachment || null,
    },
  })

  return NextResponse.json(request)
}

// Approve/Deny a request
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, status, reviewNotes } = body

  if (!id || !status) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const request = await prisma.employeeRequest.update({
    where: { id },
    data: {
      status,
      reviewedById: session.user.id as string,
      reviewNotes: reviewNotes || null,
    },
  })

  return NextResponse.json(request)
}
