import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function computePatientType(dob: Date): 'PEDIATRIC' | 'ADULT' {
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age <= 17 ? 'PEDIATRIC' : 'ADULT'
}

// POST — create a walk-in patient + schedule entry
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  const {
    // Patient (required if no patientId)
    patientId,
    firstName, lastName, phone, email, dob: dobStr,
    sex, civilStatus, religion, nationality, address, city, diagnosis, notes: patientNotes,
    // Schedule (all required)
    staffId, date, startTime, endTime, duration, sessionType,
    status = 'PENDING', notes: scheduleNotes,
  } = body

  if (!staffId || !date || !startTime || !endTime || !duration || !sessionType) {
    return NextResponse.json({ error: 'Missing schedule fields' }, { status: 400 })
  }

  let resolvedPatientId: string | null = patientId ?? null

  // Create patient if not provided
  if (!resolvedPatientId) {
    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'Patient first and last name required' }, { status: 400 })
    }
    const dob = dobStr ? new Date(dobStr) : null
    const patientType = dob ? computePatientType(dob) : (body.patientType ?? 'ADULT')

    // Determine branch from staff
    const staff = await prisma.staff.findUnique({ where: { id: staffId } })
    const branchEnum = staff?.branch === 'SBEA' ? 'SANDBOX_EAST'
      : staff?.branch === 'SBGH' ? 'SANDBOX_GREENHILLS'
      : null

    const patient = await prisma.patient.create({
      data: {
        firstName:   firstName.trim(),
        lastName:    lastName.trim(),
        phone:       phone       || null,
        email:       email       || null,
        dob:         dob         ?? null,
        patientType: patientType as any,
        branch:      branchEnum as any  ?? null,
        branches:    branchEnum ? [branchEnum as any] : [],
        sex:         sex         || null,
        civilStatus: civilStatus || null,
        religion:    religion    || null,
        nationality: nationality || null,
        address:     address     || null,
        city:        city        || null,
        diagnosis:   diagnosis   || null,
        notes:       patientNotes || null,
      },
    })
    resolvedPatientId = patient.id
  }

  // Create schedule
  const schedule = await prisma.schedule.create({
    data: {
      staffId,
      patientId: resolvedPatientId,
      date:        new Date(`${date}T12:00:00.000Z`),
      startTime,
      endTime,
      duration,
      sessionType,
      status: status as any,
      notes: scheduleNotes || null,
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      staff:   { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
    },
  })

  return NextResponse.json({ ok: true, schedule }, { status: 201 })
}
