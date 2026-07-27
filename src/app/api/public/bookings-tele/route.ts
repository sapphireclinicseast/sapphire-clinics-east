// POST /api/public/bookings-tele
//
// Creates a PENDING PatientBooking for a teletherapy service with no staff or
// date assignment yet.  The patient pays via the static accounting-hub PayMongo
// link; the front desk manually confirms payment in the Decking Module, then
// assigns a therapist and time via the Add-to-Staff-Deck modal.
//
// Authenticated via the patient's session token (same JWT used everywhere).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { preflight, withCors } from '../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')

  let body: { token?: string; branch?: string; department?: string; serviceId?: string; serviceName?: string }
  try { body = await req.json() } catch { body = {} }

  const { token, branch, department, serviceId, serviceName } = body

  const session = verifyPatientToken(token ?? '')
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  if (!branch || !department) {
    return withCors(
      NextResponse.json({ error: 'branch and department are required' }, { status: 400 }),
      origin,
    )
  }

  const patient = await prisma.patient.findUnique({
    where: { id: session.patientId },
    select: { id: true },
  })
  if (!patient) {
    return withCors(NextResponse.json({ error: 'Patient not found' }, { status: 404 }), origin)
  }

  const notes = serviceName
    ? `Teletherapy: ${serviceName}${serviceId ? ` (${serviceId})` : ''}`
    : 'Teletherapy booking'

  const booking = await prisma.patientBooking.create({
    data: {
      patientId: session.patientId,
      staffId: null,
      branch,
      department,
      date: null,
      startTime: '',
      endTime: '',
      isTeletherapy: true,
      status: 'PENDING',
      source: 'PORTAL',
      notes,
    },
    select: { id: true },
  })

  return withCors(NextResponse.json({ ok: true, bookingId: booking.id }), origin)
}
