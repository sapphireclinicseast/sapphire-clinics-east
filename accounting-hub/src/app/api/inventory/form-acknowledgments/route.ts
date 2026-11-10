import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { controlToInt, rangeQuantity, coveredByUnion, toIntervals } from '@/lib/form-ranges'
import { ACK_DELETE_ROLES, ACK_ITEMS, ACK_VIEW_ROLES, ACK_WRITE_ROLES, DEFAULT_DELIVERED_BY_TITLE, resolveAckBranch } from '@/lib/form-ack'
import { buildAndStoreAckPdf, deleteAcknowledgment } from '@/lib/form-ack-store'

// Signed acknowledgments from the med rep link (/acknowledge/<branch>).
// The link needs the med rep's own hub login (not a shared token): every
// signed delivery is attributed to a real account, the Delivered-by name can't
// be typed in by anyone holding the link, and access ends when the account is
// disabled. Submitting adds Partner Distribution rows for the referral pads,
// which draw down that branch's on-hand exactly like a manual row.

const MAX_PAD_RANGES = 6
const MAX_PCS_PER_RANGE = 5000
const ITEM_KEYS: string[] = ACK_ITEMS.map((i) => i.key)

const str = (v: unknown, max = 160) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

// Everything but the signature (the list stays light; the signature is served by /[id]).
const LIST_SELECT = {
  id: true, branch: true, recipientKind: true, partnerId: true, partnerName: true, institution: true,
  recipientName: true, recipientDesignation: true, receivedBy: true, receivedByDesignation: true,
  items: true, remarks: true, signedAt: true, deliveredById: true, deliveredByName: true,
  deliveredByTitle: true, pdfFile: true, createdAt: true,
} as const

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ACK_VIEW_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const branch = resolveAckBranch(new URL(req.url).searchParams.get('branch'))?.branch
  const data = await prisma.formAcknowledgment.findMany({
    where: branch ? { branch } : {},
    select: LIST_SELECT,
    orderBy: { signedAt: 'desc' },
  })
  return NextResponse.json({ data })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Your sign-in has expired — sign in again', signedOut: true }, { status: 401 })
  if (!ACK_WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Your account cannot record acknowledgments' }, { status: 403 })
  }
  // JWT sessions outlive a disabled account; re-check the account itself.
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, disabled: true } })
  if (!me || me.disabled) return NextResponse.json({ error: 'Your account is disabled' }, { status: 403 })

  try {
    const body = await req.json()
    const b = resolveAckBranch(body.branch)
    if (!b) return NextResponse.json({ error: 'Unknown branch' }, { status: 400 })

    const items = Array.from(new Set((Array.isArray(body.items) ? body.items : []).filter((k: unknown) => typeof k === 'string' && ITEM_KEYS.includes(k)))) as string[]
    if (!items.length) return NextResponse.json({ error: 'Tick at least one item received' }, { status: 400 })

    const kind = body.recipientKind === 'SCHOOL' ? 'SCHOOL' : 'DOCTOR'
    const institution = str(body.institution)
    const recipientName = str(body.recipientName)
    const recipientDesignation = str(body.recipientDesignation)
    const receivedBy = str(body.receivedBy)
    const receivedByDesignation = str(body.receivedByDesignation)
    const remarks = str(body.remarks, 500)
    const deliveredByTitle = str(body.deliveredByTitle, 80) || DEFAULT_DELIVERED_BY_TITLE
    const partnerName = str(body.partnerName) || (kind === 'SCHOOL' ? institution : recipientName)
    if (!partnerName) {
      return NextResponse.json({ error: kind === 'SCHOOL' ? 'Enter the school / institution' : 'Enter the recipient (doctor) name' }, { status: 400 })
    }
    if (!recipientName && !receivedBy) return NextResponse.json({ error: 'Enter who received the items' }, { status: 400 })

    // Keep a partner id only when it really is that doctor (schools come from HR live).
    let partnerId: string | null = str(body.partnerId, 64) || null
    if (partnerId && kind === 'DOCTOR') {
      const doc = await prisma.referrer.findUnique({ where: { id: partnerId }, select: { name: true } })
      if (!doc || doc.name.trim().toLowerCase() !== partnerName.toLowerCase()) partnerId = null
    }

    // Referral pads (control-number ranges) — only when Referral Pad is ticked.
    const pads: Array<{ formType: string; fromControl: string; toControl: string; quantity: number; a: number; b: number }> = []
    if (items.includes('REFERRAL_PAD')) {
      const raw = Array.isArray(body.pads) ? body.pads : []
      if (!raw.length) return NextResponse.json({ error: 'Enter the referral pad form and control numbers' }, { status: 400 })
      if (raw.length > MAX_PAD_RANGES) return NextResponse.json({ error: `At most ${MAX_PAD_RANGES} pad ranges per acknowledgment` }, { status: 400 })
      for (const [i, p] of raw.entries()) {
        const formType = str(p?.formType, 60), fromControl = str(p?.fromControl, 30), toControl = str(p?.toControl, 30)
        const quantity = rangeQuantity(fromControl, toControl)
        if (!formType || quantity == null) {
          return NextResponse.json({ error: `Pad range ${i + 1}: pick the form and enter a valid From # / To # (To must be ≥ From)` }, { status: 400 })
        }
        if (quantity > MAX_PCS_PER_RANGE) {
          return NextResponse.json({ error: `Pad range ${i + 1}: ${quantity.toLocaleString('en-PH')} pcs looks like a typo — check the control numbers` }, { status: 400 })
        }
        const a = controlToInt(fromControl)!, bb = controlToInt(toControl)!
        if (pads.some((q) => q.formType === formType && q.a <= bb && q.b >= a)) {
          return NextResponse.json({ error: `Pad range ${i + 1} overlaps another range on this form` }, { status: 400 })
        }
        pads.push({ formType, fromControl, toControl, quantity, a, b: bb })
      }
    }

    const sig = typeof body.signaturePng === 'string' ? body.signaturePng : ''
    const sigBytes = sig.startsWith('data:image/png;base64,') && sig.length <= 1_500_000 ? Buffer.from(sig.slice(22), 'base64') : null
    if (!sigBytes || sigBytes.length < 200 || sigBytes.toString('ascii', 1, 4) !== 'PNG') {
      return NextResponse.json({ error: 'The doctor / secretary signature is missing' }, { status: 400 })
    }

    // Same rule as a manual Partner Distribution row: pads never recorded as
    // received need the receipt recorded too, or nothing is saved.
    const types = Array.from(new Set(pads.map((p) => p.formType)))
    const receipts = types.length
      ? await prisma.formReceipt.findMany({ where: { branch: b.branch, formType: { in: types } }, select: { formType: true, fromControl: true, toControl: true } })
      : []
    const uncovered = pads.filter((p) => !coveredByUnion(toIntervals(receipts.filter((r) => r.formType === p.formType)), p.a, p.b))
    if (uncovered.length && !body.alsoRecordReceipt) {
      return NextResponse.json({
        needsReceipt: true,
        uncovered: uncovered.map(({ formType, fromControl, toControl, quantity }) => ({ formType, fromControl, toControl, quantity })),
        error: `These control numbers are not recorded as received at ${b.shortName}`,
      }, { status: 409 })
    }

    const now = new Date()
    const id = `ack${randomUUID().replace(/-/g, '').slice(0, 22)}`
    const by = { createdById: session.user.id as string, createdByName: me.name || session.user.name || null }
    await prisma.$transaction([
      prisma.formAcknowledgment.create({
        data: {
          id, branch: b.branch, recipientKind: kind, partnerId, partnerName,
          institution: institution || null, recipientName: recipientName || null,
          recipientDesignation: recipientDesignation || null, receivedBy: receivedBy || null,
          receivedByDesignation: receivedByDesignation || null, items, remarks: remarks || null,
          signaturePng: sig, signedAt: now, deliveredById: session.user.id as string,
          deliveredByName: me.name || session.user.name || 'Med rep', deliveredByTitle,
        },
      }),
      ...uncovered.map((p) => prisma.formReceipt.create({
        data: {
          branch: b.branch, formType: p.formType, dateReceived: now, fromControl: p.fromControl, toControl: p.toControl,
          quantity: p.quantity, remarks: `Auto-recorded with signed acknowledgment ${id} (${partnerName})`, ...by,
        },
      })),
      ...pads.map((p) => prisma.formDistribution.create({
        data: {
          branch: b.branch, formType: p.formType, partnerId, partnerName, dateGiven: now,
          fromControl: p.fromControl, toControl: p.toControl, quantity: p.quantity,
          remarks: 'Signed acknowledgment', acknowledgmentId: id, ...by,
        },
      })),
    ])

    // The record is saved; the PDF can always be rebuilt from it if this fails.
    let pdfOk = true
    try { await buildAndStoreAckPdf(id) } catch (e) { pdfOk = false; console.error('[form-ack] PDF build failed:', e) }

    return NextResponse.json({
      id,
      padRows: pads.length,
      pcs: pads.reduce((s, p) => s + p.quantity, 0),
      receiptsAdded: uncovered.length,
      pdfOk,
      pdfUrl: `/api/inventory/form-acknowledgments/${id}?format=pdf`,
    })
  } catch (err) {
    console.error('Form acknowledgment create error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save the acknowledgment' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !ACK_DELETE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Only an admin or accountant can delete a signed acknowledgment' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    const removed = await deleteAcknowledgment(id)
    return NextResponse.json({ message: 'Signed delivery deleted', ...removed })
  } catch (err) {
    console.error('Form acknowledgment delete error:', err)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
