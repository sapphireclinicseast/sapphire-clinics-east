// GET /api/public/therapists?branch=SBEA&department=PT
// Returns minimal, non-PII therapist info for the patient portal.

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { preflight, withCors } from '../_cors'

/**
 * The portal exposes three MD sub-specialty tiles (Psychiatrist,
 * Developmental Pediatrician, Rehab Medicine Doctor). In HR Platform those
 * doctors are tagged `department=MD` with the real specialty in `jobTitle`.
 * Rather than re-classifying every record, this route maps each
 * sub-specialty dept code to a distinctive jobTitle substring, then queries
 * MD-dept staff whose jobTitle contains that substring (case-insensitive).
 */
const MD_SPECIALTY_JOB_TITLE: Record<string, string> = {
  PSYCHIATRY:                'psychiatrist',
  DEVELOPMENTAL_PEDIATRICIAN: 'developmental',  // matches developmental-pediatrician
  REHABILITATION_MEDICINE:    'rehab',          // matches rehab-medicine-doctor
}

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') ?? ''
  const department = searchParams.get('department') ?? ''

  if (!branch || !department) {
    return withCors(
      NextResponse.json({ error: 'branch and department are required' }, { status: 400 }),
      origin,
    )
  }

  // Build the staff filter. For MD sub-specialty depts the underlying staff
  // rows are tagged department=MD with the specialty in jobTitle; otherwise
  // do a straight department equality match.
  // We intentionally DON'T require a DeckingTherapistConfig here — staff
  // who haven't had their Decking Module set up yet should still appear in
  // the picker (with an empty week). Once their config is added they
  // automatically start surfacing available slots.
  const mdJobTitleHint = MD_SPECIALTY_JOB_TITLE[department]
  const staffWhere: Prisma.StaffWhereInput = mdJobTitleHint
    ? {
        branch,
        department: 'MD',
        jobTitle: { contains: mdJobTitleHint, mode: 'insensitive' },
      }
    : {
        branch,
        department: department as Prisma.EnumStaffDepartmentFilter['equals'],
      }

  const staff = await prisma.staff.findMany({
    where: staffWhere,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      sex: true,
      jobTitle: true,
      deckingConfig: { select: { workDays: true } },
    },
  })

  // HR Platform sends jobTitle as a slug (e.g. "developmental-pediatrician").
  // Render to a clean human form for the patient portal.
  function prettifyJobTitle(raw: string | null): string | null {
    if (!raw) return null
    const t = raw.trim()
    if (!t) return null
    return t
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .split(' ')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(' ')
  }

  const therapists = staff.map((s) => {
    const raw = (s.sex ?? '').trim().toUpperCase()
    const sex: 'M' | 'F' | null = raw === 'M' ? 'M' : raw === 'F' ? 'F' : null
    const days = (s.deckingConfig?.workDays as string[] | null) ?? []
    return {
      id: s.id,
      initials: `${s.firstName?.[0] ?? '?'}${s.lastName?.[0] ?? '?'}`.toUpperCase(),
      sex,
      jobTitle: prettifyJobTitle(s.jobTitle),
      // hasSchedule lets the UI render a subtle "no schedule yet" hint
      // alongside config-less staff. Frontend may choose to ignore it.
      hasSchedule: days.length > 0,
    }
  })

  return withCors(NextResponse.json({ therapists }), origin)
}
