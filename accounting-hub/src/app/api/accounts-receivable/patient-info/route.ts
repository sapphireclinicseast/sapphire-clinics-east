import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']

/**
 * GET /api/accounts-receivable/patient-info?patientId=xxx
 * Proxies a single-patient lookup to the Marketing Hub external endpoint.
 * Returns { id, firstName, lastName, email, phone, dob, sex, address, city } or null.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const patientId = searchParams.get('patientId')
  if (!patientId) return NextResponse.json({ patient: null })

  try {
    const res = await fetch(
      `${MARKETING_HUB_URL}/api/patients/lookup?id=${encodeURIComponent(patientId)}`,
      {
        headers: { Authorization: `Bearer ${EXTERNAL_API_KEY}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return NextResponse.json({ patient: null })
    const data = await res.json()
    return NextResponse.json({ patient: data.patient ?? null })
  } catch {
    return NextResponse.json({ patient: null })
  }
}
