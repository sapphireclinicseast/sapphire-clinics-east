// GET   /api/accounts-receivable/payment-register?branch=
// PATCH /api/accounts-receivable/payment-register  { id, ref?, copyPending?, addProofUrls? }
//
// Accounts Receivable → Payment Register (Hannah 2026-11-17: "a payment history
// (joint) tracker that combines both HMO and GL so we know that a sequence was not
// missed"). Every recorded AR payment — HMO and Guarantee Letter alike — with the
// reference at the head of its notes, so the page can lay the numbers out in
// order and show any number that was skipped, used on more than one row, or
// never given.
//
// PATCH writes ONLY the payment's notes (the AR number at their head and/or the
// "physical copy pending" tag) and its proof files (appended, never removed —
// Hannah 2026-11-18: "just make sure proof is there"). It never touches tags,
// amounts or the journal —
// unlike the Payment History PUT, which rebuilds the payment and re-posts its
// entry (a new entry id that unhooks the bank-rec match).

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchAllowed, enforceBranch } from '@/lib/branch-scope'
import { arRefOf, notesWithoutRef, notesWithRef, parseArRef, hasCopyPending, withCopyPending, withoutCopyPending } from '@/lib/ar-ref'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
// Same roles as recording a payment in Payment History.
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

const n = (v: unknown) => Number(v ?? 0) || 0

