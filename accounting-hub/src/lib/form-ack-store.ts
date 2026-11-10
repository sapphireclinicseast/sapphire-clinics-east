// Server-only storage helpers for signed acknowledgments: the PDF lives in the
// uploads volume (same place /api/upload writes), the signature in the DB row,
// so a missing PDF can always be rebuilt from the row.
import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { join, basename } from 'path'
import { prisma } from '@/lib/prisma'
import { buildAckPdf } from '@/lib/form-ack-pdf'
import { resolveAckBranch, type AckPdfData } from '@/lib/form-ack'

export const uploadsDir = () => process.env.UPLOADS_DIR || join(process.cwd(), 'uploads')

type AckRow = NonNullable<Awaited<ReturnType<typeof prisma.formAcknowledgment.findUnique>>>

export async function ackPdfData(ack: AckRow): Promise<AckPdfData> {
  const pads = await prisma.formDistribution.findMany({
    where: { acknowledgmentId: ack.id },
    orderBy: [{ formType: 'asc' }, { fromControl: 'asc' }],
    select: { formType: true, fromControl: true, toControl: true, quantity: true },
  })
  return {
    id: ack.id,
    branchName: resolveAckBranch(ack.branch)?.name || ack.branch,
    signedAt: ack.signedAt,
    institution: ack.institution || '',
    recipientName: ack.recipientName || '',
    recipientDesignation: ack.recipientDesignation || '',
    receivedBy: ack.receivedBy || '',
    receivedByDesignation: ack.receivedByDesignation || '',
    items: ack.items,
    pads,
    remarks: ack.remarks || '',
    deliveredByName: ack.deliveredByName,
    deliveredByTitle: ack.deliveredByTitle || '',
    signaturePng: ack.signaturePng,
  }
}

const slug = (s: string) => s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'recipient'

/** A readable download name, e.g. Acknowledgment-DR-JUAN-CRUZ-2026-11-10.pdf */
export function ackFileName(ack: { partnerName: string; signedAt: Date }): string {
  const day = ack.signedAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  return `Acknowledgment-${slug(ack.partnerName)}-${day}.pdf`
}

/** Build the PDF for an acknowledgment and store it in uploads; returns the bytes. */
export async function buildAndStoreAckPdf(ackId: string): Promise<Buffer> {
  const ack = await prisma.formAcknowledgment.findUnique({ where: { id: ackId } })
  if (!ack) throw new Error('Acknowledgment not found')
  const pdf = await buildAckPdf(await ackPdfData(ack))
  try {
    const dir = uploadsDir()
    await mkdir(dir, { recursive: true })
    const branchSlug = resolveAckBranch(ack.branch)?.slug || 'branch'
    const name = ack.pdfFile || `ACK-${branchSlug}-${ack.id}.pdf`
    await writeFile(join(dir, name), pdf)
    if (!ack.pdfFile) await prisma.formAcknowledgment.update({ where: { id: ack.id }, data: { pdfFile: name } })
  } catch (e) {
    // Serving still works: the PDF is rebuilt from the row on each request.
    console.error('[form-ack] storing PDF failed:', e)
  }
  return pdf
}

/** The stored PDF, or a rebuilt one when the file is missing. */
export async function loadAckPdf(ack: AckRow): Promise<Buffer> {
  if (ack.pdfFile) {
    try { return await readFile(join(uploadsDir(), basename(ack.pdfFile))) } catch { /* rebuild below */ }
  }
  return buildAndStoreAckPdf(ack.id)
}

/** Remove a signed delivery: its pad rows (pcs go back to on-hand), the row, and the PDF file. */
export async function deleteAcknowledgment(id: string): Promise<{ padRowsRemoved: number }> {
  const ack = await prisma.formAcknowledgment.findUnique({ where: { id }, select: { pdfFile: true } })
  const [pads] = await prisma.$transaction([
    prisma.formDistribution.deleteMany({ where: { acknowledgmentId: id } }),
    prisma.formAcknowledgment.deleteMany({ where: { id } }),
  ])
  if (ack?.pdfFile) await unlink(join(uploadsDir(), basename(ack.pdfFile))).catch(() => {})
  return { padRowsRemoved: pads.count }
}
