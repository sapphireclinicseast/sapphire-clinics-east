import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { fetchHrPartnerInstitutions } from '@/lib/external-staff'

// Partner institutions synced live from the HR Platform "Partnerships" module.
// Read-only passthrough so the Forms distribution sheet's partner dropdown always
// reflects HR's current list without storing a stale copy in the accounting DB.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const institutions = await fetchHrPartnerInstitutions()
  // Sort by name for a stable, scannable dropdown.
  institutions.sort((a, b) => a.name.localeCompare(b.name))
  return NextResponse.json({ data: institutions })
}
