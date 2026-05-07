/**
 * Registration Forms Responses — Proxy to HR Platform
 *
 * GET /api/registration-forms/:formId/responses
 *
 * Auth: session required (any role). Front desk users are filtered
 *       to their branch on the client side.
 */

import { NextResponse, NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

const HR_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { formId } = await params
  if (!formId || !/^[a-zA-Z0-9]+$/.test(formId)) {
    return NextResponse.json({ ok: false, error: 'Invalid form ID' })
  }

  try {
    const res = await fetch(`${HR_URL}/forms/external/${formId}/responses`, {
      headers: { Authorization: `Bearer ${HR_KEY}` },
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    // Visible in `docker logs sapphire_app` so an outage is obvious.
    console.error('[registration-forms/responses] HR fetch failed:', e)
    return NextResponse.json({
      ok: false,
      error: e.message || 'Failed to fetch from HR platform',
      _warning: 'HR Platform unreachable — Registration Form responses cannot be loaded right now.',
    })
  }
}
