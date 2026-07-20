import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchAllowed } from '@/lib/branch-scope'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE', 'CEO']
const BRANCH_CODE: Record<string, string> = {
  SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VER', CEO: 'CEO',
}

// GET ?branch=...        → list reports (no pdf)
// GET ?id=...            → single report's pdfData (for download)
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const id = sp.get('id')
  // Billing-Voucher line items for one RFP (mirrors the Expenses BV).
  if (id && sp.get('items')) {
    const r = await prisma.reimbursementReport.findUnique({
      where: { id },
      select: { meta: true, entries: { select: { accountTitle: true, description: true, requestor: true, vatable: true, grossAmount: true, hasEwt: true, ewtRate: true } } },
    })
    if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const bvLine = (accountTitle: string | null, description: string | null, vatable: string | null, gross: number, hasEwt: boolean, ewtRate: number | null) => {
      const netVat = vatable === 'VAT' ? gross / 1.12 : gross
      const vat = gross - netVat
      const ewt = hasEwt && ewtRate ? netVat * (ewtRate / 100) : 0
      return { account: accountTitle || '', description: description || '', gross, vat, netVat, ewt, netEwt: gross - ewt }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = r.meta as any
    let lines
    if (meta && Array.isArray(meta.items)) {
      // CEO branch RFP: allocated portions live in meta.items (account/desc from the entry).
      const ids = meta.items.map((i: { entryId?: string }) => i.entryId).filter(Boolean)
      const ents = await prisma.pettyCashEntry.findMany({ where: { id: { in: ids } }, select: { id: true, accountTitle: true, description: true, requestor: true } })
      const byId = new Map(ents.map(e => [e.id, e]))
      lines = meta.items.map((i: { entryId?: string; gross: number; vatable: string | null; hasEwt?: boolean; ewtRate?: number | null }) => {
        const e = i.entryId ? byId.get(i.entryId) : null
        return bvLine(e?.accountTitle ?? null, e?.description || e?.requestor || null, i.vatable ?? null, Number(i.gross), !!i.hasEwt, i.ewtRate ?? null)
      })
    } else {
      lines = r.entries.map(e => bvLine(e.accountTitle, e.description || e.requestor, e.vatable, Number(e.grossAmount), e.hasEwt, e.ewtRate))
    }
    return NextResponse.json({ lines })
  }
  if (id) {
    const r = await prisma.reimbursementReport.findUnique({ where: { id }, select: { pdfData: true, refNumber: true } })
    if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(r)
  }
  const branch = sp.get('branch') || ''
  if (!VALID_BRANCHES.includes(branch)) {
    return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
  }
  const reports = await prisma.reimbursementReport.findMany({
    where: { branch, module: 'PETTY_CASH' },
    select: {
      id: true, refNumber: true, grossTotal: true, status: true, kind: true, paidAt: true, paymentMethod: true, checkNumber: true, transferRef: true,
      debitAccount: true, depositAccount: true, proofUrl: true, payableTo: true, createdAt: true, meta: true,
      _count: { select: { entries: true } },
      entries: { select: { vatable: true, grossAmount: true, hasEwt: true, ewtRate: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  // Amount Payable = GROSS − EWT. The person replenishing paid the full gross
  // (VAT included) to the supplier, so they are reimbursed the full gross; only
  // EWT is withheld (VAT is reclaimable input tax, not deducted from the payee).
  // EWT base is the net-of-VAT amount. For CEO branch RFPs the entries live in
  // meta.items (only the branch-allocated portion), not the entries relation.
  const payableOf = (vatable: string | null, gross: number, hasEwt: boolean, ewtRate: number | null) => {
    const net = vatable === 'VAT' ? gross / 1.12 : gross
    const ewt = hasEwt && ewtRate ? net * (ewtRate / 100) : 0
    return gross - ewt
  }
  const withPayable = reports.map(r => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = r.meta as any
    const ceoItems: { gross: number; vatable: string | null; hasEwt?: boolean; ewtRate?: number | null }[] | null =
      meta && Array.isArray(meta.items) ? meta.items : null
    let payableTotal: number
    let count: number
    if (ceoItems) {
      payableTotal = ceoItems.reduce((s, i) => s + payableOf(i.vatable ?? null, Number(i.gross), !!i.hasEwt, i.ewtRate ?? null), 0)
      count = ceoItems.length
    } else {
      payableTotal = r.entries.reduce((s, e) => s + payableOf(e.vatable, Number(e.grossAmount), e.hasEwt, e.ewtRate), 0)
      count = r._count.entries
    }
    const { entries, _count, meta: _m, ...rest } = r
    void entries; void _count; void _m
    return { ...rest, payableTotal, _count: { entries: count }, filterBranch: ceoItems ? (meta.filterBranch ?? null) : null }
  })
  return NextResponse.json(withPayable)
}

// POST { branch, entryIds } → create report, lock the entries, return { id, refNumber, grossTotal }
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, entryIds, kind, manualSeq, filterBranch } = await req.json()
    if (!VALID_BRANCHES.includes(branch)) {
      return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    }
    if (!branchAllowed((session.user as { branch?: string }).branch, branch)) {
      return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
    }
    if (!Array.isArray(entryIds) || entryIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one entry' }, { status: 400 })
    }
    const k = kind === 'INVALID' ? 'INVALID' : 'VALID'   // RFP (Valid) | RFP (Invalid)
    const mseq = manualSeq != null && String(manualSeq).trim() !== '' ? parseInt(String(manualSeq), 10) : null

    // CEO petty cash: a branch RFP includes only each entry's allocation to that
    // branch, so a shared entry can be reimbursed once per branch.
    const ALLOC_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
    const ceoBranch: string | null = branch === 'CEO' && typeof filterBranch === 'string' && ALLOC_BRANCHES.includes(filterBranch) ? filterBranch : null
    if (branch === 'CEO' && !ceoBranch) {
      return NextResponse.json({ error: 'Select a branch for this CEO RFP' }, { status: 400 })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allocAmount = (e: any, br: string): number => {
      const arr = Array.isArray(e.branchAllocations) ? e.branchAllocations : []
      return Number(arr.find((x: { branch?: string; amount?: number | string }) => x?.branch === br)?.amount || 0)
    }

    const report = await prisma.$transaction(async (tx) => {
      const validity = k === 'VALID' ? 'Valid' : 'Invalid'
      let grossTotal: number
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let meta: any = undefined
      let eligibleIds: string[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let ceoEligible: any[] = []
      // Auto-filled "Payable to" = the Payee (requestor) of the first line item in the
      // group; fall back to its supplier (registeredName) only if that Payee is blank.
      let firstPayee: string | null = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const firstPayeeOf = (rows: any[]) => { const f = [...rows].sort((a, b) => (a.pcvSeq - b.pcvSeq) || ((a.pcvSub || 0) - (b.pcvSub || 0)))[0]; return f?.requestor?.trim() || f?.registeredName?.trim() || null }

      if (ceoBranch) {
        const entries = await tx.pettyCashEntry.findMany({
          where: { id: { in: entryIds }, branch: 'CEO', audited: true, validity },
        })
        // Eligible = has a nonzero allocation to this branch and not already RFP'd for it.
        ceoEligible = entries.filter(e => {
          const map = (e.rfpBranchMap && typeof e.rfpBranchMap === 'object') ? e.rfpBranchMap as Record<string, string> : {}
          return allocAmount(e, ceoBranch) !== 0 && !map[ceoBranch]
        })
        if (ceoEligible.length === 0) throw new Error(`No eligible ${validity.toLowerCase()} entries for this branch (no allocation / already reimbursed for it?)`)
        const items = ceoEligible.map(e => ({
          entryId: e.id, gross: allocAmount(e, ceoBranch), vatable: e.vatable, hasEwt: e.hasEwt, ewtRate: e.ewtRate,
        }))
        grossTotal = items.reduce((s, i) => s + i.gross, 0)
        meta = { filterBranch: ceoBranch, items }
        firstPayee = firstPayeeOf(ceoEligible)
      } else {
        const entries = await tx.pettyCashEntry.findMany({
          where: { id: { in: entryIds }, branch, reimbursementId: null, audited: true, validity },
        })
        if (entries.length === 0) throw new Error(`No eligible audited ${validity.toLowerCase()} entries (already reimbursed / not audited?)`)
        grossTotal = entries.reduce((s, e) => s + Number(e.grossAmount), 0)
        eligibleIds = entries.map(e => e.id)
        firstPayee = firstPayeeOf(entries)
      }

      const settingsBranch = branch
      let settings = await tx.pettyCashSettings.findUnique({ where: { branch: settingsBranch } })
      if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch: settingsBranch, nextPcvSeq: 1 } })
      const seq = (mseq != null && !isNaN(mseq) && mseq > 0) ? mseq : settings.nextReimbSeq
      await tx.pettyCashSettings.update({ where: { branch: settingsBranch }, data: { nextReimbSeq: Math.max(settings.nextReimbSeq, seq + 1) } })

      const yy = new Date().getFullYear() % 100
      const suffix = k === 'VALID' ? 'VAL' : 'INV'
      const refNumber = ceoBranch
        ? `${BRANCH_CODE['CEO']}-RFP${yy}-${String(seq).padStart(6, '0')}-${BRANCH_CODE[ceoBranch]}-${suffix}`
        : `${BRANCH_CODE[branch]}-RFP${yy}-${String(seq).padStart(6, '0')}-${suffix}`

      const created = await tx.reimbursementReport.create({
        data: { branch, refNumber, refSeq: seq, grossTotal, kind: k, meta, payableTo: firstPayee, createdById: session.user.id ?? null },
      })
      if (ceoBranch) {
        // Tag only this branch portion of each entry (leave reimbursementId free so
        // other branches can still be reimbursed separately).
        for (const e of ceoEligible) {
          const map = (e.rfpBranchMap && typeof e.rfpBranchMap === 'object') ? { ...e.rfpBranchMap as Record<string, string> } : {}
          map[ceoBranch] = created.id
          await tx.pettyCashEntry.update({ where: { id: e.id }, data: { rfpBranchMap: map, pcfStatus: 'For Replenishment' } })
        }
      } else {
        await tx.pettyCashEntry.updateMany({ where: { id: { in: eligibleIds } }, data: { reimbursementId: created.id, pcfStatus: 'For Replenishment' } })
      }
      return created
    })

    return NextResponse.json({ id: report.id, refNumber: report.refNumber, grossTotal: report.grossTotal, payableTo: report.payableTo })
  } catch (e) {
    console.error('Reimbursement create error:', e)
    const msg = e instanceof Error ? e.message : 'Failed to create reimbursement'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH { id, pdfData } → store the generated PDF for later download
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const { id, action } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const rep = await prisma.reimbursementReport.findUnique({ where: { id }, select: { branch: true } })
    if (!rep) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!branchAllowed((session.user as { branch?: string }).branch, rep.branch)) {
      return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
    }
    if (action === 'pay') {
      await prisma.reimbursementReport.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAt: body.datePaid ? new Date(body.datePaid) : new Date(),
          paymentMethod: body.paymentMethod || null,
          checkNumber: body.checkNumber || null,
          transferRef: body.transferRef || null,
          debitAccount: body.debitAccount || null,
          depositAccount: body.depositAccount || null,
          proofUrl: body.proofUrl || null,
        },
      })
      // Paid → its entries are reimbursed/replenished.
      await prisma.pettyCashEntry.updateMany({ where: { reimbursementId: id }, data: { pcfStatus: 'Replenished' } })
      return NextResponse.json({ success: true })
    }
    if (action === 'unpay') {
      await prisma.reimbursementReport.update({
        where: { id },
        data: { status: 'PENDING', paidAt: null, paymentMethod: null, checkNumber: null, transferRef: null, debitAccount: null, depositAccount: null, proofUrl: null },
      })
      await prisma.pettyCashEntry.updateMany({ where: { reimbursementId: id }, data: { pcfStatus: 'For Replenishment' } })
      return NextResponse.json({ success: true })
    }
    if (action === 'set-payable') {
      await prisma.reimbursementReport.update({ where: { id }, data: { payableTo: (body.payableTo ?? '').trim() || null } })
      return NextResponse.json({ success: true })
    }
    await prisma.reimbursementReport.update({ where: { id }, data: { pdfData: body.pdfData || null } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Reimbursement patch error:', e)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

// DELETE ?id=...  → delete report; entries auto-unlock (FK onDelete SetNull)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const rep = await prisma.reimbursementReport.findUnique({ where: { id }, select: { branch: true, meta: true } })
  if (!rep) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!branchAllowed((session.user as { branch?: string }).branch, rep.branch)) {
    return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = rep.meta as any
    if (meta && meta.filterBranch && Array.isArray(meta.items)) {
      // CEO branch RFP: free just this branch portion of each entry (drop the
      // rfpBranchMap[filterBranch] key) so it can be reimbursed again.
      const br = meta.filterBranch as string
      const entryIds = (meta.items as { entryId: string }[]).map(i => i.entryId)
      const entries = await prisma.pettyCashEntry.findMany({ where: { id: { in: entryIds } }, select: { id: true, rfpBranchMap: true } })
      for (const e of entries) {
        const map = (e.rfpBranchMap && typeof e.rfpBranchMap === 'object') ? { ...e.rfpBranchMap as Record<string, string> } : {}
        if (map[br] !== id) continue
        delete map[br]
        // Once the entry is no longer in ANY branch RFP, unlock it (un-finalize)
        // so it's editable again and back to Unliquidated.
        const stillInRfp = Object.keys(map).length > 0
        await prisma.pettyCashEntry.update({
          where: { id: e.id },
          data: stillInRfp ? { rfpBranchMap: map } : { rfpBranchMap: map, finalized: false, pcfStatus: 'Unliquidated' },
        })
      }
    } else {
      // Standard RFP: released entries go back to being editable (un-finalized).
      await prisma.pettyCashEntry.updateMany({ where: { reimbursementId: id }, data: { pcfStatus: 'For Replenishment', finalized: false } })
    }
    await prisma.reimbursementReport.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Reimbursement delete error:', e)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
