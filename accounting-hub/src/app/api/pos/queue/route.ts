import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://marketing.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || 'SBEA'
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

  try {
    const res = await fetch(
      `${MARKETING_HUB_URL}/api/queue?branch=${branch}&date=${date}&status=CONFIRMED`,
      { headers: { 'Authorization': `Bearer ${EXTERNAL_API_KEY}` }, cache: 'no-store' }
    )
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch queue data' }, { status: 502 })
  }
}
