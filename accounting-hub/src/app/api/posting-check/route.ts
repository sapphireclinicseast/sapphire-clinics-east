import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { posGlStatus, runPosGlCheck } from '@/lib/accounting/pos-gl-check'

// POS ↔ ledger posting check (lib/accounting/pos-gl-check).
//   GET            → live status: what needs a person + what the next run will fix
//   GET ?alerts=1  → the bell: just the needs-a-person list
//   POST           → run now: fix the safe cases, record the run. The nightly
//                    cron (/usr/local/bin/scei-pos-gl-check.sh, 01:30) calls it
//                    with x-internal-secret; Admin/Accountant can run it too.
const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const RUN_ROLES = ['ADMIN', 'ACCOUNTANT']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  try {
    const status = await posGlStatus(prisma, sp.get('fresh') === '1')
    if (sp.get('alerts') === '1') return NextResponse.json({ exceptions: status.exceptions })
    return NextResponse.json(status)
  } catch (e) {
    console.error('[posting-check] status failed', e)
    return NextResponse.json({ error: 'Posting check failed' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const internalSecret = process.env.NEXTAUTH_SECRET
  const isInternal = !!internalSecret && req.headers.get('x-internal-secret') === internalSecret
  const session = isInternal ? null : await auth()
  if (!isInternal && (!session?.user || !RUN_ROLES.includes(session.user.role as string))) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  let actorId = session?.user?.id as string | undefined
  if (!actorId) {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true }, orderBy: { createdAt: 'asc' } })
    actorId = admin?.id
    if (!actorId) return NextResponse.json({ error: 'no admin user to run as' }, { status: 500 })
  }
  try {
    return NextResponse.json(await runPosGlCheck(prisma, actorId))
  } catch (e) {
    console.error('[posting-check] run failed', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Posting check failed' }, { status: 500 })
  }
}
