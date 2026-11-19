import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { movedOnProblem, movedAtFor, manilaDay } from '@/lib/gl-stage-events'

/**
 * PATCH /api/accounts-receivable/gl-case/stage-date
 *   { caseId: string, date: 'YYYY-MM-DD' }  — a Detailed GL entry that holds its own stage
 *   { walletId: string, date: 'YYYY-MM-DD' } — a GL wallet's stage
 *
 * Sets the day a Guarantee Letter moved to the office it is at now — the Detailed
 * GL "Moved to stage on" cell (Hannah 2026-11-20: "make sure to take note of the
 * date of the movement to the next office"). A stage change is dated the moment
 * someone picks it in the hub; this corrects it to the day the letter actually
 * moved, which is often a day or two earlier.
 *
 * It edits the letter's latest stage event, which must be for the stage the
 * letter is at now. The date can't be in the future or before the letter's
 * previous move. A letter that was already at the office when stage dates began
 * (a BASELINE) can be given the real arrival day, on or before that baseline; its
 * event then reads as dated (source DATED), so the office-to-office averages can
 * measure from it.
 *
 * One exception to "not before the previous move": when the previous event is a
 * BASELINE, the hub only believed the letter was at that office. A move dated
 * before it proves the belief was stale (e.g. the 11/17 baseline said STAR
 * OFFICE, but Finance received the letter on 10/01), so that baseline is
 * removed. The old and new dates, and any baseline removed, go to the audit log.
 */
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN',
  'HMO_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const caseId = typeof body.caseId === 'string' ? body.caseId : ''
    const walletId = typeof body.walletId === 'string' ? body.walletId : ''
    const day = String(body.date ?? '').trim().slice(0, 10)
    if (!caseId === !walletId) return NextResponse.json({ error: 'Which letter?' }, { status: 400 })

    // The stage the letter is at now, from the record that holds it.
    let current: string | null = null
    if (caseId) {
      const c = await prisma.glCase.findUnique({ where: { id: caseId }, select: { glStage: true } })
      if (!c) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
      current = c.glStage
    } else {
      const w = await prisma.digitalWallet.findUnique({ where: { id: walletId }, select: { glStage: true, walletType: true } })
      if (!w || w.walletType !== 'GL') return NextResponse.json({ error: 'Letter not found' }, { status: 404 })
      current = w.glStage
    }
    if (!current) return NextResponse.json({ error: 'This letter has no stage yet' }, { status: 400 })

    // The record's own history: case events by case; wallet events are the ones
    // logged on the wallet itself (gl-stage-times indexStageEvents).
    const events = await prisma.glStageEvent.findMany({
      where: caseId ? { glCaseId: caseId } : { walletId, glCaseId: null },
      orderBy: { changedAt: 'asc' },
    })
    const last = events[events.length - 1]
    if (!last || last.stage !== current) {
      return NextResponse.json({ error: `No move to ${current} is on record for this letter. Set its stage again to start its dates.` }, { status: 409 })
    }
    const prev = events.length > 1 ? events[events.length - 2] : null
    const wasBaseline = last.source === 'BASELINE'
    const prevIsBaseline = prev?.source === 'BASELINE'
    const problem = movedOnProblem(day, {
      prevAt: prevIsBaseline ? null : prev?.changedAt ?? null,
      notAfter: wasBaseline ? last.changedAt : null,
    })
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    // A stale baseline: the letter had already left that office by `day`.
    const dropPrev = !!prev && prevIsBaseline && day < manilaDay(prev.changedAt)

    const changedAt = movedAtFor(day, dropPrev ? null : prev?.changedAt ?? null)
    const source = wasBaseline ? 'DATED' : last.source
    await prisma.$transaction([
      ...(dropPrev ? [prisma.glStageEvent.delete({ where: { id: prev!.id } })] : []),
      prisma.glStageEvent.update({ where: { id: last.id }, data: { changedAt, source } }),
      prisma.auditLog.create({
        data: {
          userId: session.user.id as string, action: 'UPDATE', entity: 'gl_stage_date', entityId: last.id,
          details: {
            ...(caseId ? { glCaseId: caseId } : { walletId }),
            stage: current, movedOn: day,
            from: last.changedAt.toISOString(), to: changedAt.toISOString(),
            ...(wasBaseline ? { wasBaseline: true } : {}),
            ...(dropPrev ? { removedStaleBaseline: { id: prev!.id, stage: prev!.stage, changedAt: prev!.changedAt.toISOString() } } : {}),
          },
        },
      }),
    ])
    return NextResponse.json({ ok: true, changedAt: changedAt.toISOString(), source })
  } catch (e) {
    console.error('GL stage date error:', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
