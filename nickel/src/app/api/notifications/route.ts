import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId, getSessionProviderId, getSessionDoctorId } from '@/lib/auth'

// Booking/consult-event alerts for the current user. Powers the bell's "Alerts" tab.
export async function GET() {
  const [patientId, providerId, doctorId] = await Promise.all([getSessionPatientId(), getSessionProviderId(), getSessionDoctorId()])
  const role: 'PATIENT' | 'PROVIDER' | 'DOCTOR' | null = patientId ? 'PATIENT' : providerId ? 'PROVIDER' : doctorId ? 'DOCTOR' : null
  if (!role) return NextResponse.json({ role: null, notifications: [], unread: 0 })

  const where = role === 'PATIENT' ? { recipientPatientId: patientId! } : role === 'PROVIDER' ? { recipientProviderId: providerId! } : { recipientDoctorId: doctorId! }
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 40 }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ])
  return NextResponse.json({
    role,
    unread,
    notifications: notifications.map((n) => ({
      id: n.id, type: n.type, title: n.title, body: n.body,
      bookingId: n.bookingId, consultId: n.consultId, read: !!n.readAt, createdAt: n.createdAt,
    })),
  })
}

// Mark alerts read. Body: { ids?: string[] } to mark specific ones, or {} for all.
export async function POST(req: NextRequest) {
  const [patientId, providerId, doctorId] = await Promise.all([getSessionPatientId(), getSessionProviderId(), getSessionDoctorId()])
  const role: 'PATIENT' | 'PROVIDER' | 'DOCTOR' | null = patientId ? 'PATIENT' : providerId ? 'PROVIDER' : doctorId ? 'DOCTOR' : null
  if (!role) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { ids?: string[] }
  const where = role === 'PATIENT' ? { recipientPatientId: patientId! } : role === 'PROVIDER' ? { recipientProviderId: providerId! } : { recipientDoctorId: doctorId! }
  await prisma.notification.updateMany({
    where: { ...where, readAt: null, ...(Array.isArray(b.ids) && b.ids.length ? { id: { in: b.ids.slice(0, 200) } } : {}) },
    data: { readAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
