import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Departments offered as tick-boxes. Mirrors the StaffDepartment enum.
const DEPARTMENTS = [
  'OT', 'PT', 'SLP', 'SPED', 'MD',
  'PSYCHOLOGY', 'ORTHOSIS', 'FRONT_DESK', 'ADMINISTRATION',
] as const

function isAdmin(role?: string) {
  return role === 'ADMIN'
}

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

// GET — list directory entries. Visible to every signed-in user.
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // @ts-ignore — directoryEntry not in PrismaClient typings until generate
  const entries = await prisma.directoryEntry.findMany({
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ entries, departments: DEPARTMENTS })
}

// POST — create a directory entry (admin only).
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json()
  const departments: string[] = Array.isArray(body.departments)
    ? body.departments.filter((d: unknown): d is string => typeof d === 'string' && (DEPARTMENTS as readonly string[]).includes(d))
    : []
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''

  if (departments.length === 0) {
    return NextResponse.json({ error: 'Select at least one department' }, { status: 400 })
  }
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  // @ts-ignore
  const entry = await prisma.directoryEntry.create({
    data: {
      departments,
      email,
      description: description || null,
      createdById: session.user.id,
    },
  })
  return NextResponse.json({ entry }, { status: 201 })
}

// DELETE — remove a directory entry by id (admin only).
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // @ts-ignore
  await prisma.directoryEntry.delete({ where: { id } }).catch(() => null)
  return NextResponse.json({ success: true })
}
