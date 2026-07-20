import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchAllowed, canViewPettyCashCeoVerdana, PETTY_CASH_VIEW_ONLY_BRANCHES } from '@/lib/branch-scope'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE', 'CEO']

// Fields a client may set/update on an entry.
const EDITABLE = [
  'requestor', 'department', 'pcfStatus', 'date', 'description', 'vatable',
  'siNumber', 'tinNumber', 'registeredName', 'registeredAddress', 'grossAmount',
  'accountTitle', 'referenceNumber', 'proofUrl', 'proofUrls', 'validity', 'finalized',
  'recurFrequency', 'recurDeadlineDay', 'distributeMonthly', 'amountVaries', 'distributeStart', 'distributeEnd',
  'hasEwt', 'ewtRate',
] as const

const PCV_BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD', CEO: 'CEO' }
// Petty cash entries carry a "-NN" sub-sequence (entries sharing one PCV);
// expense entries (RECURRING/ONE_TIME) keep the plain base number.
function pcvNumber(branch: string, seq: number, sub: number, withSub: boolean): string {
  const yy = new Date().getFullYear() % 100
  const base = `${PCV_BRANCH_CODE[branch] || branch}-PCV${yy}-${String(seq).padStart(6, '0')}`
  return withSub ? `${base}-${String(sub).padStart(2, '0')}` : base
}

// GET /api/petty-cash/entries?branch=SANDBOX_EAST
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const branch = sp.get('branch') || ''
  const recordType = sp.get('recordType') || 'PETTY_CASH'
  if (!VALID_BRANCHES.includes(branch)) {
    return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
  }
  // Branch-scoped users may only read their own branch — except East/Greenhills
  // accountants & bookkeepers, who get read-only visibility into CEO & Verdana.
  const uBranch = (session.user as { branch?: string }).branch
  const uRole = (session.user as { role?: string }).role
  const canRead = branchAllowed(uBranch, branch)
    || (canViewPettyCashCeoVerdana(uRole, uBranch) && PETTY_CASH_VIEW_ONLY_BRANCHES.includes(branch))
  if (!canRead) {
    return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
  }
  const entries = await prisma.pettyCashEntry.findMany({
    where: { branch, recordType },
    orderBy: [{ pcvSeq: 'asc' }, { pcvSub: 'asc' }],
    include: { reimbursement: { select: { refNumber: true } } },
  })
  return NextResponse.json(entries)
}

// POST /api/petty-cash/entries  { branch }  → creates a blank row with the next PCV number
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const branch = body.branch
    const recordType = ['PETTY_CASH', 'RECURRING', 'ONE_TIME'].includes(body.recordType) ? body.recordType : 'PETTY_CASH'
    // When provided, the new row shares this existing PCV base (a new "-NN" sub).
    const samePcvSeq = body.samePcvSeq != null && body.samePcvSeq !== '' ? Number(body.samePcvSeq) : null
    if (!VALID_BRANCHES.includes(branch)) {
      return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    }
    // Writes are scoped to the user's own branch (view-only branches are read-only).
    if (!branchAllowed((session.user as { branch?: string }).branch, branch)) {
      return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
    }
    const withSub = recordType === 'PETTY_CASH'
    const entry = await prisma.$transaction(async (tx) => {
      let settings = await tx.pettyCashSettings.findUnique({ where: { branch } })
      if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch, nextPcvSeq: 1 } })
      let baseSeq: number, sub: number
      if (samePcvSeq != null && !isNaN(samePcvSeq)) {
        // Reuse an existing PCV base — bump its sub-sequence; don't claim a new number.
        baseSeq = samePcvSeq
        const agg = await tx.pettyCashEntry.aggregate({ where: { branch, recordType, pcvSeq: baseSeq }, _max: { pcvSub: true } })
        sub = (agg._max.pcvSub || 0) + 1
      } else {
        // Continuous per branch: derive the next number from the actual highest
        // sequence in use, so deleting the most-recent (e.g. blank) rows reclaims
        // their numbers instead of leaving a permanent gap. The stored counter is
        // kept in sync but never allowed to run ahead of reality.
        const maxAgg = await tx.pettyCashEntry.aggregate({ where: { branch }, _max: { pcvSeq: true } })
        baseSeq = (maxAgg._max.pcvSeq || 0) + 1
        await tx.pettyCashSettings.update({ where: { branch }, data: { nextPcvSeq: baseSeq + 1 } })
        sub = 1
      }
      return tx.pettyCashEntry.create({
        data: {
          branch,
          recordType,
          pcvNumber: pcvNumber(branch, baseSeq, sub, withSub),
          pcvSeq: baseSeq,
          pcvSub: sub,
          date: new Date(),
          createdById: session.user.id ?? null,
        },
      })
    })
    return NextResponse.json(entry)
  } catch (e) {
    console.error('Petty cash create error:', e)
    return NextResponse.json({ error: 'Failed to add row' }, { status: 500 })
  }
}

