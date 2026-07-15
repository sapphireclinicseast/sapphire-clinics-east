import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

const VALID_ROLES = ['ADMIN', 'MARKETING_ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONT_DESK', 'AHGH_FRONT_DESK']
function safeRole(role: unknown) {
  return typeof role === 'string' && VALID_ROLES.includes(role) ? role : 'MARKETING_ADMIN'
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ users })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only admins can create users
  const currentUser = await prisma.user.findUnique({
    where: { id: (session.user as { id: string }).id },
    select: { role: true },
  })
  if (currentUser?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { name, email, password, role } = await req.json()
  if (!name || !email || !password) {
    return NextResponse.json({ error: 'name, email, and password are required' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: safeRole(role) as any },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  })

  return NextResponse.json({ user })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: (session.user as { id: string }).id },
      select: { role: true },
    })
    if (currentUser?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { id, name, email, password, role } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    // Check email uniqueness if changing email
    if (email) {
      const existing = await prisma.user.findFirst({ where: { email, NOT: { id } } })
      if (existing) return NextResponse.json({ error: 'Email already in use by another account' }, { status: 409 })
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (email) updateData.email = email
    if (role !== undefined) updateData.role = safeRole(role)
    if (password) updateData.passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    })

    return NextResponse.json({ user })
  } catch (err) {
    console.error('PUT /api/users error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to update user: ${msg}` }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUser = await prisma.user.findUnique({
    where: { id: (session.user as { id: string }).id },
    select: { role: true },
  })
  if (currentUser?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Prevent self-deletion
  if (id === (session.user as { id: string }).id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  await prisma.user.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
