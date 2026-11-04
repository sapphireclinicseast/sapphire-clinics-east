import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { assetBookableCost, assetGlNetCents, HUB_LEDGER_START, postAssetJournal, repostAssetJournal, reverseAssetJournal } from '@/lib/accounting/post-asset'
import { assetName, isDepreciationOff } from '@/lib/asset-classification'
import { partsJson, partsOf } from '@/lib/asset-parts'

// POST { mainId, otherIds: string[], name?: string }
// Combine asset records that are one item — a 12% VAT line, a delivery fee or
// a split payment entered as its own record (Hannah 2026-11-01) — into the
// main record: its total becomes the sum, depreciation = total ÷ life from the
// main record's purchase date; the other records are removed.
//
// Every part's cost must stay booked exactly once:
// - a part made from an expense entry: the entry books it, and the entry is
//   re-linked to the main record as a balance (PettyCashEntry.addedToAssetId),
//   which the main record's purchase JE leaves out;
// - a part with its own purchase JE: folded into the main record's JE when the
//   main record carries one, otherwise left posted;
// - a manual part the reports synthesize from its own row: posted first when
//   the main record carries no JE of its own;
// - a part paid from petty cash with no entry linked: its voucher books it, so
//   it joins the parts marked carried and the main record's posting leaves it out.
// Photos of every record are kept on the main one.
// Purchases before 2026 sit in the imported QuickBooks GL, so only rows merge.
// Across 2026 (Hannah 2026-11-02: a 2025 tablet + its 2026 stand and screen
// glass): only INTO a pre-2026 main record — its cost stays in the QuickBooks
// books, and every 2026 part keeps (or first gets) its own 2026 posting. A
// pre-2026 part can never go into a 2026 record: its cost would be booked twice.

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Only Admin / Accountant / Bookkeeper can combine assets.' }, { status: 403 })
  }
  const uid = session.user.id as string
  try {
    const body = await req.json()
    const mainId = typeof body.mainId === 'string' ? body.mainId : ''
    const otherIds: string[] = Array.isArray(body.otherIds) ? [...new Set<string>(body.otherIds.filter((x: unknown) => typeof x === 'string' && x !== mainId))] : []
    if (!mainId || otherIds.length === 0) return NextResponse.json({ error: 'Pick the main record and at least one other.' }, { status: 400 })

    const all = await prisma.asset.findMany({ where: { id: { in: [mainId, ...otherIds] } } })
    const main = all.find(a => a.id === mainId)
    const others = all.filter(a => a.id !== mainId)
    if (!main || others.length !== otherIds.length) return NextResponse.json({ error: 'Some of those assets no longer exist — refresh and try again.' }, { status: 404 })
    if (others.some(a => a.branch !== main.branch)) return NextResponse.json({ error: 'Only assets of the same branch can be combined.' }, { status: 400 })
    const inHub = (d: Date) => d.getUTCFullYear() >= HUB_LEDGER_START
    if (inHub(main.dateBought) && others.some(a => !inHub(a.dateBought))) {
      return NextResponse.json({ error: 'Pick the pre-2026 record as the main one — a purchase before 2026 sits in the QuickBooks books and cannot be folded into a 2026 record.' }, { status: 400 })
    }

    const hasJe = async (id: string) => !!(await prisma.journalEntry.findFirst({ where: { referenceType: 'ASSET_PURCHASE', referenceId: id }, select: { id: true } }))
    const carriedByEntry = (a: typeof main) => !!a.sourceEntryId || a.fromPettyCash

    if (!inHub(main.dateBought)) {
      // The pre-2026 main never posts in the hub, so each 2026 part must carry
      // its own 2026 posting before its row goes.
      for (const a of others) {
        if (!inHub(a.dateBought) || carriedByEntry(a) || (await hasJe(a.id))) continue
        const r = await postAssetJournal(prisma, a.id, uid)
        if (!r.posted && !r.alreadyPosted) {
          return NextResponse.json({ error: `Could not record ${a.controlNumber || a.name}'s 2026 purchase first (${r.reason}) — nothing was changed.` }, { status: 400 })
        }
      }
    }

    // What the main record's own purchase entry covers now; its re-post below
    // adds only what this combine moved into it.
    const costBefore = await assetBookableCost(prisma, main)

    if (inHub(main.dateBought)) {
      // A main record whose purchase entry was reversed can't take a part's cost.
      const mainPosts = !carriedByEntry(main) && (!(await hasJe(main.id)) || (await assetGlNetCents(prisma, main.id)) > 0)
      for (const a of others) {
        if (carriedByEntry(a)) continue
        if (mainPosts) {
          // Its cost moves into the main record's purchase JE.
          if (await hasJe(a.id)) await reverseAssetJournal(prisma, a.id, uid, `combined into ${main.controlNumber || main.name}`)
        } else if (!(await hasJe(a.id))) {
          // The main record never posts, so this part must carry its own JE.
          const r = await postAssetJournal(prisma, a.id, uid)
          if (!r.posted && !r.alreadyPosted) {
            return NextResponse.json({ error: `Could not record ${a.controlNumber || a.name}'s purchase first (${r.reason}) — nothing was changed.` }, { status: 400 })
          }
        }
      }
    }

    // Parts made from entries become balances on the main record.
    for (const a of others) {
      if (a.sourceEntryId) {
        await prisma.pettyCashEntry.update({ where: { id: a.sourceEntryId }, data: { addedToAssetId: main.id, assetAddedAt: new Date() } }).catch(() => {})
      }
      await prisma.pettyCashEntry.updateMany({ where: { addedToAssetId: a.id }, data: { addedToAssetId: main.id } })
    }

    const total = Math.round((Number(main.totalAmount) + others.reduce((s, a) => s + Number(a.totalAmount), 0)) * 100) / 100
    const qty = main.quantity || 1
    const name = assetName(typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 300) : main.name)
    const note = `Combined: ${others.map(a => `${a.controlNumber || '—'} ${a.name} ₱${Number(a.totalAmount).toFixed(2)}`).join('; ')}`
    // A petty-cash part with no entry linked stays booked by its voucher.
    const voucherOnly = (a: typeof main) => a.fromPettyCash && !a.sourceEntryId
    const parts = [...partsOf(main), ...others.flatMap(a => voucherOnly(a) && !main.fromPettyCash ? partsOf(a).map(p => ({ ...p, carried: true })) : partsOf(a))]
    const photosOf = (a: typeof main) => [...(Array.isArray(a.photoUrls) ? (a.photoUrls as unknown[]).filter((u): u is string => typeof u === 'string') : []), ...(a.photoUrl ? [a.photoUrl] : [])]
    const photos = [...new Set([main, ...others].flatMap(photosOf))]
    const combined = await prisma.asset.update({
      where: { id: main.id },
      data: {
        parts: partsJson(parts),
        ...(photos.length ? { photoUrls: photos, photoUrl: main.photoUrl || photos[0] } : {}),
        name,
        totalAmount: total,
        purchasePrice: qty > 1 ? Math.round((total / qty) * 100) / 100 : total,
        // A part not in the books yet (depreciation off) adds no depreciation.
        monthlyDepreciation: main.yearsDepreciation > 0 ? [main, ...others].filter(a => !isDepreciationOff(a)).reduce((s, a) => s + Number(a.totalAmount), 0) / (main.yearsDepreciation * 12) : 0,
        remarks: [main.remarks, note].filter(Boolean).join(' · '),
      },
    })
    await prisma.asset.deleteMany({ where: { id: { in: others.map(a => a.id) } } })

    if (inHub(main.dateBought) && !carriedByEntry(main) && (await hasJe(main.id))) {
      try {
        await repostAssetJournal(prisma, main.id, uid, 'assets combined', (await assetBookableCost(prisma, combined)) - costBefore)
      } catch (err) { console.error(`[GL] combine posting threw for ${main.id}:`, err) }
    }
    return NextResponse.json({ ok: true, id: main.id, controlNumber: main.controlNumber, totalAmount: total, removed: others.map(a => a.controlNumber) })
  } catch (e) {
    console.error('Asset combine error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to combine' }, { status: 500 })
  }
}
