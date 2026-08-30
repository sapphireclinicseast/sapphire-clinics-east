import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { bookingParticipant } from '@/lib/booking-access'

// GET /api/messages?bookingId= — the thread for a booking (participants only).
export async function GET(req: NextRequest) {
  const bookingId = req.nextUrl.searchParams.get('bookingId') ?? ''
  const p = await bookingParticipant(bookingId)
  if (!p) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const messages = await prisma.message.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' }, take: 200 })
  // Opening the thread marks it read for this participant (clears the unread badge).
  await prisma.booking.update({ where: { id: bookingId }, data: p.role === 'PATIENT' ? { patientReadAt: new Date() } : { providerReadAt: new Date() } })
  return NextResponse.json({ role: p.role, messages })
}

// POST /api/messages — send a text and/or one attachment (data URI).
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { bookingId?: string; text?: string; attachment?: string; attachmentName?: string; attachmentType?: string }
  const bookingId = String(b.bookingId ?? '')
  const p = await bookingParticipant(bookingId)
  if (!p) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const text = String(b.text ?? '').trim() || null
  const attachment = typeof b.attachment === 'string' && b.attachment.startsWith('data:') ? b.attachment : null
  if (!text && !attachment) return NextResponse.json({ error: 'Nothing to send' }, { status: 400 })
  if (attachment && attachment.length > 8_000_000) return NextResponse.json({ error: 'Attachment too large (max ~6 MB).' }, { status: 413 })

  const message = await prisma.message.create({
    data: {
      bookingId, senderRole: p.role, text, attachment,
      attachmentName: attachment ? String(b.attachmentName ?? 'file').slice(0, 120) : null,
      attachmentType: attachment ? String(b.attachmentType ?? '').slice(0, 60) : null,
    },
  })
  return NextResponse.json({ ok: true, message })
}
