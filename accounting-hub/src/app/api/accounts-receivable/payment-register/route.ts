// GET /api/accounts-receivable/payment-register?branch=
//
// Accounts Receivable → Payment Register (Hannah 2026-11-17: "a payment history
// (joint) tracker that combines both HMO and GL so we know that a sequence was not
// missed"). Every recorded AR payment — HMO and Guarantee Letter alike — with the
// reference at the head of its notes, so the page can lay the numbers out in
// order and show any number that was skipped, used on more than one row, or
// never given. Read-only.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enforceBranch } from '@/lib/branch-scope'
import { arRefOf, notesWithoutRef, parseArRef } from '@/lib/ar-ref'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

const n = (v: unknown) => Number(v ?? 0) || 0

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
        hasProof: !!p.proofUrl,
        notes: notesWithoutRef(p.notes),
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