// PUT /api/petty-cash/entries  { id, ...fields }
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const existing = await prisma.pettyCashEntry.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    if (!branchAllowed((session.user as { branch?: string }).branch, existing.branch)) {
      return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
    }
    if (existing.reimbursementId || existing.paidAt) {
      return NextResponse.json({ error: 'Locked: entry has been paid / reimbursed' }, { status: 409 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}

    // Re-parent this entry under a previous PCV base: it joins that base as the
    // next "-NN" sub-entry (used from the grid to assign an entry to an existing
    // reference number after the fact).
    if (body.assignToSeq != null && body.assignToSeq !== '') {
      const targetSeq = Number(body.assignToSeq)
      if (isNaN(targetSeq)) return NextResponse.json({ error: 'Invalid PCV to assign to' }, { status: 400 })
      const sibling = await prisma.pettyCashEntry.findFirst({
        where: { branch: existing.branch, recordType: existing.recordType, pcvSeq: targetSeq },
        orderBy: { pcvSub: 'desc' },
      })
      if (!sibling) return NextResponse.json({ error: 'That PCV number does not exist in this branch' }, { status: 404 })
      const base = sibling.pcvNumber.replace(/-\d{1,2}$/, '')
      const nextSub = (sibling.pcvSub || 0) + 1
      data.pcvSeq = targetSeq
      data.pcvSub = nextSub
      data.pcvNumber = `${base}-${String(nextSub).padStart(2, '0')}`
      const entry = await prisma.pettyCashEntry.update({ where: { id }, data })
      return NextResponse.json(entry)
    }

    // Overhaul / force the PCV reference number to match the physical hard copy.
    // Must stay unique within the branch; keep pcvSeq aligned with the forced
    // number so list order and future auto-numbering follow it.
    if ('pcvNumber' in body) {
      const newNum = String(body.pcvNumber ?? '').trim()
      if (!newNum) return NextResponse.json({ error: 'Reference number cannot be blank' }, { status: 400 })
      if (newNum !== existing.pcvNumber) {
        const dup = await prisma.pettyCashEntry.findFirst({ where: { branch: existing.branch, pcvNumber: newNum, id: { not: id } } })
        if (dup) return NextResponse.json({ error: `Reference "${newNum}" is already used in this branch` }, { status: 409 })
        data.pcvNumber = newNum
        const m = newNum.match(/(\d{3,})(?:-\d{1,2})?$/)
        if (m) data.pcvSeq = parseInt(m[1], 10)
      }
    }

    for (const f of EDITABLE) {
      if (f in body) {
        if (f === 'grossAmount') data.grossAmount = Number(body.grossAmount) || 0
        else if (f === 'date') data.date = body.date ? new Date(body.date) : null
        else if (f === 'distributeStart' || f === 'distributeEnd') data[f] = body[f] ? new Date(body[f]) : null
        else if (f === 'recurDeadlineDay') data[f] = (body[f] === '' || body[f] == null) ? null : Number(body[f])
        else if (f === 'distributeMonthly' || f === 'amountVaries' || f === 'hasEwt') data[f] = !!body[f]
        else if (f === 'ewtRate') data[f] = (body[f] === '' || body[f] == null) ? null : Number(body[f])
        else data[f] = body[f] === '' ? null : body[f]
      }
    }
    if ('branchAllocations' in body) data.branchAllocations = body.branchAllocations ?? null
    if ('proofUrls' in body) data.proofUrls = body.proofUrls ?? null
    const entry = await prisma.pettyCashEntry.update({ where: { id }, data })
    return NextResponse.json(entry)
  } catch (e) {
    console.error('Petty cash update error:', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}

// DELETE /api/petty-cash/entries?id=...
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const existing = await prisma.pettyCashEntry.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  if (!branchAllowed((session.user as { branch?: string }).branch, existing.branch)) {
    return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
  }
  if (existing.reimbursementId) {
    return NextResponse.json({ error: 'Locked: entry is part of a reimbursement report' }, { status: 409 })
  }
  await prisma.pettyCashEntry.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
