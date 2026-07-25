// GET /api/aurora-admin/sessions — admin view of ALL consultants' session
// history (Clinic Schedule), grouped by consultant. Server-to-server auth via
// the shared AURORA_ADMIN_TOKEN (injected by the client-portal admin proxy).
// Optional ?branch=SANDBOX_EAST|SANDBOX_GREENHILLS filter.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkAdminToken } from '@/lib/aurora-admin'

const DEPT_LABEL: Record<string, string> = {
  OT: 'Occupational Therapy (OT)',
  PT: 'Physical Therapy (PT)',
  SLP: 'Speech-Language Pathology (SLP)',
  SPED: 'Special Education (SPED)',
  MD: 'Medical Doctor (MD)',
  PSYCHOLOGY: 'Psychology',
  ORTHOSIS: 'Orthosis / Prosthesis',
  PSYCHIATRY: 'Psychiatry',
  DEVELOPMENTAL_PEDIATRICIAN: 'Developmental Pediatrician',
  REHABILITATION_MEDICINE: 'Rehabilitation Medicine',
}
const BRANCH_LABEL: Record<string, string> = {
  SANDBOX_EAST: 'East Branch',
  SANDBOX_GREENHILLS: 'Greenhills Branch',
  VERDANA_STORE: 'Verdana Store',
}
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

interface SessionRow {
  id: string
  date: string
  startTime: string
  endTime: string
  patientName: string
  status: string
  isTeletherapy: boolean
}
interface ConsultantGroup {
  staffId: string
  name: string
  department: string
  branch: string
  sessions: SessionRow[]
}

export async function GET(req: NextRequest) {
  if (!checkAdminToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const branch = new URL(req.url).searchParams.get('branch')
  const staffFilter =
    branch === 'SANDBOX_EAST' || branch === 'SANDBOX_GREENHILLS'
      ? {
          staff: {
            is: { OR: [{ branch: branch as never }, { extraBranches: { has: branch as never } }] },
          },
        }
      : {}

  const schedules = await prisma.schedule.findMany({
    where: { ...staffFilter },
    orderBy: { date: 'desc' },
    take: 6000,
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      isTeletherapy: true,
      staff: {
        select: { id: true, firstName: true, lastName: true, department: true, branch: true },
      },
      patient: { select: { firstName: true, lastName: true } },
    },
  })

  const map = new Map<string, ConsultantGroup>()
  for (const s of schedules) {
    if (!s.staff) continue
    const key = s.staff.id
    let group = map.get(key)
    if (!group) {
      group = {
        staffId: key,
        name: titleCase(`${s.staff.firstName} ${s.staff.lastName}`) || 'Consultant',
        department: s.staff.department
          ? DEPT_LABEL[s.staff.department] ?? titleCase(s.staff.department)
          : '',
        branch: s.staff.branch ? BRANCH_LABEL[s.staff.branch] ?? s.staff.branch : '',
        sessions: [],
      }
      map.set(key, group)
    }
    group.sessions.push({
      id: s.id,
      date: s.date.toISOString().slice(0, 10),
      startTime: s.startTime,
      endTime: s.endTime,
      patientName:
        titleCase(`${s.patient?.firstName ?? ''} ${s.patient?.lastName ?? ''}`.trim()) || '—',
      status: s.status,
      isTeletherapy: s.isTeletherapy,
    })
  }

  const consultants = [...map.values()].sort((a, b) => (a.name < b.name ? -1 : 1))
  return NextResponse.json({ consultants, totalSessions: schedules.length })
}
