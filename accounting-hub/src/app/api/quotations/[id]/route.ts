import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'BOOKKEEPER', 'VIEWER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      createdBy: { select: { name: true } },
    },
  })
  if (!quotation) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
  return NextResponse.json(quotation)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { id } = await params
  const existing = await prisma.quotation.findUnique({ where: { id }, select: { quotationNumber: true } })
  if (!existing) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })

  await prisma.quotation.delete({ where: { id } })
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'DELETE',
      entity: 'quotation',
      entityId: id,
      details: { quotationNumber: existing.quotationNumber },
    },
  })
  return NextResponse.json({ ok: true })
}
