// The money split for a Nickel homecare session.
//
// Nickel's take is a flat PHP 20 platform fee per session. On top of that, the
// payment processor (PayMongo, our payment channel partner) deducts its own
// transaction fee (MDR) before the money reaches us — the exact amount depends
// on how the patient paid. The therapist receives their rate net of both.

// Nickel is currently FREE to use — the platform fee is waived. Providers keep
// their full rate, less only PayMongo's payment-processing fee. Set back to 20
// (or any value) to re-enable the flat per-session app fee.
export const APP_FEE_PHP = 0

// Rolling payout hold. A completed session's earnings become payable only after
// this many days — covering PayMongo's settlement clearing (up to ~3 days by
// method) plus a 7-day Nickel buffer. Payouts run weekly and pay only matured,
// unpaid earnings.
export const PAYOUT_HOLD_DAYS = 10

const r2 = (n: number) => Math.round(n * 100) / 100

// PayMongo MDR by payment method. `pct` is a fraction of the amount; `fixed` is a
// flat peso add-on. `higherOf` means the fee is max(pct, fixed) rather than pct+fixed.
// Source: PayMongo pricing (Aura/Verdana account tier).
export interface FeeTier { key: string; label: string; pct: number; fixed: number; higherOf?: boolean }
export const PAYMONGO_FEES: FeeTier[] = [
  { key: 'card',      label: 'Credit / Debit card (local)', pct: 0.03125, fixed: 13.39 },
  { key: 'card_intl', label: 'International card',           pct: 0.0402,  fixed: 13.39 },
  { key: 'qrph',      label: 'QR Ph',                        pct: 0.0134,  fixed: 0 },
  { key: 'gcash',     label: 'GCash',                        pct: 0.0223,  fixed: 0 },
  { key: 'paymaya',   label: 'Maya',                         pct: 0.0179,  fixed: 0 },
  { key: 'grab_pay',  label: 'GrabPay',                      pct: 0.0196,  fixed: 0 },
  { key: 'shopeepay', label: 'ShopeePay / SPayLater',        pct: 0.0170,  fixed: 0 },
  { key: 'dob',       label: 'Online banking (BDO, BPI, …)', pct: 0.0071,  fixed: 13.39, higherOf: true },
  { key: 'billease',  label: 'Buy Now Pay Later (BillEase)', pct: 0.0134,  fixed: 0 },
]
const FEE_BY_KEY: Record<string, FeeTier> = Object.fromEntries(PAYMONGO_FEES.map((f) => [f.key, f]))

// Normalise the many method identifiers PayMongo can report to our fee keys.
export function normalizeMethod(raw?: string | null): string {
  const m = (raw ?? '').toLowerCase()
  if (!m) return 'card'
  if (m === 'wallet' || m === 'nickel_wallet') return 'wallet'
  if (m.includes('gcash')) return 'gcash'
  if (m.includes('paymaya') || m === 'maya') return 'paymaya'
  if (m.includes('grab')) return 'grab_pay'
  if (m.includes('shopee') || m.includes('spaylater') || m.includes('maribank')) return 'shopeepay'
  if (m.includes('billease')) return 'billease'
  if (m.includes('qr')) return 'qrph'
  if (m.includes('dob') || m.includes('bank') || m.includes('brankas') || m.includes('online_banking')) return 'dob'
  if (m.includes('intl') || m.includes('international')) return 'card_intl'
  if (m.includes('card')) return 'card'
  return FEE_BY_KEY[m] ? m : 'card'
}

// PayMongo processing fee for a charged amount paid by `method`. Store-credit
// ('wallet') incurs no processing fee.
export function paymongoFee(chargedPhp: number, method?: string | null): number {
  const key = normalizeMethod(method)
  if (key === 'wallet' || chargedPhp <= 0) return 0
  const t = FEE_BY_KEY[key] ?? FEE_BY_KEY.card
  const pct = chargedPhp * t.pct
  return r2(t.higherOf ? Math.max(pct, t.fixed) : pct + t.fixed)
}

export interface EarningsSplit { gross: number; appFee: number; processingFee: number; net: number }

// grossPhp = the amount charged to the patient (the therapist's rate).
// chargedPhp = the portion actually run through PayMongo (rate minus any store
// credit applied); defaults to the full amount. `method` / `processingFee` let
// the caller pin the exact processor fee once the payment method is known.
export function computeSplit(grossPhp: number, opts?: { method?: string | null; chargedPhp?: number; processingFee?: number | null }): EarningsSplit {
  const gross = r2(grossPhp)
  const appFee = Math.min(APP_FEE_PHP, gross)
  const charged = opts?.chargedPhp != null ? r2(opts.chargedPhp) : gross
  const processingFee = opts?.processingFee != null ? r2(opts.processingFee) : paymongoFee(charged, opts?.method)
  const net = r2(Math.max(0, gross - appFee - processingFee))
  return { gross, appFee, processingFee, net }
}

// ISO week label (Mon–Sun) for grouping settlements, e.g. "Aug 25–31".
export function weekLabel(d: Date): { key: string; label: string } {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = (dt.getUTCDay() + 6) % 7 // 0 = Monday
  const mon = new Date(dt); mon.setUTCDate(dt.getUTCDate() - dow)
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6)
  const M = (x: Date) => x.toLocaleDateString('en-PH', { month: 'short', timeZone: 'UTC' })
  const key = mon.toISOString().slice(0, 10)
  const label = M(mon) === M(sun)
    ? `${M(mon)} ${mon.getUTCDate()}–${sun.getUTCDate()}`
    : `${M(mon)} ${mon.getUTCDate()} – ${M(sun)} ${sun.getUTCDate()}`
  return { key, label }
}
