import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Public endpoint for QR code proof uploads (no auth required)
// Validates that the logId exists before accepting the upload
export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Multipart form data required' }, { status: 400 })
  }

  const formData = await req.formData()
  const logId = formData.get('logId') as string
  const file = formData.get('file') as File
  if (!logId || !file) {
    return NextResponse.json({ error: 'logId and file required' }, { status: 400 })
  }

  // Validate that the cancellation log exists
  const log = await prisma.cancellationLog.findUnique({ where: { id: logId } })
  if (!log) {
    return NextResponse.json({ error: 'Cancellation log not found' }, { status: 404 })
  }
  if (log.proofUrl) {
    return NextResponse.json({ error: 'Proof already uploaded for this log' }, { status: 409 })
  }

  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const uploadDir = process.env.UPLOAD_DIR || '/app/uploads'
    const cancDir = path.join(uploadDir, 'cancellations')
    await fs.mkdir(cancDir, { recursive: true })

    const ext = file.name.split('.').pop() || 'bin'
    const fileName = `${logId}-${Date.now()}.${ext}`
    const filePath = path.join(cancDir, fileName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(filePath, buffer)

    const proofUrl = `/uploads/cancellations/${fileName}`
    await prisma.cancellationLog.update({
      where: { id: logId },
      data: { proofUrl },
    })

    return NextResponse.json({ ok: true, proofUrl })
  } catch (err: any) {
    console.error('Upload proof error:', err)
    return NextResponse.json({ error: `Upload failed: ${err.message}` }, { status: 500 })
  }
}
