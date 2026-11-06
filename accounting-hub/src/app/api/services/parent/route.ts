import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parentOptions } from '@/lib/service-groups'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

function activeServices() {
  return prisma.service.findMany({ where: { isActive: true }, select: { id: true, name: true, parentGroup: true }, orderBy: { name: 'asc' } })
}

// The categories in use; ?services=1 adds every active service to pick from.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await activeServices()
  const withServices = new URL(req.url).searchParams.get('services') === '1'
  return NextResponse.json({ parents: parentOptions(rows), ...(withServices ? { services: rows } : {}) })
}

// Files services under a category on the Services page. Only parentGroup changes:
// the name, price and every link POS and payroll use stay as they are. A blank
// category puts a service back where its name places it.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : []
  if (!ids.length) return NextResponse.json({ error: 'Pick a service to move' }, { status: 400 })
  const typed = typeof body.parentGroup === 'string' ? body.parentGroup.trim() : ''

  // Typing "cocolife" joins the existing COCOLIFE instead of starting a second one.
  const parent = typed
    ? parentOptions(await activeServices()).find(p => p.toUpperCase() === typed.toUpperCase()) ?? typed
    : null

  const rows = await prisma.service.findMany({ where: { id: { in: ids } }, select: { id: true, parentGroup: true } })
  if (!rows.length) return NextResponse.json({ error: 'Service not found' }, { status: 404 })

  await prisma.$transaction([
    prisma.service.updateMany({ where: { id: { in: rows.map(r => r.id) } }, data: { parentGroup: parent } }),
    prisma.auditLog.createMany({
      data: rows.map(r => ({
        userId: session.user.id,
        action: 'UPDATE' as const,
        entity: 'service',
        entityId: r.id,
        details: { updated: ['parentGroup'], from: r.parentGroup, to: parent },
      })),
    }),
  ])

  return NextResponse.json({ moved: rows.length, parent })
}
