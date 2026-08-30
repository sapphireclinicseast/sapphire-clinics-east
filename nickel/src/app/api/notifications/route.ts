import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId, getSessionProviderId } from '@/lib/auth'

// Booking-event alerts for the current user (patient or provider): confirmations,
// reschedule proposals, cancellations, etc. Powers the bell's "Alerts" tab.
export async function GET() {
  const [patientId, providerId] = await Promise.all([getSessionPatientId(), getSessionProviderId()])
  const role: 'PATIENT' | 'PROVIDER' | null = patientId ? 'PATIENT' : providerId ? 'PROVIDER' : null
  if (!role) return NextResponse.json({ role: null, notifications: [], unread: 0 })

  const where = role === 'PATIENT' ? { recipientPatientId: patientId! } : { recipientProviderId: providerId! }
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 40 }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ])
  return NextResponse.json({
    role,
    unread,
    notifications: notifications.map((n) => ({
      id: n.id, type: n.type, title: n.title, body: n.body,
      bookingId: n.bookingId, read: !!n.readAt, createdAt: n.createdAt,
    })),
  })
}

// Mark alerts read. Body: { ids?: string[] } to mark specific ones, or {} for all.
export async function POST(req: NextRequest) {
  const [patientId, providerId] = await Promise.all([getSessionPatientId(), getSessionProviderId()])
  const role: 'PATIENT' | 'PROVIDER' | null = patientId ? 'PATIENT' : providerId ? 'PROVIDER' : null
  if (!role) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { ids?: string[] }
  const where = role === 'PATIENT' ? { recipientPatientId: patientId! } : { recipientProviderId: providerId! }
  await prisma.notification.updateMany({
    where: { ...where, readAt: null, ...(Array.isArray(b.ids) && b.ids.length ? { id: { in: b.ids.slice(0, 200) } } : {}) },
    data: { readAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
