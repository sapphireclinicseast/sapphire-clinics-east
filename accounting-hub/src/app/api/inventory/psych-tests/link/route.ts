import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * The shareable edit token for the external psych-tests page.
 *
 * The link grants WRITE access to the register without a hub login, so only
 * the hub's write roles may read it, and regenerating it is the kill switch
 * when a link leaks or a psych head leaves.
 */

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

const newToken = () => crypto.randomBytes(9).toString('base64url') // ~12 chars, unguessable

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const row = await prisma.psychTestSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', editToken: newToken() },
    update: {},
  })
  return NextResponse.json({ token: row.editToken })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  if (!body?.regenerate) return NextResponse.json({ error: 'Nothing to do' }, { status: 400 })
  const token = newToken()
  const row = await prisma.psychTestSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', editToken: token },
    update: { editToken: token },
  })
  return NextResponse.json({ token: row.editToken })
}
