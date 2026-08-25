import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolvePatientViewBranch } from '@/lib/patient-view'

/**
 * The till's side of the patient tablet.
 *
 *   PUT    — publish/refresh what the patient should be seeing
 *   GET    — read it back, chiefly to collect a card the tablet scanned
 *   DELETE — take it down (form closed, or the sale completed)
 *
 * One row per branch, overwritten in place: the tablet is fixed at that
 * branch's address, so there is never more than one live checkout to choose
 * between and no pairing step for staff to get wrong.
 *
 * Staff-authenticated. The public tablet feed reads this row but cannot write
 * it — the one thing a tablet may write is a scanned card code, and that goes
 * through /api/patient-view/scan, which only works while a checkout is live.
 */

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN',
  'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

export const dynamic = 'force-dynamic'

const num = (v: unknown) => Number(v ?? 0) || 0

/**
 * Only the fields the patient screen shows. Whatever else the cart is carrying
 * — service ids, wallet ids, internal notes — is not copied to a public row.
 */
function shapePayload(body: Record<string, unknown>) {
  const items = Array.isArray(body.items) ? body.items : []
  const payments = Array.isArray(body.payments) ? body.payments : []
  return {
    patientName: String(body.patientName ?? '').trim(),
    // The CRM id when the sale came from the appointment queue. Used to match
    // the survey invitation exactly; names collide and vary in punctuation.
    patientId: String(body.patientId ?? '').trim() || null,
    // ACTIVE while the cashier is ringing up; COMPLETED once the sale is saved,
    // which is what turns the tablet into the thank-you and survey prompt.
    status: body.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE',
    clinicianName: String(body.clinicianName ?? '').trim(),
    items: items.slice(0, 40).map((raw) => {
      const i = raw as Record<string, unknown>
      return {
        name: String(i.name ?? '').trim(),
        quantity: num(i.quantity) || 1,
        unitPrice: num(i.unitPrice),
        lineTotal: num(i.lineTotal),
      }
    }).filter(i => i.name),
    discountLabel: String(body.discountLabel ?? '').trim(),
    subtotal: num(body.subtotal),
    discountAmount: num(body.discountAmount),
    netAmount: num(body.netAmount),
    payments: payments.slice(0, 12).map((raw) => {
      const p = raw as Record<string, unknown>
      return {
        method: String(p.method ?? '').trim(),
        label: String(p.label ?? '').trim(),
        amount: num(p.amount),
      }
    }).filter(p => p.method),
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const branch = resolvePatientViewBranch(String(body.branch || ''))
    // Branches with no tablet are not an error — the till simply has nothing to
    // publish to, and should carry on without a failed request in the console.
    if (!branch) return NextResponse.json({ published: false, reason: 'no patient tablet for this branch' })

    const payload = shapePayload(body)
    const row = await prisma.patientViewCheckout.upsert({
      where: { branch: branch.branch },
      create: { branch: branch.branch, active: true, payload },
      // A fresh publish supersedes any earlier scan: the code was for the sale
      // that is no longer on screen.
      update: { active: true, payload, scannedCode: null, scannedAt: null },
      select: { id: true, updatedAt: true },
    })
    return NextResponse.json({ published: true, at: row.updatedAt })
  } catch (e) {
    console.error('[patient-view] publish failed:', e)
    return NextResponse.json({ error: 'Failed to publish' }, { status: 500 })
  }
}

/** Read back the branch's row — the till polls this to collect a scanned card. */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const branch = resolvePatientViewBranch(new URL(req.url).searchParams.get('branch'))
  if (!branch) return NextResponse.json({ active: false, scannedCode: null })

  const row = await prisma.patientViewCheckout.findUnique({
    where: { branch: branch.branch },
    select: { active: true, scannedCode: true, scannedAt: true, updatedAt: true },
  })
  return NextResponse.json({
    active: !!row?.active,
    scannedCode: row?.scannedCode ?? null,
    scannedAt: row?.scannedAt ?? null,
    updatedAt: row?.updatedAt ?? null,
  })
}

/**
 * Take the checkout down, and optionally consume a scanned code in the same
 * call (`?consumeScan=1`) so the till does not apply the same card twice.
 */
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  const branch = resolvePatientViewBranch(sp.get('branch'))
  if (!branch) return NextResponse.json({ cleared: false })

  const scanOnly = sp.get('consumeScan') === '1'
  try {
    await prisma.patientViewCheckout.updateMany({
      where: { branch: branch.branch },
      data: scanOnly
        ? { scannedCode: null, scannedAt: null }
        : { active: false, scannedCode: null, scannedAt: null },
    })
    return NextResponse.json({ cleared: true })
  } catch (e) {
    console.error('[patient-view] clear failed:', e)
    return NextResponse.json({ cleared: false }, { status: 500 })
  }
}
