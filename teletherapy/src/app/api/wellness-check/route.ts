/**
 * POST /api/wellness-check
 *
 * Teletherapy → HR proxy for Therapist Wellness Survey submissions.
 * Forwards the form payload to HR's bearer-key-protected
 * /internal/wellness-survey endpoint. The HR side is the source of
 * truth — it stores the row, scrubs identity for anonymous submits,
 * and powers the Wellness Survey tab in the Staff Concerns module.
 *
 * Authentication: requires a logged-in teletherapy session, but
 * the HR call uses the static HR_API_KEY (= MARKETING_API_KEY on the
 * HR side) like our other internal cross-app calls. We never pass
 * the user's identity to HR for anonymous submissions; the form
 * payload itself decides whether name/department are included.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'
const HR_API_KEY  = process.env.HR_API_KEY  ?? ''

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!HR_API_KEY) {
    return NextResponse.json(
      { error: 'HR_API_KEY is not configured on the server' },
      { status: 500 },
    )
  }

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Defensive scrub — even if a misbehaving client posts an
  // anonymous submission with name/department populated, strip
  // them before the request leaves teletherapy. The HR endpoint
  // does its own scrub too; this is belt-and-braces.
  if (body.submitMode !== 'named') {
    body.name = ''
    body.department = ''
  }

  let res: Response
  try {
    res = await fetch(`${HR_API_BASE}/internal/wellness-survey`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HR_API_KEY}`,
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to reach HR hub', detail: (err as Error).message },
      { status: 502 },
    )
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error ?? `Submission failed (${res.status})` },
      { status: res.status },
    )
  }
  return NextResponse.json({ success: true, id: data.id })
}
