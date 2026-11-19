// GET /api/accounts-receivable/unmatched?type=HMO&branch=
//
// Accounts Receivable → Unmatched Payments (Hannah 2026-11-11: "a subsection for
// the amount paid to us but we can't reconcile with any sessions we have").
//
// Every recorded payment that brought in more than the sessions tagged on it —
// ARPayment.overpayment. Where that excess went decides what it is:
//   · 4050 Unearned Revenue — HELD: money we could not match to any of our
//     sessions (a claim paid twice, a line with no session left). Owed back to
//     the payer until they confirm it is for other sessions, or it is refunded.
//   · anything else — already explained and booked (e.g. a VAT top-up to 4080).
// The amounts are read-only (they come from Record Payment). The Reason column —
// why the excess exists, split by amount — is the one thing edited here:
// PATCH { id, reasons: [{ reason, amount, note }] } (lib/unmatched-reasons).

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enforceBranch } from '@/lib/branch-scope'
import { arRefOf } from '@/lib/ar-ref'
import { readReasons, suggestReasons, REASON_WRITE_ROLES } from '@/lib/unmatched-reasons'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']
/** The account an unmatched excess is parked in while it is still owed to the payer. */
const HELD_ACCOUNT = '4050'

const n = (v: unknown) => Number(v ?? 0) || 0
const round2 = (x: number) => Math.round(x * 100) / 100

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { role?: string; branch?: string; branches?: string[] }
  if (!READ_ROLES.includes(user.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = new URL(req.url).searchParams
  const type = sp.get('type') === 'GL' ? 'GL' : 'HMO'
  const branch = enforceBranch(user.branch, user.branches, sp.get('branch')) ?? (sp.get('branch') || '')

  try {
    const payments = await prisma.aRPayment.findMany({
      where: {
        overpayment: { gt: 0 },
        wallet: { walletType: type },
        ...(branch ? { branch: { in: [branch, 'ALL'] } } : {}),
      },
      select: {
        id: true, paymentDate: true, amount: true, discount: true, overpayment: true, notes: true, branch: true, overpaymentReasons: true,
        salesInvoiceNumber: true,
        wallet: { select: { id: true, patientName: true } },
        overpaymentAccount: { select: { accountNumber: true, accountTitle: true } },
        cashAccount: { select: { accountNumber: true, accountTitle: true } },
        _count: { select: { items: true } },
      },
      orderBy: { paymentDate: 'desc' },
    })

    // Is each payment standing in the ledger? (its AR_PAYMENT entries net of reversals)
    const jes = payments.length
      ? await prisma.journalEntry.findMany({
          where: { referenceId: { in: payments.map(p => p.id) }, referenceType: { in: ['AR_PAYMENT', 'AR_PAYMENT_REVERSAL'] } },
          select: { referenceId: true, referenceType: true },
        })
      : []
    const standing = new Map<string, number>()
    for (const je of jes) {
      if (!je.referenceId) continue
      standing.set(je.referenceId, (standing.get(je.referenceId) || 0) + (je.referenceType === 'AR_PAYMENT' ? 1 : -1))
    }

    const rows = payments.map(p => {
      const gross = round2(n(p.amount) + n(p.discount))
      const unmatched = round2(n(p.overpayment))
      const ref = arRefOf(p.notes)
      return {
        id: p.id,
        paymentDate: p.paymentDate.toISOString(),
        hmo: p.wallet?.patientName || '—',
        walletId: p.wallet?.id || null,
        branch: p.branch,
        ref,
        notes: (p.notes || '').replace(ref, '').replace(/^[\s;|—-]+/, '').trim(),
        cash: round2(n(p.amount)),
        ewt: round2(n(p.discount)),
        gross,
        matched: round2(gross - unmatched),
        unmatched,
        sessions: p._count.items,
        account: p.overpaymentAccount ? `${p.overpaymentAccount.accountNumber} ${p.overpaymentAccount.accountTitle}` : '',
        held: p.overpaymentAccount?.accountNumber === HELD_ACCOUNT,
        cashAccount: p.cashAccount ? `${p.cashAccount.accountNumber} ${p.cashAccount.accountTitle}` : '',
        inLedger: (standing.get(p.id) || 0) > 0,
        ...(() => {
          const stored = readReasons(p.overpaymentReasons)
          return stored.length
            ? { reasons: stored, reasonsSuggested: false }
            : { reasons: suggestReasons(unmatched, round2(gross - unmatched)), reasonsSuggested: true }
        })(),
      }
    })
    return NextResponse.json({ rows })
  } catch (err) {
    console.error('[AR unmatched] failed:', err)
    return NextResponse.json({ error: 'Could not load unmatched payments' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id || !REASON_WRITE_ROLES.includes(user.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { id?: string; reasons?: unknown }
  if (!body.id) return NextResponse.json({ error: 'Which payment?' }, { status: 400 })
  const payment = await prisma.aRPayment.findUnique({ where: { id: body.id }, select: { id: true, overpayment: true, overpaymentReasons: true, notes: true } })
  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  const reasons = readReasons(body.reasons)
  const total = round2(reasons.reduce((t, r) => t + r.amount, 0))
  const unmatched = round2(n(payment.overpayment))
  if (total > unmatched + 0.005) {
    return NextResponse.json({ error: `The reasons add up to ${total.toFixed(2)}, more than the ${unmatched.toFixed(2)} unmatched` }, { status: 400 })
  }
  // Only the reasons change: no amount, account or journal entry is touched.
  await prisma.$transaction([
    prisma.aRPayment.update({ where: { id: payment.id }, data: { overpaymentReasons: reasons.length ? (reasons as unknown as Prisma.InputJsonValue) : Prisma.DbNull } }),
    prisma.auditLog.create({
      data: {
        userId: user.id, action: 'UPDATE', entity: 'arPaymentUnmatchedReason', entityId: payment.id,
        details: { ref: arRefOf(payment.notes), before: payment.overpaymentReasons ?? null, after: reasons } as unknown as Prisma.InputJsonValue,
      },
    }),
  ])
  return NextResponse.json({ ok: true, reasons })
}
