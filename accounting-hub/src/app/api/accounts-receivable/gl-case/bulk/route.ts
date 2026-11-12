import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GL_STAGES } from '@/lib/gl-stage'

/**
 * PUT /api/accounts-receivable/gl-case/bulk
 *   { glStage?:        { value: 'BILLING' | '' , caseIds: [], walletIds: [] },
 *     glReleasedAt?:   { value: 'YYYY-MM-DD',    caseIds: [], walletIds: [] },
 *     soaSubmittedAt?: { value: 'YYYY-MM-DD',    caseIds: [], walletIds: [] },
 *     soaResubmittedAt?: { value: 'YYYY-MM-DD',  caseIds: [], walletIds: [] } }
 *
 * Detailed GL bulk edit for the ticked letters (Hannah 2026-11-11: "allow me to
 * tick all and set the stage in bulk", then "also allow bulk setting the SOA
 * submission date", "also allow bulk setting the SOA resubmission date",
 * 2026-11-12 "also allow bulk setting the GL release date"). The same writes as
 * editing one row: a row backed by a Detailed GL entry stores them on the entry,
 * a wallet-only row on the GL wallet. Only these fields are touched. A blank
 * stage clears it; neither SOA date can be in the future (the single-row rule in
 * ../route.ts — the GL release date has no such rule there, so none here
 * either). All in one transaction.
 */
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN',
  'HMO_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const MAX = 1000
const YMD = /^\d{4}-\d{2}-\d{2}$/
const DATE_FIELDS = ['glReleasedAt', 'soaSubmittedAt', 'soaResubmittedAt'] as const
type DateField = typeof DATE_FIELDS[number]
const DATE_LABEL: Record<DateField, string> = {
  glReleasedAt: 'GL release date', soaSubmittedAt: 'SOA submission date', soaResubmittedAt: 'SOA resubmission date',
}
const NO_FUTURE: readonly DateField[] = ['soaSubmittedAt', 'soaResubmittedAt']

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

    let glStage: string | null = null
    if (stage) {
      const s = String(body.glStage.value ?? '').trim().toUpperCase()
      if (s && !(GL_STAGES as readonly string[]).includes(s)) {
        return NextResponse.json({ error: `Stage must be one of: ${GL_STAGES.join(', ')}` }, { status: 400 })
      }
      glStage = s || null
    }
    const todayManila = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    const dates: { field: DateField; day: string; at: Date; ids: Part }[] = []
    for (const field of DATE_FIELDS) {
      const ids = part(body[field])
      if (!ids) continue
      const day = String(body[field].value ?? '').slice(0, 10)
      if (!YMD.test(day)) return NextResponse.json({ error: `Pick the ${DATE_LABEL[field]}` }, { status: 400 })
      if (NO_FUTURE.includes(field) && day > todayManila) {
        return NextResponse.json({ error: `The ${DATE_LABEL[field]} is in the future. Record it once it has actually happened.` }, { status: 400 })
      }
      dates.push({ field, day, at: new Date(`${day}T00:00:00+08:00`), ids })
    }
    if (!size(stage) && !dates.some(d => size(d.ids))) return NextResponse.json({ error: 'Tick at least one letter' }, { status: 400 })
    if (size(stage) > MAX || dates.some(d => size(d.ids) > MAX)) return NextResponse.json({ error: `At most ${MAX} letters at a time` }, { status: 400 })

    const ops = []
    if (stage) {
      ops.push(prisma.glCase.updateMany({ where: { id: { in: stage.caseIds } }, data: { glStage } }))
      ops.push(prisma.digitalWallet.updateMany({ where: { id: { in: stage.walletIds }, walletType: 'GL' }, data: { glStage } }))
    }
    for (const d of dates) {
      ops.push(prisma.glCase.updateMany({ where: { id: { in: d.ids.caseIds } }, data: { [d.field]: d.at } }))
      ops.push(prisma.digitalWallet.updateMany({ where: { id: { in: d.ids.walletIds }, walletType: 'GL' }, data: { [d.field]: d.at } }))
    }
    const counts = await prisma.$transaction(ops)
    // Two updateMany per part, in push order: stage first (if any), then each date.
    const pair = (i: number) => counts[2 * i].count + counts[2 * i + 1].count
    const stageUpdated = stage ? pair(0) : 0
    const dateUpdated = Object.fromEntries(dates.map((d, i) => [d.field, pair(i + (stage ? 1 : 0))]))
    await prisma.auditLog.create({
      data: {
        userId: session.user.id as string, action: 'UPDATE', entity: 'gl_case_bulk', entityId: 'detailed-gl',
        details: {
          ...(stage ? { glStage, stageCaseIds: stage.caseIds, stageWalletIds: stage.walletIds, stageUpdated } : {}),
          ...Object.fromEntries(dates.map(d => [d.field, { day: d.day, caseIds: d.ids.caseIds, walletIds: d.ids.walletIds, updated: dateUpdated[d.field] }])),
        },
      },
    })
    return NextResponse.json({ ok: true, stageUpdated, dateUpdated })
  } catch (e) {
    console.error('GL bulk edit error:', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
