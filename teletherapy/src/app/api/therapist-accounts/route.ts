import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const accounts = await prisma.therapistAccount.findMany({
    include: {
      staff: {
        select: {
          firstName: true,
          lastName: true,
          department: true,
          branch: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ accounts })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json()
  const { staffId, email, password, role } = body

  if (!staffId || !email || !password) {
    return NextResponse.json({ error: 'Staff member, email, and password are required' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  // Check if staff exists
  const staff = await prisma.staff.findUnique({ where: { id: staffId } })
  if (!staff) {
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  }

  // Check for existing account
  const existingByEmail = await prisma.therapistAccount.findUnique({ where: { email } })
  if (existingByEmail) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 400 })
  }

  const existingByStaff = await prisma.therapistAccount.findUnique({ where: { staffId } })
  if (existingByStaff) {
    return NextResponse.json({ error: 'Staff member already has an account' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const account = await prisma.therapistAccount.create({
    data: {
      staffId,
      email,
      passwordHash,
      role: role === 'ADMIN' ? 'ADMIN' : 'THERAPIST',
    },
    include: {
      staff: {
        select: {
          firstName: true,
          lastName: true,
          department: true,
          branch: true,
        },
      },
    },
  })

  return NextResponse.json({ account }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json()
  const { id, isActive } = body

  if (!id || typeof isActive !== 'boolean') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const updated = await prisma.therapistAccount.update({
    where: { id },
    data: { isActive },
  })

  return NextResponse.json({ account: updated })
}
