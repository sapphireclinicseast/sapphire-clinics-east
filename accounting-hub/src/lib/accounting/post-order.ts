/**
 * Tier 3 Step 3 — POS Order auto-posting.
 *
 * Translates a POS Order into a balanced double-entry JE. For a typical sale:
 *
 *   DR Cash (per payment-mode account)         net cash received
 *   DR Deductions (MDR/CWT, per account)       deduction amounts
 *   DR AR (per HMO/GL wallet account)          HMO/GL portions
 *   DR Discount (contra-revenue)               discount amount
 *     CR Revenue (per item revenue account)    gross item subtotal
 *
 * Plus, for inventory items consumed:
 *   DR COGS (per expense account)              cogsCost
 *     CR Inventory (per inventory ASSET acct)  cogsCost
 *
 * If a required account cannot be resolved, the function returns `skipped`
 * with a reason instead of posting a half-broken entry. The order itself is
 * untouched (callers swallow the skip and the books are simply un-posted
 * for that order — fixable by a backfill once accounts are configured).
 *
 * Gated by env ENABLE_GL_POSTING=true so it can be enabled per environment.
 */

import type { PrismaClient } from '@prisma/client'
import { postJournalEntry, UnbalancedJournalEntryError, type PostingLine } from './posting'

const CASH_METHODS = new Set(['CASH', 'GCASH', 'PAYMAYA', 'DEBIT', 'CREDIT_CARD', 'SHOPEE', 'LAZADA', 'TIKTOK'])
const AR_METHODS   = new Set(['HMO', 'GL'])

export interface PostOrderResult {
  posted: boolean
  reason?: string
  journalEntryId?: string
}

