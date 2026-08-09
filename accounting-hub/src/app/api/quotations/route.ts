/**
 * Quotations — list and create.
 *
 * Prices are resolved server-side from the same helper the maker screen uses, so
 * the saved figures can't drift from what was on screen, and a client-side edit
 * can't quietly change a price. Names, departments, SKUs and photos are copied
 * onto the line: a quotation already sent must not change when a price does.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { priceQuotation, QUOTATION_BRANCHES, VALIDITY_OPTIONS, type QuotationLineInput } from '@/lib/quotations/pricing'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']

const BRANCH_KEYS = QUOTATION_BRANCHES.map(b => b.key) as string[]

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''
  const search = searchParams.get('search') || ''
  const take = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (branch) where.branch = branch
  if (search) {
    where.OR = [
      { quotationNumber: { contains: search, mode: 'insensitive' } },
      { recipientName: { contains: search, mode: 'insensitive' } },
      { contactPerson: { contains: search, mode: 'insensitive' } },
    ]
  }

  const quotations = await prisma.quotation.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
  })

  return NextResponse.json({ quotations })
}

/** QTN-<BRANCH>-<YEAR>-<0001>, sequential per branch per year. */
async function nextQuotationNumber(branch: string, year: number): Promise<string> {
  const prefix = `QTN-${branch}-${year}-`
  const latest = await prisma.quotation.findFirst({
    where: { quotationNumber: { startsWith: prefix } },
    orderBy: { quotationNumber: 'desc' },
    select: { quotationNumber: true },
  })
  const lastSeq = latest ? parseInt(latest.quotationNumber.slice(prefix.length), 10) : 0
  const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1
  return prefix + String(next).padStart(4, '0')
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const {
      branch, recipientName, recipientEmail, recipientPhone, contactPerson,
      datePrepared, validityDays, usePwdRate, globalDiscountType, globalDiscountValue,
      remarks, preparedByName, preparedByPosition, signatureUrl, lines,
    } = body as {
      branch: string; recipientName: string; recipientEmail?: string; recipientPhone?: string
      contactPerson?: string; datePrepared: string; validityDays: number; usePwdRate?: boolean
      globalDiscountType?: 'NONE' | 'PERCENT' | 'AMOUNT'; globalDiscountValue?: number
      remarks?: string; preparedByName: string; preparedByPosition: string
      signatureUrl?: string; lines: QuotationLineInput[]
    }

    if (!BRANCH_KEYS.includes(branch)) {
      return NextResponse.json({ error: 'Choose a branch' }, { status: 400 })
    }
    if (!recipientName?.trim()) {
      return NextResponse.json({ error: 'Who is the quotation for?' }, { status: 400 })
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'Add at least one service or product' }, { status: 400 })
    }
    if (!VALIDITY_OPTIONS.includes(validityDays as (typeof VALIDITY_OPTIONS)[number])) {
      return NextResponse.json({ error: 'Validity must be 30, 45, 60 or 90 days' }, { status: 400 })
    }
    if (!preparedByName?.trim() || !preparedByPosition?.trim()) {
      return NextResponse.json({ error: 'Name and position of the preparer are required' }, { status: 400 })
    }

    const prepared = datePrepared ? new Date(datePrepared) : new Date()
    if (Number.isNaN(prepared.getTime())) {
      return NextResponse.json({ error: 'Date Prepared is not a valid date' }, { status: 400 })
    }

    const totals = priceQuotation(lines, {
      usePwdRate: !!usePwdRate,
      globalDiscountType: globalDiscountType ?? 'NONE',
      globalDiscountValue: globalDiscountValue ?? 0,
    })

    const quotationNumber = await nextQuotationNumber(branch, prepared.getFullYear())

    const quotation = await prisma.quotation.create({
      data: {
        quotationNumber,
        branch,
        recipientName: recipientName.trim(),
        recipientEmail: recipientEmail?.trim() || null,
        recipientPhone: recipientPhone?.trim() || null,
        contactPerson: contactPerson?.trim() || null,
        datePrepared: prepared,
        validityDays,
        usePwdRate: !!usePwdRate,
        globalDiscountType: globalDiscountType && globalDiscountType !== 'NONE' ? globalDiscountType : null,
        globalDiscountValue: globalDiscountType && globalDiscountType !== 'NONE' ? (globalDiscountValue ?? 0) : null,
        remarks: remarks?.trim() || null,
        preparedByName: preparedByName.trim(),
        preparedByPosition: preparedByPosition.trim(),
        signatureUrl: signatureUrl || null,
        subtotalGross: totals.subtotalGross,
        grandTotal: totals.grandTotal,
        createdById: session.user.id,
        items: {
          create: totals.lines.map((l, i) => ({
            kind: l.kind,
            serviceId: l.serviceId || null,
            inventoryItemId: l.inventoryItemId || null,
            name: l.name,
            department: l.department || null,
            sku: l.sku || null,
            imageUrl: l.imageUrl || null,
            grossPrice: l.grossPrice,
            discountedPrice: l.discountedPrice,
            discountLabel: l.discountLabel,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
            sortOrder: i,
          })),
        },
      },
      include: { items: true },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'quotation',
        entityId: quotation.id,
        details: { quotationNumber, branch, grandTotal: totals.grandTotal.toString() },
      },
    })

    return NextResponse.json(quotation, { status: 201 })
  } catch (err) {
    console.error('[quotations] create failed:', err)
    return NextResponse.json({ error: 'Could not save the quotation' }, { status: 500 })
  }
}
