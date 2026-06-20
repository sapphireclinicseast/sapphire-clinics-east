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
  // Collapse duplicate payslips for the same cutoff + branch. Some people
  // exist in BOTH the Employee and Consultant rosters with the same email, and
  // a few carry a leftover ₱0 LOCKED consultant entry alongside their real
  // employee payslip — which would otherwise show up as two identical-looking
  // cards for the same period. Keep the one with the highest net pay (the real
  // one) per cutoff+branch; different branches are kept (interbranch is legit).
  if (data && Array.isArray(data.payslips)) {
    const byKey = new Map<string, any[]>()
    for (const p of data.payslips) {
      const key = `${p?.cutoffPeriod ?? ''}|${p?.branch ?? ''}`
      const arr = byKey.get(key)
      if (arr) arr.push(p)
      else byKey.set(key, [p])
    }
    data.payslips = [...byKey.values()].map((arr) =>
      arr.length === 1
        ? arr[0]
        : arr.reduce((a, b) => (Number(b?.netPay ?? 0) > Number(a?.netPay ?? 0) ? b : a)),
    )
  }

  return NextResponse.json(data)
}
