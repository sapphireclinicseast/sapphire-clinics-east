import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const HR_PLATFORM_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const HR_KEY = process.env.TELETHERAPY_HR_API_KEY || ''

// GET ?month=YYYY-MM → consultant Service-Invoice submission status from the HR Hub.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const month = new URL(req.url).searchParams.get('month') || new Date().toISOString().slice(0, 7)
  try {
    const res = await fetch(`${HR_PLATFORM_URL}/external/service-invoices?month=${month}`, {
      headers: { 'x-api-key': HR_KEY }, cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json({ error: `HR Hub returned ${res.status}`, statuses: [] }, { status: 502 })
    const data = await res.json()
    // [{ staffId, name, branch, tin, status, submittedAt }]
    return NextResponse.json({ month, statuses: data.invoices || [] })
  } catch (e) {
    console.error('EWT SI status fetch error:', e)
    return NextResponse.json({ error: 'Could not reach HR Hub', statuses: [] }, { status: 502 })
  }
}
