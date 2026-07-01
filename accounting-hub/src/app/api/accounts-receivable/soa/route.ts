import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']
const READ_ROLES = WRITE_ROLES

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
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { walletId, walletName, period, pdfData, branch, forceCreate, checkOnly } = await req.json()
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
