/**
 * PayMongo payout auto-posting.
 *
 * How the money actually moves (verified against the live API, 2026-10-31):
 * PayMongo pays every merchant account's collections out to the PayMongo
 * WALLET (bank "PAYMONGO PAYMENTS, INC.", account ••8714), and the wallet
 * settles to the bank (SCEI Main, BDO ••7267). That settlement is a bank
 * statement line: a Bank Rec category rule on PayMongo's bank code (PAEYPHM)
 * books it DR bank / CR wallet at import, so it is NOT posted here — posting it
 * here as well would count the deposit twice. Only the wallet's own transfer
 * fee, which no bank statement shows, is posted here (DR 8330 / CR wallet).
 *
 * Each settled payout posts, against the configured settlement account
 * (the PayMongo Wallet asset):
 *
 *   DR PayMongo Wallet                 payout net
 *     CR <clearing the sale debited>   each settled payment's net
 *     CR 2990 suspense                 anything that cannot be traced
 *
 * Fees never touch this entry: a POS PayMongo payment mode books the fee when
 * the sale is rung, and a link sale's PAYMONGO_SALE entry books it exactly, so
 * both leave the clearing holding the NET — which is what the payout settles.
 *
 * Each payment is traced through the payout's own transaction list:
 *   1. a payment link whose PAYMONGO_SALE entry exists → that entry's clearing;
 *   2. a link converted into a POS order → the order's PayMongo payment mode
 *      account;
 *   3. otherwise the branch clearing (1055–1058) with an open balance that can
 *      absorb it — POS PayMongo payments rung by a cashier carry no PayMongo id.
 * Whatever is left lands in 2990 suspense, never invented into a clearing.
 *
 * Idempotent per payout (JE PAYMONGO_PAYOUT:<payoutId>). Payouts before
 * POSTING_FROM are skipped: everything up to the 2026-06-16 settlement reached
 * the books through the SCEI Main true-up and MJE-2026-0041, and the ₱285.70
 * the wallet kept that day was booked as its opening (MJE-2026-0049).
 */

import type { PrismaClient } from '@prisma/client'
import { PAYMONGO_ACCOUNTS, listPayouts, listPayoutTransactions, listWallets, listWalletTransactions, paymongoConfigured, parsePayout } from '@/lib/paymongo'
import { postJournalEntry, type PostingLine } from './posting'
import { syncStoreOrders } from '@/lib/verdana-store-sync'

const POSTING_FROM = new Date('2026-06-17T00:00:00+08:00')
const SUSPENSE_NUMBER = '2990'
const BANK_CHARGES_NUMBER = '8330'

export interface PayoutSyncResult { recorded: number; net: number; unallocated?: number; skipped?: string }

const r2 = (n: number) => Math.round(n * 100) / 100

