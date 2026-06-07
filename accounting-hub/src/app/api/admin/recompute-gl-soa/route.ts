/**
 * One-shot data correction for GL wallets whose `totalGlAmount` (Approved SOA)
 * was clobbered by the 2026-04-08 migration, which set
 *   totalGlAmount = balance
 * for every GL wallet — including wallets that had already been partially
 * consumed at migration time. For those, the Approved SOA was permanently
 * recorded as the *remaining* balance instead of the *original* approved
 * amount, and the PUT route's "definitive protection" then blocked any
 * subsequent UI fix.
 *
 * This endpoint derives the original Approved SOA from the ledger — exactly
 * the same way the wallet detail GET (src/app/api/pos/wallets/[id]/route.ts)
 * derives `glInitialBalance`:
 *
 *   derived = current balance + sum(non-voided GL OrderPayment.amount)
 *                              − sum(VOID_REVERSAL credits parsed from log.description)
 *
 * Only updates when `derived > totalGlAmount` (within 1¢), so legitimate
 * top-ups that left totalGlAmount > derived are never lowered.
 *
 * POST /api/admin/recompute-gl-soa            → apply
 * POST /api/admin/recompute-gl-soa { dryRun:true } → preview only
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const RUN_ROLES = ['ADMIN', 'ACCOUNTANT']

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !RUN_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { dryRun?: boolean }
  const dryRun = body.dryRun === true

  const wallets = await prisma.digitalWallet.findMany({
    where: { walletType: 'GL', isActive: true },
    select: { id: true, patientName: true, balance: true, totalGlAmount: true },
  })

  const changes: {
    id: string
    patientName: string
    balance: number
    currentTotalGlAmount: number | null
    derivedTotalGlAmount: number
    delta: number
  }[] = []
  const skipped: { id: string; patientName: string; reason: string }[] = []

  for (const w of wallets) {
    const [payments, voidLogs] = await Promise.all([
      prisma.orderPayment.findMany({
        where: {
          walletId: w.id,
          method: 'GL',
          order: { status: { not: 'VOIDED' } },
        },
        select: { amount: true },
      }),
      prisma.walletLog.findMany({
        where: { walletId: w.id, action: 'VOID_REVERSAL' },
        select: { description: true },
      }),
    ])

    const sumDeductions = payments.reduce((s, p) => s + Number(p.amount), 0)
    const sumReversals = voidLogs.reduce((s, log) => {
      const m = log.description.match(/[\d,]+\.\d{1,2}/)
      return s + (m ? parseFloat(m[0].replace(/,/g, '')) : 0)
    }, 0)

    const balance = Number(w.balance)
    const currentTotalGlAmount = w.totalGlAmount != null ? Number(w.totalGlAmount) : null
    const derived = Number((balance + sumDeductions - sumReversals).toFixed(2))

    if (derived <= 0.005) {
      skipped.push({ id: w.id, patientName: w.patientName, reason: 'derived ≤ 0 — no ledger activity' })
      continue
    }

    if (currentTotalGlAmount != null && derived <= currentTotalGlAmount + 0.005) {
      skipped.push({
        id: w.id,
        patientName: w.patientName,
        reason: `current totalGlAmount (${currentTotalGlAmount}) ≥ derived (${derived}) — preserved`,
      })
      continue
    }

    changes.push({
      id: w.id,
      patientName: w.patientName,
      balance,
      currentTotalGlAmount,
      derivedTotalGlAmount: derived,
      delta: derived - (currentTotalGlAmount ?? 0),
    })
  }

  if (!dryRun) {
    for (const c of changes) {
      await prisma.digitalWallet.update({
        where: { id: c.id },
        data: { totalGlAmount: c.derivedTotalGlAmount },
      })
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'RECOMPUTE_GL_SOA',
        entity: 'digitalWallet',
        details: {
          updatedCount: changes.length,
          skippedCount: skipped.length,
          updated: changes.map(c => ({
            id: c.id,
            patientName: c.patientName,
            from: c.currentTotalGlAmount,
            to: c.derivedTotalGlAmount,
          })),
        },
      },
    })
  }

  return NextResponse.json({
    dryRun,
    scanned: wallets.length,
    updated: dryRun ? 0 : changes.length,
    wouldUpdate: dryRun ? changes.length : undefined,
    skipped: skipped.length,
    changes,
    skippedDetails: skipped,
  })
}
