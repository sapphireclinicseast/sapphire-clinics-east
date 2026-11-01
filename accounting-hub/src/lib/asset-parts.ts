// The payments behind an asset's cost (Asset.parts), shown as its breakdown in
// Asset Management (Hannah, 2026-11-01: a combined fit-out must still show its
// 40% / 40% / 20% payments and their dates). An asset with one payment has no
// parts; the first combine or balance payment seeds the list with the asset's
// own original payment.
import type { Prisma } from '@prisma/client'

export interface AssetPart {
  date: string            // YYYY-MM-DD
  label: string
  amount: number
  ref?: string | null     // control number / PCV / check reference
  entryId?: string | null // the expense entry that paid it, when there is one
}

type PartSource = { parts?: Prisma.JsonValue | null; dateBought: Date; name: string; totalAmount: Prisma.Decimal | number; controlNumber: string | null }

const ymd = (d: Date | string) => new Date(d).toISOString().slice(0, 10)
const r2 = (n: number) => Math.round(n * 100) / 100

export function partsOf(a: PartSource): AssetPart[] {
  if (Array.isArray(a.parts) && a.parts.length) return a.parts as unknown as AssetPart[]
  return [{ date: ymd(a.dateBought), label: a.name, amount: r2(Number(a.totalAmount)), ref: a.controlNumber }]
}

export const partsJson = (parts: AssetPart[]) =>
  [...parts].sort((x, y) => x.date.localeCompare(y.date)) as unknown as Prisma.InputJsonValue

/** Scale every part to a share of the asset (a branch split keeps the payment mix). */
export const scaleParts = (parts: AssetPart[], ratio: number) => parts.map(p => ({ ...p, amount: r2(p.amount * ratio) }))

export { ymd as partDate }
