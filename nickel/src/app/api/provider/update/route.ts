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
  if (typeof b.travelBuffer === 'boolean') data.travelBuffer = b.travelBuffer
  if (typeof b.dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.dob)) data.dob = new Date(`${b.dob}T00:00:00.000Z`)
  // Itemized service prices (the standard booking still uses `rate`).
  const num = (k: string) => { if (k in b) data[k] = b[k] === '' || b[k] == null ? null : Number(b[k]) }
  ;['priceInitialEval', 'priceProgressReport', 'priceHEP'].forEach(num)
  // Specialized rate/price only settable once SCEI has approved the specialization.
  if ('specializedRate' in b || 'priceTreatmentSpecialized' in b) {
    const prov = await prisma.provider.findUnique({ where: { id: pid }, select: { specializedRateApproved: true } })
    if (prov?.specializedRateApproved) {
      if ('specializedRate' in b) data.specializedRate = b.specializedRate === '' || b.specializedRate == null ? null : Number(b.specializedRate)
      if ('priceTreatmentSpecialized' in b) data.priceTreatmentSpecialized = b.priceTreatmentSpecialized === '' || b.priceTreatmentSpecialized == null ? null : Number(b.priceTreatmentSpecialized)
    }
  }
  // Names are stored uppercase to match the rest of the platform.
  if (typeof data.firstName === 'string') data.firstName = (data.firstName as string).toUpperCase()
  if (typeof data.lastName === 'string') data.lastName = (data.lastName as string).toUpperCase()

  const provider = await prisma.provider.update({ where: { id: pid }, data })
  return NextResponse.json({ ok: true, provider: { ...provider, passwordHash: undefined } })
}
