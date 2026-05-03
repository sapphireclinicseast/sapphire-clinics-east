// Shared Jitsi Meet link generator. Mirrors the inline helper in
// src/app/api/clinic-schedule/route.ts so teletherapy links are identical
// format across the admin app and the new patient portal.

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
  return `https://meet.jit.si/${roomName}`
}