export async function postOrderJournal(
  prisma: PrismaClient,
  orderId: string,
  createdById: string,
): Promise<PostOrderResult> {
  if (process.env.ENABLE_GL_POSTING !== 'true') {
    return { posted: false, reason: 'ENABLE_GL_POSTING flag is off' }
  }

  // Pull everything we need in one round-trip.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          service:       { select: { revenueAccount: { select: { id: true, accountNumber: true, accountTitle: true } } } },
          inventoryItem: {
            select: {
              revenueAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
              expenseAccount: { select: { id: true, accountNumber: true, accountTitle: true } },
              sourceAccount:  { select: { id: true, accountNumber: true, accountTitle: true, accountType: true } },
            },
          },
        },
      },
      payments: {
        include: {
          wallet: { select: { walletType: true, account: { select: { id: true, accountNumber: true, accountTitle: true } } } },
        },
      },
    },
  })
  if (!order) return { posted: false, reason: 'order not found' }

  // Cache lookups we may need
  const [paymentModes, discountSettings, defaultARAccount, defaultUnearnedAccount, defaultInventoryAccount, defaultUnclassifiedRevenue] = await Promise.all([
    prisma.paymentMode.findMany({
      where: { isActive: true },
      include: {
        account:    { select: { id: true, accountNumber: true, accountTitle: true } },
        deductions: { include: { account: { select: { id: true, accountNumber: true, accountTitle: true, accountType: true } } } },
      },
    }),
    prisma.discountSetting.findMany({
      where: { isActive: true },
      include: { account: { select: { id: true, accountNumber: true, accountTitle: true } } },
    }),
    prisma.account.findFirst({ where: { accountNumber: '1010', accountType: 'ASSET' } }),
    prisma.account.findFirst({ where: { accountNumber: '4055' } }) ??
      prisma.account.findFirst({ where: { accountNumber: '4050' } }),
    prisma.account.findFirst({
      where: {
        accountType: 'ASSET',
        OR: [
          { accountTitle: { contains: 'inventory', mode: 'insensitive' } },
          { accountTitle: { contains: 'merchandise', mode: 'insensitive' } },
          { accountNumber: { startsWith: '13' } },
        ],
      },
    }),
    prisma.account.findFirst({ where: { accountNumber: '7000' } }),  // generic Gross Revenue fallback
  ])

  const pmById = new Map(paymentModes.map(p => [p.id, p]))
  const dsByLabel = new Map(discountSettings.map(d => [d.name.trim().toLowerCase(), d]))

  // Aggregator: accountId → { debit, credit }
  const agg = new Map<string, { debit: number; credit: number; description?: string }>()
  const addLine = (accountId: string, side: 'debit' | 'credit', amount: number, description?: string) => {
    if (amount <= 0) return
    const cur = agg.get(accountId) || { debit: 0, credit: 0, description }
    cur[side] += amount
    if (description && !cur.description) cur.description = description
    agg.set(accountId, cur)
  }

  /* ── 1. Revenue (CR) per item ─────────────────────────────────── */
  for (const item of order.items) {
    const lineTotal = Number(item.lineTotal)
    if (lineTotal <= 0) continue   // free samples / zero-priced items have their own JE
    const revAcct = item.service?.revenueAccount || item.inventoryItem?.revenueAccount || defaultUnclassifiedRevenue
    if (!revAcct) {
      return { posted: false, reason: `item "${item.name}" has no revenue account and no 7000 fallback exists` }
    }
    addLine(revAcct.id, 'credit', lineTotal, `Revenue — ${item.name}`)
  }

  /* ── 2. Discount (DR contra-revenue) ──────────────────────────── */
  const discountAmount = Number(order.discountAmount)
  if (discountAmount > 0) {
    let discAcctId: string | undefined
    if (order.discountType === 'PWD_SC') {
      const pwdSetting = discountSettings.find(d => /pwd|senior/i.test(d.name))
      discAcctId = pwdSetting?.account?.id
    }
    if (!discAcctId && order.discountLabel) {
      const matched = dsByLabel.get(order.discountLabel.trim().toLowerCase())
      discAcctId = matched?.account?.id
    }
    if (!discAcctId) {
      const fallback = discountSettings.find(d => d.account?.accountNumber === '7210')
      discAcctId = fallback?.account?.id
    }
    if (!discAcctId) {
      return { posted: false, reason: `discount of ${discountAmount} has no resolvable account (label="${order.discountLabel}", type=${order.discountType})` }
    }
    addLine(discAcctId, 'debit', discountAmount, `Discount — ${order.discountLabel || order.discountType}`)
  }

  /* ── 3. Cash + AR + Deductions (DR) per payment ───────────────── */
  for (const p of order.payments) {
    const gross = Number(p.amount)
    if (gross <= 0) continue

    if (AR_METHODS.has(p.method)) {
      const arAcct = p.wallet?.account || defaultARAccount
      if (!arAcct) {
        return { posted: false, reason: `${p.method} payment of ${gross} has no AR account (wallet has none and no default 1010 found)` }
      }
      // For UNEARNED orders, the credit side moves from Revenue → Unearned.
      // Reclassify by removing the per-item Revenue credit and adding Unearned credit.
      // Simpler: if UNEARNED, also credit Unearned Revenue and zero out the
      // matching Revenue credit. We do this in step 5 below.
      addLine(arAcct.id, 'debit', gross, `AR — ${p.method}`)
      continue
    }

    if (CASH_METHODS.has(p.method)) {
      const pm = p.paymentModeId ? pmById.get(p.paymentModeId) : null
      const cashAcct = pm?.account
      if (!cashAcct) {
        return { posted: false, reason: `cash payment ${p.method} ${gross} has no payment-mode account configured` }
      }
      const totalDeductionRate = (pm?.deductions || []).reduce((s, d) => s + Number(d.rate), 0)
      const deductionAmt = gross * (totalDeductionRate / 100)
      const netCash = gross - deductionAmt

      addLine(cashAcct.id, 'debit', netCash, `Cash receipt — ${p.method}`)

      for (const d of pm?.deductions || []) {
        const amt = gross * (Number(d.rate) / 100)
        if (amt <= 0) continue
        if (!d.account) {
          return { posted: false, reason: `deduction "${d.name}" on payment mode "${pm?.id}" has no account` }
        }
        addLine(d.account.id, 'debit', amt, `${d.name} on ${p.method}`)
      }
      continue
    }

    // VIP_CARD / PREPAID_CARD / DOWNPAYMENT / PACKAGE — wallet-funded, settled
    // by drawing down the unearned-revenue liability. DR Unearned Revenue, no
    // cash side (the cash was received earlier when the wallet was loaded).
    if (defaultUnearnedAccount && p.wallet?.account) {
      addLine(p.wallet.account.id, 'debit', gross, `Wallet draw-down — ${p.method}`)
    } else if (defaultUnearnedAccount) {
      addLine(defaultUnearnedAccount.id, 'debit', gross, `Wallet draw-down — ${p.method}`)
    } else {
      return { posted: false, reason: `non-cash payment ${p.method} ${gross} has no unearned-revenue account` }
    }
  }

  /* ── 4. COGS pair per inventory item (DR COGS, CR Inventory) ───── */
  for (const item of order.items) {
    const cogsCost = Number(item.cogsCost || 0)
    if (cogsCost <= 0) continue
    const cogsAcct = item.inventoryItem?.expenseAccount
    const invAcct  = item.inventoryItem?.sourceAccount?.accountType === 'ASSET'
                       ? item.inventoryItem.sourceAccount
                       : defaultInventoryAccount
    if (!cogsAcct || !invAcct) {
      return { posted: false, reason: `inventory item "${item.name}" missing COGS account or inventory ASSET account` }
    }
    addLine(cogsAcct.id, 'debit',  cogsCost, `COGS — ${item.name}`)
    addLine(invAcct.id,  'credit', cogsCost, `Inventory out — ${item.name}`)
  }

  /* ── 5. UNEARNED reclassification (HMO/GL only) ────────────────
     If the order is UNEARNED, recognized revenue is wrong — move the credit
     from Revenue to Unearned Revenue. This affects ONLY the portion paid via
     HMO/GL (cash UNEARNED is a contradiction; ignored). */
  if (order.revenueType === 'UNEARNED' && defaultUnearnedAccount) {
    const arPaid = order.payments
      .filter(p => AR_METHODS.has(p.method))
      .reduce((s, p) => s + Number(p.amount), 0)
    if (arPaid > 0) {
      // Allocate the AR-paid portion of the gross subtotal to Unearned.
      const ratio = arPaid / Number(order.netAmount || 1)
      const unearnedShare = Number(order.subtotal) * ratio
      // Remove that much from each revenue line proportionally
      const totalRevCredit = Array.from(agg.values()).reduce((s, l) => s + l.credit, 0)
      if (totalRevCredit > 0) {
        const scale = unearnedShare / totalRevCredit
        for (const [accId, line] of agg) {
          if (line.credit > 0) {
            const moved = line.credit * scale
            line.credit -= moved
            agg.set(accId, line)
          }
        }
        addLine(defaultUnearnedAccount.id, 'credit', unearnedShare, `Unearned (HMO/GL) — ${order.id}`)
      }
    }
  }

  /* ── 6. Build & post ──────────────────────────────────────────── */
  const lines: PostingLine[] = []
  for (const [accountId, l] of agg) {
    if (l.debit > 0)  lines.push({ accountId, debit:  l.debit,  description: l.description })
    if (l.credit > 0) lines.push({ accountId, credit: l.credit, description: l.description })
  }
  if (lines.length === 0) return { posted: false, reason: 'no postable lines (free-sample-only order?)' }

  try {
    const je = await postJournalEntry(prisma, {
      entryDate:     order.transactionDate,
      description:   `POS Order #${order.orderNumber}${order.patientName ? ' — ' + order.patientName : ''}`,
      referenceType: 'POS_ORDER',
      referenceId:   order.id,
      branch:        order.branch,
      createdById,
      lines,
    })
    return { posted: true, journalEntryId: je.id }
  } catch (e) {
    if (e instanceof UnbalancedJournalEntryError) {
      console.error('[POS_ORDER] refused unbalanced JE for order', order.id, '—', e.message)
      return { posted: false, reason: e.message }
    }
    throw e
  }
}
