// POST /api/provider-auth/verify — server-to-server (called by the patient
// app's proxy, guarded by PROVIDER_HANDOFF_SECRET). Verifies a provider's
// email+password and returns a one-time handoff token the browser redeems at
// /provider-handoff to get a real NextAuth session. Never exposes the session
// directly and never runs from the browser.

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { mintHandoffToken } from '@/lib/provider-handoff'

function guarded(req: NextRequest): boolean {
  const expected = process.env.PROVIDER_HANDOFF_SECRET
  return !!expected && req.headers.get('x-handoff-secret') === expected
}

export async function POST(req: NextRequest) {
  if (!guarded(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string }
  const email = String(body.email ?? '').toLowerCase().trim()
  const password = String(body.password ?? '')
  if (!email || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })

  const { success } = rateLimit(`provider-verify:${email}`, { maxAttempts: 10, windowMs: 15 * 60 * 1000 })
  if (!success) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })

  let account = await prisma.therapistAccount.findUnique({ where: { email } })
  if (!account) account = await prisma.therapistAccount.findFirst({ where: { emailAliases: { has: email } } })
  if (!account) account = await prisma.therapistAccount.findFirst({ where: { staff: { email } } })
  if (!account || !account.isActive) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })

  const valid = await bcrypt.compare(password, account.passwordHash)
  if (!valid) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })

  return NextResponse.json({ token: mintHandoffToken(account.id) })
}
