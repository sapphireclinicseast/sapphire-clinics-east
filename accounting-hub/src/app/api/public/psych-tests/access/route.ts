import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

/**
 * PUBLIC — trades the shared access code for the Psych Tests edit token.
 *
 * Hannah's call (2026-10-19): the unguessable URL was too hard to pass
 * around, so the bare /psych-tests page gates on this short code instead.
 * The code is deliberately simple; change ACCESS_CODE here if it ever needs
 * rotating. A small in-memory rate limit keeps casual guessing out.
 */

const ACCESS_CODE = 'scei'

const attempts = new Map<string, { n: number; resetAt: number }>()
const LIMIT = 10
const WINDOW_MS = 60_000

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  const now = Date.now()
  const slot = attempts.get(ip)
  if (slot && slot.resetAt > now && slot.n >= LIMIT) {
    return NextResponse.json({ error: 'Too many tries — wait a minute and try again.' }, { status: 429 })
  }
  if (!slot || slot.resetAt <= now) attempts.set(ip, { n: 1, resetAt: now + WINDOW_MS })
  else slot.n++

  const body = await req.json().catch(() => ({}))
  const code = String(body?.code ?? '').trim().toLowerCase()
  if (code !== ACCESS_CODE) {
    return NextResponse.json({ error: 'That code is not right — please ask the accounting office.' }, { status: 403 })
  }
  const row = await prisma.psychTestSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', editToken: crypto.randomBytes(9).toString('base64url') },
    update: {},
  })
  return NextResponse.json({ token: row.editToken })
}
