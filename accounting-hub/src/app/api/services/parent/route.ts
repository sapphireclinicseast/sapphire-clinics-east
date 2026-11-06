import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parentFromName, parentOptions } from '@/lib/service-groups'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

async function allParents() {
  const rows = await prisma.service.findMany({ where: { isActive: true }, select: { name: true, parentGroup: true } })
  return parentOptions(rows)
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ parents: await allParents() })
}

// Files services under a parent on the Services page. Only parentGroup changes:
// the name, price and every link POS and payroll use stay as they are. A blank
// parent puts a service back where its name places it.
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
    ? (await allParents()).find(p => p.toUpperCase() === typed.toUpperCase()) ?? typed
    : ''

  const rows = await prisma.service.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, parentGroup: true } })
  if (!rows.length) return NextResponse.json({ error: 'Service not found' }, { status: 404 })

  const nextFor = (name: string) => (parent && parent.toUpperCase() !== parentFromName(name).toUpperCase() ? parent : null)
  await prisma.$transaction([
    ...rows.map(r => prisma.service.update({ where: { id: r.id }, data: { parentGroup: nextFor(r.name) } })),
    prisma.auditLog.createMany({
      data: rows.map(r => ({
        userId: session.user.id,
        action: 'UPDATE' as const,
        entity: 'service',
        entityId: r.id,
        details: { updated: ['parentGroup'], from: r.parentGroup, to: nextFor(r.name) },
      })),
    }),
  ])

  return NextResponse.json({ moved: rows.length, parent: parent || null })
}
