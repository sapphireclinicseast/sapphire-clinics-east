import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'
const HR_API_KEY = process.env.HR_API_KEY ?? ''

export interface Certificate {
  seminarId: string
  seminarTitle: string
  seminarDate: string
  certificateFile: string
  certificateUrl: string
  uploadedAt: string | null
  source: 'registered' | 'manual'
}

// GET /api/certificates
// Returns all seminar certificates uploaded for the logged-in clinician.
// Delegates to HR hub GET /internal/staff-certificates?email=xxx which
// searches registered[] and certRecipients[] across all seminars.
export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!HR_API_KEY) {
    return NextResponse.json(
      { error: 'HR_API_KEY is not configured on the server' },
      { status: 500 }
    )
  }

  const email = session.user.email.toLowerCase()

  let res: Response
  try {
    res = await fetch(
      `${HR_API_BASE}/internal/staff-certificates?email=${encodeURIComponent(email)}`,
      {
        headers: { Authorization: `Bearer ${HR_API_KEY}` },
        cache: 'no-store',
      }
    )
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to reach HR hub', detail: (err as Error).message },
      { status: 502 }
    )
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `HR hub returned ${res.status}` },
      { status: 502 }
    )
  }

  const data = (await res.json()) as { ok: boolean; certificates?: Certificate[] }
  if (!data.ok) {
    return NextResponse.json({ error: 'HR hub error' }, { status: 502 })
  }

  return NextResponse.json({ certificates: data.certificates ?? [] })
}
