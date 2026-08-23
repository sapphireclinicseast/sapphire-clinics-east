import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
// Same arithmetic the Detailed GL sheet displays — see lib/gl-processor-fee.
import { processorFeeOf as feeOf, processorRateOf as rateOf } from '@/lib/gl-processor-fee'

/**
 * POST /api/accounts-receivable/gl-processor-payout
 *
 * Settles the GL processor's fee for a batch of letters and raises the matching
 * RFP, which then appears under Expenses like any other request for payment.
 *
 * The fee is always recomputed here from the letter's own SOA amount and rate
 * rather than taken from the request body. A client-supplied total would let the
 * amount on the RFP drift from the sheet it was read off, and this is money
 * leaving the company.
 *
 * Paying is one-shot per letter: a case that already carries a processorRfpId is
 * refused rather than silently skipped, so a double-click or a stale tab cannot
 * pay the same fee twice. Deleting the RFP clears the link (FK is SET NULL) and
 * releases those letters for a fresh batch.
 */

// Raising an RFP moves money, so this is narrower than the sheet's edit
// permission — front desk maintain the paper trail but do not authorise payment.
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

const BRANCH_CODE: Record<string, string> = {
  SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD', AURA_INSTITUTE: 'AHI',
}

const num = (v: unknown) => Number(v ?? 0) || 0

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const caseIds: string[] = Array.isArray(body.caseIds) ? body.caseIds.filter(Boolean) : []
    const walletIds: string[] = Array.isArray(body.walletIds) ? body.walletIds.filter(Boolean) : []
    const branch = String(body.branch || '')
    const expenseAccountId = String(body.expenseAccountId || '')
    const remittedAt = body.remittedAt ? new Date(`${String(body.remittedAt).slice(0, 10)}T00:00:00+08:00`) : null
    const proofUrl = String(body.proofUrl || '').trim() || null
    const payableTo = String(body.payableTo || 'GL Processor').trim() || 'GL Processor'
    const mseq = body.manualSeq != null && String(body.manualSeq).trim() !== ''
      ? parseInt(String(body.manualSeq), 10) : null

    if (!caseIds.length && !walletIds.length) {
      return NextResponse.json({ error: 'Select at least one letter' }, { status: 400 })
    }
    if (!BRANCH_CODE[branch]) {
      return NextResponse.json({ error: 'Choose the branch this payment is drawn on' }, { status: 400 })
    }
    if (!remittedAt || isNaN(remittedAt.getTime())) {
      return NextResponse.json({ error: 'Date remitted is required' }, { status: 400 })
    }
    if (!expenseAccountId) {
      return NextResponse.json({ error: 'Choose the expense account to lodge this against' }, { status: 400 })
    }

    // The account must be a real expense line. A clearing account would balance
    // but would never reach the income statement, which is the whole point here.
    const account = await prisma.account.findUnique({
      where: { id: expenseAccountId },
      select: { id: true, accountNumber: true, accountTitle: true, accountType: true, isActive: true },
    })
    if (!account || !account.isActive) {
      return NextResponse.json({ error: 'That account no longer exists' }, { status: 400 })
    }
    if (account.accountType !== 'EXPENSE') {
      return NextResponse.json({
        error: `${account.accountNumber} ${account.accountTitle} is ${account.accountType}, not an expense account`,
      }, { status: 400 })
    }

    const report = await prisma.$transaction(async (tx) => {
      // Wallet-backed rows may have no case yet. The case is where the payout is
      // recorded, so create the missing ones rather than leaving those letters
      // unpayable — this is the same paper trail, just not filled in yet.
      if (walletIds.length) {
        const wallets = await tx.digitalWallet.findMany({
          where: { id: { in: walletIds }, walletType: 'GL' },
          select: { id: true, patientName: true, branch: true, glCase: { select: { id: true } } },
        })
        for (const w of wallets) {
          if (w.glCase) { caseIds.push(w.glCase.id); continue }
          const created = await tx.glCase.create({
            data: {
              walletId: w.id, patientName: w.patientName, branch: w.branch || 'ALL',
              createdById: session.user!.id as string,
            },
            select: { id: true },
          })
          caseIds.push(created.id)
        }
      }

      const cases = await tx.glCase.findMany({
        where: { id: { in: caseIds } },
        select: {
          id: true, patientName: true, branch: true, soaAmount: true,
          soaCommissionRate: true, processorRfpId: true,
          wallet: { select: { soaAmount: true, soaCommissionRate: true, totalGlAmount: true } },
        },
      })
      if (cases.length === 0) throw new Error('None of the selected letters were found')

      const alreadyPaid = cases.filter(c => c.processorRfpId)
      if (alreadyPaid.length) {
        throw new Error(
          `Already paid: ${alreadyPaid.map(c => c.patientName).join(', ')}. Refresh and try again.`,
        )
      }

      // The case's own figures win, falling back to the wallet's — the same
      // precedence the sheet displays, so the RFP matches what was on screen.
      const items = cases.map(c => {
        const soa = c.soaAmount ?? c.wallet?.soaAmount
        const rate = c.soaCommissionRate ?? c.wallet?.soaCommissionRate
        return {
          caseId: c.id,
          name: c.patientName,
          branch: c.branch,
          soaAmount: num(soa),
          rate: rateOf(rate),
          rateWasDefaulted: num(rate) <= 0,
          amount: feeOf(soa, rate),
        }
      })

      const unpayable = items.filter(i => i.amount <= 0)
      if (unpayable.length) {
        throw new Error(
          `No fee can be computed for ${unpayable.map(i => i.name).join(', ')} — each needs an SOA amount.`,
        )
      }

      const grossTotal = items.reduce((s, i) => s + i.amount, 0)

      let settings = await tx.pettyCashSettings.findUnique({ where: { branch } })
      if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch, nextPcvSeq: 1 } })
      const seq = (mseq != null && !isNaN(mseq) && mseq > 0) ? mseq : settings.nextReimbSeq
      await tx.pettyCashSettings.update({
        where: { branch },
        data: { nextReimbSeq: Math.max(settings.nextReimbSeq, seq + 1) },
      })
      const yy = new Date().getFullYear() % 100
      const refNumber = `${BRANCH_CODE[branch]}-RFP${yy}-${String(seq).padStart(6, '0')}-GLP`

      const created = await tx.reimbursementReport.create({
        data: {
          branch, refNumber, refSeq: seq, grossTotal,
          module: 'GL_PROCESSOR',
          payableTo,
          debitAccount: `${account.accountNumber} ${account.accountTitle}`,
          proofUrl,
          paidAt: remittedAt,
          meta: {
            source: 'gl-processor',
            expenseAccountId: account.id,
            expenseAccount: `${account.accountNumber} ${account.accountTitle}`,
            remittedAt: remittedAt.toISOString(),
            items,
            grossTotal,
          },
          createdById: session.user!.id ?? null,
        },
      })

      await tx.glCase.updateMany({
        where: { id: { in: items.map(i => i.caseId) } },
        data: {
          processorRfpId: created.id,
          processorPaidAt: remittedAt,
          processorProofUrl: proofUrl,
          // Surfaces straight away in the sheet's existing Payout column.
          payoutBatch: refNumber,
        },
      })

      return { id: created.id, refNumber, grossTotal, count: items.length }
    })

    return NextResponse.json(report, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to raise the payout'
    console.error('GL processor payout error:', e)
    // The thrown messages above are written for the person clicking the button.
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
