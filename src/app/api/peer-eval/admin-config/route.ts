import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { StaffDepartment } from '@prisma/client'

const HR_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

const ADMIN_DEPTS = new Set(['ADMINISTRATION'])

// ── GET: list all PeerEvalAdminConfigs, optionally filtered by branch ──────────
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch')

  const configs = await prisma.peerEvalAdminConfig.findMany({
    where: { ...(branch ? { branch } : {}) },
    include: {
      staff: { select: { id: true, firstName: true, lastName: true, department: true, branch: true, jobTitle: true } },
    },
    orderBy: [{ staff: { lastName: 'asc' } }],
  })

  return NextResponse.json(configs)
}

// ── POST: upsert a single admin config ────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN'].includes(role))
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const { staffId, workDays, branch } = await req.json()
  if (!staffId || !workDays || !branch)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const config = await prisma.peerEvalAdminConfig.upsert({
    where: { staffId },
    create: { staffId, workDays, branch },
    update: { workDays },
    include: {
      staff: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
    },
  })

  return NextResponse.json(config)
}

// ── DELETE: remove a config ───────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN'].includes(role))
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const { staffId } = await req.json()
  await prisma.peerEvalAdminConfig.delete({ where: { staffId } })
  return NextResponse.json({ ok: true })
}

// ── PATCH: sync admin staff from HR Platform and auto-create configs ──────────
// Route: POST /api/peer-eval/admin-config?action=sync
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN'].includes(role))
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  if (!HR_KEY) return NextResponse.json({ error: 'HR Platform API key not configured' }, { status: 500 })

  // Fetch from HR Platform
  let hrStaff: any[]
  try {
    const res = await fetch(`${HR_URL}/staff/external`, {
      headers: { Authorization: `Bearer ${HR_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json({ error: `HR Platform returned ${res.status}` }, { status: 502 })
    const data = await res.json()
    hrStaff = data.staff || []
  } catch {
    return NextResponse.json({ error: 'Cannot reach HR Platform' }, { status: 502 })
  }

  const EXCLUDED_TITLES = new Set(['CEO', 'President', 'ceo', 'president', 'Chief Executive Officer', 'ceo-and-president'])

  // Filter to admin staff in SBEA or SBGH, excluding CEO and President
  const adminStaff = hrStaff.filter(
    s => ADMIN_DEPTS.has(s.department) && ['SBEA', 'SBGH'].includes(s.branch)
      && !EXCLUDED_TITLES.has(s.jobTitle)
  )

  // Upsert all ADMINISTRATION staff into local Staff table first
  for (const hr of adminStaff) {
    let dob: Date | null = null
    if (hr.birthday) {
      const d = new Date(hr.birthday)
      if (!isNaN(d.getTime())) dob = d
    }
    try {
      await prisma.staff.upsert({
        where: { hrPlatformId: hr.hrId },
        create: {
          hrPlatformId:   hr.hrId,
          firstName:      hr.firstName,
          lastName:       hr.lastName,
          email:          hr.email ?? null,
          phone:          hr.phone ?? null,
          dob,
          department:     'ADMINISTRATION' as StaffDepartment,
          branch:         hr.branch,
          jobTitle:       hr.jobTitle ?? null,
          employmentType: hr.employmentType ?? null,
        },
        update: {
          firstName:      hr.firstName,
          lastName:       hr.lastName,
          email:          hr.email ?? null,
          phone:          hr.phone ?? null,
          dob,
          department:     'ADMINISTRATION' as StaffDepartment,
          branch:         hr.branch,
          jobTitle:       hr.jobTitle ?? null,
          employmentType: hr.employmentType ?? null,
        },
      })
    } catch { /* skip individual upsert errors */ }
  }

  // Reload staff after upsert
  const existing = await prisma.staff.findMany({
    where: { department: 'ADMINISTRATION' },
    select: { id: true, hrPlatformId: true, firstName: true, lastName: true, branch: true },
  })
  const byHrId = new Map(existing.filter(s => s.hrPlatformId).map(s => [s.hrPlatformId!, s]))
  const byName = new Map(existing.map(s => [`${s.firstName}|${s.lastName}|${s.branch}`, s]))

  let created = 0, updated = 0
  const errors: string[] = []

  for (const hr of adminStaff) {
    const match = byHrId.get(hr.hrId) ?? byName.get(`${hr.firstName}|${hr.lastName}|${hr.branch}`)
    if (!match) {
      errors.push(`Could not resolve ${hr.firstName} ${hr.lastName} (${hr.branch})`)
      continue
    }

    try {
      const cfg = await prisma.peerEvalAdminConfig.findUnique({ where: { staffId: match.id } })
      if (cfg) {
        updated++
      } else {
        await prisma.peerEvalAdminConfig.create({
          data: {
            staffId:  match.id,
            workDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
            branch:   match.branch,
          },
        })
        created++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${hr.firstName} ${hr.lastName}: ${msg}`)
    }
  }

  return NextResponse.json({ synced: created + updated, created, updated, errors })
}
