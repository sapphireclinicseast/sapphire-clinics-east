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

/** Returns the entry fields to write alongside the title (assetAddedAt: null when withdrawn). */
export async function retagEntryAssets(
  prisma: PrismaClient,
  entry: { id: string; pcvNumber: string; assetAddedAt: Date | null },
  newTitle: string | null | undefined,
  userId: string,
): Promise<{ assetAddedAt?: null }> {
  if (!entry.assetAddedAt || !newTitle) return {}
  const cls = assetClassFromAccountTitle(newTitle)
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
    const je = await prisma.journalEntry.findFirst({ where: { referenceType: 'ASSET_PURCHASE', referenceId: a.id }, select: { id: true } })
    if (je) {
      try {
        await reverseAssetJournal(prisma, a.id, userId, `source entry ${entry.pcvNumber} re-classified`)
        await postAssetJournal(prisma, a.id, userId)
      } catch (err) {
        console.error(`[GL] asset re-classify posting threw for ${a.id}:`, err)
      }
    }
  }
  return {}
}
