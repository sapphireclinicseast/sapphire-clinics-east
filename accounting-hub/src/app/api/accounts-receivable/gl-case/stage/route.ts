import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GL_STAGES } from '@/lib/gl-stage'

/**
 * PUT /api/accounts-receivable/gl-case/stage  { glStage, caseIds: [], walletIds: [] }
 *
 * Detailed GL bulk stage (Hannah 2026-11-11: "allow me to tick all and set the
 * stage in bulk"). The same write as picking a stage on one row: a row backed by
 * a Detailed GL entry stores it on the entry, a wallet-only row on the GL wallet.
 * Stage only — nothing else on the letter is touched. Blank glStage clears it.
 */
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN',
  'HMO_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const MAX = 1000

const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x))] : [])

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const s = String(body.glStage ?? '').trim().toUpperCase()
    if (s && !(GL_STAGES as readonly string[]).includes(s)) {
      return NextResponse.json({ error: `Stage must be one of: ${GL_STAGES.join(', ')}` }, { status: 400 })
    }
    const glStage = s || null
    const caseIds = ids(body.caseIds)
    const walletIds = ids(body.walletIds)
    if (!caseIds.length && !walletIds.length) return NextResponse.json({ error: 'Tick at least one letter' }, { status: 400 })
    if (caseIds.length + walletIds.length > MAX) return NextResponse.json({ error: `At most ${MAX} letters at a time` }, { status: 400 })

    const [cases, wallets] = await prisma.$transaction([
      prisma.glCase.updateMany({ where: { id: { in: caseIds } }, data: { glStage } }),
      prisma.digitalWallet.updateMany({ where: { id: { in: walletIds }, walletType: 'GL' }, data: { glStage } }),
    ])
    await prisma.auditLog.create({
      data: {
        userId: session.user.id as string, action: 'UPDATE', entity: 'gl_stage_bulk', entityId: glStage || 'cleared',
        details: { glStage, caseIds, walletIds, updated: cases.count + wallets.count },
      },
    })
    return NextResponse.json({ ok: true, updated: cases.count + wallets.count })
  } catch (e) {
    console.error('GL bulk stage error:', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
