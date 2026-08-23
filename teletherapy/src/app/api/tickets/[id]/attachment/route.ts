import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'
const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  heic: 'image/heic', heif: 'image/heif',
}

// GET /api/tickets/[id]/attachment — streams the ticket's screenshot/photo.
// Viewable by the main admin or the staff member who raised the ticket.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { raisedByAccountId: true, attachmentPath: true },
  })
  if (!ticket?.attachmentPath) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin && ticket.raisedByAccountId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const full = path.join(UPLOAD_DIR, ticket.attachmentPath)
  if (!existsSync(full)) return NextResponse.json({ error: 'File missing' }, { status: 404 })

  const ext = (ticket.attachmentPath.split('.').pop() ?? '').toLowerCase()
  const buf = await readFile(full)
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
