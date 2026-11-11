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
// Read-only: the amounts come from Record Payment; this lists them in one place.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enforceBranch } from '@/lib/branch-scope'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']
/** The account an unmatched excess is parked in while it is still owed to the payer. */
const HELD_ACCOUNT = '4050'
const AR_REF_RE = /\b(?:(?:AHEA|AHGH|VER)-)?AR\d{2}-\d{3,5}\b/

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
        id: true, paymentDate: true, amount: true, discount: true, overpayment: true, notes: true, branch: true,
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
      const ref = p.notes?.match(AR_REF_RE)?.[0] || ''
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
      }
    })
    return NextResponse.json({ rows })
  } catch (err) {
    console.error('[AR unmatched] failed:', err)
    return NextResponse.json({ error: 'Could not load unmatched payments' }, { status: 500 })
  }
}
