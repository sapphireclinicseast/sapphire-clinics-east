// GET /api/partner-institutions — the partnership list, read-only.
//
// HR Hub owns this data; nothing here writes it. HR already publishes a
// view-only feed at /partner-institutions/external (bearer key, same pattern as
// /staff/external) that deliberately omits the uploaded MOA and photos — front
// desk need the partnership terms, not the contract scans — so this is a proxy
// over that, not a second copy of the records.
//
// The shared key never reaches the browser: the page calls this route, and this
// route calls HR. Only signed-in Operations Hub users get an answer, which is
// the whole reason this is a proxy rather than a direct fetch from the client.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

// Same fallback chain as /api/staff/sync: inside the container 127.0.0.1 is the
// container itself, so the host gateway has to be tried explicitly.
const HR_URLS = [
  process.env.HR_PLATFORM_URL,
  'http://172.17.0.1:3457',
  'http://172.18.0.1:3457',
  'http://host.docker.internal:3457',
  'http://127.0.0.1:3457',
].filter(Boolean) as string[]

const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

export interface PartnerInstitution {
  id: string
  name: string
  type: string
  typeLabel: string
  pointOfContact: string
  email: string
  mobile: string
  telephone: string
  services: { id: string; label: string }[]
  discounts: { serviceId: string; serviceLabel: string; discountType: string; value: number; note: string }[]
  agreementType: string
  effectivityFrom: string
  effectivityTo: string
  hasCommission: boolean
  commissionType: string
  commissionValue: number
  commissionNote: string
  hasDocument: boolean
  photoCount: number
  remarks: string
  updatedAt: string
}

export async function GET() {
  // Every signed-in user, deliberately — the point of surfacing this here is
  // that whoever is on the desk can answer "do we have a discount with that
  // school?" without a message to HR. No role check, because there is nothing
  // to protect beyond being signed in and nothing here can be changed.
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!HR_KEY) {
    return NextResponse.json(
      { error: 'HR Platform API key not configured on this server.' },
      { status: 503 },
    )
  }

  let lastErr = ''
  for (const base of HR_URLS) {
    try {
      const res = await fetch(`${base}/partner-institutions/external`, {
        headers: { Authorization: `Bearer ${HR_KEY}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) { lastErr = `HR returned ${res.status}`; continue }
      const data = await res.json()
      const institutions = (data.institutions ?? []) as PartnerInstitution[]
      // Alphabetical: this is a list someone scans for one name, and HR's own
      // order is whenever the record happened to be created.
      institutions.sort((a, b) => a.name.localeCompare(b.name))
      return NextResponse.json({ institutions })
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
    }
  }

  console.error('[partner-institutions] HR unreachable:', lastErr)
  return NextResponse.json(
    { error: `Could not reach HR Hub: ${lastErr}` },
    { status: 502 },
  )
}
