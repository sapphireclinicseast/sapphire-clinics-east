import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
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
  let settings = await prisma.employeeSettings.findFirst()

  if (settings) {
    settings = await prisma.employeeSettings.update({
      where: { id: settings.id },
      data: body,
    })
  } else {
    settings = await prisma.employeeSettings.create({ data: body })
  }

  return NextResponse.json(settings)
}
