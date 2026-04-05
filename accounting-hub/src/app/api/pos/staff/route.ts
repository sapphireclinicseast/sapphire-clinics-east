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
  const branch = searchParams.get('branch') || ''

  try {
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search)
    if (branch) params.set('branch', branch)

    const res = await fetch(
      `${MARKETING_HUB_URL}/api/staff/external?${params.toString()}`,
      {
        headers: { 'Authorization': `Bearer ${EXTERNAL_API_KEY}` },
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      console.error('Marketing Hub staff error:', res.status)
      return NextResponse.json([])
    }

    const data = await res.json()
    // Transform: Marketing Hub returns {staff: [{id, firstName, lastName, department, branch, jobTitle}]}
    // POS expects [{id, name, department, branch}]
    const staff = (data.staff || []).map((s: Record<string, unknown>) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      department: s.department || '',
      branch: s.branch || '',
      jobTitle: s.jobTitle || '',
    }))

    return NextResponse.json(staff)
  } catch (err) {
    console.error('Staff fetch error:', err)
    return NextResponse.json([])
  }
}
