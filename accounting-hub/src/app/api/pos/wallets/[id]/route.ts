import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params

    const wallet = await prisma.digitalWallet.findUnique({
      where: { id },
      include: {
        packages: {
          orderBy: { createdAt: 'desc' },
          include: {
            logs: { orderBy: { createdAt: 'desc' } },
          },
        },
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    })

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    return NextResponse.json(wallet)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id } = await params
    const { patientName, patientEmail, patientId } = await req.json()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (patientName !== undefined) data.patientName = patientName.trim()
    if (patientEmail !== undefined) data.patientEmail = patientEmail?.trim() || null
    if (patientId !== undefined) data.patientId = patientId?.trim() || null

    const wallet = await prisma.digitalWallet.update({ where: { id }, data })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entity: 'digitalWallet',
        entityId: wallet.id,
        details: { updated: Object.keys(data) },
      },
    })

    return NextResponse.json(wallet)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
