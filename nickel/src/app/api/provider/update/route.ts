import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionProviderId } from '@/lib/auth'

// Whitelisted editable fields (Settings + Profile).
export async function PATCH(req: NextRequest) {
  const pid = await getSessionProviderId()
  if (!pid) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const data: Record<string, unknown> = {}

  const str = (k: string) => { if (k in b) data[k] = (String(b[k] ?? '').trim()) || null }
  ;['firstName', 'lastName', 'phone', 'photo', 'prcNumber', 'ptrNumber', 'signature', 'bankName', 'bankAccountNo', 'bankAccountName', 'gcashNumber', 'gcashName'].forEach(str)

  if (typeof b.profession === 'string') data.profession = b.profession.toUpperCase()
  if (Array.isArray(b.citiesCovered)) data.citiesCovered = b.citiesCovered.map((c) => String(c).trim()).filter(Boolean)
  // Richer coverage from the dashboard: store the detail and keep citiesCovered
  // (the names, which drive patient matching) in sync from it.
  if (Array.isArray(b.coverageAreas)) {
    const areas = (b.coverageAreas as unknown[])
      .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
      .map((a) => ({ city: String(a.city ?? '').trim(), province: String(a.province ?? '').trim(), region: String(a.region ?? '').trim(), zip: String(a.zip ?? '').trim() }))
      .filter((a) => a.city)
    data.coverageAreas = areas
    data.citiesCovered = Array.from(new Set(areas.map((a) => a.city)))
  }
  if ('rate' in b) data.rate = b.rate === '' || b.rate == null ? null : Number(b.rate)
  if (typeof b.transpoIncluded === 'boolean') data.transpoIncluded = b.transpoIncluded
  // Names are stored uppercase to match the rest of the platform.
  if (typeof data.firstName === 'string') data.firstName = (data.firstName as string).toUpperCase()
  if (typeof data.lastName === 'string') data.lastName = (data.lastName as string).toUpperCase()

  const provider = await prisma.provider.update({ where: { id: pid }, data })
  return NextResponse.json({ ok: true, provider: { ...provider, passwordHash: undefined } })
}
