/**
 * Tier 3 Step 3 — POS Order auto-posting.
 *
 * Translates a POS Order into a balanced double-entry JE. For a typical sale:
 *
 *   DR Cash (per payment-mode account)         net cash received
 *   DR Deductions (MDR/CWT, per account)       deduction amounts
 *   DR AR (per HMO/GL wallet account)          HMO/GL portions
 *   DR Discount (contra-revenue)               discount amount
 *   DR Sales Returns 7160 (contra-revenue)     item refund amounts
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

  // Idempotency: skip while an ACTIVE forward JE exists for this order. A forward JE
  // cancelled by a POS_ORDER_REVERSAL (void → reopen → complete again) no longer
  // counts, so the re-completed sale posts a fresh JE — determined by which posting
  // happened LAST, not by comparing raw counts. Raw counts (forwardCount >
  // reversalCount) look equivalent but aren't: any order reopened exactly once before
  // its revenue account existed (so the fresh forward posts only once, after the
  // reversal) lands at forwardCount === reversalCount == 1 the moment the backfill
  // that finally posts it runs a second time — indistinguishable, by count alone,
  // from "already caught up" and "still needs its post-reversal repost". Ordering by
  // createdAt resolves it correctly either way and self-heals any order already
  // double-posted by the count-based check (its last JE is still the newer forward).
  const lastJe = await prisma.journalEntry.findFirst({
    where: { referenceId: orderId, referenceType: { in: ['POS_ORDER', 'POS_ORDER_REVERSAL'] } },
    orderBy: { createdAt: 'desc' },
    select: { referenceType: true },
  })
  if (lastJe?.referenceType === 'POS_ORDER') return { posted: false, alreadyPosted: true }

  // Pull everything we need in one round-trip.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          service:       { select: { hmoPaysClinicianDirect: true, revenueAccount: { select: { id: true, accountNumber: true, accountTitle: true } } } },
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
          wallet: { select: { walletType: true, paysClinicForMd: true, account: { select: { id: true, accountNumber: true, accountTitle: true } } } },
        },
      },
    },
  })
  if (!order) return { posted: false, reason: 'order not found' }

  // MD pass-through: when every item's service is settled by the HMO with the
  // clinician directly (and no paying wallet is a pays-the-clinic exception),
  // nothing here is our revenue or receivable — the books get no entry at all
  // (owner directive 2026-08-24).
  if (
    order.items.length > 0 &&
    order.items.every(i => (i.service as { hmoPaysClinicianDirect?: boolean } | null)?.hmoPaysClinicianDirect) &&
    order.payments.some(p => p.method === 'HMO') &&
    !order.payments.some(p => p.wallet?.paysClinicForMd)
  ) {
    return { posted: false, reason: 'MD pass-through — HMO pays the clinician directly; not our revenue or AR' }
  }

  // Cache lookups we may need
  const [paymentModes, discountSettings, defaultARAccount, defaultUnearnedAccount, defaultInventoryAccount, defaultUnclassifiedRevenue, salesReturnsAccount] = await Promise.all([
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
    prisma.account.findFirst({ where: { accountNumber: '7160' } }),  // Sales Returns (contra-revenue)
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

  /* ── 0b. Name fallback for unlinked product lines ───────────────
     A line rung up as free text carries no inventoryItem, but nearly always names
     a real catalogue product — and the reporting engine ALREADY resolves exactly
     these lines by name for the 7080 product-subtype breakdown. Without the same
     fallback here the two disagree on the same sale: the income statement files it
     under "Training & Education · Materials" while its peso sits in 7000
     Unclassified Revenue. Resolve by name so classification follows the catalogue
     automatically, and 7000 means what it says — a product we genuinely can't
     identify — rather than "the cashier didn't pick from the dropdown".

     Ambiguity is never guessed through: a name matching several catalogue rows
     (consignment copies share their parent's name) only resolves when the order's
     own branch picks a single one, or when every candidate points at the same
     revenue account anyway. Otherwise it falls through to 7000, which is visible
     and fixable, rather than silently crediting the wrong line. */
  const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ')
  const unlinkedNames = [...new Set(
    order.items
      .filter(i => !i.service && !i.inventoryItem && Number(i.lineTotal) > 0 && (i.name || '').trim())
      .map(i => norm(i.name)),
  )]
  const revByName = new Map<string, { id: string; accountNumber: string; accountTitle: string }>()
  if (unlinkedNames.length > 0) {
    const candidates = await prisma.inventoryItem.findMany({
      where: { name: { in: unlinkedNames } },   // catalogue names are stored upper-case
      select: { name: true, branch: true, revenueAccount: { select: { id: true, accountNumber: true, accountTitle: true } } },
    })
    const byName = new Map<string, typeof candidates>()
    for (const c of candidates) {
      const k = norm(c.name)
      if (!byName.has(k)) byName.set(k, [])
      byName.get(k)!.push(c)
    }
    for (const [name, rows] of byName) {
      const withAcct = rows.filter(r => r.revenueAccount)
      if (withAcct.length === 0) continue
      const sameBranch = withAcct.filter(r => r.branch === order.branch)
      const pick =
        withAcct.length === 1 ? withAcct[0]
        : sameBranch.length === 1 ? sameBranch[0]
        : new Set(withAcct.map(r => r.revenueAccount!.id)).size === 1 ? withAcct[0]
        : null
      if (pick?.revenueAccount) revByName.set(name, pick.revenueAccount)
    }
  }

  /* ── 1. Revenue (CR) per item ─────────────────────────────────── */
  for (const item of order.items) {
    const lineTotal = Number(item.lineTotal)
    if (lineTotal <= 0) continue   // free samples / zero-priced items have their own JE
    const revAcct = item.service?.revenueAccount
      || item.inventoryItem?.revenueAccount
      || revByName.get(norm(item.name || ''))
      || defaultUnclassifiedRevenue
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

  /* ── 2b. Sales returns (DR contra-revenue 7160) ───────────────────
     Item lines keep their full gross in Revenue (step 1) and carry the
     returned portion as refundAmount; payments are recorded net of refunds
     (order handler enforces paid = gross − discount − refunds). Without this
     contra line the entry is short by the refund on the debit side — an order
     whose refunds consume the whole collected amount has NO payment rows at
     all, so the guard refused it and the sale never posted (orders #42589,
     #42590). UNEARNED orders net refunds out of the deposit liability in
     step 5 instead, mirroring the discount treatment. ── */
  const totalRefund = order.items.reduce((s, i) => s + Number(i.refundAmount || 0), 0)
  if (totalRefund > 0 && order.revenueType !== 'UNEARNED') {
    if (!salesReturnsAccount) {
      return { posted: false, reason: `refunds of ${totalRefund} have no 7160 Sales Returns account` }
    }
    addLine(salesReturnsAccount.id, 'debit', totalRefund, 'Sales returns — refunded item(s)')
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
      // Round each deduction to the centavo at source: a % of gross (e.g. 0.5% CWT)
      // is fractional, and posting unrounded amounts left half-centavo-unbalanced
      // JEs in the ledger (POS Order #41216). The cash line takes the remainder,
      // so gross always splits exactly.
      const dedAmt = (d: { rate: unknown; valueType?: string | null }) =>
        Math.round((d.valueType === 'FIXED' ? Number(d.rate) : gross * (Number(d.rate) / 100)) * 100) / 100
      const deductionAmt = (pm?.deductions || []).reduce((s, d) => s + dedAmt(d), 0)
      const netCash = Math.round((gross - deductionAmt) * 100) / 100

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
    // Refunds net out of the liability the same way: the deposit owed is only
    // what was actually kept (step 2b books no 7160 line for UNEARNED orders).
    unearnedShare -= totalRefund
    if (unearnedShare > 0) addLine(defaultUnearnedAccount.id, 'credit', unearnedShare, `Unearned deposit — order ${order.id}`)
  }

  /* ── 6. Build & post ──────────────────────────────────────────── */
  const lines: PostingLine[] = []
  for (const [accountId, l] of agg) {
    if (l.debit > 0)  lines.push({ accountId, debit:  l.debit,  description: l.description })
    if (l.credit > 0) lines.push({ accountId, credit: l.credit, description: l.description })
  }
  if (lines.length === 0) return { posted: false, reason: 'no postable lines (free-sample-only order?)' }

  // Round EVERY line to the centavo first — adjusting only one line while others
  // keep sub-centavo fractions is what stored half-centavo-unbalanced JEs
  // (POS Order #41216: CWT 9.425 posted unrounded, cash rounded). Then compute
  // the residual in integer centavos (no float drift) and absorb up to 2 centavos
  // into the discount line — that's where fractions come from — falling back to
  // the largest debit line. Bigger gaps are real errors and still refuse below.
  for (const l of lines) {
    if (l.debit)  l.debit  = Math.round(l.debit * 100) / 100
    if (l.credit) l.credit = Math.round(l.credit * 100) / 100
  }
  const cents = (v: number | undefined) => Math.round((v || 0) * 100)
  const gapCents = lines.reduce((s, l) => s + cents(l.debit) - cents(l.credit), 0)
  if (gapCents !== 0 && Math.abs(gapCents) <= 2) {
    const gap = gapCents / 100
    const target = lines.find(l => (l.debit || 0) > Math.abs(gap) && l.description?.startsWith('Discount'))
      || lines.filter(l => (l.debit || 0) > Math.abs(gap)).sort((a, b) => (b.debit || 0) - (a.debit || 0))[0]
    if (target) target.debit = (cents(target.debit) - gapCents) / 100
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
  const original = await prisma.journalEntry.findFirst({
    where: { referenceType: 'POS_ORDER', referenceId: orderId },
    include: { lines: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!original) return { posted: false, reason: 'no forward JE to reverse' }
  // Idempotency: mirrors postOrderJournal's fix above — ordering by createdAt, not
  // raw counts, since forwardCount===reversalCount is ambiguous (could mean "fully
  // reversed" or "freshly reposted after a reversal") and raw counts read that
  // ambiguous case as "already reversed", silently skipping a genuine new void/reopen.
  const lastJe = await prisma.journalEntry.findFirst({
    where: { referenceId: orderId, referenceType: { in: ['POS_ORDER', 'POS_ORDER_REVERSAL'] } },
    orderBy: { createdAt: 'desc' },
    select: { referenceType: true },
  })
  if (lastJe?.referenceType !== 'POS_ORDER') return { posted: false, alreadyPosted: true }

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
