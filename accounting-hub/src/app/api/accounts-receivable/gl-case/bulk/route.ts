import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GL_STAGES } from '@/lib/gl-stage'

/**
 * PUT /api/accounts-receivable/gl-case/bulk
 *   { glStage?:        { value: 'BILLING' | '' , caseIds: [], walletIds: [] },
 *     soaSubmittedAt?: { value: 'YYYY-MM-DD',    caseIds: [], walletIds: [] } }
 *
 * Detailed GL bulk edit for the ticked letters (Hannah 2026-11-11: "allow me to
 * tick all and set the stage in bulk", then "also allow bulk setting the SOA
 * submission date"). The same writes as editing one row: a row backed by a
 * Detailed GL entry stores them on the entry, a wallet-only row on the GL wallet.
 * Only these two fields are touched. A blank stage clears it; the SOA date can't
 * be in the future (the single-row rule in ../route.ts). All in one transaction.
 */
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN',
  'HMO_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const MAX = 1000
const YMD = /^\d{4}-\d{2}-\d{2}$/

type Part = { caseIds: string[]; walletIds: string[] }
const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x))] : [])
const part = (v: unknown): Part | null => {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  return { caseIds: ids(o.caseIds), walletIds: ids(o.walletIds) }
}
const size = (p: Part | null) => (p ? p.caseIds.length + p.walletIds.length : 0)

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const stage = part(body.glStage)
    const soa = part(body.soaSubmittedAt)

    let glStage: string | null = null
    if (stage) {
      const s = String(body.glStage.value ?? '').trim().toUpperCase()
      if (s && !(GL_STAGES as readonly string[]).includes(s)) {
        return NextResponse.json({ error: `Stage must be one of: ${GL_STAGES.join(', ')}` }, { status: 400 })
      }
      glStage = s || null
    }
    let soaDate: Date | null = null
    if (soa) {
      const d = String(body.soaSubmittedAt.value ?? '').slice(0, 10)
      if (!YMD.test(d)) return NextResponse.json({ error: 'Pick the SOA submission date' }, { status: 400 })
      const todayManila = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
      if (d > todayManila) {
        return NextResponse.json({ error: 'The SOA submission date is in the future. Record it once the SOA has actually been submitted.' }, { status: 400 })
      }
      soaDate = new Date(`${d}T00:00:00+08:00`)
    }
    if (!size(stage) && !size(soa)) return NextResponse.json({ error: 'Tick at least one letter' }, { status: 400 })
    if (size(stage) > MAX || size(soa) > MAX) return NextResponse.json({ error: `At most ${MAX} letters at a time` }, { status: 400 })

    const ops = []
    if (stage) {
      ops.push(prisma.glCase.updateMany({ where: { id: { in: stage.caseIds } }, data: { glStage } }))
      ops.push(prisma.digitalWallet.updateMany({ where: { id: { in: stage.walletIds }, walletType: 'GL' }, data: { glStage } }))
    }
    if (soa) {
      ops.push(prisma.glCase.updateMany({ where: { id: { in: soa.caseIds } }, data: { soaSubmittedAt: soaDate } }))
      ops.push(prisma.digitalWallet.updateMany({ where: { id: { in: soa.walletIds }, walletType: 'GL' }, data: { soaSubmittedAt: soaDate } }))
    }
    const counts = await prisma.$transaction(ops)
    const stageUpdated = stage ? counts[0].count + counts[1].count : 0
    const soaUpdated = soa ? counts[stage ? 2 : 0].count + counts[stage ? 3 : 1].count : 0
    await prisma.auditLog.create({
      data: {
        userId: session.user.id as string, action: 'UPDATE', entity: 'gl_case_bulk', entityId: 'detailed-gl',
        details: {
          ...(stage ? { glStage, stageCaseIds: stage.caseIds, stageWalletIds: stage.walletIds, stageUpdated } : {}),
          ...(soa ? { soaSubmittedAt: body.soaSubmittedAt.value, soaCaseIds: soa.caseIds, soaWalletIds: soa.walletIds, soaUpdated } : {}),
        },
      },
    })
    return NextResponse.json({ ok: true, stageUpdated, soaUpdated })
  } catch (e) {
    console.error('GL bulk edit error:', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
