// GET /api/public/patients/certificates?token=…
// The signed-in patient's own discharge certificates.
//
// The certificates live in the HR Platform, where front desk issues them, so
// this reads through to HR with the shared service key. HR answers only for
// the patient ids named here — it has no patient session of its own and must
// not be the side that decides whose certificates these are. That decision is
// made here, from the portal token, and widened across the person's
// interbranch records the same way their documents are.

import { NextRequest, NextResponse } from 'next/server'
import { verifyPatientToken } from '@/lib/patient-session'
import { linkedPatientIds } from '@/lib/patient-links'
import { preflight, withCors } from '../../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export interface PortalCertificate {
  id: string
  service: string
  awardedOn: string
  dischargeDate: string
  therapistName: string
  managerName: string
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const session = verifyPatientToken(token)
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  const patientIds = await linkedPatientIds(session.patientId)
  const { certificates } = await fetchFromHr(patientIds)

  // Newest first — a family looking for "the one from last month" reads down,
  // not up.
  certificates.sort((a, b) => (b.dischargeDate || '').localeCompare(a.dischargeDate || ''))

  return withCors(NextResponse.json({ certificates }), origin)
}

/** Shared with the file route, which has to repeat the ownership check. */
export async function fetchFromHr(
  patientIds: string[],
): Promise<{ certificates: PortalCertificate[] }> {
  if (patientIds.length === 0) return { certificates: [] }

  const base = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
  const key  = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''
  if (!key) {
    console.error('[patients/certificates] no HR service key configured')
    return { certificates: [] }
  }

  try {
    const url = new URL(`${base}/external/discharge-certificates`)
    url.searchParams.set('patientIds', patientIds.join(','))
    const res = await fetch(url, {
      headers: { 'x-api-key': key },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) {
      console.error('[patients/certificates] HR returned', res.status)
      return { certificates: [] }
    }
    const data = await res.json()
    return { certificates: Array.isArray(data.certificates) ? data.certificates : [] }
  } catch (err) {
    // An unreachable HR Platform must not break the portal page — the patient
    // sees an empty list, which is also what they see when none were issued.
    console.error('[patients/certificates] HR unreachable:', (err as Error).message)
    return { certificates: [] }
  }
}
