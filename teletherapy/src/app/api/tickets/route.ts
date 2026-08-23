import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'
const ALLOWED = ['image/jpeg', 'image/png', 'image/heic', 'image/heif']

// Branch → ticket-number prefix. Aura Health East / Greenhills / Verdana.
function branchPrefix(branch?: string | null): string {
  const b = (branch ?? '').toUpperCase()
  if (b === 'SBGH' || b.includes('GREENHILLS')) return 'AHGH'
  if (b.startsWith('VERD')) return 'VERD'
  return 'AHEA'
}

// YYYYMMDD in Manila time (the clinic's timezone), so the date in the ticket
// number matches the staff member's local day.
function manilaDatePart(): string {
  const ymd = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) // 2026-08-16
  return ymd.replace(/-/g, '')
}

// GET /api/tickets — admin sees all; staff see only their own.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isAdmin = session.user.role === 'ADMIN'
  const tickets = await prisma.ticket.findMany({
    where: isAdmin ? {} : { raisedByAccountId: session.user.id },
    // OPEN sorts before RESOLVED alphabetically, so open tickets surface first.
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ tickets, isAdmin })
}

// POST /api/tickets — create a ticket (multipart: subject, description, file?).
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const subject = ((form.get('subject') as string) ?? '').trim()
  const description = ((form.get('description') as string) ?? '').trim()
  const file = form.get('file') as File | null

  if (!subject) return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
  if (!description) return NextResponse.json({ error: 'Description is required' }, { status: 400 })
  if (file && file.size > 0) {
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: 'Photo must be a JPG, PNG, or HEIC image.' }, { status: 400 })
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'Photo is too large (max 15MB).' }, { status: 400 })
    }
  }

  const prefix = branchPrefix(session.user.branch)
  const datePart = manilaDatePart()
  const raisedByName = session.user.name ?? session.user.email ?? 'Staff'

  // Assign the next sequential number for this branch+day. The unique index on
  // ticketNumber guards concurrent submits: on collision (P2002) we recount and
  // retry, so two people submitting at once get consecutive numbers.
  let created: Awaited<ReturnType<typeof prisma.ticket.create>> | null = null
  for (let attempt = 0; attempt < 8 && !created; attempt++) {
    const count = await prisma.ticket.count({
      where: { ticketNumber: { startsWith: `${prefix}-${datePart}-` } },
    })
    const ticketNumber = `${prefix}-${datePart}-${String(count + 1).padStart(2, '0')}`
    try {
      created = await prisma.ticket.create({
        data: {
          ticketNumber,
          branch: session.user.branch ?? '',
          subject,
          description,
          status: 'OPEN',
          raisedByAccountId: session.user.id,
          raisedByName,
          raisedByEmail: session.user.email ?? null,
        },
      })
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') continue
      throw e
    }
  }
  if (!created) {
    return NextResponse.json({ error: 'Could not assign a ticket number. Please try again.' }, { status: 500 })
  }

  // Persist the attachment (if any) under uploads/tickets/<ticketId>/.
  if (file && file.size > 0) {
    try {
      const dir = path.join(UPLOAD_DIR, 'tickets', created.id)
      await mkdir(dir, { recursive: true })
      const ext = (file.name.split('.').pop() || 'img').toLowerCase().replace(/[^a-z0-9]/g, '') || 'img'
      const fname = `attachment.${ext}`
      await writeFile(path.join(dir, fname), Buffer.from(await file.arrayBuffer()))
      created = await prisma.ticket.update({
        where: { id: created.id },
        data: { attachmentPath: path.join('tickets', created.id, fname), attachmentName: file.name },
      })
    } catch (e) {
      // Non-fatal — the ticket still exists without the photo.
      console.warn('[tickets] attachment write failed:', e)
    }
  }

  return NextResponse.json({ ticket: created })
}
