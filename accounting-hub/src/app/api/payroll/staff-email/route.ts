import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://marketing.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const externalStaffId = searchParams.get('externalStaffId') || ''
  const name = searchParams.get('name') || ''

  try {
    const res = await fetch(`${MARKETING_HUB_URL}/api/staff/external`, {
      headers: { Authorization: `Bearer ${EXTERNAL_API_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json({ error: 'Marketing hub unavailable' }, { status: 503 })

    const data = await res.json()
    const staff: { id: string; firstName: string; lastName: string; email?: string }[] = data.staff || []

    // Match by externalStaffId first, then by name
    let match = externalStaffId ? staff.find(s => s.id === externalStaffId) : null
    if (!match && name) {
      match = staff.find(
        s => `${s.lastName}, ${s.firstName}`.toLowerCase() === name.toLowerCase() ||
             `${s.firstName} ${s.lastName}`.toLowerCase() === name.toLowerCase()
      )
    }

    if (!match) return NextResponse.json({ error: 'Staff member not found in marketing hub' }, { status: 404 })
    if (!match.email) return NextResponse.json({ error: 'No email address on file for this staff member' }, { status: 404 })

    return NextResponse.json({ email: match.email, firstName: match.firstName, lastName: match.lastName })
  } catch (err) {
    console.error('Staff email lookup error:', err)
    return NextResponse.json({ error: 'Failed to reach marketing hub' }, { status: 500 })
  }
}
