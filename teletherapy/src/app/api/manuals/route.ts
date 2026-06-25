/**
 * GET /api/manuals
 *
 * Lists department manuals published from the HR hub
 * (/manuals/public — "Show in Staff Portal" items only), scoped to
 * the logged-in clinician's department. Returns metadata only; page
 * images are fetched separately via /api/manuals/[id]/page/[n] so the
 * source PDF never reaches the browser.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { allowedDeptsFor, manualInScope, normaliseDept } from '@/lib/manual-scope'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'

interface HRManual {
  id: string
  name: string
  departments: string[]
  branches: string[]
  version: string
  sizeBytes: number
  pageCount: number
  audience?: string
  updatedAt: string
}

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const myRole = (session.user as { role?: string }).role ?? ''
  const myDept = normaliseDept((session.user as { department?: string }).department ?? '')
  const myAccountType = (session.user as { accountType?: string }).accountType ?? ''
  const isAdmin = myRole === 'ADMIN'
  // Front-desk / admin-staff accounts see all-department manuals (null scope).
  const allowed = (myAccountType === 'FRONT_DESK' || myAccountType === 'ADMIN_STAFF')
    ? null
    : allowedDeptsFor(myRole, (session.user as { department?: string }).department ?? '')

  // Per-manual Staff Portal audience set in the HR hub:
  //   ALL = everyone · CLINICIAN = clinical staff · ADMIN = admin/office staff.
  // System admins (role ADMIN) always see every manual. Account type defaults
  // to CLINICIAN, so accounts without an explicit type are treated as clinical.
  const isClinician = myAccountType === 'CLINICIAN' || myAccountType === ''
  const isAdminEmployee = myAccountType === 'ADMIN_STAFF' || myAccountType === 'FRONT_DESK'
  const audienceVisible = (aud?: string) => {
    if (isAdmin) return true
    const a = (aud || 'ALL').toUpperCase()
    if (a === 'CLINICIAN') return isClinician
    if (a === 'ADMIN') return isAdminEmployee
    return true
  }

  let res: Response
  try {
    res = await fetch(`${HR_API_BASE}/manuals/public`, { cache: 'no-store' })
  } catch {
    return NextResponse.json({ error: 'HR hub unreachable' }, { status: 502 })
  }
  if (!res.ok) {
    return NextResponse.json({ error: `HR manuals returned ${res.status}` }, { status: 502 })
  }

  const data = (await res.json()) as { ok: boolean; manuals?: HRManual[] }
  const all = data.ok ? data.manuals ?? [] : []

  const manuals = all
    .filter((m) => manualInScope(m.departments, allowed) && audienceVisible(m.audience))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((m) => ({
      id: m.id,
      name: m.name,
      departments: m.departments || [],
      version: m.version || '',
      sizeBytes: m.sizeBytes || 0,
      pageCount: m.pageCount || 0,
      updatedAt: m.updatedAt,
    }))

  return NextResponse.json({ department: myDept || null, isAdmin, manuals })
}
