import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
// Therapy prepayment refunds only — East / Greenhills / Aura Health Institute.
// Verdana Store is excluded on purpose: its merchandise returns are already recorded through
// the POS/bulk-upload flow as sales returns (contra-revenue, 7160 Sales Returns), so routing
// them here would double-count them and wrongly hit Unearned Revenue.
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'AURA_INSTITUTE']

// GET ?branch=... — list refunds for a branch (with RFP status)
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const branch = new URL(req.url).searchParams.get('branch') || ''
  if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })

  const refunds = await prisma.refund.findMany({ where: { branch }, orderBy: { date: 'desc' } })
  // Attach RFP ref numbers for rows that are in an RFP.
  const rfpIds = Array.from(new Set(refunds.map(r => r.refundRfpId).filter(Boolean))) as string[]
  const rfps = rfpIds.length ? await prisma.reimbursementReport.findMany({ where: { id: { in: rfpIds } }, select: { id: true, refNumber: true, status: true } }) : []
  const rfpMap = new Map(rfps.map(r => [r.id, r]))
  return NextResponse.json(refunds.map(r => {
    const rfp = r.refundRfpId ? rfpMap.get(r.refundRfpId) : null
    return {
      ...r,
      refundAmount: Number(r.refundAmount),
      chargesDeducted: Number(r.chargesDeducted),
      netAmount: Number(r.netAmount),
      rfpRefNumber: rfp?.refNumber || null,
      rfpStatus: rfp?.status || null,
    }
  }))
}

// POST — create a refund row
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const b = await req.json()
    if (!VALID_BRANCHES.includes(b.branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    if (!b.patientName?.trim()) return NextResponse.json({ error: 'Patient name is required' }, { status: 400 })
    const refundAmount = Number(b.refundAmount) || 0
    const chargesDeducted = Number(b.chargesDeducted) || 0
    // Charges are withheld out of the refund, so they can never exceed it — otherwise the
    // posted entry (DR gross = CR net + CR charges) would not balance.
    if (chargesDeducted > refundAmount) return NextResponse.json({ error: 'Charges deducted cannot exceed the refund amount' }, { status: 400 })
    const netAmount = refundAmount - chargesDeducted
    const proofs = Array.isArray(b.proofUrls) ? b.proofUrls.filter(Boolean) : []
    const refund = await prisma.refund.create({
      data: {
        branch: b.branch,
        date: b.date ? new Date(b.date) : new Date(),
        patientId: b.patientId || null,
        patientName: b.patientName.trim(),
        refundAmount, chargesDeducted, netAmount,
        reason: b.reason?.trim() || null,
        proofUrls: proofs.length ? proofs : undefined,
        audited: !!b.audited,
        createdById: session.user.id ?? null,
      },
    })
    return NextResponse.json(refund, { status: 201 })
  } catch (e) {
    console.error('Refund create error:', e)
    return NextResponse.json({ error: 'Failed to create refund' }, { status: 500 })
  }
}

// PATCH { id, action } — 'audit' toggle | 'update' fields | 'set-proof'
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const existing = await prisma.refund.findUnique({ where: { id: b.id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (existing.refundRfpId && b.action !== 'set-proof') {
      return NextResponse.json({ error: 'This refund is in an RFP — remove it from the RFP first.' }, { status: 400 })
    }

    if (b.action === 'audit') {
      const updated = await prisma.refund.update({ where: { id: b.id }, data: { audited: !!b.audited } })
      return NextResponse.json(updated)
    }
    if (b.action === 'set-proof') {
      const proofs = Array.isArray(b.proofUrls) ? b.proofUrls.filter(Boolean) : []
      const updated = await prisma.refund.update({ where: { id: b.id }, data: { proofUrls: proofs.length ? proofs : undefined } })
      return NextResponse.json(updated)
    }
    // Generic field update (only when not in RFP)
    const refundAmount = b.refundAmount !== undefined ? Number(b.refundAmount) || 0 : Number(existing.refundAmount)
    const chargesDeducted = b.chargesDeducted !== undefined ? Number(b.chargesDeducted) || 0 : Number(existing.chargesDeducted)
    if (chargesDeducted > refundAmount) return NextResponse.json({ error: 'Charges deducted cannot exceed the refund amount' }, { status: 400 })
    const updated = await prisma.refund.update({
      where: { id: b.id },
      data: {
        ...(b.patientName !== undefined && { patientName: String(b.patientName).trim(), patientId: b.patientId || null }),
        ...(b.date !== undefined && { date: new Date(b.date) }),
        ...(b.reason !== undefined && { reason: b.reason?.trim() || null }),
        refundAmount, chargesDeducted, netAmount: refundAmount - chargesDeducted,
      },
    })
    return NextResponse.json(updated)
  } catch (e) {
    console.error('Refund update error:', e)
    return NextResponse.json({ error: 'Failed to update refund' }, { status: 500 })
  }
}

// DELETE ?id=... — only when not locked in an RFP
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const existing = await prisma.refund.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.refundRfpId) return NextResponse.json({ error: 'This refund is in an RFP — delete the RFP first.' }, { status: 400 })
  await prisma.refund.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
