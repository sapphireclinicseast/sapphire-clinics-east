// GET  /api/accounts-receivable/gl-link?walletId=   the letter, its sessions, and the
//                                                   same person's sessions on no letter
// POST /api/accounts-receivable/gl-link  { walletId, paymentIds, action?: 'link'|'unlink' }
//
// Attaches GL sessions that sit on no letter (OrderPayment.walletId null) to the
// Guarantee Letter they used (Hannah 2026-11-18: "Link GL sessions to their
// guarantee letters"). Most of 2025's GL sessions, and a quarter of 2026's, came in
// with no letter, so their letters show nothing consumed on AR → GL.
//
// It moves ONLY the payment line's letter link. No journal entry, no letter
// balance, no approved amount: the POS edit would also decrement the letter's
// balance, which for letters already closed by hand (balance 0) goes negative.
// Every link is written to the audit log per payment line, and only lines linked
// here can be unlinked here — a session the POS attached also moved the balance.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { samePerson, suggestedSessions, GL_LINK_ROLES } from '@/lib/gl-link'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER']
const LINK = 'GL_SESSION_LINK'
const UNLINK = 'GL_SESSION_UNLINK'

const n = (v: unknown) => Number(v ?? 0) || 0
const r2 = (v: number) => Math.round(v * 100) / 100

const SESSION_SELECT = {
  id: true, amount: true, walletId: true,
  order: {
    select: {
      id: true, orderNumber: true, transactionDate: true, status: true, patientName: true,
      clinicianName: true, branch: true, items: { select: { name: true } },
    },
  },
} as const

type Line = {
  id: string; amount: unknown; walletId: string | null
  order: { id: string; orderNumber: number; transactionDate: Date; status: string; patientName: string | null; clinicianName: string | null; branch: string | null; items: { name: string }[] }
}

