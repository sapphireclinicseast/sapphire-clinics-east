import { prisma } from '@/lib/prisma'

// A booking-event notification for the floating bell (see /api/notifications
// and MessagesWidget → "Alerts"). Non-fatal: a failure here must never break
// the action that triggered it, so all callers await inside a try/catch here.
type NotifInput = {
  to: 'PATIENT' | 'PROVIDER'
  patientId?: string | null
  providerId?: string | null
  bookingId?: string | null
  type: string
  title: string
  body?: string | null
}

export async function notify(n: NotifInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        recipientPatientId: n.to === 'PATIENT' ? n.patientId ?? null : null,
        recipientProviderId: n.to === 'PROVIDER' ? n.providerId ?? null : null,
        bookingId: n.bookingId ?? null,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
      },
    })
  } catch (e) {
    console.warn('[nickel notify] failed', e)
  }
}
