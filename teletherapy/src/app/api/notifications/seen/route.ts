// POST /api/notifications/seen  { keys: string[] }
// Marks the given notification keys as read for the logged-in account (called
// when the user opens the bell). Unions into NotificationSeen.seenKeys, keeping
// the most-recent keys so the set stays bounded.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const MAX_KEYS = 1000

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const accountId = (session.user as unknown as { id: string }).id

  let body: { keys?: unknown } = {}
  try { body = await req.json() } catch { /* empty body ok */ }
  const incoming = Array.isArray(body.keys)
    ? (body.keys.filter((k) => typeof k === 'string') as string[]).slice(0, 500)
    : []

  const existing = await prisma.notificationSeen.findUnique({ where: { accountId } }).catch(() => null)
  // Existing first, incoming last, dedup — then keep the newest MAX_KEYS.
  const merged = Array.from(new Set([...(existing?.seenKeys ?? []), ...incoming])).slice(-MAX_KEYS)

  await prisma.notificationSeen.upsert({
    where: { accountId },
    create: { accountId, seenKeys: merged },
    update: { seenKeys: merged },
  })

  return NextResponse.json({ ok: true })
}
