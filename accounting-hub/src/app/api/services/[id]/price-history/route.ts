import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/services/[id]/price-history
// Recorded price movements, newest first, plus the audit-log dates of earlier edits.
// Those older entries only ever stored WHICH fields changed, never the values, so they
// are returned as dated markers rather than pretending to know the amounts.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const service = await prisma.service.findUnique({
    where: { id },
    select: { id: true, name: true, department: true, branch: true, price: true, doctorFee: true, clinicFee: true },
  })
  if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 })

  const [history, legacy] = await Promise.all([
    prisma.servicePriceHistory.findMany({
      where: { serviceId: id },
      orderBy: { changedAt: 'desc' },
      include: { changedBy: { select: { name: true } } },
    }),
    prisma.auditLog.findMany({
      where: { entity: 'service', entityId: id, action: 'UPDATE' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, details: true, user: { select: { name: true } } },
      take: 100,
    }),
  ])

  const firstRecorded = history.length ? history[history.length - 1].changedAt : new Date()
  const MONEY = ['price', 'doctorFee', 'clinicFee', 'newPrice']
  const olderEdits = legacy
    .filter((l) => {
      if (l.createdAt >= firstRecorded) return false          // already covered by a real row
      const d = l.details as { updated?: string[] } | null
      return Array.isArray(d?.updated) && d!.updated!.some((f) => MONEY.includes(f))
    })
    .map((l) => ({
      changedAt: l.createdAt,
      by: l.user?.name ?? null,
      fields: ((l.details as { updated?: string[] }).updated ?? []).filter((f) => MONEY.includes(f)),
    }))

  return NextResponse.json({
    service,
    history: history.map((h) => ({
      id: h.id, field: h.field, branch: h.branch,
      oldValue: h.oldValue == null ? null : Number(h.oldValue),
      newValue: h.newValue == null ? null : Number(h.newValue),
      source: h.source, note: h.note,
      changedAt: h.changedAt, by: h.changedBy?.name ?? null,
    })),
    olderEdits,
  })
}
