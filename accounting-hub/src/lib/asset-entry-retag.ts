// What an expense entry's Account Title change does to the assets made from it
// ("Add to Asset Management", linked by Asset.sourceEntryId).
//
// Hannah, 2026-11-01: an entry first saved under one asset account and then
// revised to another (CEO-PCV26-000150: 2080 → 2050, with the title blank for
// a moment in between) must keep its asset — the asset follows the new
// classification. A blank title is an edit in progress and changes nothing.
// Only a real non-asset (expense) account takes the assets out of the register.
import type { PrismaClient } from '@prisma/client'
import { assetClassFromAccountTitle, isDepreciatingClassification } from '@/lib/asset-classification'
import { deleteAssetWithReversal, postAssetJournal, reverseAssetJournal } from '@/lib/accounting/post-asset'
import { netOfVat, type VatSource } from '@/lib/vat'

type RetagEntry = VatSource & {
  id: string; pcvNumber: string; assetAddedAt: Date | null
  addedToAssetId: string | null; branchAllocations: unknown
}

// The part of an entry that was added to an existing asset (net of VAT): its
// one branch allocation, or the whole gross.
function addedAmount(e: RetagEntry): number {
  const allocs = (Array.isArray(e.branchAllocations) ? e.branchAllocations : []) as { branch?: string; amount?: number | string }[]
  const a = allocs.find(x => x?.branch && Number(x.amount) !== 0)
  return Math.round(netOfVat(e, a ? Number(a.amount) : Number(e.grossAmount) || 0) * 100) / 100
}

async function repostIfJournaled(prisma: PrismaClient, assetId: string, userId: string, reason: string) {
  if (!(await prisma.journalEntry.findFirst({ where: { referenceType: 'ASSET_PURCHASE', referenceId: assetId }, select: { id: true } }))) return
  try {
    await reverseAssetJournal(prisma, assetId, userId, reason)
    await postAssetJournal(prisma, assetId, userId)
  } catch (err) {
    console.error(`[GL] asset re-post threw for ${assetId}:`, err)
  }
}

/** Returns the entry fields to write alongside the title (assetAddedAt: null when withdrawn). */
export async function retagEntryAssets(
  prisma: PrismaClient,
  entry: RetagEntry,
  newTitle: string | null | undefined,
  userId: string,
): Promise<{ assetAddedAt?: null; addedToAssetId?: null }> {
  if (!entry.assetAddedAt || !newTitle) return {}
  const cls = assetClassFromAccountTitle(newTitle)
  // A balance payment added onto an existing asset: that asset keeps its own
  // classification; re-tagging the payment to an expense takes its amount back out.
  if (entry.addedToAssetId) {
    if (cls) return {}
    const asset = await prisma.asset.findUnique({ where: { id: entry.addedToAssetId }, select: { id: true, totalAmount: true, quantity: true, yearsDepreciation: true } })
    if (asset) {
      const total = Math.max(0, Math.round((Number(asset.totalAmount) - addedAmount(entry)) * 100) / 100)
      const qty = asset.quantity || 1
      await prisma.asset.update({
        where: { id: asset.id },
        data: {
          totalAmount: total,
          purchasePrice: qty > 1 ? Math.round((total / qty) * 100) / 100 : total,
          monthlyDepreciation: asset.yearsDepreciation > 0 ? total / (asset.yearsDepreciation * 12) : 0,
        },
      })
      // The payment's own entry carried its cost, so the asset's acquisition JE
      // (if any) never included it — nothing to re-post.
    }
    return { assetAddedAt: null, addedToAssetId: null }
  }
  const linked = await prisma.asset.findMany({
    where: { sourceEntryId: entry.id },
    select: { id: true, classification: true, totalAmount: true, dateBought: true },
  })
  if (!cls) {
    for (const a of linked) {
      await deleteAssetWithReversal(prisma, a.id, userId, `source entry ${entry.pcvNumber} re-tagged from asset to expense`)
    }
    return { assetAddedAt: null }
  }
  // Asset → another asset account: move the assets to the new classification,
  // with that classification's depreciation life (same rule as creation).
  const years = isDepreciatingClassification(cls)
    ? ((await prisma.assetDepreciationSetting.findUnique({ where: { classification: cls } }))?.years ?? 5)
    : 0
  for (const a of linked) {
    if (a.classification === cls) continue
    const total = Number(a.totalAmount)
    const end = new Date(a.dateBought)
    if (years > 0) end.setFullYear(end.getFullYear() + years)
    await prisma.asset.update({
      where: { id: a.id },
      data: { classification: cls, yearsDepreciation: years, monthlyDepreciation: years > 0 ? total / (years * 12) : 0, depreciationEndDate: end },
    })
    // Assets made from entries normally carry no acquisition JE (the entry
    // already booked the cost). If one was posted later, re-post it under the
    // new classification, as an edit in Asset Management does.
    await repostIfJournaled(prisma, a.id, userId, `source entry ${entry.pcvNumber} re-classified`)
  }
  return {}
}

/**
 * Cost added onto each asset by balance payments (PettyCashEntry.addedToAssetId),
 * net of VAT. Those payments book their own cost, so anything that derives an
 * asset's purchase from its totalAmount must take this back out.
 */
export async function addedCostByAsset(prisma: PrismaClient): Promise<Map<string, number>> {
  const rows = await prisma.pettyCashEntry.findMany({
    where: { addedToAssetId: { not: null } },
    select: { id: true, pcvNumber: true, assetAddedAt: true, addedToAssetId: true, branchAllocations: true, grossAmount: true, vatable: true, vatPortion: true },
  })
  const out = new Map<string, number>()
  for (const e of rows) out.set(e.addedToAssetId!, (out.get(e.addedToAssetId!) || 0) + addedAmount(e))
  return out
}

/** The same, for one asset. */
export async function addedCostForAsset(prisma: PrismaClient, assetId: string): Promise<number> {
  const rows = await prisma.pettyCashEntry.findMany({
    where: { addedToAssetId: assetId },
    select: { id: true, pcvNumber: true, assetAddedAt: true, addedToAssetId: true, branchAllocations: true, grossAmount: true, vatable: true, vatPortion: true },
  })
  return rows.reduce((s, e) => s + addedAmount(e), 0)
}

