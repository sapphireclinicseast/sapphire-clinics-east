import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { isNoteAgeLocked, NOTE_AGE_LOCK_MESSAGE } from '@/lib/note-age-lock'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

export async function POST(req: NextRequest) {
  try {
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

    // Allow multiple captures per QR token (user may want to upload multiple photos)
    // Token is still invalidated after expiry

    if (new Date() > captureToken.expiresAt) {
      return NextResponse.json({ error: 'Token expired' }, { status: 400 })
    }

    // Save file
    // Age lock — this route writes session notes on a token, with no user
    // session behind it, so without this check a QR capture would be a way
    // around the documentation window that the portal enforces everywhere
    // else. Re-opening the session in the portal lifts it here too.
    const captureSchedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      select: { date: true, noteUnlockedAt: true },
    })
    if (captureSchedule && isNoteAgeLocked(captureSchedule)) {
      return NextResponse.json({ error: NOTE_AGE_LOCK_MESSAGE }, { status: 403 })
    }

    const dir = path.join(UPLOAD_DIR, 'session-notes', scheduleId)
    await mkdir(dir, { recursive: true })

    const ext = file.name.split('.').pop() ?? 'jpg'
    const fileName = `capture-${Date.now()}.${ext}`
    const displayName = file.name === 'image.jpg' || file.name === 'image.jpeg'
      ? `Session Photo ${new Date().toLocaleDateString()}.${ext}`
      : file.name
    const filePath = path.join('session-notes', scheduleId, fileName)
    const fullPath = path.join(UPLOAD_DIR, filePath)

    const bytes = await file.arrayBuffer()
    await writeFile(fullPath, Buffer.from(bytes))

    // Mark token as used
    await prisma.captureToken.update({
      where: { token },
      data: { used: true },
    })

    const attachment = { fileName: displayName, filePath, mimeType: file.type || 'image/jpeg' }

    // Attach to existing session note if one exists, or create new
    const existingNote = await prisma.sessionNote.findUnique({
      where: { scheduleId },
    })

    if (existingNote) {
      // Safely handle null/undefined attachments
      let currentAttachments: any[] = []
      if (existingNote.attachments) {
        if (Array.isArray(existingNote.attachments)) {
          currentAttachments = existingNote.attachments as any[]
        } else {
          currentAttachments = []
        }
      }

      const updatedAttachments = [...currentAttachments, attachment]

      await prisma.sessionNote.update({
        where: { id: existingNote.id },
        data: {
          attachments: updatedAttachments,
        },
      })
    } else {
      // Create a session note with the attachment
      const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId },
        select: { staffId: true },
      })

      if (schedule) {
        const account = await prisma.therapistAccount.findFirst({
          where: { staffId: schedule.staffId },
          select: { id: true },
        })

        if (account) {
          await prisma.sessionNote.create({
            data: {
              scheduleId,
              therapistAccountId: account.id,
              status: 'COMPLETED',
              attachments: [attachment],
            },
          })
        }
      }
    }

    return NextResponse.json({ success: true, filePath, fileName: displayName })
  } catch (err: any) {
    console.error('Capture upload error:', err)
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 })
  }
}
