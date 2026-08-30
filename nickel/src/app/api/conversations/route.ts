import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId, getSessionProviderId } from '@/lib/auth'

// Conversations for the current user (patient or provider): every booking that
// has at least one message, with the other party's name, the last message, and
// how many messages are unread (from the other side, since my last read).
export async function GET() {
  const [patientId, providerId] = await Promise.all([getSessionPatientId(), getSessionProviderId()])
  const role: 'PATIENT' | 'PROVIDER' | null = patientId ? 'PATIENT' : providerId ? 'PROVIDER' : null
  if (!role) return NextResponse.json({ role: null, conversations: [], unread: 0 })

  const where = role === 'PATIENT' ? { patientId: patientId! } : { providerId: providerId! }
  const bookings = await prisma.booking.findMany({
    where: { ...where, messages: { some: {} } },
    include: {
      provider: { select: { firstName: true, lastName: true, postNominals: true } },
      patient: { select: { firstName: true, lastName: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  const otherRole = role === 'PATIENT' ? 'PROVIDER' : 'PATIENT'
  const conversations = await Promise.all(bookings.map(async (b) => {
    const readAt = role === 'PATIENT' ? b.patientReadAt : b.providerReadAt
    const unread = await prisma.message.count({
      where: { bookingId: b.id, senderRole: otherRole, ...(readAt ? { createdAt: { gt: readAt } } : {}) },
    })
    const last = b.messages[0]
    const otherName = role === 'PATIENT'
      ? `${b.provider.firstName} ${b.provider.lastName}${b.provider.postNominals ? `, ${b.provider.postNominals}` : ''}`
      : `${b.patient.firstName} ${b.patient.lastName}`
    return {
      bookingId: b.id,
      otherName,
      date: b.date.toISOString().slice(0, 10),
      startTime: b.startTime,
      lastText: last?.text ?? (last?.attachment ? 'Attachment' : ''),
      lastAt: last?.createdAt ?? null,
      unread,
    }
  }))

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0)
  return NextResponse.json({ role, conversations, unread: totalUnread })
}
