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
  const branch = branchFromRole(role)

  const staff = await prisma.staff.findMany({
    where:   branch ? { branch } : {},
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
  return NextResponse.json(staff)
}

// Staff creation is disabled — staff data is synced from the HR Platform
export async function POST() {
  return NextResponse.json(
    { error: 'Staff creation is disabled. Staff data is synced from the HR Platform.' },
    { status: 403 }
  )
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Staff editing is disabled. Update staff profiles in the HR Platform.' },
    { status: 403 }
  )
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Staff deletion is disabled. Manage staff profiles in the HR Platform.' },
    { status: 403 }
  )
}
