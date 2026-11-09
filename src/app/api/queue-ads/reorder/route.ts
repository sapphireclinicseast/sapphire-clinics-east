import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ── POST — set the whole ad order in one go (drag-and-drop in Ads Manager) ──
// Body: { ids: string[] } — every ad id, in the new top-to-bottom order.
// Rejects a list that doesn't match the current set of ads exactly (an ad was
// added/deleted in another tab), so a stale drag can't drop or duplicate ads;
// the client reloads and the user drags again.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { ids?: unknown } | null
  const ids = Array.isArray(body?.ids) ? body!.ids.filter((x): x is string => typeof x === 'string') : null
  if (!ids || ids.length === 0) return NextResponse.json({ error: 'ids required' }, { status: 400 })

  const all = await prisma.queueAd.findMany({ select: { id: true } })
  const current = new Set(all.map(a => a.id))
  const unique = new Set(ids)
  if (unique.size !== ids.length || unique.size !== current.size || ids.some(id => !current.has(id))) {
    return NextResponse.json({ error: 'The ad list changed — reload and try again.' }, { status: 409 })
  }

  await prisma.$transaction(ids.map((id, i) => prisma.queueAd.update({ where: { id }, data: { order: i } })))
  return NextResponse.json({ ok: true })
}
