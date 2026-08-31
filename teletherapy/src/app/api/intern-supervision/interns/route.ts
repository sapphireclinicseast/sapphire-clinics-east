/**
 * Interns decked to the current supervisor.
 * Decking source = Operations Hub (Schedule.internStaffId, where the schedule's
 * staffId is the supervisor). Month range + branch = HR Platform (dateHired /
 * contractExpiry are the intern's Start / End months).
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isRotationLapsed, maybeSweepExpiredInterns } from '@/lib/intern-access'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'
const HR_KEY = process.env.HR_API_KEY ?? ''

const BRANCH_LABEL: Record<string, string> = {
  SBEA: 'Aura Health East',
  SANDBOX_EAST: 'Aura Health East',
  SBGH: 'Aura Health Greenhills',
  SANDBOX_GREENHILLS: 'Aura Health Greenhills',
  VDNA: 'Verdana',
  VERDANA_STORE: 'Verdana',
}

function fmtMonth(d?: string | null): string | null {
  if (!d) return null
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return null
  return dt.toLocaleString('en-US', { month: 'short', year: 'numeric' })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Drive the auto-disable sweep from normal supervisor traffic (throttled,
  // fire-and-forget) so it works without a cron.
  maybeSweepExpiredInterns()

  const user = session.user as { role?: string; staffId?: string; department?: string; branches?: { staffId: string }[]; isInternshipSupervisor?: boolean }
  const isAdmin = user.role === 'ADMIN'
  const isTaggedSupervisor = !!user.isInternshipSupervisor
  const myStaffIds = (user.branches ?? []).map((b) => b.staffId).filter(Boolean)
  const staffPool = myStaffIds.length > 0 ? myStaffIds : [user.staffId].filter(Boolean) as string[]

  // ?scope=all — every intern (Clinical Internship Supervisor tag or admin
  // only), not just the ones decked to this person. Source of truth is
  // Staff.employmentType, not the Schedule decking used below — an intern
  // who hasn't been decked to anyone yet still belongs on this roster.
  // A tagged supervisor only oversees interns in THEIR OWN department, so the
  // roster is department-scoped for them; admins see every department.
  const scopeAll = new URL(req.url).searchParams.get('scope') === 'all'
  if (scopeAll && !isAdmin && !isTaggedSupervisor) {
    return NextResponse.json({ error: 'Clinical Internship Supervisor access required.' }, { status: 403 })
  }

  const interns = scopeAll
    ? await prisma.staff.findMany({
        where: {
          employmentType: 'intern',
          ...(isAdmin || !user.department ? {} : { department: user.department as never }),
        },
        select: { id: true, firstName: true, lastName: true, department: true, branch: true, hrPlatformId: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })
    : await (async () => {
        // Interns decked to me: supervisor = schedule.staffId, intern = internStaffId.
        const rows = await prisma.schedule.findMany({
          where: {
            internStaffId: { not: null },
            ...(isAdmin ? {} : { staffId: { in: staffPool } }),
          },
          select: {
            internStaff: {
              select: { id: true, firstName: true, lastName: true, department: true, branch: true, hrPlatformId: true },
            },
          },
          distinct: ['internStaffId'],
        })
        return rows.map((r) => r.internStaff).filter((s): s is NonNullable<typeof s> => !!s)
      })()

  // Pull HR data for the month range + branch, matched by hrPlatformId.
  const hrMap = new Map<string, { dateHired?: string | null; contractExpiry?: string | null; branch?: string | null }>()
  if (HR_KEY && interns.length > 0) {
    try {
      const res = await fetch(`${HR_API_BASE}/staff/external`, {
        headers: { Authorization: 'Bearer ' + HR_KEY },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        const data = await res.json()
        for (const s of (data.staff ?? [])) {
          hrMap.set(s.hrId, { dateHired: s.dateHired, contractExpiry: s.contractExpiry, branch: s.branch })
        }
      }
    } catch { /* HR unavailable — fall back to local Staff.branch, no month range */ }
  }

  // Portal-account status per intern (for the auto-disable / Enable UI).
  const accounts = await prisma.therapistAccount.findMany({
    where: { staffId: { in: interns.map((i) => i.id) } },
    select: { staffId: true, isActive: true },
  })
  const acctByStaff = new Map(accounts.map((a) => [a.staffId, a]))

  const out = interns
    .map((i) => {
      const hr = i.hrPlatformId ? hrMap.get(i.hrPlatformId) : undefined
      const branchCode = hr?.branch ?? i.branch
      const acct = acctByStaff.get(i.id)
      return {
        id: i.id,
        name: `${i.firstName} ${i.lastName}`,
        department: i.department,
        branch: BRANCH_LABEL[branchCode ?? ''] ?? branchCode ?? '—',
        startMonth: fmtMonth(hr?.dateHired),
        endMonth: fmtMonth(hr?.contractExpiry),
        hasAccount: !!acct,
        accountActive: acct?.isActive ?? null,
        rotationLapsed: isRotationLapsed(hr?.contractExpiry),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({ interns: out })
}
