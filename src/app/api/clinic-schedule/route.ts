import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
// Shared LiveKit meeting-link generator (was an inline meet.jit.si helper).
import { generateMeetLink } from '@/lib/jitsi'

// Maps Staff.branch short codes to Patient.branch enum values
const STAFF_BRANCH_TO_PATIENT_BRANCH: Record<string, string> = {
  SBEA: 'SANDBOX_EAST',
  SBGH: 'SANDBOX_GREENHILLS',
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const staffId     = searchParams.get('staffId')
  const date        = searchParams.get('date')        // YYYY-MM-DD (single day)
  const startDate   = searchParams.get('startDate')   // YYYY-MM-DD (range start)
  const endDate     = searchParams.get('endDate')     // YYYY-MM-DD (range end)
  // The branch calendar being viewed. A session belongs to the branch it was
  // BOOKED on (Schedule.branch), not the branch its patient is registered at:
  // the Greenhills front desk routinely books East-registered patients, and
  // those sessions are Greenhills sessions.
  const branch = searchParams.get('branch')
  // Legacy fallback only. Rows created before Schedule.branch existed have it
  // null, so for those we still infer from the patient's registered branch.
  const patientBranch = searchParams.get('patientBranch') ?? branch
  const patientBranchEnum = patientBranch ? STAFF_BRANCH_TO_PATIENT_BRANCH[patientBranch] : null

  let dayStart: Date, dayEnd: Date
  if (startDate && endDate) {
    dayStart = new Date(`${startDate}T00:00:00.000Z`)
    dayEnd   = new Date(`${endDate}T23:59:59.999Z`)
  } else if (date) {
    dayStart = new Date(`${date}T00:00:00.000Z`)
    dayEnd   = new Date(`${date}T23:59:59.999Z`)
  } else {
    return NextResponse.json({ error: 'date or startDate+endDate is required' }, { status: 400 })
  }

  const schedules = await prisma.schedule.findMany({
    where: {
      ...(staffId ? { staffId } : {}),
      date: { gte: dayStart, lte: dayEnd },
      ...(branch ? {
        OR: [
          // Booked on this branch's calendar — the authoritative signal.
          { branch },
          // Legacy rows (branch null) keep patient-based inference so history
          // stays visible rather than vanishing from both calendars. Read the
          // `branches` ARRAY, not the legacy `branch` scalar: a patient tagged
          // for both branches has branches = {EAST, GREENHILLS} while `branch`
          // still holds only whichever branch registered them first. Filtering
          // on the scalar is what hid interbranch patients from the second
          // branch's calendar.
          {
            branch: null,
            OR: [
              { patientId: null },
              // Patients with neither field set pre-date branch tagging — show everywhere
              { patient: { branches: { isEmpty: true }, branch: null } },
              ...(patientBranchEnum
                ? [
                    { patient: { branches: { has: patientBranchEnum } } },
                    // Older rows never migrated onto `branches`
                    { patient: { branches: { isEmpty: true }, branch: patientBranchEnum } },
                  ]
                : []),
            ],
          },
        ],
      } : patientBranchEnum ? {
        OR: [
          { patientId: null },
          { patient: { branches: { isEmpty: true }, branch: null } },
          { patient: { branches: { has: patientBranchEnum } } },
          { patient: { branches: { isEmpty: true }, branch: patientBranchEnum } },
        ],
      } : {}),
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, branch: true, branches: true } },
      staff: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
      internStaff: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { startTime: 'asc' },
  })

  return NextResponse.json(schedules)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffId, patientId, date, startTime, endTime, duration, sessionType, status, notes, isTeletherapy, internStaffId, branch , withMentor } = await req.json()
  // Where the session happens — the branch calendar it was booked on. Needed
  // because interbranch clinicians hold one staff profile pinned to a single
  // branch, so staff.branch cannot attribute their cross-branch sessions.
  const sessionBranch = ['SBEA', 'SBGH', 'VER'].includes(branch) ? branch : null

  if (!staffId || !date || !startTime || !endTime || !duration || !sessionType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Booking a patient onto a branch calendar IS the act of assigning them to
  // that branch, so tag them here rather than making the front desk remember a
  // separate step. Without this, an East-registered patient booked at
  // Greenhills stays tagged East-only and drops off the Greenhills calendar the
  // moment anyone filters by patient branch — which is how the same session
  // ended up booked three times.
  if (patientId && sessionBranch && sessionBranch !== 'VER') {
    const patientBranchEnum = STAFF_BRANCH_TO_PATIENT_BRANCH[sessionBranch]
    if (patientBranchEnum) {
      const existing = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { branches: true, branch: true },
      })
      if (existing && !existing.branches.includes(patientBranchEnum)) {
        // Seed `branches` from the legacy scalar for patients never migrated,
        // so tagging a second branch does not silently drop the first.
        const seeded = existing.branches.length === 0 && existing.branch
          ? [existing.branch]
          : existing.branches
        await prisma.patient.update({
          where: { id: patientId },
          data: { branches: { set: [...new Set([...seeded, patientBranchEnum])] } },
        })
      }
    }
  }

  const schedule = await prisma.schedule.create({
    data: {
      staffId,
      patientId: patientId || null,
      date: new Date(`${date}T00:00:00.000Z`),
      startTime,
      endTime,
      duration,
      sessionType,
      status: status || 'PENDING',
      notes: notes || null,
      isTeletherapy: isTeletherapy || false,
      // Mentor sitting in on a mentee's session — drives the cashiering
      // highlight and the mentorship billing audit.
      withMentor: withMentor === true,
      internStaffId: internStaffId || null,
      branch: sessionBranch,
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, branch: true, branches: true } },
      staff: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
      internStaff: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  // If teletherapy, generate Jitsi Meet link and update the record
  if (isTeletherapy) {
    const patientName = schedule.patient
      ? `${schedule.patient.firstName}${schedule.patient.lastName}`
      : 'Patient'
    const staffName = `${schedule.staff.firstName}${schedule.staff.lastName}`

    const meetLink = generateMeetLink(staffName, patientName, date)
    const updated = await prisma.schedule.update({
      where: { id: schedule.id },
      data: { meetLink },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, branch: true, branches: true } },
        staff: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
      },
    })
    return NextResponse.json(updated, { status: 201 })
  }

  return NextResponse.json(schedule, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, patientId, date, startTime, endTime, duration, sessionType, status, notes, isTeletherapy, meetLink, internStaffId, branch , withMentor } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (patientId !== undefined) data.patientId = patientId || null
  if (date !== undefined) data.date = new Date(`${date}T00:00:00.000Z`)
  if (startTime !== undefined) data.startTime = startTime
  if (endTime !== undefined) data.endTime = endTime
  if (duration !== undefined) data.duration = duration
  if (sessionType !== undefined) data.sessionType = sessionType
  if (status !== undefined) data.status = status
  if (notes !== undefined) data.notes = notes || null
  if (isTeletherapy !== undefined) data.isTeletherapy = isTeletherapy
  if (withMentor !== undefined) data.withMentor = withMentor === true
  if (meetLink !== undefined) data.meetLink = meetLink || null
  if (internStaffId !== undefined) data.internStaffId = internStaffId || null
  if (branch !== undefined) data.branch = ['SBEA', 'SBGH', 'VER'].includes(branch) ? branch : null

  // Auto-generate a Jitsi link when teletherapy is being TOGGLED ON during an
  // edit (POST creates a link on initial save, but the PUT path used to leave
  // meetLink null when a user flipped the toggle on an existing schedule —
  // the symptom was "teletherapy link generator not working for MD" because
  // MD bookings most often start in-person and get switched to teletherapy
  // via edit, but the bug applies to every department equally).
  const wantsLink = isTeletherapy === true && !meetLink
  if (wantsLink) {
    const existing = await prisma.schedule.findUnique({
      where: { id },
      select: {
        date: true,
        meetLink: true,
        patient: { select: { firstName: true, lastName: true } },
        staff:   { select: { firstName: true, lastName: true } },
      },
    })
    if (existing && !existing.meetLink) {
      const patientName = existing.patient
        ? `${existing.patient.firstName}${existing.patient.lastName}`
        : 'Patient'
      const staffName = existing.staff
        ? `${existing.staff.firstName}${existing.staff.lastName}`
        : 'Staff'
      const effDate = (data.date as Date | undefined) ?? existing.date
      const dateStr = effDate.toISOString().split('T')[0]
      data.meetLink = generateMeetLink(staffName, patientName, dateStr)
    }
  }

  const schedule = await prisma.schedule.update({
    where: { id },
    data,
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, branch: true, branches: true } },
      internStaff: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  return NextResponse.json(schedule)
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  await prisma.schedule.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
