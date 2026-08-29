import { getSessionPatientId, getSessionProviderId } from './auth'
import { prisma } from './prisma'
import type { Booking } from '@prisma/client'

// Resolve whether the current session is a participant in a booking, and which
// side. Returns null if not signed in as either party to this booking.
export async function bookingParticipant(bookingId: string): Promise<{ role: 'PATIENT' | 'PROVIDER'; booking: Booking } | null> {
  if (!bookingId) return null
  const [patientId, providerId] = await Promise.all([getSessionPatientId(), getSessionProviderId()])
  if (!patientId && !providerId) return null
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
  if (!booking) return null
  if (patientId && booking.patientId === patientId) return { role: 'PATIENT', booking }
  if (providerId && booking.providerId === providerId) return { role: 'PROVIDER', booking }
  return null
}
