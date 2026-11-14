/**
 * Gift cards — a prepaid peso value on a scannable code (POS → Services → Vouchers).
 *
 * Life of a card (Hannah, 2026-11-14):
 *   UNSOLD   generated in a batch and printed; worth nothing yet.
 *   ACTIVE   rung up at the Cashier as its own order. That order is UNEARNED:
 *            DR cash / CR 4050 Unearned Revenue for the face value.
 *            Each use at checkout is a GIFT_CARD payment line (reference = the
 *            code): DR 4050 / CR revenue at FULL price — never a discount.
 *            Whatever is not spent stays on the code.
 *   USED_UP  balance reached 0 (back to ACTIVE if an order that used it is voided).
 *   VOIDED   pulled from circulation — only an unsold card can be voided.
 *
 * No expiry: RA 10962 (Gift Check Act of 2017) makes it unlawful to put an
 * expiry date on a gift check or refuse its unused balance.
 *
 * Every balance change is guarded in the WHERE clause (status, balance ≥ amount)
 * so the same card used at two counters at once can only be spent once.
 */
import type { PrismaClient, Prisma } from '@prisma/client'

type Tx = PrismaClient | Prisma.TransactionClient

/** Unambiguous alphabet (no 0/O/1/I/L) — codes are read aloud and typed as often as scanned. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function randomGiftCardCode(): string {
  let s = ''
  for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return `GC-${s}`
}

/** The order line a gift card sale writes. post-order credits 4050 for these lines. */
export const giftCardItemName = (code: string) => `Gift Card ${code}`
const ITEM_RE = /^Gift Card (GC-[A-Z0-9]{8})$/
export function giftCardCodeFromItem(name: string | null | undefined): string | null {
  const m = ITEM_RE.exec((name || '').trim())
  return m ? m[1] : null
}

/** Money actually coming in — the only ways a gift card can be paid for. */
export const GIFT_CARD_SALE_METHODS = ['CASH', 'GCASH', 'PAYMAYA', 'PAYMONGO', 'DEBIT', 'CREDIT_CARD']

const r2 = (n: number) => Math.round(n * 100) / 100
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type PayLike = { method?: string; amount?: number | string; reference?: string | null }

/** GIFT_CARD payment lines summed per code (a card may appear on two lines). */
export function giftCardLegs(payments: PayLike[] | null | undefined): Map<string, number> {
  const legs = new Map<string, number>()
  for (const p of payments || []) {
    if (p.method !== 'GIFT_CARD') continue
    const amt = r2(Number(p.amount) || 0)
    if (amt <= 0) continue
    const code = String(p.reference || '').trim().toUpperCase()
    legs.set(code, r2((legs.get(code) || 0) + amt))
  }
  return legs
}

/** Why these GIFT_CARD lines cannot be paid, or null when every card covers its amount. */
export async function giftCardLegsProblem(tx: Tx, legs: Map<string, number>): Promise<string | null> {
  for (const [code, amt] of legs) {
    if (!code) return 'A gift card payment has no card code — scan or type the card again'
    const c = await tx.giftCard.findUnique({ where: { code } })
    if (!c) return `Gift card ${code} was not found — check the code`
    if (c.status === 'UNSOLD') return `Gift card ${code} has not been sold yet — it has no value until it is paid for at the Cashier`
    if (c.status === 'VOIDED') return `Gift card ${code} has been voided`
    const bal = Number(c.balance)
    if (c.status === 'USED_UP' || bal <= 0) return `Gift card ${code} has no balance left`
    if (amt > bal + 0.005) return `Gift card ${code} has only ${peso(bal)} left — put the rest on another payment`
  }
  return null
}

/**
 * Spend the cards. All-or-nothing: if any card can't cover its amount (it was
 * just used elsewhere), the ones already drawn are put back and the reason is
 * returned. Outside a transaction this is the claim-before-create pattern the
 * voucher uses; inside one, throw on the returned reason to roll back.
 */
