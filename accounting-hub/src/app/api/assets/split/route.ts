import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { postAssetJournal, reverseAssetJournal } from '@/lib/accounting/post-asset'

// POST { id, shares: [{ branch, amount }] }
// An asset several branches use (Hannah 2026-11-01): split it into one record
// per branch at the amounts given, so each branch carries its own share of the
// depreciation — the same shape a CEO-allocated entry already becomes (one
// asset per branch). The original record keeps its branch's share (or the first
// share when its branch isn't one of them); the others are new records with
// their own control numbers, same purchase date, classification and life.

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const ASSET_BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD' }
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
const SHORT: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD', AURA_INSTITUTE: 'AHI' }

async function nextControlNumber(branch: string, dateBought: Date): Promise<string> {
  const code = ASSET_BRANCH_CODE[branch] || branch
  const prefix = `${code}-${dateBought.getFullYear()}-`
  // Every asset carrying the prefix, whatever its branch now: an asset moved to
  // another branch keeps its number (PLS5 Test, AHEA-2026-0035 → Greenhills,
  // 1 Nov), and a branch-only lookup handed that number out again.
  const existing = await prisma.asset.findMany({ where: { controlNumber: { startsWith: prefix } }, select: { controlNumber: true } })
  let max = 0
  for (const e of existing) { const m = e.controlNumber?.match(/-(\d+)$/); if (m) max = Math.max(max, parseInt(m[1], 10)) }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Only Admin / Accountant / Bookkeeper can split an asset.' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const id = typeof body.id === 'string' ? body.id : ''
    const raw: { branch?: string; amount?: number | string }[] = Array.isArray(body.shares) ? body.shares : []
    const shares = raw
      .map(s => ({ branch: String(s.branch || ''), cents: Math.round(Number(s.amount) * 100) }))
      .filter(s => s.cents > 0)
    if (shares.length < 2) return NextResponse.json({ error: 'Give at least two branches an amount.' }, { status: 400 })
    if (shares.some(s => !VALID_BRANCHES.includes(s.branch))) return NextResponse.json({ error: 'Invalid branch.' }, { status: 400 })
    if (new Set(shares.map(s => s.branch)).size !== shares.length) return NextResponse.json({ error: 'Each branch can appear once.' }, { status: 400 })

    const a = await prisma.asset.findUnique({ where: { id } })
    if (!a) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    const totalCents = Math.round(Number(a.totalAmount) * 100)
    const sumCents = shares.reduce((s, x) => s + x.cents, 0)
    if (sumCents !== totalCents) {
      return NextResponse.json({ error: `The shares add up to ₱${(sumCents / 100).toFixed(2)} but the asset's total is ₱${(totalCents / 100).toFixed(2)}.` }, { status: 400 })
    }

    const keep = shares.find(s => s.branch === a.branch) || shares[0]
    const others = shares.filter(s => s !== keep)
    const qty = a.quantity || 1
    const life = a.yearsDepreciation
    const priced = (cents: number) => {
      const total = cents / 100
      return {
        totalAmount: total,
        purchasePrice: qty > 1 ? Math.round((total / qty) * 100) / 100 : total,
        monthlyDepreciation: life > 0 ? total / (life * 12) : 0,
      }
    }
    const branchList = shares.map(s => `${SHORT[s.branch] || s.branch} ₱${(s.cents / 100).toFixed(2)}`).join(' / ')
    const hadJe = !!(await prisma.journalEntry.findFirst({ where: { referenceType: 'ASSET_PURCHASE', referenceId: a.id }, select: { id: true } }))

    await prisma.asset.update({
      where: { id: a.id },
      data: {
        branch: keep.branch as never,
        ...priced(keep.cents),
        remarks: [a.remarks, `Shared: ${branchList}`].filter(Boolean).join(' · '),
      },
    })
    const created: { id: string; branch: string; controlNumber: string | null }[] = []
    for (const s of others) {
      const controlNumber = await nextControlNumber(s.branch, a.dateBought)
      const n = await prisma.asset.create({
        data: {
          branch: s.branch as never,
          name: a.name,
          ...priced(s.cents),
          quantity: a.quantity,
          dateBought: a.dateBought,
          classification: a.classification,
          yearsDepreciation: a.yearsDepreciation,
          depreciationEndDate: a.depreciationEndDate,
          supplierId: a.supplierId,
          photoUrl: a.photoUrl,
          photoUrls: a.photoUrls == null ? undefined : (a.photoUrls as Prisma.InputJsonValue),
          departments: (a.departments ?? []) as Prisma.InputJsonValue,
          utilized: a.utilized,
          controlNumber,
          remarks: `Shared with ${a.controlNumber || a.name}: ${branchList}`,
          accountableName: a.accountableName,
          sourceAccountId: a.sourceAccountId,
          fromPettyCash: a.fromPettyCash,
          auditable: a.auditable,
          // Same source entry, so a later Account Title change on the entry
          // re-classifies / withdraws every branch's record together.
          sourceEntryId: a.sourceEntryId,
          createdById: session.user.id as string,
        },
        select: { id: true, branch: true, controlNumber: true },
      })
      created.push(n)
    }
    // Acquisition JEs only where the original had one (most assets made from
    // entries don't — the entry carries the cost).
    if (hadJe) {
      try {
        await reverseAssetJournal(prisma, a.id, session.user.id as string, 'asset split across branches')
        await postAssetJournal(prisma, a.id, session.user.id as string)
        for (const n of created) await postAssetJournal(prisma, n.id, session.user.id as string)
      } catch (err) { console.error(`[GL] asset split posting threw for ${a.id}:`, err) }
    }
    return NextResponse.json({ ok: true, kept: { id: a.id, branch: keep.branch }, created })
  } catch (e) {
    console.error('Asset split error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to split the asset' }, { status: 500 })
  }
}
