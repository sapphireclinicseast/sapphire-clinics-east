import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { nextSoaReferenceNo, soaBranchCode, soaHmoCode } from '@/lib/soa-ref'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']
// Front desk print SOAs from the POS wallet detail, so they generate as well as
// read. Deleting stays with WRITE_ROLES: printing a statement again is routine,
// removing one from the register is not.
const GENERATE_ROLES = [...WRITE_ROLES, 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const READ_ROLES = GENERATE_ROLES

/** GET /api/accounts-receivable/soa
 *  - No ?id     → list (no pdfData)
 *  - ?id=xxx    → single record with pdfData
 *  - ?walletId= → filter list
 *  - ?period=   → filter list (YYYY-MM)
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const walletId = searchParams.get('walletId')
  const period = searchParams.get('period')

  try {
    if (id) {
      const record = await prisma.soaRecord.findUnique({ where: { id } })
      if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json(record)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}
    if (walletId) where.walletId = walletId
    if (period) where.period = period

    const records = await prisma.soaRecord.findMany({
      where,
      orderBy: { generatedAt: 'desc' },
      select: {
        id: true, walletId: true, walletName: true, period: true,
        branch: true, isHighlighted: true, generatedAt: true,
        generatedById: true, generatedByName: true,
        orderIds: true, submittedDate: true, submissionId: true, referenceNo: true,
        // pdfData excluded from list for performance
      },
    })
    return NextResponse.json(records)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/accounts-receivable/soa
 *  Body: { walletId, walletName, period, pdfData, branch, forceCreate? }
 *  - Checks for existing record for same walletId+period
 *  - If exists + !forceCreate → returns { duplicate: true, existingId }
 *  - If exists + forceCreate → marks all same-period records as highlighted, creates new
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !GENERATE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { walletId, walletName, period, pdfData, branch, forceCreate, checkOnly, orderIds } = await req.json()
    if (!walletId || !period) {
      return NextResponse.json({ error: 'walletId and period are required' }, { status: 400 })
    }

    // Check for duplicate
    const existing = await prisma.soaRecord.findFirst({
      where: { walletId, period },
      orderBy: { generatedAt: 'desc' },
    })

    // checkOnly: just report duplicate status, never create
    if (checkOnly) {
      return NextResponse.json({ duplicate: !!existing, existingId: existing?.id ?? null })
    }

    if (existing && !forceCreate) {
      return NextResponse.json({ duplicate: true, existingId: existing.id })
    }

    // If force-creating, highlight all existing records for same provider+period
    if (existing) {
      await prisma.soaRecord.updateMany({
        where: { walletId, period },
        data: { isHighlighted: true },
      })
    }

    const record = await prisma.soaRecord.create({
      data: {
        walletId,
        walletName,
        period,
        pdfData: pdfData || null,
        branch: branch || null,
        isHighlighted: !!existing, // highlight the new one too if replacing
        // Which orders this SOA covers — the Submitted button tags exactly these.
        orderIds: Array.isArray(orderIds) ? [...new Set(orderIds.filter(Boolean))] : undefined,
        generatedById: session.user.id || null,
        generatedByName: session.user.name || null,
      },
    })

    return NextResponse.json(record, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE /api/accounts-receivable/soa?id=xxx */
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  try {
    await prisma.soaRecord.delete({ where: { id } })

    // After delete, if only one record remains for that wallet+period, un-highlight it
    const deleted = await prisma.soaRecord.findFirst({ where: { id } }).catch(() => null)
    if (!deleted) {
      // Record was deleted — nothing to do for now
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** PATCH /api/accounts-receivable/soa
 *  Body: { id, submittedDate: "YYYY-MM-DD" }
 *  Marks a generated SOA as actually submitted: creates an SoaSubmission batch
 *  over the record's covered orders (flipping their "SOA Submitted" flag and
 *  date in Per HMO) and stamps the record itself.
 */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { id, submittedDate, proofUrls } = await req.json()
    if (!id || !submittedDate) {
      return NextResponse.json({ error: 'id and submittedDate are required' }, { status: 400 })
    }
    // Proof the SOA was really handed over (courier receipt photo, email
    // screenshot for online submissions, …) is part of recording it.
    const proofs = Array.isArray(proofUrls) ? proofUrls.filter((u: unknown): u is string => typeof u === 'string' && !!u) : []
    if (proofs.length === 0) {
      return NextResponse.json({ error: 'Attach at least one proof of submission (e.g. LBC receipt photo, email screenshot).' }, { status: 400 })
    }
    const record = await prisma.soaRecord.findUnique({ where: { id } })
    if (!record) return NextResponse.json({ error: 'SOA record not found' }, { status: 404 })
    if (record.submittedDate) {
      return NextResponse.json({ error: 'This SOA is already recorded as submitted.' }, { status: 409 })
    }
    const ids: string[] = Array.isArray(record.orderIds) ? (record.orderIds as string[]).filter(Boolean) : []
    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'This SOA was generated before per-session tracking — tag its sessions manually in SOA Submissions instead.' },
        { status: 400 },
      )
    }
    // Only orders that still stand and still belong to this provider get tagged
    // (a session could have been voided or re-tendered since generation).
    const validIds = (await prisma.order.findMany({
      where: { id: { in: ids }, status: { not: 'VOIDED' }, payments: { some: { method: 'HMO', walletId: record.walletId } } },
      select: { id: true },
    })).map(o => o.id)
    if (validIds.length === 0) {
      return NextResponse.json({ error: 'None of the sessions on this SOA are still valid for this provider.' }, { status: 400 })
    }

    const [wallet, settings] = await Promise.all([
      prisma.digitalWallet.findUnique({ where: { id: record.walletId }, select: { patientName: true, branch: true } }),
      prisma.soaSettings.findUnique({ where: { id: 'singleton' }, select: { hmoCodes: true } }),
    ])
    const updated = await prisma.$transaction(async (tx) => {
      const referenceNo = await nextSoaReferenceNo(
        tx,
        soaBranchCode(record.branch || wallet?.branch),
        new Date(submittedDate),
        soaHmoCode(settings?.hmoCodes, record.walletId, wallet?.patientName || ''),
      )
      const sub = await tx.soaSubmission.create({
        data: {
          referenceNo,
          walletId: record.walletId,
          submittedDate: new Date(submittedDate),
          transmittalUrls: proofs,
          notes: `SOA ${record.period} — marked submitted from Generate SOA`,
          branch: record.branch || null,
          createdById: session.user.id as string,
          items: { create: validIds.map(orderId => ({ orderId })) },
        },
        select: { id: true, referenceNo: true },
      })
      return tx.soaRecord.update({
        where: { id },
        data: { submittedDate: new Date(submittedDate), submissionId: sub.id, referenceNo: sub.referenceNo },
        select: { id: true, submittedDate: true, submissionId: true, referenceNo: true },
      })
    })
    return NextResponse.json({ ...updated, taggedCount: validIds.length, droppedCount: ids.length - validIds.length })
  } catch (e) {
    console.error('SOA mark-submitted failed', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
