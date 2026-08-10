/**
 * Downloads a saved quotation as a .docx on its branch letterhead.
 *
 * Reads the stored figures rather than re-pricing: the document must say exactly
 * what was saved, even if a service price moved afterwards.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { readFile } from 'fs/promises'
import { join, basename } from 'path'
import { buildQuotationDocx } from '@/lib/quotations/docx'
import { QUOTATION_BRANCHES, type PricedLine } from '@/lib/quotations/pricing'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

const uploadsDir = () => process.env.UPLOADS_DIR || join(process.cwd(), 'uploads')

/** Uploaded assets are referenced as /api/files/<name>; read them off disk directly. */
async function readUpload(url: string | null | undefined): Promise<{ data: Buffer; contentType: string } | null> {
  if (!url) return null
  const name = basename(url)
  if (!name || name.includes('..')) return null
  try {
    const data = await readFile(join(uploadsDir(), name))
    const ext = (name.split('.').pop() || '').toLowerCase()
    const contentType =
      ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    return { data, contentType }
  } catch {
    return null // a missing photo must not sink the whole document
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!quotation) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })

  const template = await prisma.quotationTemplate.findUnique({ where: { branch: quotation.branch } })
  if (!template) {
    return NextResponse.json(
      { error: `No quotation template uploaded for ${quotation.branch}. Add one under Quotations → Settings.` },
      { status: 400 },
    )
  }

  let templateBytes: Buffer
  try {
    templateBytes = await readFile(join(uploadsDir(), basename(template.storedName)))
  } catch {
    return NextResponse.json({ error: 'The uploaded template file is missing — please upload it again.' }, { status: 400 })
  }

  const toLine = (i: (typeof quotation.items)[number]): PricedLine => ({
    kind: i.kind as 'SERVICE' | 'PRODUCT',
    name: i.name,
    department: i.department,
    sku: i.sku,
    imageUrl: i.imageUrl,
    grossPrice: Number(i.grossPrice),
    quantity: i.quantity,
    discountedPrice: i.discountedPrice != null ? Number(i.discountedPrice) : null,
    discountLabel: i.discountLabel,
    lineTotal: Number(i.lineTotal),
  })

  const lines = quotation.items.map(toLine)
  const products = lines.filter(l => l.kind === 'PRODUCT')

  const photos = new Map<string, { data: Buffer; contentType: string }>()
  for (const p of products) {
    if (!p.imageUrl || photos.has(p.imageUrl)) continue
    const photo = await readUpload(p.imageUrl)
    if (photo) photos.set(p.imageUrl, photo)
  }

  try {
    const buffer = await buildQuotationDocx(templateBytes, {
      quotationNumber: quotation.quotationNumber,
      branchLabel: QUOTATION_BRANCHES.find(b => b.key === quotation.branch)?.label || quotation.branch,
      recipientName: quotation.recipientName,
      recipientEmail: quotation.recipientEmail,
      recipientPhone: quotation.recipientPhone,
      contactPerson: quotation.contactPerson,
      datePrepared: quotation.datePrepared,
      validityDays: quotation.validityDays,
      services: lines.filter(l => l.kind === 'SERVICE'),
      products,
      grandTotal: Number(quotation.grandTotal),
      remarks: quotation.remarks,
      downpaymentPercent: quotation.downpaymentPercent,
      bankAccountName: quotation.bankAccountName,
      bankAccountNumber: quotation.bankAccountNumber,
      bankName: quotation.bankName,
      preparedByName: quotation.preparedByName,
      preparedByPosition: quotation.preparedByPosition,
      signature: await readUpload(quotation.signatureUrl),
      photos,
    })

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${quotation.quotationNumber}.docx"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err) {
    console.error('[quotations] docx generation failed:', err)
    return NextResponse.json({ error: 'Could not build the document from that template' }, { status: 500 })
  }
}
