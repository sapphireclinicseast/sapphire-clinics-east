import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GL_STAGES, parseAgency, AGENCY_ERROR, parseTreatedBranch, TREATED_ERROR } from '@/lib/gl-stage'
import { stageEventRows, movedOnProblem, movedAtFor, manilaDay } from '@/lib/gl-stage-events'

/**
 * PUT /api/accounts-receivable/gl-case/bulk
 *   { glStage?:        { value: 'BILLING' | '' , caseIds: [], walletIds: [], movedOn?: 'YYYY-MM-DD' },
 *     glReleasedAt?:   { value: 'YYYY-MM-DD',    caseIds: [], walletIds: [] },
 *     soaSubmittedAt?: { value: 'YYYY-MM-DD',    caseIds: [], walletIds: [] },
 *     soaResubmittedAt?: { value: 'YYYY-MM-DD',  caseIds: [], walletIds: [] },
 *     agency?:         { value: 'STAR' | 'ODESFA' | 'LGU' | '', caseIds: [], walletIds: [] },
 *     treatedBranch?:  { value: 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' | '', caseIds: [], walletIds: [] } }
 *
 * Detailed GL bulk edit for the ticked letters (Hannah 2026-11-11: "allow me to
 * tick all and set the stage in bulk", then "also allow bulk setting the SOA
 * submission date", "also allow bulk setting the SOA resubmission date",
 * 2026-11-12 "also allow bulk setting the GL release date", 2026-11-15 the Agency
 * column, STAR, ODESFA or LGU). The same writes as
 * editing one row: a row backed by a Detailed GL entry stores them on the entry,
 * a wallet-only row on the GL wallet. Only these fields are touched. A blank
 * stage clears it; neither SOA date can be in the future (the single-row rule in
 * ../route.ts — the GL release date has no such rule there, so none here
 * either). All in one transaction.
 *
 * `glStage.movedOn` dates the move (Hannah 2026-11-20: "make sure to take note of
 * the date of the movement to the next office"): the day the letters reached the
 * new office, today when left out. It can't be in the future or before a ticked
 * letter's previous move — unless that previous event is a BASELINE (the hub
 * only believed the letter was there), which the earlier move shows was stale,
 * so it is removed (see stage-date/route.ts).
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
    let movedOn: string | null = null
    if (stage) {
      const s = String(body.glStage.value ?? '').trim().toUpperCase()
      if (s && !(GL_STAGES as readonly string[]).includes(s)) {
        return NextResponse.json({ error: `Stage must be one of: ${GL_STAGES.join(', ')}` }, { status: 400 })
      }
      glStage = s || null
      const m = String(body.glStage.movedOn ?? '').trim().slice(0, 10)
      if (m) {
        const problem = movedOnProblem(m)
        if (problem) return NextResponse.json({ error: problem }, { status: 400 })
        movedOn = m
      }
    }
    const agencyPart = part(body.agency)
    let agency: string | null = null
    if (agencyPart) {
      const ag = parseAgency(body.agency.value)
      if (!ag.ok) return NextResponse.json({ error: AGENCY_ERROR }, { status: 400 })
      agency = ag.value
    }
    const treatedPart = part(body.treatedBranch)
    let treatedBranch: string | null = null
    if (treatedPart) {
      const tb = parseTreatedBranch(body.treatedBranch.value)
      if (!tb.ok) return NextResponse.json({ error: TREATED_ERROR }, { status: 400 })
      treatedBranch = tb.value
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
    if (!size(stage) && !size(agencyPart) && !size(treatedPart) && !dates.some(d => size(d.ids))) return NextResponse.json({ error: 'Tick at least one letter' }, { status: 400 })
    if (size(stage) > MAX || size(agencyPart) > MAX || size(treatedPart) > MAX || dates.some(d => size(d.ids) > MAX)) return NextResponse.json({ error: `At most ${MAX} letters at a time` }, { status: 400 })

    const ops = []
    let staleRemoved: { id: string; changedAt: string }[] = []
    if (stage) {
      ops.push(prisma.glCase.updateMany({ where: { id: { in: stage.caseIds } }, data: { glStage } }))
      ops.push(prisma.digitalWallet.updateMany({ where: { id: { in: stage.walletIds }, walletType: 'GL' }, data: { glStage } }))
    }
    for (const d of dates) {
      ops.push(prisma.glCase.updateMany({ where: { id: { in: d.ids.caseIds } }, data: { [d.field]: d.at } }))
      ops.push(prisma.digitalWallet.updateMany({ where: { id: { in: d.ids.walletIds }, walletType: 'GL' }, data: { [d.field]: d.at } }))
    }
    if (agencyPart) {
      ops.push(prisma.glCase.updateMany({ where: { id: { in: agencyPart.caseIds } }, data: { agency } }))
      ops.push(prisma.digitalWallet.updateMany({ where: { id: { in: agencyPart.walletIds }, walletType: 'GL' }, data: { agency } }))
    }
    if (treatedPart) {
      ops.push(prisma.glCase.updateMany({ where: { id: { in: treatedPart.caseIds } }, data: { treatedBranch } }))
      ops.push(prisma.digitalWallet.updateMany({ where: { id: { in: treatedPart.walletIds }, walletType: 'GL' }, data: { treatedBranch } }))
    }
    // Dated stage history (Hannah 2026-11-17: "track stage dates"): one event per
    // ticked letter whose stage actually changes, dated the day it moved.
    // Appended last, so the count pairs read below keep their positions.
    if (size(stage)) {
      const [curCases, curWallets, history] = await Promise.all([
        stage!.caseIds.length
          ? prisma.glCase.findMany({ where: { id: { in: stage!.caseIds } }, select: { id: true, glStage: true, walletId: true, patientName: true } })
          : Promise.resolve([]),
        stage!.walletIds.length
          ? prisma.digitalWallet.findMany({ where: { id: { in: stage!.walletIds }, walletType: 'GL' }, select: { id: true, glStage: true, patientName: true } })
          : Promise.resolve([]),
        // Each letter's previous move — a backdated move can't come before it.
        movedOn
          ? prisma.glStageEvent.findMany({
              where: { OR: [{ glCaseId: { in: stage!.caseIds } }, { walletId: { in: stage!.walletIds }, glCaseId: null }] },
              select: { id: true, glCaseId: true, walletId: true, changedAt: true, source: true },
              orderBy: { changedAt: 'asc' },
            })
          : Promise.resolve([]),
      ])
      type Last = { id: string; changedAt: Date; source: string }
      const lastCase = new Map<string, Last>()
      const lastWallet = new Map<string, Last>()
      for (const e of history) {
        if (e.glCaseId) lastCase.set(e.glCaseId, e)
        else if (e.walletId) lastWallet.set(e.walletId, e)
      }
      const changes = [
        ...curCases.map(c => ({ glCaseId: c.id, walletId: c.walletId, fromStage: c.glStage, stage: glStage, name: c.patientName, prev: lastCase.get(c.id) ?? null })),
        ...curWallets.map(w => ({ glCaseId: null as string | null, walletId: w.id, fromStage: w.glStage, stage: glStage, name: w.patientName, prev: lastWallet.get(w.id) ?? null })),
      ].filter(c => (c.fromStage ?? null) !== (c.stage ?? null))
      // A previous event that is only a BASELINE, dated after the move: stale, removed.
      const stale = movedOn ? changes.filter(c => c.prev?.source === 'BASELINE' && movedOn! < manilaDay(c.prev.changedAt)) : []
      const staleIds = new Set(stale.map(c => c.prev!.id))
      if (movedOn) {
        const early = changes.filter(c => movedOnProblem(movedOn!, { prevAt: c.prev && !staleIds.has(c.prev.id) ? c.prev.changedAt : null }))
        if (early.length) {
          const names = early.slice(0, 3).map(c => c.name).join(', ')
          return NextResponse.json({
            error: `${early.length} ticked letter${early.length === 1 ? ' was' : 's were'} moved to ${early.length === 1 ? 'its' : 'their'} current office after that date (${names}${early.length > 3 ? ', …' : ''}). Pick a later date or untick ${early.length === 1 ? 'it' : 'them'}.`,
          }, { status: 400 })
        }
      }
      const events = stageEventRows(
        changes.map(c => ({
          glCaseId: c.glCaseId, walletId: c.walletId, fromStage: c.fromStage, stage: c.stage,
          ...(movedOn ? { changedAt: movedAtFor(movedOn, c.prev && !staleIds.has(c.prev.id) ? c.prev.changedAt : null) } : {}),
        })),
        session.user.id as string, 'BULK')
      if (staleIds.size) ops.push(prisma.glStageEvent.deleteMany({ where: { id: { in: [...staleIds] }, source: 'BASELINE' } }))
      if (events.length) ops.push(prisma.glStageEvent.createMany({ data: events }))
      staleRemoved = stale.map(c => ({ id: c.prev!.id, changedAt: c.prev!.changedAt.toISOString(), ...(c.glCaseId ? { glCaseId: c.glCaseId } : { walletId: c.walletId }) }))
    }
    const counts = await prisma.$transaction(ops)
    // Two updateMany per part, in push order: stage first (if any), then each date, then agency, then treated-at.
    const pair = (i: number) => counts[2 * i].count + counts[2 * i + 1].count
    const stageUpdated = stage ? pair(0) : 0
    const dateUpdated = Object.fromEntries(dates.map((d, i) => [d.field, pair(i + (stage ? 1 : 0))]))
    const agencyUpdated = agencyPart ? pair(dates.length + (stage ? 1 : 0)) : 0
    const treatedUpdated = treatedPart ? pair(dates.length + (stage ? 1 : 0) + (agencyPart ? 1 : 0)) : 0
    await prisma.auditLog.create({
      data: {
        userId: session.user.id as string, action: 'UPDATE', entity: 'gl_case_bulk', entityId: 'detailed-gl',
        details: {
          ...(stage ? { glStage, ...(movedOn ? { movedOn } : {}), ...(staleRemoved.length ? { staleBaselinesRemoved: staleRemoved } : {}), stageCaseIds: stage.caseIds, stageWalletIds: stage.walletIds, stageUpdated } : {}),
          ...(agencyPart ? { agency, agencyCaseIds: agencyPart.caseIds, agencyWalletIds: agencyPart.walletIds, agencyUpdated } : {}),
          ...(treatedPart ? { treatedBranch, treatedCaseIds: treatedPart.caseIds, treatedWalletIds: treatedPart.walletIds, treatedUpdated } : {}),
          ...Object.fromEntries(dates.map(d => [d.field, { day: d.day, caseIds: d.ids.caseIds, walletIds: d.ids.walletIds, updated: dateUpdated[d.field] }])),
        },
      },
    })
    return NextResponse.json({ ok: true, stageUpdated, dateUpdated, agencyUpdated, treatedUpdated })
  } catch (e) {
    console.error('GL bulk edit error:', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
