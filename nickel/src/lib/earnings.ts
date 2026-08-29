// The money split for a Nickel homecare session.
//
// Per the Provider Terms (Clause 10) and Annex A: SCEI retains a 15% Platform
// Fee on the Provider Rate, and withholds 5% creditable withholding tax (the
// rate for professionals earning ≤ PHP 3M/yr who filed the sworn declaration;
// otherwise 10% — kept flat at 5% here until per-provider tax status is tracked).
// Payment processing charges are absorbed by SCEI out of the Platform Fee.

export const PLATFORM_FEE_RATE = 0.15
export const CWT_RATE = 0.05

const r2 = (n: number) => Math.round(n * 100) / 100

export interface EarningsSplit { gross: number; fee: number; cwt: number; net: number }

// grossPhp = the amount charged to the patient (the provider rate; transport,
// once modelled as a separate pass-through, is added to net without a fee).
export function computeSplit(grossPhp: number): EarningsSplit {
  const gross = r2(grossPhp)
  const fee = r2(gross * PLATFORM_FEE_RATE)
  const cwt = r2(gross * CWT_RATE)
  const net = r2(gross - fee - cwt)
  return { gross, fee, cwt, net }
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
