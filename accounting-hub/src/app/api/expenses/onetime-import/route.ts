// POST /api/expenses/onetime-import — Expenses → One-time expense → Bulk upload.
// Body: { branch, rows: [{ row, cells }], dryRun? }
//   cells = the template row keyed by column (lib/expenses/onetime-bulk).
// dryRun: check every row (same rules as the preview) and flag possible
// duplicates of entries already in the branch — nothing is saved.
// Otherwise: refuse if any row has an error, else create one ONE_TIME entry per
// row with the branch's next PCV numbers. No proof travels in a spreadsheet;
// the One-time grid flags the new entries "No proof" until one is attached.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchAllowed } from '@/lib/branch-scope'
import { loadSupplierNameIndex, snapRegisteredName } from '@/lib/supplier-snap-server'
import { validateOneTimeRow, isBlankRow, MAX_ROWS, type RawRow, type RowResult } from '@/lib/expenses/onetime-bulk'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE', 'CEO']
const PCV_BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD', CEO: 'CEO' }
const pcvNumber = (branch: string, seq: number) => `${PCV_BRANCH_CODE[branch] || branch}-PCV${new Date().getFullYear() % 100}-${String(seq).padStart(6, '0')}`
const norm = (v: string | null | undefined) => (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const branch = String(body?.branch || '')
    if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    if (!branchAllowed((session.user as { branch?: string }).branch, branch)) {
      return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
    }
    const input: { row: number; cells: RawRow }[] = (Array.isArray(body?.rows) ? body.rows : [])
      .filter((r: { cells?: RawRow }) => r && r.cells && !isBlankRow(r.cells))
    if (!input.length) return NextResponse.json({ error: 'The sheet has no expense rows' }, { status: 400 })
    if (input.length > MAX_ROWS) return NextResponse.json({ error: `Too many rows (${input.length}) — up to ${MAX_ROWS} per upload` }, { status: 400 })

    const accounts = await prisma.account.findMany({ select: { accountNumber: true, accountTitle: true } })
    const results: RowResult[] = input.map(r => validateOneTimeRow(r.cells, Number(r.row) || 0, accounts))

    // Possible duplicates: same day and amount as an entry already in the branch
    // (or another row of this sheet) with the same SI number, else the same payee
    // or description. Warnings only — repeat purchases are real.
    const dated = results.filter(r => r.data).map(r => r.data!.date).sort()
    if (dated.length) {
      const existing = await prisma.pettyCashEntry.findMany({
        where: { branch, recordType: 'ONE_TIME', date: { gte: new Date(`${dated[0]}T00:00:00.000Z`), lte: new Date(`${dated[dated.length - 1]}T23:59:59.999Z`) } },
        select: { pcvNumber: true, date: true, grossAmount: true, siNumber: true, requestor: true, description: true },
      })
      const same = (a: { siNumber: string | null; requestor: string | null; description: string | null }, b: { siNumber: string | null; requestor: string | null; description: string | null }) =>
        a.siNumber && b.siNumber ? norm(a.siNumber) === norm(b.siNumber)
          : (!!a.requestor && norm(a.requestor) === norm(b.requestor)) || (!!a.description && norm(a.description) === norm(b.description))
      results.forEach((r, i) => {
        const d = r.data
        if (!d) return
        const hit = existing.find(e => e.date && e.date.toISOString().slice(0, 10) === d.date && Math.abs(Number(e.grossAmount) - d.grossAmount) < 0.005 && same(e, d))
        if (hit) r.warnings.push(`Possible duplicate of ${hit.pcvNumber} (same date and amount)`)
        const twin = results.slice(0, i).find(o => o.data && o.data.date === d.date && Math.abs(o.data.grossAmount - d.grossAmount) < 0.005 && same(o.data, d))
        if (twin) r.warnings.push(`Same date and amount as row ${twin.row} of this sheet`)
      })
    }

    const errorRows = results.filter(r => r.errors.length).length
    if (body?.dryRun) return NextResponse.json({ results, errorRows })
    if (errorRows) return NextResponse.json({ error: `${errorRows} row(s) have errors — fix them in the sheet and upload again`, results, errorRows }, { status: 400 })

    const names = await loadSupplierNameIndex(prisma)
    const snapped = new Map<string, string>()
    const created = await prisma.$transaction(async (tx) => {
      let settings = await tx.pettyCashSettings.findUnique({ where: { branch } })
      if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch, nextPcvSeq: 1 } })
      // Same numbering as "Add entry": continue from the highest PCV in use.
      const maxAgg = await tx.pettyCashEntry.aggregate({ where: { branch }, _max: { pcvSeq: true } })
      let seq = (maxAgg._max.pcvSeq || 0) + 1
      const out: { id: string; pcvNumber: string; grossAmount: number }[] = []
      for (const r of results) {
        const d = r.data!
        let registeredName = d.registeredName
        if (registeredName) {
          const s = snapRegisteredName(registeredName, names)
          if (s.snappedFrom) snapped.set(s.snappedFrom.toUpperCase(), s.name)
          registeredName = s.name
        }
        const e = await tx.pettyCashEntry.create({
          data: {
            branch, recordType: 'ONE_TIME', pcvNumber: pcvNumber(branch, seq), pcvSeq: seq, pcvSub: 1,
            requestor: d.requestor, departments: d.departments, date: new Date(d.date), description: d.description,
            validity: d.validity, vatable: d.vatable, vatPortion: d.vatPortion, siNumber: d.siNumber, tinNumber: d.tinNumber,
            registeredName, registeredAddress: d.registeredAddress, grossAmount: d.grossAmount,
            accountTitle: d.accountTitle, hasEwt: d.hasEwt, ewtRate: d.ewtRate,
            createdById: session.user.id ?? null,
          },
          select: { id: true, pcvNumber: true, grossAmount: true },
        })
        out.push({ id: e.id, pcvNumber: e.pcvNumber, grossAmount: Number(e.grossAmount) })
        seq++
      }
      await tx.pettyCashSettings.update({ where: { branch }, data: { nextPcvSeq: seq } })
      return out
    })
    const total = Math.round(created.reduce((s, e) => s + e.grossAmount, 0) * 100) / 100
    await prisma.auditLog.create({
      data: {
        userId: session.user.id as string, action: 'BULK_IMPORT', entity: 'PettyCashEntry', entityId: null,
        details: { what: 'One-time expenses bulk upload', branch, count: created.length, total, from: created[0]?.pcvNumber, to: created[created.length - 1]?.pcvNumber, ids: created.map(e => e.id) },
      },
    }).catch(() => {})
    return NextResponse.json({ created, total, suppliersMatched: [...snapped].map(([from, to]) => ({ from, to })) })
  } catch (e) {
    console.error('One-time bulk import error:', e)
    return NextResponse.json({ error: 'Failed to import' }, { status: 500 })
  }
}
