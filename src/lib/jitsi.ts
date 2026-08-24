// Shared meeting-link generator. Now emits LiveKit join links
// (meet.sapphireclinicseast.org) instead of public meet.jit.si — anyone with
// the link joins directly, no moderator login. Name kept for signature
// compatibility across the admin app and the patient portal.
import { meetRoomUrl, expiryFromDate } from './meet-link'

export function generateMeetLink(
  staffName: string,
  patientName: string,
  date: string, // "YYYY-MM-DD"
): string {
  const cleanPatient = patientName.replace(/[^a-zA-Z]/g, '').toUpperCase()
  const dateSlug = date.replace(/-/g, '')
  const random = Math.random().toString(36).substring(2, 14)
  void staffName
  const roomName = `SandboxClinic-${cleanPatient}-${dateSlug}-${random}`
  // Guest link (anyone joins). Clinicians get a host variant from the staff
  // portal for elective recording.
  return meetRoomUrl(roomName, { name: patientName, role: 'guest' }, expiryFromDate(date))
}
