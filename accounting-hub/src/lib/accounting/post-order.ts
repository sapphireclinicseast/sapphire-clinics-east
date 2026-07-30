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

const CASH_METHODS = new Set(['CASH', 'GCASH', 'PAYMAYA', 'PAYMONGO', 'DEBIT', 'CREDIT_CARD', 'SHOPEE', 'LAZADA', 'TIKTOK'])
const AR_METHODS   = new Set(['HMO', 'GL'])

export interface PostOrderResult {
  posted: boolean
  reason?: string
  journalEntryId?: string
  alreadyPosted?: boolean
}

export async function postOrderJournal(
  prisma: PrismaClient,
  orderId: string,
  createdById: string,
): Promise<PostOrderResult> {
  if (process.env.ENABLE_GL_POSTING !== 'true') {
    return { posted: false, reason: 'ENABLE_GL_POSTING flag is off' }
  }

  // Idempotency: skip while an ACTIVE forward JE exists for this order. A
  // forward JE cancelled by a POS_ORDER_REVERSAL (void → reopen → complete
  // again) no longer counts, so the re-completed sale posts a fresh JE.
  const [forwardCount, reversalCount] = await Promise.all([
    prisma.journalEntry.count({ where: { referenceType: 'POS_ORDER', referenceId: orderId } }),
    prisma.journalEntry.count({ where: { referenceType: 'POS_ORDER_REVERSAL', referenceId: orderId } }),
  ])
  if (forwardCount > reversalCount) return { posted: false, alreadyPosted: true }

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
    // 4050 Unearned Revenue — the liability a deposit creates and a wallet draw-down clears.
    // NOT 4055 "Refunds of Unearned Revenue", which is the refunds contra: this used to read
    // `findFirst(4055) ?? findFirst(4050)`, but the left side is a Promise and so never null,
    // making the 4050 fallback dead code. Once 4055 was created every deposit and draw-down
    // silently landed in the refunds contra instead of the liability.
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
  // Fallback: legs recorded without an explicit mode (front desk isn't required
  // to pick one for plain cash) resolve by (branch, method) — but only when
  // exactly ONE active mode matches, so PayMongo (several per branch) never
  // resolves implicitly.
  const pmByBranchMethod = new Map<string, (typeof paymentModes)[number] | null>()
  for (const pm of paymentModes) {
    if (!pm.paymentMethod || !pm.branch) continue
    const k = `${pm.branch}:${pm.paymentMethod}`
    pmByBranchMethod.set(k, pmByBranchMethod.has(k) ? null : pm)
  }
  const dsByLabel = new Map(discountSettings.map(d => [d.name.trim().toLowerCase(), d]))

  // Aggregator: accountId → { debit, credit }
  const agg = new Map<string, { debit: number; credit: number; description?: string }>()
  // Track which credited accounts are item Revenue (vs. the Inventory CR from the COGS
  // pair) so an UNEARNED reclassification only defers revenue, never inventory.
  const revenueAccountIds = new Set<string>()
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
    revenueAccountIds.add(revAcct.id)
  }

  /* ── 2. Discount (DR contra-revenue) ──────────────────────────────
     UNEARNED orders skip this entirely: the deposit liability is credited NET
     of the discount (step 5), and the discount is recognized later on the
     earned per-session orders — booking it here would double-count it. ── */
  const discountAmount = Number(order.discountAmount)
  if (discountAmount > 0 && order.revenueType !== 'UNEARNED') {
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
      const pm = (p.paymentModeId ? pmById.get(p.paymentModeId) : null)
        || pmByBranchMethod.get(`${order.branch}:${p.method}`)
      const cashAcct = pm?.account
      if (!cashAcct) {
        return { posted: false, reason: `cash payment ${p.method} ${gross} has no payment-mode account configured` }
      }
      // Each deduction is either a percentage of gross or a fixed peso amount (valueType).
      const dedAmt = (d: { rate: unknown; valueType?: string | null }) =>
        d.valueType === 'FIXED' ? Number(d.rate) : gross * (Number(d.rate) / 100)
      const deductionAmt = (pm?.deductions || []).reduce((s, d) => s + dedAmt(d), 0)
      const netCash = gross - deductionAmt

      addLine(cashAcct.id, 'debit', netCash, `Cash receipt — ${p.method}`)

      for (const d of pm?.deductions || []) {
        const amt = dedAmt(d)
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
    // The whole order is unearned (e.g. a package purchase or deposit): no tender's
    // share should sit in Revenue yet. Move EVERY item-revenue credit to Unearned
    // Revenue (deposit liability), whatever the payment method. Only the accounts we
    // credited as revenue are moved — the Inventory CR from the COGS pair is left alone.
    let unearnedShare = 0
    for (const accId of revenueAccountIds) {
      const line = agg.get(accId)
      if (line && line.credit > 0) {
        unearnedShare += line.credit
        line.credit = 0
        agg.set(accId, line)
      }
    }
    // The discount defers too: the liability is what was actually collected —
    // gross minus discount (e.g. 25,500 package − 5,100 PWD → CR 4050 20,400).
    // Step 2 skipped the discount DR for unearned orders, so net it out of the
    // liability here. The discount is recognized later, pro-rata, on the
    // earned per-session orders; deferring gross would overstate 4050 by an
    // amount the draw-downs (which total the net) would never clear.
    unearnedShare -= discountAmount
    if (unearnedShare > 0) addLine(defaultUnearnedAccount.id, 'credit', unearnedShare, `Unearned deposit — order ${order.id}`)
  }

  /* ── 6. Build & post ──────────────────────────────────────────── */
  const lines: PostingLine[] = []
  for (const [accountId, l] of agg) {
    if (l.debit > 0)  lines.push({ accountId, debit:  l.debit,  description: l.description })
    if (l.credit > 0) lines.push({ accountId, credit: l.credit, description: l.description })
  }
  if (lines.length === 0) return { posted: false, reason: 'no postable lines (free-sample-only order?)' }

  // Fractional discounts (e.g. 25% of ₱2,062.50 = ₱515.625) leave a sub-centavo
  // gap against centavo-rounded payment amounts, and float drift pushes an
  // exactly-0.005 gap just past the balance tolerance. Absorb residuals of up
  // to 2 centavos into the discount line — that's where the fraction came
  // from — falling back to the largest debit line. Bigger gaps are real
  // errors and still refuse below.
  const drTotal = lines.reduce((s, l) => s + (l.debit || 0), 0)
  const crTotal = lines.reduce((s, l) => s + (l.credit || 0), 0)
  const gap = drTotal - crTotal
  if (gap !== 0 && Math.abs(gap) <= 0.02) {
    const target = lines.find(l => (l.debit || 0) > Math.abs(gap) && l.description?.startsWith('Discount'))
      || lines.filter(l => (l.debit || 0) > Math.abs(gap)).sort((a, b) => (b.debit || 0) - (a.debit || 0))[0]
    if (target) target.debit = Math.round(((target.debit || 0) - gap) * 100) / 100
  }

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

/**
 * Reverse an order's forward JE when the sale stops standing (void, buyer
 * return, reopen). Posts a mirrored POS_ORDER_REVERSAL dated now — the
 * original entry is left untouched so the ledger keeps the full history,
 * and JE-based reports (Ledger dataset, Subsidiary Ledger) net to zero.
 * Idempotent: skips when there is no un-reversed forward JE.
 */
export async function reverseOrderJournal(
  prisma: PrismaClient,
  orderId: string,
  createdById: string,
  reason: string,
): Promise<PostOrderResult> {
  if (process.env.ENABLE_GL_POSTING !== 'true') {
    return { posted: false, reason: 'ENABLE_GL_POSTING flag is off' }
  }
  const [original, reversalCount] = await Promise.all([
    prisma.journalEntry.findFirst({
      where: { referenceType: 'POS_ORDER', referenceId: orderId },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.journalEntry.count({ where: { referenceType: 'POS_ORDER_REVERSAL', referenceId: orderId } }),
  ])
  if (!original) return { posted: false, reason: 'no forward JE to reverse' }
  const forwardCount = await prisma.journalEntry.count({ where: { referenceType: 'POS_ORDER', referenceId: orderId } })
  if (reversalCount >= forwardCount) return { posted: false, alreadyPosted: true }

  const lines: PostingLine[] = original.lines.map(l => ({
    accountId: l.accountId,
    debit:  Number(l.credit) || 0,   // swap sides
    credit: Number(l.debit)  || 0,
    description: `Reversal — ${reason}`,
  }))
  try {
    const je = await postJournalEntry(prisma, {
      entryDate:     new Date(),
      description:   `Reversal of ${original.description} — ${reason}`,
      referenceType: 'POS_ORDER_REVERSAL',
      referenceId:   orderId,
      branch:        original.branch,
      createdById,
      lines,
    })
    return { posted: true, journalEntryId: je.id }
  } catch (e) {
    if (e instanceof UnbalancedJournalEntryError) {
      console.error('[POS_ORDER_REVERSAL] refused unbalanced JE for order', orderId, '—', e.message)
      return { posted: false, reason: e.message }
    }
    throw e
  }
}
