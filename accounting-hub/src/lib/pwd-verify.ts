/**
 * PWD / Senior-citizen discount eligibility.
 *
 * The register of PWD/Senior IDs lives in Patient CRM on the Operations Hub, so eligibility
 * is asked of that hub rather than duplicated here. A payer qualifies only when their patient
 * record carries BOTH an ID number AND an uploaded ID photo.
 *
 * Fails CLOSED: if the hub is unreachable or misconfigured, the discount is refused rather
 * than granted, and the payer is told to contact the clinic.
 */

const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

export interface PwdEligibility {
  verified: boolean
  /** Payer-safe explanation of a refusal. */
  reason?: string
  /** The CRM patient the entitlement came from — kept for the audit trail. */
  patientId?: string
  patientName?: string
}

const REASONS: Record<string, string> = {
  MISSING_DETAILS: 'Please fill in your name, contact number and email first, then apply the code again.',
  NO_PHOTO: 'Your PWD/Senior ID number is on file but the ID photo is missing. Please send a photo of your ID to the clinic so we can activate this discount.',
  NO_PWD_ID: 'We found your patient record but no PWD/Senior ID is registered on it. Please register your PWD/Senior ID with the clinic first.',
  NO_RECORD: 'We could not match these details to a patient record. Please use the name, contact number and email registered with the clinic.',
}

export async function verifyPwdEligibility(payer: {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
}): Promise<PwdEligibility> {
  if (!EXTERNAL_API_KEY) {
    console.error('[pwd-verify] EXTERNAL_API_KEY is not set — refusing the PWD discount')
    return { verified: false, reason: 'PWD/Senior verification is unavailable right now. Please contact the clinic.' }
  }

  try {
    const res = await fetch(`${MARKETING_HUB_URL}/api/patients/external`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${EXTERNAL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'pwdCheck',
        firstName: payer.firstName || '', lastName: payer.lastName || '',
        email: payer.email || '', phone: payer.phone || '',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.error('[pwd-verify] Operations Hub returned', res.status)
      return { verified: false, reason: 'We could not verify your PWD/Senior ID just now. Please contact the clinic.' }
    }
    const d = await res.json()
    if (d?.verified) {
      return { verified: true, patientId: d.patient?.id, patientName: d.patient?.name }
    }
    return { verified: false, reason: REASONS[d?.reason] || REASONS.NO_RECORD }
  } catch (e) {
    console.error('[pwd-verify] check failed:', e)
    return { verified: false, reason: 'We could not verify your PWD/Senior ID just now. Please contact the clinic.' }
  }
}
