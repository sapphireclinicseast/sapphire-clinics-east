/**
 * Full profile for one decked intern: their HR sign-up record (from the HR
 * Platform) + their self-submitted Learning Outcomes & Preferences.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'
const HR_KEY = process.env.HR_API_KEY ?? ''

// Display-safe HR fields only (never expose gov-ID / bank fields here).
const HR_FIELDS = ['firstName', 'lastName', 'department', 'branch', 'jobTitle', 'employmentType', 'email', 'phone', 'birthday', 'sex', 'dateHired', 'contractExpiry', 'school', 'schoolAttended'] as const

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const user = session.user as { role?: string; staffId?: string; branches?: { staffId: string }[] }
  const isAdmin = user.role === 'ADMIN'
  if (!isAdmin) {
    const myStaffIds = (user.branches ?? []).map((b) => b.staffId).filter(Boolean)
    const staffPool = myStaffIds.length > 0 ? myStaffIds : ([user.staffId].filter(Boolean) as string[])
    const decked = await prisma.schedule.findFirst({ where: { internStaffId: id, staffId: { in: staffPool } }, select: { id: true } })
    if (!decked) return NextResponse.json({ error: 'You do not supervise this intern.' }, { status: 403 })
  }

  const staff = await prisma.staff.findUnique({
    where: { id },
    select: { id: true, firstName: true, lastName: true, department: true, branch: true, hrPlatformId: true, photoPath: true },
  })
  if (!staff) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // HR sign-up record (display-safe subset).
  let hr: Record<string, unknown> | null = null
  let hrPhoto: string | null = null
  if (HR_KEY && staff.hrPlatformId) {
    try {
      const res = await fetch(`${HR_API_BASE}/staff/external`, {
        headers: { Authorization: 'Bearer ' + HR_KEY }, cache: 'no-store', signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        const data = await res.json()
        const rec = (data.staff ?? []).find((s: { hrId?: string }) => s.hrId === staff.hrPlatformId)
        if (rec) {
          hr = {}
          for (const f of HR_FIELDS) if (rec[f] != null && rec[f] !== '') hr[f] = rec[f]
          if (rec.photo) hrPhoto = String(rec.photo)
        }
      }
    } catch { /* HR unavailable */ }
  }

  // Prefer the locally-stored photo (a data URI — always reachable by the browser,
  // survives HR redeploys, and needs no HR auth). The HR-served URL is only a
  // last resort: that endpoint requires auth and the /staff/external `photo` field
  // is a direct edit that HR deploys periodically revert.
  let photoUrl: string | null = null
  if (staff.photoPath) photoUrl = staff.photoPath
  else if (hrPhoto) photoUrl = `${HR_API_BASE}/staff-photos/${encodeURIComponent(hrPhoto)}`

  // @ts-ignore — learningProfile
  const lp = await prisma.learningProfile.findUnique({ where: { internStaffId: id } })

  return NextResponse.json({
    intern: { id: staff.id, name: `${staff.firstName} ${staff.lastName}`, department: staff.department, branch: staff.branch },
    hr,
    photoUrl,
    learningProfile: lp?.data ?? null,
    learningUpdatedAt: lp?.updatedAt ?? null,
  })
}
