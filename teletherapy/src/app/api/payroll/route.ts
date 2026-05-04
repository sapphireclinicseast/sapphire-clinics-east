/**
 * GET /api/payroll
 *
 * Returns the logged-in clinician's LOCKED payslips by proxying the
 * accounting hub's internal /my-payslips endpoint with the user's email.
 * Draft / Final payslips are excluded server-side, so they will never
 * surface in teletherapy.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const ACCOUNTING_API_BASE = process.env.ACCOUNTING_API_BASE ?? 'https://accounting.sapphireclinicseast.org/api'
const ACCOUNTING_API_KEY = process.env.ACCOUNTING_API_KEY ?? ''

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ACCOUNTING_API_KEY) {
    return NextResponse.json(
      { error: 'ACCOUNTING_API_KEY is not configured on the server' },
      { status: 500 }
    )
  }

  const url = `${ACCOUNTING_API_BASE}/internal/my-payslips?email=${encodeURIComponent(session.user.email)}`
  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${ACCOUNTING_API_KEY}` },
      cache: 'no-store',
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to reach accounting hub', detail: (err as Error).message },
      { status: 502 }
    )
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error ?? `Accounting hub returned ${res.status}` },
      { status: 502 }
    )
  }
  return NextResponse.json(data)
}
