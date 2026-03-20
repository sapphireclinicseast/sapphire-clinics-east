import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://marketing.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || 'SBEA'
  const date = searchParams.get('date') || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

  try {
    // Use the authenticated external endpoint that returns full patient names
    const res = await fetch(
      `${MARKETING_HUB_URL}/api/queue/external?branch=${branch}&date=${date}&status=CONFIRMED`,
      {
        headers: { 'Authorization': `Bearer ${EXTERNAL_API_KEY}` },
        cache: 'no-store',
        next: { revalidate: 0 },
      }
    )

    if (!res.ok) {
      const text = await res.text()
      console.error('Marketing Hub queue error:', res.status, text)
      return NextResponse.json(
        { error: `Marketing Hub returned ${res.status}` },
        { status: 502 }
      )
    }

    const data = await res.json()

    // Transform Marketing Hub response → POS QueueItem format
    // Marketing Hub returns: { date, branch, items: [{id, startTime, endTime, sessionType, status, clinician, patientId, patientName, ...}] }
    // POS expects: [{id, time, patientName, sessionType, clinician}]
    const items = (data.items || []).map((item: Record<string, unknown>) => ({
      id: item.id,
      time: item.startTime ? `${item.startTime}–${item.endTime || ''}` : '',
      patientName: item.patientName || '—',
      patientId: item.patientId || null,
      sessionType: item.sessionType || '',
      clinician: item.clinician || item.therapist || '',
      department: item.department || '',
      branch: item.branch || branch,
      status: item.status || 'CONFIRMED',
    }))

    return NextResponse.json(items)
  } catch (err) {
    console.error('Queue fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch queue data from scheduling system' }, { status: 502 })
  }
}