const shape = (l: Line) => ({
  paymentId: l.id,
  orderId: l.order.id,
  orderNumber: l.order.orderNumber,
  date: l.order.transactionDate.toISOString(),
  status: l.order.status,
  patientName: l.order.patientName || '',
  clinician: l.order.clinicianName || '',
  branch: l.order.branch || '',
  items: l.order.items.map(i => i.name).join('; '),
  amount: n(l.amount),
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const walletId = new URL(req.url).searchParams.get('walletId') || ''
  if (!walletId) return NextResponse.json({ error: 'walletId is required' }, { status: 400 })
  try {
    const w = await prisma.digitalWallet.findUnique({
      where: { id: walletId },
      select: { id: true, patientName: true, walletType: true, agency: true, glLetterNo: true, totalGlAmount: true, dateObtained: true, createdAt: true, branch: true },
    })
    if (!w || w.walletType !== 'GL') return NextResponse.json({ error: 'Guarantee Letter not found' }, { status: 404 })

    const [linkedRaw, looseRaw, pays] = await Promise.all([
      prisma.orderPayment.findMany({ where: { walletId, method: 'GL', order: { status: { not: 'VOIDED' } } }, select: SESSION_SELECT }),
      prisma.orderPayment.findMany({ where: { walletId: null, method: 'GL', order: { status: { not: 'VOIDED' } } }, select: SESSION_SELECT }),
      prisma.aRPayment.findMany({ where: { walletId }, select: { amount: true, discount: true, overpayment: true } }),
    ]) as unknown as [Line[], Line[], { amount: unknown; discount: unknown; overpayment: unknown }[]]

    // Lines linked here (and so unlinkable here): the newest link/unlink audit per line.
    const linkedIds = linkedRaw.map(l => l.id)
    const audits = linkedIds.length
      ? await prisma.auditLog.findMany({
          where: { entity: 'orderPayment', entityId: { in: linkedIds }, action: { in: [LINK, UNLINK] } },
          orderBy: { createdAt: 'desc' },
          select: { entityId: true, action: true, details: true },
        })
      : []
    const viaHere = new Set<string>()
    const seen = new Set<string>()
    for (const a of audits) {
      if (!a.entityId || seen.has(a.entityId)) continue
      seen.add(a.entityId)
      const d = a.details as { walletId?: string } | null
      if (a.action === LINK && d?.walletId === walletId) viaHere.add(a.entityId)
    }

    const approved = n(w.totalGlAmount)
    const linked = linkedRaw.map(l => ({ ...shape(l), linkedHere: viaHere.has(l.id) }))
      .sort((a, b) => a.date.localeCompare(b.date))
    const alreadyLinked = r2(linked.reduce((s, l) => s + l.amount, 0))
    const loose = looseRaw.filter(l => samePerson(w.patientName, l.order.patientName || ''))
    // The same person's earlier letters claim their run first, so a 2nd application
    // does not pre-tick the sessions its 1st application used.
    const obtainedAt = (x: { dateObtained: Date | null; createdAt: Date }) => (x.dateObtained ?? x.createdAt).getTime()
    const earlier = (await prisma.digitalWallet.findMany({
      where: { walletType: 'GL', id: { not: walletId } },
      select: { id: true, patientName: true, totalGlAmount: true, dateObtained: true, createdAt: true },
    })).filter(o => samePerson(w.patientName, o.patientName) && obtainedAt(o) < obtainedAt(w))
      .sort((a, b) => obtainedAt(a) - obtainedAt(b))
    let pool = loose.map(l => ({ id: l.id, date: l.order.transactionDate, amount: n(l.amount) }))
    if (earlier.length) {
      const onEarlier = await prisma.orderPayment.groupBy({
        by: ['walletId'], where: { walletId: { in: earlier.map(o => o.id) }, method: 'GL', order: { status: { not: 'VOIDED' } } }, _sum: { amount: true },
      })
      const usedBy = new Map(onEarlier.map(g => [g.walletId, n(g._sum.amount)]))
      for (const o of earlier) {
        const claimed = suggestedSessions(pool, { approved: n(o.totalGlAmount), alreadyLinked: usedBy.get(o.id) ?? 0, obtained: o.dateObtained ?? o.createdAt })
        pool = pool.filter(c => !claimed.has(c.id))
      }
    }
    const suggested = suggestedSessions(pool, { approved, alreadyLinked, obtained: w.dateObtained ?? w.createdAt })
    const candidates = loose.map(l => ({ ...shape(l), suggested: suggested.has(l.id) }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({
      letter: {
        id: w.id, name: w.patientName, agency: w.agency || '', glLetterNo: w.glLetterNo || '',
        branch: w.branch || '', approved,
        obtained: (w.dateObtained ?? w.createdAt)?.toISOString() ?? null,
        paid: r2(pays.reduce((s, p) => s + n(p.amount) + n(p.discount) - n(p.overpayment), 0)),
        linkedTotal: alreadyLinked,
      },
      linked,
      candidates,
    })
  } catch (err) {
    console.error('[AR] gl-link GET failed:', err)
    return NextResponse.json({ error: 'Could not load the letter\'s sessions' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !GL_LINK_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const walletId = typeof body.walletId === 'string' ? body.walletId : ''
    const action: 'link' | 'unlink' = body.action === 'unlink' ? 'unlink' : 'link'
    const ids: string[] = Array.isArray(body.paymentIds)
      ? [...new Set((body.paymentIds as unknown[]).filter((x): x is string => typeof x === 'string' && !!x))]
      : []
    if (!walletId || !ids.length) return NextResponse.json({ error: 'Send the letter and at least one session' }, { status: 400 })
    if (ids.length > 500) return NextResponse.json({ error: 'Link at most 500 sessions at a time' }, { status: 400 })

    const w = await prisma.digitalWallet.findUnique({ where: { id: walletId }, select: { id: true, walletType: true, patientName: true } })
    if (!w || w.walletType !== 'GL') return NextResponse.json({ error: 'Guarantee Letter not found' }, { status: 404 })

    const lines = await prisma.orderPayment.findMany({
      where: { id: { in: ids } },
      select: { id: true, method: true, walletId: true, amount: true, order: { select: { orderNumber: true, status: true } } },
    })
    if (lines.length !== ids.length) return NextResponse.json({ error: 'Some sessions no longer exist — reload and try again' }, { status: 409 })

    if (action === 'link') {
      const bad = lines.filter(l => l.method !== 'GL' || l.walletId !== null || l.order.status === 'VOIDED')
      if (bad.length) {
        return NextResponse.json({ error: `Only GL sessions on no letter can be linked — #${bad.map(b => b.order.orderNumber).join(', #')} ${bad.length === 1 ? 'is' : 'are'} not` }, { status: 409 })
      }
    } else {
      const notHere = lines.filter(l => l.walletId !== walletId)
      if (notHere.length) return NextResponse.json({ error: `#${notHere.map(b => b.order.orderNumber).join(', #')} ${notHere.length === 1 ? 'is' : 'are'} not on this letter` }, { status: 409 })
      const audits = await prisma.auditLog.findMany({
        where: { entity: 'orderPayment', entityId: { in: ids }, action: { in: [LINK, UNLINK] } },
        orderBy: { createdAt: 'desc' },
        select: { entityId: true, action: true, details: true },
      })
      const latest = new Map<string, { action: string; walletId?: string }>()
      for (const a of audits) if (a.entityId && !latest.has(a.entityId)) latest.set(a.entityId, { action: a.action, walletId: (a.details as { walletId?: string } | null)?.walletId })
      const posLinked = lines.filter(l => { const a = latest.get(l.id); return !(a && a.action === LINK && a.walletId === walletId) })
      if (posLinked.length) {
        return NextResponse.json({ error: `#${posLinked.map(b => b.order.orderNumber).join(', #')} ${posLinked.length === 1 ? 'was' : 'were'} put on this letter at the till (which also moved its balance) — change ${posLinked.length === 1 ? 'it' : 'them'} in POS instead` }, { status: 409 })
      }
    }

    // Guarded write: only lines still in the state checked above change.
    const res = await prisma.orderPayment.updateMany({
      where: action === 'link'
        ? { id: { in: ids }, method: 'GL', walletId: null }
        : { id: { in: ids }, method: 'GL', walletId },
      data: { walletId: action === 'link' ? walletId : null },
    })
    if (res.count !== ids.length) {
      console.error(`[AR] gl-link ${action}: expected ${ids.length}, changed ${res.count}`)
    }
    await prisma.auditLog.createMany({
      data: lines.map(l => ({
        userId: session.user.id as string,
        action: action === 'link' ? LINK : UNLINK,
        entity: 'orderPayment',
        entityId: l.id,
        details: { walletId, letter: w.patientName, orderNumber: l.order.orderNumber, amount: n(l.amount) },
      })),
    })
    return NextResponse.json({ ok: true, changed: res.count, total: r2(lines.reduce((s, l) => s + n(l.amount), 0)) })
  } catch (err) {
    console.error('[AR] gl-link POST failed:', err)
    return NextResponse.json({ error: 'Could not update the sessions' }, { status: 500 })
  }
}