// proofUrl holds one plain URL, or a JSON array of "url" strings / { url, locked }
// objects (the same shapes Payment History writes).
function proofUrlsOf(raw: string | null): string[] {
  if (!raw) return []
  try {
    const p = JSON.parse(raw)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Array.isArray(p)) return p.map((e: any) => typeof e === 'string' ? e : e?.url).filter(Boolean) as string[]
  } catch { /* plain URL */ }
  return [raw]
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { role?: string; branch?: string; branches?: string[] }
  if (!READ_ROLES.includes(user.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = new URL(req.url).searchParams
  const branch = enforceBranch(user.branch, user.branches, sp.get('branch')) ?? (sp.get('branch') || '')

  try {
    const payments = await prisma.aRPayment.findMany({
      where: {
        wallet: { walletType: { in: ['HMO', 'GL'] } },
        ...(branch ? { branch } : {}),
      },
      orderBy: { paymentDate: 'asc' },
      select: {
        id: true, paymentDate: true, amount: true, discount: true, overpayment: true,
        notes: true, branch: true, proofUrl: true, createdAt: true,
        wallet: { select: { patientName: true, walletType: true, agency: true } },
        _count: { select: { items: true } },
      },
    })

    const rows = payments.map(p => {
      const ref = arRefOf(p.notes)
      const parsed = ref ? parseArRef(ref) : null
      const cash = n(p.amount)
      const withheld = n(p.discount)
      return {
        id: p.id,
        ref,
        series: parsed?.series ?? '',
        num: parsed?.num ?? null,
        paymentDate: p.paymentDate.toISOString(),
        type: p.wallet.walletType as 'HMO' | 'GL',
        payer: p.wallet.patientName,
        agency: p.wallet.agency || '',
        branch: p.branch || '',
        cash,
        withheld,
        overpayment: n(p.overpayment),
        settled: Math.round((cash + withheld - n(p.overpayment)) * 100) / 100,
        sessions: p._count.items,
        proofUrls: proofUrlsOf(p.proofUrl),
        notes: notesWithoutRef(withoutCopyPending(p.notes)),
        copyPending: hasCopyPending(p.notes),
        // No cash received: SCI-era ₱0 markers, GL write-offs, and the separate
        // BIR 2307 (TC) entries — they are not collections needing an AR number.
        noCash: cash === 0,
      }
    })
    return NextResponse.json({ rows })
  } catch (err) {
    console.error('[AR] payment register failed:', err)
    return NextResponse.json({ error: 'Could not load the payment register' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { id?: string; role?: string; branch?: string; branches?: string[] }
  if (!WRITE_ROLES.includes(user.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json().catch(() => ({}))
    const id = typeof body.id === 'string' ? body.id : ''
    const refIn = typeof body.ref === 'string' ? body.ref.trim().toUpperCase() : ''
    const copyPending = typeof body.copyPending === 'boolean' ? body.copyPending : undefined
    // Files already uploaded through POST /api/upload.
    const addProofUrls: string[] = Array.isArray(body.addProofUrls)
      ? body.addProofUrls.filter((u: unknown): u is string => typeof u === 'string' && /^\/api\/files\/[A-Za-z0-9._-]+$/.test(u))
      : []
    if (Array.isArray(body.addProofUrls) && addProofUrls.length !== body.addProofUrls.length) {
      return NextResponse.json({ error: 'Proof files must be /api/files/… links from the upload' }, { status: 400 })
    }
    if (!id || (!refIn && copyPending === undefined && !addProofUrls.length)) {
      return NextResponse.json({ error: 'Send the payment id with an AR number, copyPending and/or addProofUrls' }, { status: 400 })
    }

    const p = await prisma.aRPayment.findUnique({
      where: { id },
      select: { id: true, notes: true, branch: true, paymentDate: true, proofUrl: true, wallet: { select: { walletType: true } } },
    })
    if (!p || !['HMO', 'GL'].includes(p.wallet.walletType)) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    if (p.branch && !branchAllowed(user.branch, p.branch, user.branches)) {
      return NextResponse.json({ error: 'This payment belongs to another branch' }, { status: 403 })
    }

    let notes = p.notes || ''
    if (refIn) {
      const parsed = parseArRef(refIn)
      if (!parsed || parsed.kind !== 'AR') {
        return NextResponse.json({ error: 'Write the AR number like AHEA-AR26-0026 or AR25-0028' }, { status: 400 })
      }
      // A number belongs to one collection. One remittance paid out as several
      // credits (Pacific Cross's claim-by-claim batch, a deposit split across
      // GL wallets) shares its number across rows of the SAME day — the
      // register shows those as "one deposit · i of n" (Hannah 2026-11-18: "if
      // paid in bulk, this should just be one AR reference number"). The same
      // number on a different day is refused.
      const yy = String(parsed.yy).padStart(2, '0')
      const candidates = await prisma.aRPayment.findMany({
        where: { id: { not: id }, notes: { contains: `AR${yy}-` } },
        select: { id: true, notes: true, paymentDate: true },
      })
      const manilaDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
      const clash = candidates.find(c => {
        const other = parseArRef(arRefOf(c.notes))
        return other && other.series === parsed.series && other.num === parsed.num
          && manilaDay(c.paymentDate) !== manilaDay(p.paymentDate)
      })
      if (clash) return NextResponse.json({ error: `${parsed.ref} is already used by a payment on another date` }, { status: 409 })
      notes = notesWithRef(parsed.ref, notes)
    }
    if (copyPending !== undefined) notes = copyPending ? withCopyPending(notes) : withoutCopyPending(notes)

    // Proof: keep every file already attached, add the new ones (same shapes
    // Payment History writes: one plain URL, or a JSON array).
    const proofBefore = proofUrlsOf(p.proofUrl)
    const proofAfter = [...proofBefore, ...addProofUrls.filter(u => !proofBefore.includes(u))]
    const proofUrl = proofAfter.length === 0 ? null : proofAfter.length === 1 ? proofAfter[0] : JSON.stringify(proofAfter)
    const proofChanged = proofAfter.length !== proofBefore.length

    if (notes === (p.notes || '') && !proofChanged) return NextResponse.json({ ok: true, unchanged: true })
    await prisma.aRPayment.update({ where: { id }, data: { notes, ...(proofChanged ? { proofUrl } : {}) } })
    await prisma.auditLog.create({
      data: {
        userId: user.id as string,
        action: 'AR_REFERENCE',
        entity: 'arPayment',
        entityId: id,
        details: { before: p.notes, after: notes, ref: refIn || null, copyPending: copyPending ?? null, proofAdded: proofChanged ? addProofUrls : [] },
      },
    })
    return NextResponse.json({ ok: true, ref: arRefOf(notes), copyPending: hasCopyPending(notes), proofUrls: proofAfter })
  } catch (err) {
    console.error('[AR] payment register PATCH failed:', err)
    return NextResponse.json({ error: 'Could not update the payment' }, { status: 500 })
  }
}
