import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://marketing.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''

  if (!search.trim()) {
    return NextResponse.json({ error: 'Search query is required' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `${MARKETING_HUB_URL}/api/patients/external?search=${encodeURIComponent(search)}`,
      { headers: { 'Authorization': `Bearer ${EXTERNAL_API_KEY}` }, cache: 'no-store' }
    )

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch patient data' },
        { status: res.status >= 500 ? 502 : res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch patient data' }, { status: 502 })
  }
}
