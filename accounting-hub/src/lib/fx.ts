import { prisma } from '@/lib/prisma'

// Every figure in the general ledger is PHP. Accounts held in another currency
// therefore have to be translated before they are posted, using the rate that
// applied on the day — which is what the Chart of Accounts has always told
// users would happen.
export const HOME_CURRENCY = 'PHP'

export function isForeign(currency: string | null | undefined): boolean {
  return !!currency && currency !== HOME_CURRENCY
}

/** Midnight UTC, so a rate's effective date is not shifted by local time. */
function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export interface Rate {
  phpPerUnit: number
  rateDate: string
  /** false when no rate on or before the date exists and a later one was used */
  onOrBefore: boolean
}

/**
 * The rate to state `currency` in PHP on `date`: the most recent one on or
 * before it. If the rate table only starts later — an early transaction loaded
 * before any exchange was recorded — the earliest known rate is used instead and
 * flagged, which is better than refusing to post but should not pass unnoticed.
 */
export async function rateFor(currency: string, date: Date): Promise<Rate | null> {
  if (!isForeign(currency)) return { phpPerUnit: 1, rateDate: '', onOrBefore: true }
  const on = dateOnly(date)
  const prev = await prisma.exchangeRate.findFirst({
    where: { currency, date: { lte: on } },
    orderBy: { date: 'desc' },
  })
  const use = prev ?? await prisma.exchangeRate.findFirst({
    where: { currency },
    orderBy: { date: 'asc' },
  })
  if (!use) return null
  return {
    phpPerUnit: Number(use.phpPerUnit),
    rateDate: use.date.toISOString().slice(0, 10),
    onOrBefore: !!prev,
  }
}

/** Amount stated in PHP, rounded to centavos. */
export function toPhp(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100
}

/**
 * Record the rate an actual exchange took place at. Two exchanges of the same
 * currency on one day are averaged rather than one silently overwriting the
 * other, since both really happened.
 */
export async function recordRate(
  currency: string, date: Date, phpPerUnit: number, note?: string, userId?: string | null,
) {
  if (!isForeign(currency) || !(phpPerUnit > 0)) return
  const on = dateOnly(date)
  const existing = await prisma.exchangeRate.findUnique({
    where: { currency_date: { currency, date: on } },
  })
  if (existing && existing.source === 'FOREX_MATCH') {
    const blended = (Number(existing.phpPerUnit) + phpPerUnit) / 2
    await prisma.exchangeRate.update({
      where: { id: existing.id },
      data: { phpPerUnit: blended, note: `${existing.note || ''} + ${note || ''}`.trim().slice(0, 200) },
    })
    return
  }
  if (existing) return   // a hand-entered rate is a deliberate choice; leave it
  await prisma.exchangeRate.create({
    data: { currency, date: on, phpPerUnit, source: 'FOREX_MATCH', note: note?.slice(0, 200) || null, createdById: userId ?? null },
  })
}
