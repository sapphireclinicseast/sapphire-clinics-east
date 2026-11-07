// Cancellations, for the Accounting Hub's POS.
//
// When a cashier takes a cancellation fee, the till asks which cancellation it
// settles and writes the link back here. That replaces inferring "paid" from
// order-line names and dates, which could only ever say a fee had been
// collected for somebody — never which cancellation it belonged to.
//
//   GET  ?patientId=…            the patient's cancellations, settled or not
//   GET  ?q=…                    find the patient first, by name
//   POST { action: 'create' }    log a cancellation that was never recorded
//   POST { action: 'link' }      attach the payment to one
//
// Auth: x-api-key against the shared service key, the same gate the other
// inter-hub endpoints use. There is no user session at a till.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  CANCELLATION_TYPES, isCancellationType, validityFromType,
} from '@/lib/cancellation-types'

export const dynamic = 'force-dynamic'

const WINDOW_DAYS = 180

function authorised(req: NextRequest): boolean {
  const key = process.env.EXTERNAL_API_KEY ?? ''
  if (!key) return false
  return req.headers.get('x-api-key') === key
}

/** Branch ids as the Operations Hub stores them. */
function normaliseBranch(v: unknown): string | null {
  const b = String(v ?? '').trim().toUpperCase()
  return b === 'SANDBOX_EAST' || b === 'SANDBOX_GREENHILLS' ? b : null
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const patientId = (url.searchParams.get('patientId') ?? '').trim()
  const q = (url.searchParams.get('q') ?? '').trim()

  // Name search, for the common case where the POS order carries only free
  // text. Two letters would return most of the roster, so it asks for three.
  if (!patientId) {
    if (q.length < 3) {
      return NextResponse.json({ patients: [], note: 'Type at least three letters.' })
    }
    const parts = q.split(/\s+/).filter(Boolean)
    const patients = await prisma.patient.findMany({
      where: {
        AND: parts.map((t) => ({
          OR: [
            { firstName: { contains: t, mode: 'insensitive' as const } },
            { lastName: { contains: t, mode: 'insensitive' as const } },
          ],
        })),
      },
      select: { id: true, firstName: true, lastName: true, branches: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 15,
    })
    return NextResponse.json({ patients })
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const logs = await prisma.cancellationLog.findMany({
    where: { patientId, deletedAt: null, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, type: true, branch: true, remarks: true, createdAt: true,
      sourceStatus: true, countsToward: true,
      paidOrderId: true, paidOrderNumber: true, paidAmount: true, feePaidAt: true,
    },
  })

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, firstName: true, lastName: true, branches: true },
  })

  return NextResponse.json({
    patient,
    types: CANCELLATION_TYPES,
    // Everything in the window, with its state — the till shows unsettled ones
    // first but must be able to show that a cancellation is already linked,
    // or the cashier links a second payment to it.
    cancellations: logs.map((l) => ({
      ...l,
      // Reschedules and waived entries are logged but never chargeable; the
      // till should not offer them as something a fee settles.
      chargeable: l.sourceStatus !== 'RESCHEDULED' && l.countsToward !== false,
      settled: !!l.paidOrderId,
    })),
  })
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '')

  // ── Record a cancellation that was never logged ───────────────────────────
  // East charges more cancellation fees than it logs cancellations, so a
  // cashier will regularly be holding a fee with nothing to attach it to.
  // Rather than let them skip the link, they log it here and pick how it is
  // classified — the same six the Patient Relationship tab offers.
  if (action === 'create') {
    const patientId = String(body.patientId ?? '').trim()
    const type = body.type
    const branch = normaliseBranch(body.branch)

    if (!patientId) return NextResponse.json({ error: 'patientId is required' }, { status: 400 })
    if (!isCancellationType(type)) {
      return NextResponse.json(
        { error: 'Choose how this cancellation is classified', types: CANCELLATION_TYPES },
        { status: 400 },
      )
    }
    if (!branch) return NextResponse.json({ error: 'branch is required' }, { status: 400 })

    const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } })
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

    const log = await prisma.cancellationLog.create({
      data: {
        patientId,
        type,
        branch,
        isValid: validityFromType(type),
        // Said plainly on the log, because this one did not come from front
        // desk noticing a cancellation — it came from money arriving.
        remarks: String(body.remarks ?? '').trim() || 'Logged at the POS when the fee was paid',
        sourceStatus: 'CANCELLED',
        countsToward: true,
      },
    })
    return NextResponse.json({ ok: true, log })
  }

  // ── Attach the payment to a cancellation ──────────────────────────────────
  if (action === 'link') {
    const logId = String(body.logId ?? '').trim()
    const orderId = String(body.orderId ?? '').trim()
    if (!logId || !orderId) {
      return NextResponse.json({ error: 'logId and orderId are required' }, { status: 400 })
    }

    const log = await prisma.cancellationLog.findUnique({
      where: { id: logId },
      select: { id: true, deletedAt: true, paidOrderId: true, paidOrderNumber: true },
    })
    if (!log || log.deletedAt) {
      return NextResponse.json({ error: 'Cancellation not found' }, { status: 404 })
    }
    // Already settled by a DIFFERENT order: refuse rather than overwrite, or
    // one cancellation silently absorbs two payments and the second patient's
    // fee looks unpaid for ever.
    if (log.paidOrderId && log.paidOrderId !== orderId) {
      return NextResponse.json({
        error: `Already settled by order #${log.paidOrderNumber ?? '—'}. Pick another cancellation, or record a new one.`,
      }, { status: 409 })
    }

    const amount = Number(body.amount)
    const updated = await prisma.cancellationLog.update({
      where: { id: logId },
      data: {
        paidOrderId: orderId,
        paidOrderNumber: Number.isFinite(Number(body.orderNumber)) ? Number(body.orderNumber) : null,
        paidLineName: String(body.lineName ?? '').trim() || null,
        paidAmount: Number.isFinite(amount) ? amount : null,
        paidByName: String(body.paidByName ?? '').trim() || null,
        feePaidAt: new Date(),
      },
      select: { id: true, paidOrderNumber: true, feePaidAt: true },
    })
    return NextResponse.json({ ok: true, log: updated })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