export async function drawGiftCards(tx: Tx, legs: Map<string, number>): Promise<string | null> {
  const done: [string, number][] = []
  for (const [code, amt] of legs) {
    const r = await tx.giftCard.updateMany({
      where: { code, status: 'ACTIVE', balance: { gte: amt } },
      data: { balance: { decrement: amt } },
    })
    if (r.count === 0) {
      await restoreGiftCards(tx, new Map(done))
      return (await giftCardLegsProblem(tx, new Map([[code, amt]])))
        || `Gift card ${code} could not be charged — it may have just been used at another counter`
    }
    done.push([code, amt])
    await tx.giftCard.updateMany({ where: { code, status: 'ACTIVE', balance: { lte: 0.004 } }, data: { status: 'USED_UP', balance: 0 } })
  }
  return null
}

/** Put amounts back on cards (undo a draw). */
export async function restoreGiftCards(tx: Tx, legs: Map<string, number>) {
  for (const [code, amt] of legs) {
    await tx.giftCard.updateMany({
      where: { code, status: { in: ['ACTIVE', 'USED_UP'] } },
      data: { balance: { increment: amt }, status: 'ACTIVE' },
    })
  }
}

/** Ledger of who spent what: one +row per card drawn by the order. */
export async function recordGiftCardUses(tx: Tx, legs: Map<string, number>, orderId: string, userId: string | null) {
  for (const [code, amt] of legs) {
    const c = await tx.giftCard.findUnique({ where: { code }, select: { id: true } })
    if (c) await tx.giftCardUse.create({ data: { cardId: c.id, orderId, amount: amt, createdById: userId } })
  }
}

/** What an order currently holds on each card: its uses net of earlier put-backs. */
async function heldNet(tx: Tx, orderId: string): Promise<Map<string, { cardId: string; amt: number }>> {
  const uses = await tx.giftCardUse.findMany({ where: { orderId }, include: { card: { select: { code: true } } } })
  const net = new Map<string, { cardId: string; amt: number }>()
  for (const u of uses) {
    const k = u.card.code
    const cur = net.get(k) || { cardId: u.cardId, amt: 0 }
    cur.amt = r2(cur.amt + Number(u.amount))
    net.set(k, cur)
  }
  return net
}

/** True when an edit leaves the order's gift card payments exactly as they are. */
export async function giftCardLegsUnchanged(tx: Tx, orderId: string, legs: Map<string, number>): Promise<boolean> {
  const held = new Map([...(await heldNet(tx, orderId))].filter(([, v]) => v.amt > 0.004).map(([k, v]) => [k, v.amt]))
  if (held.size !== legs.size) return false
  for (const [k, v] of legs) if (Math.abs((held.get(k) ?? -1) - v) > 0.004) return false
  return true
}

/**
 * Put back everything an order still holds on gift cards (its uses net of
 * earlier put-backs) — for a void, or before an edit re-applies the payments.
 * Returns what was put back, per code.
 */
export async function putBackOrderGiftCards(tx: Tx, orderId: string, userId: string | null): Promise<Map<string, number>> {
  const net = await heldNet(tx, orderId)
  const back = new Map<string, number>()
  for (const [code, { cardId, amt }] of net) {
    if (amt <= 0.004) continue
    await tx.giftCard.updateMany({
      where: { id: cardId, status: { in: ['ACTIVE', 'USED_UP'] } },
      data: { balance: { increment: amt }, status: 'ACTIVE' },
    })
    await tx.giftCardUse.create({ data: { cardId, orderId, amount: -amt, createdById: userId } })
    back.set(code, amt)
  }
  return back
}

/* ── Selling ─────────────────────────────────────────────────────────────── */

type SaleBody = {
  items?: { giftCardId?: string; name?: string; quantity?: number; unitPrice?: number; lineTotal?: number; serviceId?: string | null; inventoryItemId?: string | null }[]
  payments?: PayLike[]
  discountAmount?: number | string
  voucherId?: string | null
  unpaid?: boolean
  revenueType?: string
}

/**
 * A gift card sale arrives as order lines carrying giftCardId. Checks the sale
 * is sellable and rewrites the lines from the cards themselves (name, face
 * value), so the till can't change what a card is worth. Mutates `body`.
 * Returns the card ids to claim, an error, or null when this is not a gift
 * card sale.
 */
