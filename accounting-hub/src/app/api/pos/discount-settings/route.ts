import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { isActive: true }
  if (branch) where.branch = branch

  try {
    const settings = await prisma.discountSetting.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(settings)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { name, type, value, branch } = await req.json()

    if (!name?.trim() || !type || value === undefined) {
      return NextResponse.json(
        { error: 'name, type, and value are required' },
        { status: 400 }
      )
    }

    if (!['PERCENTAGE', 'FIXED'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be PERCENTAGE or FIXED' },
        { status: 400 }
      )
    }

    const setting = await prisma.discountSetting.create({
      data: {
        name: name.trim(),
        type,
        value: Number(value),
        branch: branch || null,
        createdById: session.user.id,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'discountSetting',
        entityId: setting.id,
        details: { name: setting.name, type, value: Number(value), branch },
      },
    })

    return NextResponse.json(setting, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id, name, type, value, branch } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    if (type && !['PERCENTAGE', 'FIXED'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be PERCENTAGE or FIXED' },
        { status: 400 }
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (name !== undefined) data.name = name.trim()
    if (type !== undefined) data.type = type
    if (value !== undefined) data.value = Number(value)
    if (branch !== undefined) data.branch = branch || null

    const setting = await prisma.discountSetting.update({
      where: { id },
      data,
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entity: 'discountSetting',
        entityId: setting.id,
        details: { updated: Object.keys(data) },
      },
    })

    return NextResponse.json(setting)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const setting = await prisma.discountSetting.update({
      where: { id },
      data: { isActive: false },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'SOFT_DELETE',
        entity: 'discountSetting',
        entityId: setting.id,
        details: { name: setting.name },
      },
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
