import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']
const BRANCH_CODE: Record<string, string> = {
  SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VER',
}

// GET ?branch=...        → list reports (no pdf)
// GET ?id=...            → single report's pdfData (for download)
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const id = sp.get('id')
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
    where: { branch },
    select: {
      id: true, refNumber: true, grossTotal: true, status: true, paidAt: true,
      debitAccount: true, depositAccount: true, proofUrl: true, createdAt: true,
      _count: { select: { entries: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(reports)
}

// POST { branch, entryIds } → create report, lock the entries, return { id, refNumber, grossTotal }
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, entryIds } = await req.json()
    if (!VALID_BRANCHES.includes(branch)) {
      return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    }
    if (!Array.isArray(entryIds) || entryIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one entry' }, { status: 400 })
    }

    const report = await prisma.$transaction(async (tx) => {
      // Only entries that are in this branch AND not already reimbursed.
      const entries = await tx.pettyCashEntry.findMany({
        where: { id: { in: entryIds }, branch, reimbursementId: null },
      })
      if (entries.length === 0) throw new Error('No eligible entries (already reimbursed?)')
      const grossTotal = entries.reduce((s, e) => s + Number(e.grossAmount), 0)

      let settings = await tx.pettyCashSettings.findUnique({ where: { branch } })
      if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch, nextPcvSeq: 1 } })
      const seq = settings.nextReimbSeq
      await tx.pettyCashSettings.update({ where: { branch }, data: { nextReimbSeq: seq + 1 } })

      const yy = new Date().getFullYear() % 100
      const refNumber = `${BRANCH_CODE[branch]}${yy}-${String(seq).padStart(6, '0')}`

      const created = await tx.reimbursementReport.create({
        data: { branch, refNumber, refSeq: seq, grossTotal, createdById: session.user.id ?? null },
      })
      await tx.pettyCashEntry.updateMany({
        where: { id: { in: entries.map(e => e.id) } },
        data: { reimbursementId: created.id },
      })
      return created
    })

    return NextResponse.json({ id: report.id, refNumber: report.refNumber, grossTotal: report.grossTotal })
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
    if (action === 'pay') {
      await prisma.reimbursementReport.update({
        where: { id },
        data: {
          status: 'PAID', paidAt: new Date(),
          debitAccount: body.debitAccount || null,
          depositAccount: body.depositAccount || null,
          proofUrl: body.proofUrl || null,
        },
      })
      return NextResponse.json({ success: true })
    }
    if (action === 'unpay') {
      await prisma.reimbursementReport.update({
        where: { id },
        data: { status: 'PENDING', paidAt: null, debitAccount: null, depositAccount: null, proofUrl: null },
      })
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
  try {
    await prisma.reimbursementReport.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Reimbursement delete error:', e)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
