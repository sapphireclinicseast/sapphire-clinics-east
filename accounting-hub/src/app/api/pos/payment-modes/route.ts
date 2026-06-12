import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

// GET — list all payment modes with deductions and accounts
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const branch = searchParams.get('branch')

    const modes = await prisma.paymentMode.findMany({
      where: branch ? { OR: [{ branch: null }, { branch }] } : undefined,
      orderBy: { name: 'asc' },
      include: {
        account: { select: { id: true, accountNumber: true, accountTitle: true } },
        deductions: {
          orderBy: { createdAt: 'asc' },
          include: {
            account: { select: { id: true, accountNumber: true, accountTitle: true } },
          },
        },
      },
    })
    return NextResponse.json(modes)
  } catch (err) {
    console.error('Payment modes GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST — create a payment mode (with optional deductions)
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { name, paymentMethod, branch, accountId, deductions = [] } = await req.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Payment mode name is required' }, { status: 400 })
    }

    const mode = await prisma.paymentMode.create({
      data: {
        name: name.trim(),
        paymentMethod: paymentMethod || null,
        branch: branch || null,
        accountId: accountId || null,
        deductions: {
          create: deductions
            .filter((d: { name: string; rate: number; accountId?: string }) => d.name && d.rate > 0)
            .map((d: { name: string; rate: number; valueType?: string; accountId?: string }) => ({
              name: d.name.trim(),
              rate: d.rate,
              valueType: d.valueType === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
              accountId: d.accountId || null,
            })),
        },
      },
      include: {
        account: { select: { id: true, accountNumber: true, accountTitle: true } },
        deductions: {
          include: {
            account: { select: { id: true, accountNumber: true, accountTitle: true } },
          },
        },
      },
    })

    return NextResponse.json(mode, { status: 201 })
  } catch (err) {
    console.error('Payment mode POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT — update a payment mode and replace its deductions
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id, name, paymentMethod, branch, accountId, isActive, deductions = [] } = await req.json()

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    // Delete existing deductions then recreate (simplest replace strategy)
    await prisma.paymentModeDeduction.deleteMany({ where: { paymentModeId: id } })

    const mode = await prisma.paymentMode.update({
      where: { id },
      data: {
        name: name.trim(),
        paymentMethod: paymentMethod || null,
        branch: branch !== undefined ? (branch || null) : undefined,
        accountId: accountId || null,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        deductions: {
          create: deductions
            .filter((d: { name: string; rate: number; accountId?: string }) => d.name && d.rate > 0)
            .map((d: { name: string; rate: number; valueType?: string; accountId?: string }) => ({
              name: d.name.trim(),
              rate: d.rate,
              valueType: d.valueType === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
              accountId: d.accountId || null,
            })),
        },
      },
      include: {
        account: { select: { id: true, accountNumber: true, accountTitle: true } },
        deductions: {
          include: {
            account: { select: { id: true, accountNumber: true, accountTitle: true } },
          },
        },
      },
    })

    return NextResponse.json(mode)
  } catch (err) {
    console.error('Payment mode PUT error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — soft-delete (set isActive = false)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    await prisma.paymentMode.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('Payment mode DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