export async function syncPayouts(prisma: PrismaClient, userId: string): Promise<PayoutSyncResult> {
  if (process.env.ENABLE_GL_POSTING !== 'true') return { recorded: 0, net: 0, skipped: 'GL posting off' }

  const settings = await prisma.paymongoSettings.findUnique({ where: { id: 'singleton' } })
  if (!settings?.autoReconcile || !settings.bankAccountId) return { recorded: 0, net: 0, skipped: 'not configured' }

  const wallet = await prisma.account.findUnique({ where: { id: settings.bankAccountId }, select: { id: true, accountType: true } })
  if (!wallet || wallet.accountType !== 'ASSET') return { recorded: 0, net: 0, skipped: 'settlement account invalid' }

  const suspense = await prisma.account.findFirst({ where: { accountNumber: SUSPENSE_NUMBER }, select: { id: true } })
  if (!suspense) return { recorded: 0, net: 0, skipped: '2990 suspense account missing' }

  // Stamp the sync time up front so the on-load poll is throttled even if the API is slow/down.
  await prisma.paymongoSettings.update({ where: { id: 'singleton' }, data: { lastSyncAt: new Date() } })

  // Online-store sales first, so a payout finds its sale's clearing balance
  // instead of parking the money in suspense.
  try { await syncStoreOrders(prisma) } catch (e) { console.error('[PayMongo] store order sync failed:', e) }

  // Branch clearings = the accounts the PayMongo payment modes post to.
  const modes = await prisma.paymentMode.findMany({
    where: { OR: [{ paymentMethod: 'PAYMONGO' }, { name: { startsWith: 'Paymongo', mode: 'insensitive' } }], accountId: { not: null } },
    select: { accountId: true, branch: true },
  })
  const branchOfClearing = new Map<string, string | null>()
  for (const m of modes) if (m.accountId && !branchOfClearing.has(m.accountId)) branchOfClearing.set(m.accountId, m.branch || null)
  const clearingIds = [...branchOfClearing.keys()]
  // Credits made earlier in this run, so two payouts never claim the same open balance.
  const claimed = new Map<string, number>()
  const openBalance = async (accountId: string, asOf: Date) => {
    const agg = await prisma.journalEntryLine.aggregate({
      where: { accountId, journalEntry: { entryDate: { lte: asOf } } },
      _sum: { debit: true, credit: true },
    })
    return r2(Number(agg._sum.debit || 0) - Number(agg._sum.credit || 0) - (claimed.get(accountId) || 0))
  }

  let recorded = 0, netTotal = 0, unallocated = 0
  for (const acct of PAYMONGO_ACCOUNTS) {
    if (!paymongoConfigured(acct.code)) continue
    let payouts: unknown[]
    try { payouts = await listPayouts(acct.code, { limit: 20 }) }
    catch (e) { console.error(`[PayMongo] listPayouts failed for ${acct.code}:`, e); continue }

    for (const raw of payouts) {
      const p = parsePayout(raw)
      if (!p.settled || p.netPhp <= 0 || !p.paidAt || p.paidAt < POSTING_FROM) continue
      const dup = await prisma.journalEntry.findFirst({
        where: { referenceType: 'PAYMONGO_PAYOUT', referenceId: p.payoutId }, select: { id: true },
      })
      if (dup) continue

      let txns: { data: Record<string, unknown>[]; complete: boolean }
      try { txns = await listPayoutTransactions(acct.code, p.payoutId) }
      catch (e) { console.error('[PayMongo] payout transactions failed for', p.payoutId, e); continue }

      const credits = new Map<string, number>()
      const notes: string[] = []
      const linkedCheckoutIds: string[] = []
      const addCredit = (accountId: string, amt: number) => {
        credits.set(accountId, r2((credits.get(accountId) || 0) + amt))
        claimed.set(accountId, r2((claimed.get(accountId) || 0) + amt))
      }

      for (const t of txns.data) {
        const a = (t.attributes || {}) as Record<string, unknown>
        const paymentId = String(a.payment_id || t.id || '')
        let remaining = r2(Number(a.net_amount || 0) / 100)
        if (!(remaining > 0)) continue

        // 1–2. A payment link this hub created.
        const co = paymentId ? await prisma.paymongoCheckout.findFirst({
          where: { paymentId }, select: { id: true, checkoutId: true, orderId: true },
        }) : null
        if (co) {
          linkedCheckoutIds.push(co.id)
          const sale = await prisma.journalEntry.findFirst({
            where: { referenceType: 'PAYMONGO_SALE', referenceId: co.checkoutId },
            select: { lines: { where: { debit: { gt: 0 }, accountId: { in: clearingIds } }, select: { accountId: true } } },
          })
          let target = sale?.lines[0]?.accountId
          if (!target && co.orderId) {
            const op = await prisma.orderPayment.findFirst({
              where: { orderId: co.orderId, paymentMode: { accountId: { in: clearingIds } } },
              select: { paymentMode: { select: { accountId: true } } },
            })
            target = op?.paymentMode?.accountId || undefined
          }
          if (target) { addCredit(target, remaining); continue }
          // A link sale not yet on the books: never let it absorb a cashier's
          // POS clearing balance — it waits in suspense instead.
          notes.push(`${paymentId} ₱${remaining.toFixed(2)} (payment link with no sale entry)`)
          continue
        }

        // 3. A POS PayMongo payment: the branch clearing with room for it.
        const open = await Promise.all(clearingIds.map(async id => ({ id, bal: await openBalance(id, p.paidAt!) })))
        open.sort((x, y) => y.bal - x.bal)
        for (const o of open) {
          if (!(remaining > 0.005) || !(o.bal > 0.005)) break
          const take = r2(Math.min(o.bal, remaining))
          addCredit(o.id, take)
          remaining = r2(remaining - take)
        }
        if (remaining > 0.005) notes.push(`${paymentId} ₱${remaining.toFixed(2)}${a.description ? ` (${String(a.description).slice(0, 60)})` : ''}`)
      }

      const allocated = r2([...credits.values()].reduce((s, v) => s + v, 0))
      // Untraced payments, a short transaction list, or payout-level adjustments
      // (refunds, disputes, taxes) all surface here rather than in a clearing.
      const diff = r2(p.netPhp - allocated)
      if (!txns.complete) notes.push('payout lists more transactions than were read')

      const lines: PostingLine[] = [{ accountId: wallet.id, debit: p.netPhp, description: `PayMongo payout ${p.payoutId}` }]
      for (const [accountId, amt] of credits) lines.push({ accountId, credit: amt, description: 'PayMongo clearing settled by payout' })
      if (diff > 0.005) lines.push({ accountId: suspense.id, credit: diff, description: `PayMongo payout — untraced: ${notes.join('; ') || 'payout-level difference'}`.slice(0, 250) })
      if (diff < -0.005) lines.push({ accountId: suspense.id, debit: -diff, description: 'PayMongo payout — less than the payments it settled (refund/dispute/adjustment)' })

      const branches = new Set([...credits.keys()].map(id => branchOfClearing.get(id)).filter(Boolean))
      try {
        await postJournalEntry(prisma, {
          entryDate: p.paidAt,
          description: `PayMongo payout to wallet — ${p.payoutId} (${acct.code})`,
          referenceType: 'PAYMONGO_PAYOUT',
          referenceId: p.payoutId,
          branch: branches.size === 1 && diff <= 0.005 && diff >= -0.005 ? [...branches][0] as string : 'ALL',
          createdById: userId,
          lines,
        })
      } catch (e) {
        console.error('[PayMongo] payout JE failed for', p.payoutId, e)
        for (const [id, amt] of credits) claimed.set(id, r2((claimed.get(id) || 0) - amt))
        continue
      }

      if (linkedCheckoutIds.length) await prisma.paymongoCheckout.updateMany({ where: { id: { in: linkedCheckoutIds } }, data: { payoutId: p.payoutId } })
      recorded++; netTotal = r2(netTotal + p.netPhp)
      if (diff > 0.005) unallocated = r2(unallocated + diff)
    }

    // The wallet's fee on each settlement to the bank (₱10 per transfer so far):
    // the bank receives the amount, the wallet loses amount + fee.
    const charges = await prisma.account.findFirst({ where: { accountNumber: BANK_CHARGES_NUMBER }, select: { id: true } })
    if (!charges) continue
    let wallets: Record<string, unknown>[] = []
    try { wallets = await listWallets(acct.code) } catch { /* no wallet product on this account */ }
    for (const w of wallets) {
      const walletNo = String(((w.attributes || {}) as Record<string, unknown>).account_number || '')
      let wtx: Record<string, unknown>[] = []
      try { wtx = await listWalletTransactions(acct.code, String(w.id)) } catch (e) { console.error('[PayMongo] wallet transactions failed:', e); continue }
      for (const t of wtx) {
        const a = (t.attributes || {}) as Record<string, unknown>
        const sender = (a.sender || {}) as Record<string, unknown>
        const fee = r2(Number(a.fee || 0) / 100)
        const at = a.created_at ? new Date(Number(a.created_at) * 1000) : null
        if (!walletNo || String(sender.bank_account_number || '') !== walletNo) continue
        if (!(fee > 0) || a.status !== 'succeeded' || !at || at < POSTING_FROM) continue
        const ref = String(t.id)
        if (await prisma.journalEntry.findFirst({ where: { referenceType: 'PAYMONGO_WALLET_FEE', referenceId: ref }, select: { id: true } })) continue
        try {
          await postJournalEntry(prisma, {
            entryDate: at,
            description: `PayMongo wallet transfer fee — ${ref} (₱${(Number(a.amount || 0) / 100).toFixed(2)} sent to the bank)`,
            referenceType: 'PAYMONGO_WALLET_FEE',
            referenceId: ref,
            branch: 'ALL',
            createdById: userId,
            lines: [
              { accountId: charges.id, debit: fee, description: 'PayMongo wallet transfer fee' },
              { accountId: wallet.id, credit: fee, description: 'PayMongo wallet transfer fee' },
            ],
          })
        } catch (e) { console.error('[PayMongo] wallet fee JE failed for', ref, e) }
      }
    }
  }

  return { recorded, net: netTotal, unallocated }
}
