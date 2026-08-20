import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ─── Generate Jitsi Meet link ─────────────────────────────────────────────
function generateMeetLink(
  staffName: string,
  patientName: string,
  date: string,
): string {
  // Build a unique, readable room name: SandboxClinic-FIRSTNAME-YYYYMMDD-random
  const cleanStaff = staffName.replace(/[^a-zA-Z]/g, '').toUpperCase()
  const cleanPatient = patientName.replace(/[^a-zA-Z]/g, '').toUpperCase()
  const dateSlug = date.replace(/-/g, '')
  const random = Math.random().toString(36).substring(2, 14)
  const roomName = `SandboxClinic-${cleanPatient}-${dateSlug}-${random}`
  return `https://meet.jit.si/${roomName}`
}

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
  // For multi-branch consultants: filter to only patients registered at this branch
  const patientBranch = searchParams.get('patientBranch')
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
      ...(patientBranchEnum ? {
        OR: [
          { patientId: null },
          // Patients with no branch set pre-date the branch field — include them everywhere
          { patient: { branch: null } },
          { patient: { branch: patientBranchEnum as 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' } },
        ],
      } : {}),
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
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

  const { staffId, patientId, date, startTime, endTime, duration, sessionType, status, notes, isTeletherapy, internStaffId, branch } = await req.json()
  // Where the session happens — the branch calendar it was booked on. Needed
  // because interbranch clinicians hold one staff profile pinned to a single
  // branch, so staff.branch cannot attribute their cross-branch sessions.
  const sessionBranch = ['SBEA', 'SBGH', 'VER'].includes(branch) ? branch : null

  if (!staffId || !date || !startTime || !endTime || !duration || !sessionType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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
      internStaffId: internStaffId || null,
      branch: sessionBranch,
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
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
        patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
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

  const { id, patientId, date, startTime, endTime, duration, sessionType, status, notes, isTeletherapy, meetLink, internStaffId, branch } = await req.json()
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
      patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
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
