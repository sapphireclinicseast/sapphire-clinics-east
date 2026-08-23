// Presentation currency for the reports section.
//
// The books are kept in pesos; this only restates the figures at one rate so an
// investor can read the statements in a familiar unit. Both report engines — the
// standard derivation and the Ledger beta — format through here, so switching
// currency changes every statement rather than only the one that happens to own
// the selector.
import { formatCurrency } from '@/lib/utils'

export const DISPLAY_CURRENCIES = [
  { code: 'PHP', symbol: '₱', label: 'Philippine peso' },
  { code: 'USD', symbol: '$', label: 'US dollar' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
] as const
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number]['code']

// Set by the reports page on every render, before any child formats a figure.
let DISPLAY: { code: DisplayCurrency; symbol: string; phpPerUnit: number } = { code: 'PHP', symbol: '₱', phpPerUnit: 1 }

export function setDisplay(code: DisplayCurrency, phpPerUnit: number) {
  // Without a usable rate we stay in pesos entirely — symbol included. Showing a
  // dollar sign against an untranslated peso figure would be worse than useless.
  if (code === 'PHP' || !(phpPerUnit > 0)) {
    DISPLAY = { code: 'PHP', symbol: '₱', phpPerUnit: 1 }
    return
  }
  const c = DISPLAY_CURRENCIES.find(x => x.code === code) || DISPLAY_CURRENCIES[0]
  DISPLAY = { code: c.code, symbol: c.symbol, phpPerUnit }
}

export const displayCode = (): DisplayCurrency => DISPLAY.code
export const displayRate = (): number => DISPLAY.phpPerUnit

/** PHP figure → the amount shown, in whatever currency is selected. */
export function inDisplay(n: number): number {
  return DISPLAY.phpPerUnit === 1 ? n : n / DISPLAY.phpPerUnit
}

export function formatDisplay(n: number): string {
  if (DISPLAY.code === 'PHP') return formatCurrency(n)
  return DISPLAY.symbol + inDisplay(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Blank-for-zero, used across the statement bodies. */
export function fmt(n: number): string {
  if (n === 0) return '—'
  return formatDisplay(n)
}

/** Negatives in accounting parentheses. */
export function fmtSigned(n: number): string {
  if (n === 0) return '—'
  const prefix = n < 0 ? '(' : ''
  const suffix = n < 0 ? ')' : ''
  return prefix + formatDisplay(Math.abs(n)) + suffix
}
