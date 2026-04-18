// Lightweight signed-token helper for patient portal sessions.
// After a patient logs in (email+lastname lookup) we issue a short-lived
// HMAC-signed token tying the patient id to a timestamp. This is NOT a full
// auth system — it's a low-risk access token for their own bookings only.

import crypto from 'crypto'

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 14 // 14 days

function getSecret(): string {
  const s = process.env.PATIENT_PORTAL_SECRET || process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('PATIENT_PORTAL_SECRET (or NEXTAUTH_SECRET) is not set')
  return s
}

export function issuePatientToken(patientId: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload = `${patientId}.${exp}`
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex')
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}

export function verifyPatientToken(token: string): { patientId: string } | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8')
    const [patientId, expStr, sig] = raw.split('.')
    if (!patientId || !expStr || !sig) return null
    const exp = parseInt(expStr, 10)
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null
    const expected = crypto
      .createHmac('sha256', getSecret())
      .update(`${patientId}.${expStr}`)
      .digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null
    return { patientId }
  } catch {
    return null
  }
}
