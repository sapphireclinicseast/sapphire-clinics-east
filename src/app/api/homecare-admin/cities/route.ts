// /api/homecare-admin/cities — manage served cities.
// GET → all cities (with open-day counts). POST create. PATCH update. DELETE ?id=.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkAdminToken } from '@/lib/aurora-admin'

function guard(req: NextRequest) {
  return checkAdminToken(req) ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function GET(req: NextRequest) {
  const denied = guard(req)
  if (denied) return denied
  const cities = await prisma.homecareCity.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { openDays: true } } },
  })
  return NextResponse.json({ cities })
}

export async function POST(req: NextRequest) {
  const denied = guard(req)
  if (denied) return denied
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const name = String(b.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  const province = (String(b.province ?? '').trim()) || null
  try {
    const city = await prisma.homecareCity.create({
      data: { name, province, active: b.active !== false },
    })
    return NextResponse.json({ city })
  } catch {
    return NextResponse.json({ error: 'That city already exists' }, { status: 409 })
  }
}

export async function PATCH(req: NextRequest) {
  const denied = guard(req)
  if (denied) return denied
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = String(b.id ?? '')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const data: Record<string, unknown> = {}
  if (typeof b.name === 'string') data.name = b.name.trim()
  if ('province' in b) data.province = (String(b.province ?? '').trim()) || null
  if (typeof b.active === 'boolean') data.active = b.active
  const city = await prisma.homecareCity.update({ where: { id }, data })
  return NextResponse.json({ city })
}

export async function DELETE(req: NextRequest) {
  const denied = guard(req)
  if (denied) return denied
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await prisma.homecareCity.delete({ where: { id } }) // cascades open days
  return NextResponse.json({ ok: true })
}
