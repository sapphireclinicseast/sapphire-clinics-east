import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ackFileName, loadAckPdf } from '@/lib/form-ack-store'
import { ACK_VIEW_ROLES } from '@/lib/form-ack'

// GET ?format=pdf (default) → the signed acknowledgment PDF; ?format=png → the
// signature image alone. Add &download=1 to save instead of view.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Signatures are personal data: only the roles that can open Inventory.
  if (!ACK_VIEW_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const { id } = await params
  const ack = await prisma.formAcknowledgment.findUnique({ where: { id } })
  if (!ack) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sp = new URL(req.url).searchParams
  const disposition = sp.get('download') ? 'attachment' : 'inline'
  const pdfName = ackFileName(ack)

  if (sp.get('format') === 'png') {
    const bytes = Buffer.from(ack.signaturePng.replace(/^data:image\/png;base64,/, ''), 'base64')
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `${disposition}; filename="${pdfName.replace(/^Acknowledgment-/, 'Signature-').replace(/\.pdf$/, '.png')}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  }

  const pdf = await loadAckPdf(ack)
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${pdfName}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
