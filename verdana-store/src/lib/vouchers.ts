// ── Discount voucher storage + validation (SERVER-ONLY) ─────────
// Vouchers live in src/data/vouchers.json (runtime data, not in git,
// excluded from the rsync deploy — same pattern as store-data.json).

import { readFile, writeFile, mkdir, rename } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { TOYS_COLLECTIONS, BULKY_COLLECTIONS } from './partners'

export type DiscountType = 'percent' | 'fixed' | 'none'

/** A cart line resolved to its collection, used for category-aware discounts. */
export interface LineForDiscount {
  collectionSlug?: string
  price: number
  quantity: number
}

export interface Voucher {
  /** Uppercase code — this is the unique id customers type in. */
  code: string
  discountType: DiscountType
  /** Percent (e.g. 10 = 10%) or peso amount; 0 when discountType is 'none'. */
  discountValue: number
  /** When true, shipping fee is waived at checkout. */
  freeShipping: boolean
  active: boolean
  /** Optional minimum product subtotal (pesos) required to use the code. */
  minSubtotal?: number
  /** Optional expiry as yyyy-mm-dd (inclusive, end of that day). */
  expiresAt?: string
  /** Optional cap on total redemptions. */
  usageLimit?: number
  /** How many times it has been redeemed (incremented on paid webhook). */
  usedCount?: number
  description?: string
  // ── Partner (institutional) codes ──
  /** Per-category discount %: toys = Toys & Sensory Tools; bulky = Furniture/Room + Active Play.
   *  When set, the discount is computed per line by category (overrides discountValue). */
  categoryRates?: { toys?: number; bulky?: number }
  /** 'patient' (toys only) or 'clinic' (both bands) — for labelling/audit. */
  scope?: 'patient' | 'clinic'
  /** Owning partner id, when this is a partner-generated code. */
  partnerId?: string
}

const DATA_FILE = join(process.cwd(), 'src', 'data', 'vouchers.json')

export function normalizeCode(code: string): string {
  return (code || '').trim().toUpperCase()
}

function parse(raw: string): Voucher[] {
  const parsed = JSON.parse(raw)
  if (Array.isArray(parsed)) return parsed
  return Array.isArray(parsed?.vouchers) ? parsed.vouchers : []
}

// Async read/write for the admin CRUD path.
export async function readVouchers(): Promise<Voucher[]> {
  try {
    return parse(await readFile(DATA_FILE, 'utf-8'))
  } catch {
    return []
  }
}

export async function writeVouchers(vouchers: Voucher[]): Promise<void> {
  await mkdir(join(process.cwd(), 'src', 'data'), { recursive: true })
  const tmp = `${DATA_FILE}.tmp`
  await writeFile(tmp, JSON.stringify(vouchers, null, 2))
  await rename(tmp, DATA_FILE) // atomic
}

// Sync read for the hot request path (small file).
function readVouchersSync(): Voucher[] {
  try {
    if (!existsSync(DATA_FILE)) return []
    return parse(readFileSync(DATA_FILE, 'utf-8'))
  } catch {
    return []
  }
}

export interface VoucherResult {
  valid: boolean
  reason?: string
  code?: string
  discountType?: DiscountType
  discountValue?: number
  freeShipping?: boolean
  /** Peso amount discounted off the product subtotal. */
  discountAmount?: number
  description?: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Per-category discount (pesos) for a partner code across the given lines. */
function categoryDiscount(rates: { toys?: number; bulky?: number }, lines: LineForDiscount[]): number {
  let d = 0
  for (const li of lines) {
    const slug = li.collectionSlug || ''
    let rate = 0
    if (TOYS_COLLECTIONS.includes(slug)) rate = rates.toys || 0
    else if (BULKY_COLLECTIONS.includes(slug)) rate = rates.bulky || 0
    if (rate > 0) d += (li.price * li.quantity * rate) / 100
  }
  return round2(d)
}

/**
 * Validate a code against a product subtotal and compute the discount.
 * `lines` (optional) enables category-aware partner codes; without it a partner
 * code falls back to its headline rate applied to the whole subtotal.
 */
export function evaluateVoucher(codeInput: string, subtotal: number, lines?: LineForDiscount[]): VoucherResult {
  const code = normalizeCode(codeInput)
  if (!code) return { valid: false, reason: 'Enter a code.' }

  const v = readVouchersSync().find((x) => normalizeCode(x.code) === code)
  if (!v) return { valid: false, reason: "That code isn't valid." }
  if (!v.active) return { valid: false, reason: 'This code is no longer active.' }

  if (v.expiresAt) {
    const exp = new Date(`${v.expiresAt}T23:59:59`)
    if (!isNaN(exp.getTime()) && Date.now() > exp.getTime()) {
      return { valid: false, reason: 'This code has expired.' }
    }
  }

  if (typeof v.usageLimit === 'number' && v.usageLimit > 0 && (v.usedCount || 0) >= v.usageLimit) {
    return { valid: false, reason: 'This code has reached its usage limit.' }
  }

  if (typeof v.minSubtotal === 'number' && v.minSubtotal > 0 && subtotal < v.minSubtotal) {
    return {
      valid: false,
      reason: `This code needs a minimum order of ₱${v.minSubtotal.toLocaleString('en-PH')}.`,
    }
  }

  let discountAmount = 0
  const isPartnerCode = !!v.categoryRates
  if (isPartnerCode) {
    discountAmount = lines && lines.length
      ? categoryDiscount(v.categoryRates!, lines)
      : round2((subtotal * (v.categoryRates!.toys || 0)) / 100) // fallback: headline rate
  } else if (v.discountType === 'percent') {
    discountAmount = round2((subtotal * (v.discountValue || 0)) / 100)
  } else if (v.discountType === 'fixed') {
    discountAmount = round2(Math.min(v.discountValue || 0, subtotal))
  }

  // Non-partner codes with nothing to give are rejected. Partner codes are accepted
  // even at ₱0 (e.g. a patient code on a furniture-only cart) so it can still apply
  // once qualifying items are added.
  if (!isPartnerCode && v.discountType !== 'none' && discountAmount <= 0 && !v.freeShipping) {
    return { valid: false, reason: 'This code has no discount to apply.' }
  }

  return {
    valid: true,
    code: v.code,
    discountType: v.discountType,
    discountValue: v.discountValue,
    freeShipping: !!v.freeShipping,
    discountAmount,
    description: v.description,
  }
}

/** Append new vouchers (used when a partner subscription is paid). */
export async function addVouchers(newOnes: Voucher[]): Promise<void> {
  const all = await readVouchers()
  all.push(...newOnes)
  await writeVouchers(all)
}

/** Is a code already taken? (case-insensitive) */
export async function codeExists(code: string): Promise<boolean> {
  const c = normalizeCode(code)
  return (await readVouchers()).some((v) => normalizeCode(v.code) === c)
}

/** Increment redemption count for a code (called from the paid webhook). */
export async function incrementUsage(codeInput: string): Promise<void> {
  const code = normalizeCode(codeInput)
  if (!code) return
  const vouchers = await readVouchers()
  const idx = vouchers.findIndex((x) => normalizeCode(x.code) === code)
  if (idx === -1) return
  vouchers[idx].usedCount = (vouchers[idx].usedCount || 0) + 1
  await writeVouchers(vouchers)
}
