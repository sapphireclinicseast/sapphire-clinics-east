import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''

  if (!search.trim() || search.trim().length < 2) {
    return NextResponse.json([])
  }

  try {
    const res = await fetch(
      `${MARKETING_HUB_URL}/api/patients/external?search=${encodeURIComponent(search)}`,
      {
        headers: { 'Authorization': `Bearer ${EXTERNAL_API_KEY}` },
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      console.error('Marketing Hub patients error:', res.status)
      return NextResponse.json([])
    }

    const data = await res.json()
    // Transform: Marketing Hub returns {patients: [{firstName, lastName, email, ...}]}
    // POS expects [{id, name, email}]
    const patients = (data.patients || []).map((p: Record<string, unknown>) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      email: p.email || null,
      phone: p.phone || null,
      diagnosis: p.diagnosis || null,
    }))

    return NextResponse.json(patients)
  } catch (err) {
    console.error('Patient fetch error:', err)
    return NextResponse.json([])
  }
}
