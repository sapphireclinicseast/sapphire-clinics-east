/**
 * Branches Sync — Pull the Branches Registry from HR Platform
 *
 * Direct connection to HR Platform, same working plumbing already proven
 * in src/lib/external-staff.ts (fetchHrStaffForSync) — HR_PLATFORM_URL +
 * EXTERNAL_API_KEY, no relay through Operations Hub needed. Full-replace:
 * delete rows no longer present, upsert the rest by id.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const HR_PLATFORM_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

const WRITE_ROLES = ['ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

interface HRBranch {
  id: string
  shortCode: string
  aliases: string[]
  enumValues: {
    opsHubBranch: string | null
    opsHubClassPortalBranch: string | null
    acctHubBranch: string | null
    acctHubServiceBranch: string | null
    teletherapyBranch: string | null
  }
  name: string
  brandName: string
  tin: string
  address: string
  phone: string
  emails: { main: string; hr: string; accounting: string }
  departmentsOffered: string[]
  operatingDays: string[]
  operatingHours: { open: string; close: string }
  active: boolean
}

export async function POST() {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!EXTERNAL_API_KEY) {
    return NextResponse.json({ error: 'EXTERNAL_API_KEY not configured' }, { status: 500 })
  }

  let hrBranches: HRBranch[] = []
  try {
    const res = await fetch(`${HR_PLATFORM_URL}/branches/external`, {
      headers: { Authorization: `Bearer ${EXTERNAL_API_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json({ error: `HR Platform returned ${res.status}` }, { status: 502 })
    }
    const data = await res.json()
    hrBranches = data.branches || []
  } catch (e) {
    return NextResponse.json({ error: 'Cannot reach HR Platform: ' + (e instanceof Error ? e.message : String(e)) }, { status: 502 })
  }

  const existing = await prisma.hrBranch.findMany({ select: { id: true } })
  const seenIds = new Set<string>()
  let created = 0
  let updated = 0
  const errors: string[] = []

  for (const b of hrBranches) {
    const payload = {
      shortCode: b.shortCode,
      aliases: b.aliases ?? [],
      opsHubBranch: b.enumValues?.opsHubBranch ?? null,
      opsHubClassPortalBranch: b.enumValues?.opsHubClassPortalBranch ?? null,
      acctHubBranch: b.enumValues?.acctHubBranch ?? null,
      acctHubServiceBranch: b.enumValues?.acctHubServiceBranch ?? null,
      teletherapyBranch: b.enumValues?.teletherapyBranch ?? null,
      name: b.name,
      brandName: b.brandName || null,
      tin: b.tin || null,
      address: b.address || null,
      phone: b.phone || null,
      emailMain: b.emails?.main || null,
      emailHr: b.emails?.hr || null,
      emailAccounting: b.emails?.accounting || null,
      departmentsOffered: b.departmentsOffered ?? [],
      operatingDays: b.operatingDays ?? [],
      operatingHoursOpen: b.operatingHours?.open || null,
      operatingHoursClose: b.operatingHours?.close || null,
      active: b.active,
      syncedAt: new Date(),
    }
    try {
      await prisma.hrBranch.upsert({
        where: { id: b.id },
        create: { id: b.id, ...payload },
        update: payload,
      })
      seenIds.add(b.id)
      if (existing.some(e => e.id === b.id)) updated++
      else created++
    } catch (err) {
      errors.push(b.id + ': ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const toDelete = existing.filter(e => !seenIds.has(e.id))
  let deleted = 0
  for (const e of toDelete) {
    try {
      await prisma.hrBranch.delete({ where: { id: e.id } })
      deleted++
    } catch (err) {
      errors.push('Delete ' + e.id + ': ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return NextResponse.json({ synced: created + updated, created, updated, deleted, errors, total: hrBranches.length })
}
