/**
 * Meet gate: does this email belong to a WORKING Staff Portal account?
 *
 * Used by meet.sapphireclinicseast.org before it lets someone create a
 * meeting link. Having an HR Staff Profile is not enough — the person must
 * have an active TherapistAccount here (not every profile has one).
 *
 * POST { email }
 *   → { ok: true,  name, branch, accountType }
 *   → { ok: false, reason: 'no-account' | 'disabled' }
 *
 * Matches the same way sign-in does: current login email, an old alias, or
 * the Staff (HR/Ops) email. Auth: Bearer $EXTERNAL_API_KEY.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function authorized(req: Request): boolean {
  const key = process.env.EXTERNAL_API_KEY
  return !!key && req.headers.get('authorization') === `Bearer ${key}`
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { email?: unknown } = {}
  try { body = await req.json() } catch { /* fall through */ }
  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : ''
  if (!email || !email.includes('@')) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const include = { staff: { select: { firstName: true, lastName: true, branch: true } } } as const
  let account = await prisma.therapistAccount.findUnique({ where: { email }, include })
  if (!account) account = await prisma.therapistAccount.findFirst({ where: { emailAliases: { has: email } }, include })
  if (!account) account = await prisma.therapistAccount.findFirst({ where: { staff: { email } }, include })

  if (!account) return NextResponse.json({ ok: false, reason: 'no-account' })
  if (!account.isActive) return NextResponse.json({ ok: false, reason: 'disabled' })

  return NextResponse.json({
    ok: true,
    name: `${account.staff.firstName} ${account.staff.lastName}`.trim(),
    branch: account.staff.branch,
    accountType: account.accountType,
  })
}
