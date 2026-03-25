import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const scheduleId = formData.get('scheduleId') as string
  const token = formData.get('token') as string

  if (!file || !scheduleId || !token) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Validate capture token
  const captureToken = await prisma.captureToken.findUnique({
    where: { token },
  })

  if (!captureToken || captureToken.scheduleId !== scheduleId) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
  }

  if (captureToken.used) {
    return NextResponse.json({ error: 'Token already used' }, { status: 400 })
  }

  if (new Date() > captureToken.expiresAt) {
    return NextResponse.json({ error: 'Token expired' }, { status: 400 })
  }

  // Save file
  const dir = path.join(UPLOAD_DIR, 'session-notes', scheduleId)
  await mkdir(dir, { recursive: true })

  const ext = file.name.split('.').pop() ?? 'jpg'
  const fileName = `capture-${Date.now()}.${ext}`
  const filePath = path.join('session-notes', scheduleId, fileName)
  const fullPath = path.join(UPLOAD_DIR, filePath)

  const bytes = await file.arrayBuffer()
  await writeFile(fullPath, Buffer.from(bytes))

  // Mark token as used
  await prisma.captureToken.update({
    where: { token },
    data: { used: true },
  })

  // Attach to existing session note if one exists, or store for later
  const existingNote = await prisma.sessionNote.findUnique({
    where: { scheduleId },
  })

  if (existingNote) {
    const currentAttachments = (existingNote.attachments as any[]) ?? []
    await prisma.sessionNote.update({
      where: { scheduleId },
      data: {
        attachments: [
          ...currentAttachments,
          { fileName: file.name, filePath, mimeType: file.type },
        ],
      },
    })
  }

  return NextResponse.json({ success: true, filePath })
}
