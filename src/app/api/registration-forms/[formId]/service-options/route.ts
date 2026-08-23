/**
 * Registration Form service departments — proxy to HR Platform.
 *
 * GET   /api/registration-forms/:formId/service-options
 * PATCH /api/registration-forms/:formId/service-options  { enabled: string[] }
 *
 * Controls which departments appear on a form's "What service does the patient
 * need" question. The HR Platform stores this as an overlay outside form-defs/,
 * so it survives that platform's deploys (which rsync form-defs from its repo).
 *
 * Writes are restricted to admins — this changes what the public registration
 * form offers, so it shouldn't be editable by every signed-in front-desk user.
 */

import { NextResponse, NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

const HR_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

const WRITE_ROLES = ['ADMIN', 'MARKETING_ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN']

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ formId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (!HR_KEY) return NextResponse.json({ ok: false, error: 'HR Platform API key not configured' }, { status: 500 })

  const { formId } = await params
  try {
    const r = await fetch(`${HR_URL}/forms/external/${formId}/service-options`, {
      headers: { Authorization: `Bearer ${HR_KEY}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    return NextResponse.json(await r.json(), { status: r.ok ? 200 : r.status })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'HR Platform unreachable: ' + (err instanceof Error ? err.message : 'unknown') },
      { status: 502 },
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ formId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!WRITE_ROLES.includes(role)) {
    return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 })
  }
  if (!HR_KEY) return NextResponse.json({ ok: false, error: 'HR Platform API key not configured' }, { status: 500 })

  const { formId } = await params
  const body = await req.json().catch(() => ({}))
  try {
    const r = await fetch(`${HR_URL}/forms/external/${formId}/service-options`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${HR_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: body?.enabled ?? [] }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    return NextResponse.json(await r.json(), { status: r.ok ? 200 : r.status })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'HR Platform unreachable: ' + (err instanceof Error ? err.message : 'unknown') },
      { status: 502 },
    )
  }
}
