// GET/PUT /api/homecare-admin/settings — the singleton fare configuration.
// Token-guarded (x-aurora-admin-token), called server-to-server by the
// client-portal homecare-admin proxy.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkAdminToken } from '@/lib/aurora-admin'
import { loadHomecareSettings } from '@/lib/homecare'

function guard(req: NextRequest) {
  return checkAdminToken(req) ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function GET(req: NextRequest) {
  const denied = guard(req)
  if (denied) return denied
  return NextResponse.json({ settings: await loadHomecareSettings() })
}

export async function PUT(req: NextRequest) {
  const denied = guard(req)
  if (denied) return denied
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const num = (v: unknown): number | undefined => (v == null || v === '' ? undefined : Number(v))
  await loadHomecareSettings() // ensure the row exists
  const settings = await prisma.homecareSettings.update({
    where: { id: 'default' },
    data: {
      sessionFee: num(b.sessionFee),
      baseFare: num(b.baseFare),
      baseKm: num(b.baseKm),
      shortRatePerKm: num(b.shortRatePerKm),
      shortMaxKm: num(b.shortMaxKm),
      longRatePerKm: num(b.longRatePerKm),
      surgeCap: num(b.surgeCap),
      defaultTransportFee: b.defaultTransportFee === '' || b.defaultTransportFee == null ? null : Number(b.defaultTransportFee),
      orsEnabled: typeof b.orsEnabled === 'boolean' ? b.orsEnabled : undefined,
      surge: Array.isArray(b.surge) ? b.surge : undefined,
    },
  })
  return NextResponse.json({ settings })
}
