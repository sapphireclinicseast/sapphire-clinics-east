import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { fetchHrStaffForSync } from '@/lib/external-staff'

const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

function allowedBranches(role: string): string[] | null {
  if (role === 'AHEA_ADMIN' || role === 'AHEA_FRONTDESK') return ['SBEA', 'VERDANA']
  if (role === 'AHGH_ADMIN' || role === 'AHGH_FRONTDESK') return ['SBGH', 'VERDANA']
  if (role === 'VERDANA_ADMIN') return ['VERDANA']
  return null
}

/** Format name as "FIRSTNAME LASTNAME" in ALL CAPS */
function formatName(s: string): string {
  return s.toUpperCase()
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const branch = searchParams.get('branch') || ''

  try {
    const allowed = allowedBranches((session.user as { role?: string }).role || '')
    if (branch && allowed && !allowed.includes(branch)) {
      return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
    }

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
    let staff = (data.staff || []).map((s: Record<string, unknown>) => ({
      id: s.id,
      name: formatName(`${s.firstName} ${s.lastName}`),
      department: s.department || '',
      branch: (s.branch || '') as string,
      jobTitle: s.jobTitle || '',
    }))

    // Verdana staff are NOT in Operations (they do no therapy sessions) — they
    // live in the HR Platform. Merge them in so they appear e.g. in the asset
    // Accountability picker for a Verdana asset.
    if (!branch || branch === 'VERDANA') {
      try {
        const q = search.trim().toLowerCase()
        const hrVerdana = (await fetchHrStaffForSync())
          .filter(s => String(s.branch || '').toUpperCase() === 'VERDANA')
          .map(s => ({
            id: s.id,
            name: formatName(`${s.firstName} ${s.lastName}`),
            department: s.department || '',
            branch: 'VERDANA' as string,
            jobTitle: s.jobTitle || '',
          }))
          .filter(s => !q || s.name.toLowerCase().includes(q))
        staff = staff.concat(hrVerdana)
      } catch (e) {
        console.error('[pos/staff] HR Verdana merge failed:', e)
      }
    }

    // Filter to allowed branches if role-restricted and no specific branch was requested
    if (!branch && allowed) {
      staff = staff.filter((s: { branch: string }) => allowed.includes(s.branch))
    }

    return NextResponse.json(staff)
  } catch (err) {
    console.error('Staff fetch error:', err)
    return NextResponse.json([])
  }
}
