/**
 * GET /api/payroll/pdf?kind=employee|consultant&id=<payslip-id>
 *
 * Streams the LOCKED payslip PDF for the logged-in clinician.
 * Proxies to accounting hub's /internal/my-payslips/pdf, which
 * verifies email + LOCKED status server-side. We always re-fetch
 * the latest copy so a regenerated payslip's PDF supersedes the
 * previous version transparently.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const ACCOUNTING_API_BASE = process.env.ACCOUNTING_API_BASE ?? 'https://accounting.sapphireclinicseast.org/api'
const ACCOUNTING_API_KEY = process.env.ACCOUNTING_API_KEY ?? ''

export async function GET(req: NextRequest) {
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

  const kind = req.nextUrl.searchParams.get('kind') ?? ''
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id || !['employee', 'consultant'].includes(kind)) {
    return NextResponse.json({ error: 'kind and id are required' }, { status: 400 })
  }

  const url = `${ACCOUNTING_API_BASE}/internal/my-payslips/pdf?email=${encodeURIComponent(session.user.email)}&kind=${kind}&id=${encodeURIComponent(id)}`
  let upstream: Response
  try {
    upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${ACCOUNTING_API_KEY}` },
      cache: 'no-store',
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to reach accounting hub', detail: (err as Error).message },
      { status: 502 }
    )
  }
  if (!upstream.ok) {
    const data = await upstream.json().catch(() => ({}))
    return NextResponse.json(
      { error: data?.error ?? `Accounting hub returned ${upstream.status}` },
      { status: upstream.status }
    )
  }

  // Stream the PDF body straight through.
  const buffer = await upstream.arrayBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/pdf',
      'Content-Disposition': upstream.headers.get('Content-Disposition') ?? `inline; filename="payslip.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
