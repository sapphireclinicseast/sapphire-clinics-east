// POST /api/public/homecare/quote — compute the fare breakdown (session fee +
// distance-based transport + time-of-day surge) for a given serving branch,
// client address, and chosen open day. Used to SHOW the total on the review
// page before the patient commits. The authoritative recompute happens again
// in /book, so a tampered quote can't change what's charged.
//
// Body: { branch: "SBEA"|"SBGH", address: string, openDayId?: string }

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { preflight, withCors } from '../../_cors'
import { loadClinic, loadFareSettings, isShortBranch } from '@/lib/homecare'
import { computeHomecareFare } from '@/lib/homecare-fare'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

// Build the service datetime (Asia/Manila) used for surge lookup.
function serviceWhen(dateISO: string | null, startTime: string | null): Date {
  if (dateISO) return new Date(`${dateISO}T${(startTime ?? '09:00')}:00+08:00`)
  return new Date()
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const body = (await req.json().catch(() => ({}))) as {
    branch?: string
    address?: string
    openDayId?: string
    date?: string // chosen occurrence, "YYYY-MM-DD"
  }

  const branch = body.branch
  const address = (body.address ?? '').trim()
  if (!isShortBranch(branch)) {
    return withCors(NextResponse.json({ error: 'valid branch (SBEA|SBGH) is required' }, { status: 400 }), origin)
  }
  if (!address) {
    return withCors(NextResponse.json({ error: 'address is required' }, { status: 400 }), origin)
  }

  const clinic = await loadClinic(branch)
  if (!clinic) {
    return withCors(
      NextResponse.json({ error: 'This branch has no homecare origin location set yet. Please contact the clinic.' }, { status: 409 }),
      origin,
    )
  }

  const dateISO = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null
  let startTime: string | null = null
  if (body.openDayId) {
    const rule = await prisma.homecareOpenDay.findUnique({ where: { id: body.openDayId } })
    if (rule) startTime = rule.startTime
  }

  const settings = await loadFareSettings()
  const fare = await computeHomecareFare({
    originLat: clinic.latitude,
    originLng: clinic.longitude,
    address,
    when: serviceWhen(dateISO, startTime),
    settings,
  })

  return withCors(NextResponse.json({ fare }), origin)
}
