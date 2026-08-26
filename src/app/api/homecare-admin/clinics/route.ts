// GET/PUT /api/homecare-admin/clinics — per-branch PT origin coordinates.
// GET → all clinics; PUT { id:"SBEA"|"SBGH", name, address?, latitude, longitude, active? } upserts one.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkAdminToken } from '@/lib/aurora-admin'
import { isShortBranch } from '@/lib/homecare'

function guard(req: NextRequest) {
  return checkAdminToken(req) ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function GET(req: NextRequest) {
  const denied = guard(req)
  if (denied) return denied
  const clinics = await prisma.homecareClinic.findMany({ orderBy: { id: 'asc' } })
  return NextResponse.json({ clinics })
}

export async function PUT(req: NextRequest) {
  const denied = guard(req)
  if (denied) return denied
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = String(b.id ?? '')
  if (!isShortBranch(id)) return NextResponse.json({ error: 'id must be SBEA or SBGH' }, { status: 400 })
  const latitude = Number(b.latitude)
  const longitude = Number(b.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: 'latitude and longitude are required numbers' }, { status: 400 })
  }
  const name = String(b.name ?? '').trim() || (id === 'SBEA' ? 'Aura Health Rehab – East' : 'Aura Health Rehab – Greenhills')
  const clinic = await prisma.homecareClinic.upsert({
    where: { id },
    create: { id, name, address: (String(b.address ?? '').trim()) || null, latitude, longitude, active: b.active !== false },
    update: { name, address: (String(b.address ?? '').trim()) || null, latitude, longitude, active: b.active !== false },
  })
  return NextResponse.json({ clinic })
}
