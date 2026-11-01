import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postAssetJournal, reverseAssetJournal } from '@/lib/accounting/post-asset'
import { assetName } from '@/lib/asset-classification'

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
//   the main record carries no JE of its own.
// Purchases before 2026 sit in the imported QuickBooks GL, so only rows merge.

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const HUB_LEDGER_START = 2026

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
    if (others.some(a => inHub(a.dateBought) !== inHub(main.dateBought))) {
      return NextResponse.json({ error: 'Combine records from the same side of 2026 — purchases before 2026 live in the QuickBooks books.' }, { status: 400 })
    }

    const hasJe = async (id: string) => !!(await prisma.journalEntry.findFirst({ where: { referenceType: 'ASSET_PURCHASE', referenceId: id }, select: { id: true } }))
    const carriedByEntry = (a: typeof main) => !!a.sourceEntryId || a.fromPettyCash

    if (inHub(main.dateBought)) {
      const mainPosts = !carriedByEntry(main)
      if (mainPosts && others.some(a => a.fromPettyCash && !a.sourceEntryId)) {
        return NextResponse.json({ error: 'A record paid from petty cash can only be combined into a main record that is also from petty cash or an entry — pick that one as the main record.' }, { status: 400 })
      }
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
    await prisma.asset.update({
      where: { id: main.id },
      data: {
        name,
        totalAmount: total,
        purchasePrice: qty > 1 ? Math.round((total / qty) * 100) / 100 : total,
        monthlyDepreciation: main.yearsDepreciation > 0 ? total / (main.yearsDepreciation * 12) : 0,
        remarks: [main.remarks, note].filter(Boolean).join(' · '),
      },
    })
    await prisma.asset.deleteMany({ where: { id: { in: others.map(a => a.id) } } })

    if (inHub(main.dateBought) && !carriedByEntry(main) && (await hasJe(main.id))) {
      try {
        await reverseAssetJournal(prisma, main.id, uid, 'assets combined')
        await postAssetJournal(prisma, main.id, uid)
      } catch (err) { console.error(`[GL] combine posting threw for ${main.id}:`, err) }
    }
    return NextResponse.json({ ok: true, id: main.id, controlNumber: main.controlNumber, totalAmount: total, removed: others.map(a => a.controlNumber) })
  } catch (e) {
    console.error('Asset combine error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to combine' }, { status: 500 })
  }
}
