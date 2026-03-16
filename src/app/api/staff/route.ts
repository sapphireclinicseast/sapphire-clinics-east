import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function branchFromRole(role: string): string | null {
  if (role.startsWith('SBEA_')) return 'SBEA'
  if (role.startsWith('SBGH_')) return 'SBGH'
  return null // ADMIN / MARKETING_ADMIN — caller supplies branch in body
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role   = (session.user as { role?: string }).role ?? ''
  const branch = branchFromRole(role) // non-null for SBEA_* / SBGH_* roles; null for ADMIN / MARKETING_ADMIN

  const staff = await prisma.staff.findMany({
    where:   branch ? { branch } : {},
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
  return NextResponse.json(staff)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { firstName, lastName, email, phone, department, branch: bodyBranch } = await req.json()

  if (!firstName || !lastName || !department) {
    return NextResponse.json({ error: 'First name, last name, and department are required' }, { status: 400 })
  }

  const role = (session.user as { role?: string }).role ?? ''
  const branch = branchFromRole(role) ?? bodyBranch

  if (!branch) {
    return NextResponse.json({ error: 'Branch is required' }, { status: 400 })
  }

  const staff = await prisma.staff.create({
    data: {
      firstName: firstName.trim().toUpperCase(),
      lastName: lastName.trim().toUpperCase(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      department,
      branch,
      createdById: (session.user as { id: string }).id,
    },
  })

  return NextResponse.json(staff, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, firstName, lastName, email, phone, department, branch } = await req.json()

  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (firstName !== undefined) data.firstName = firstName.trim().toUpperCase()
  if (lastName !== undefined) data.lastName = lastName.trim().toUpperCase()
  if (email !== undefined) data.email = email?.trim() || null
  if (phone !== undefined) data.phone = phone?.trim() || null
  if (department !== undefined) data.department = department
  if (branch !== undefined) data.branch = branch

  const staff = await prisma.staff.update({ where: { id }, data })
  return NextResponse.json(staff)
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  await prisma.staff.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
