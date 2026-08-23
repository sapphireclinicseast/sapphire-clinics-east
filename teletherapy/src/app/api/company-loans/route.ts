/**
 * GET /api/company-loans
 *
 * Returns the logged-in employee's ACTIVE company loans (with outstanding
 * balances) by proxying the accounting hub's internal /my-loans endpoint.
 * Consultants have no company loans and are short-circuited. Matched by the
 * stable staffId (Employee.externalStaffId) with email as a fallback.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const ACCOUNTING_API_BASE = process.env.ACCOUNTING_API_BASE ?? 'https://accounting.sapphireclinicseast.org/api'
const ACCOUNTING_API_KEY = process.env.ACCOUNTING_API_KEY ?? ''

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Consultants don't have company loans — don't even ask the accounting hub.
  if ((session.user.employmentType ?? '').toLowerCase() === 'consultant') {
    return NextResponse.json({ matchedAsEmployee: false, loans: [], totalOutstanding: 0 })
  }

  if (!ACCOUNTING_API_KEY) {
    return NextResponse.json(
      { error: 'ACCOUNTING_API_KEY is not configured on the server' },
      { status: 500 }
    )
  }

  const params = new URLSearchParams()
  if (session.user.staffId) params.set('staffId', session.user.staffId)
  if (session.user.email) params.set('email', session.user.email)

  const url = `${ACCOUNTING_API_BASE}/internal/my-loans?${params.toString()}`
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
