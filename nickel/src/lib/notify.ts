import { prisma } from '@/lib/prisma'
import { sendPush } from '@/lib/push'

// A booking/consult-event notification for the floating bell (see
// /api/notifications and MessagesWidget → "Alerts"). Non-fatal: a failure here
// must never break the action that triggered it.
type NotifInput = {
  to: 'PATIENT' | 'PROVIDER' | 'DOCTOR'
  patientId?: string | null
  providerId?: string | null
  doctorId?: string | null
  bookingId?: string | null
  consultId?: string | null
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
        recipientDoctorId: n.to === 'DOCTOR' ? n.doctorId ?? null : null,
        bookingId: n.bookingId ?? null,
        consultId: n.consultId ?? null,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
      },
    })
    // Also push to the recipient's devices (best-effort).
    const url = n.to === 'DOCTOR' ? '/doctor' : n.to === 'PROVIDER' ? '/provider' : n.type === 'REQUEST_OFFER' ? '/requests' : '/bookings'
    await sendPush(
      { patientId: n.to === 'PATIENT' ? n.patientId : null, providerId: n.to === 'PROVIDER' ? n.providerId : null, doctorId: n.to === 'DOCTOR' ? n.doctorId : null },
      { title: n.title, body: n.body ?? undefined, url },
    )
  } catch (e) {
    console.warn('[nickel notify] failed', e)
  }
}
