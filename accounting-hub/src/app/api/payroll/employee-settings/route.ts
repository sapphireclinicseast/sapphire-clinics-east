import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']

export async function GET() {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Return first (singleton) settings row, or defaults
  let settings = await prisma.employeeSettings.findFirst()
  if (!settings) {
    settings = await prisma.employeeSettings.create({ data: {} })
  }
  return NextResponse.json(settings)
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  // Strip id and timestamps — these are not updatable
  const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = body

  try {
    let settings = await prisma.employeeSettings.findFirst()

    if (settings) {
      settings = await prisma.employeeSettings.update({
        where: { id: settings.id },
        data,
      })
    } else {
      settings = await prisma.employeeSettings.create({ data })
    }

    return NextResponse.json(settings)
  } catch (err) {
    console.error('[employee-settings] Save error:', err)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