export async function prepareGiftCardSale(tx: Tx, body: SaleBody): Promise<{ cardIds: string[] } | { error: string } | null> {
  const items = body.items || []
  const ids = items.map(i => i.giftCardId).filter((x): x is string => !!x)
  if (ids.length === 0) return null
  if (ids.length !== items.length) return { error: 'Sell gift cards on their own order — ring up services and products separately.' }
  if (new Set(ids).size !== ids.length) return { error: 'The same gift card is on the order twice.' }
  if (Number(body.discountAmount) > 0 || body.voucherId) return { error: 'A gift card is sold at its full value — remove the discount or voucher.' }
  const pays = body.payments || []
  if (body.unpaid || pays.some(p => p.method === 'RECEIVABLE')) return { error: 'A gift card must be paid for when it is sold — it cannot be saved as Unpaid or charged to a receivable.' }
  if (pays.some(p => (Number(p.amount) || 0) > 0 && !GIFT_CARD_SALE_METHODS.includes(String(p.method)))) {
    return { error: 'Pay for a gift card with cash, GCash, Maya, a card or PayMongo — not with a wallet, HMO, GL or another gift card.' }
  }
  const cards = await tx.giftCard.findMany({ where: { id: { in: ids } } })
  const byId = new Map(cards.map(c => [c.id, c]))
  for (const id of ids) {
    const c = byId.get(id)
    if (!c) return { error: 'Gift card not found — scan it again.' }
    if (c.status !== 'UNSOLD') return { error: `Gift card ${c.code} was already sold${c.status === 'VOIDED' ? ' — it has been voided' : ''}.` }
  }
  body.items = ids.map(id => {
    const c = byId.get(id)!
    const v = Number(c.faceValue)
    return { giftCardId: id, name: giftCardItemName(c.code), quantity: 1, unitPrice: v, lineTotal: v, serviceId: null, inventoryItemId: null }
  })
  body.revenueType = 'UNEARNED'
  return { cardIds: ids }
}

/** Activate sold cards (UNSOLD → ACTIVE at face value). All-or-nothing. */
export async function claimGiftCardSale(
  tx: Tx, cardIds: string[], opts: { branch: string; buyerName?: string | null; userId: string | null },
): Promise<string | null> {
  const done: string[] = []
  for (const id of cardIds) {
    const c = await tx.giftCard.findUnique({ where: { id }, select: { faceValue: true, code: true } })
    const r = c ? await tx.giftCard.updateMany({
      where: { id, status: 'UNSOLD' },
      data: {
        status: 'ACTIVE', balance: c.faceValue, soldAt: new Date(), soldById: opts.userId,
        soldBranch: opts.branch, buyerName: opts.buyerName?.trim() || null,
      },
    }) : { count: 0 }
    if (r.count === 0) {
      await unsellGiftCards(tx, { ids: done })
      return `Gift card ${c?.code || ''} was just sold at another counter — remove it from this order.`
    }
    done.push(id)
  }
  return null
}

/** Back to UNSOLD (sale voided, or the order failed after the claim). */
export async function unsellGiftCards(tx: Tx, where: { ids?: string[]; orderId?: string }) {
  if (!where.ids?.length && !where.orderId) return
  await tx.giftCard.updateMany({
    where: where.ids?.length ? { id: { in: where.ids } } : { soldOrderId: where.orderId },
    data: { status: 'UNSOLD', balance: 0, soldAt: null, soldOrderId: null, soldById: null, soldBranch: null, buyerName: null },
  })
}

/**
 * Cards an order sold that have already been spent — such a sale can't be
 * voided or refunded until the orders that used them are voided first.
 */
export async function spentCardsSoldBy(tx: Tx, orderId: string): Promise<{ code: string; spent: number }[]> {
  const cards = await tx.giftCard.findMany({ where: { soldOrderId: orderId }, select: { code: true, faceValue: true, balance: true } })
  return cards
    .map(c => ({ code: c.code, spent: r2(Number(c.faceValue) - Number(c.balance)) }))
    .filter(c => c.spent > 0.004)
}

/** A gift card payment that can't go through — thrown inside a transaction to roll it back. */
export class GiftCardPaymentError extends Error {}
