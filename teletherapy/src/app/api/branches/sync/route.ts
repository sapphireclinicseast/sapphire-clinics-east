/**
 * Branches Sync — Pull the Branches Registry from HR Platform
 *
 * Uses teletherapy's existing HR credentials (HR_API_BASE + HR_API_KEY),
 * the same pair /api/staff/sync-hr uses. Full-replace: delete rows no
 * longer present in HR Platform, upsert the rest by id.
 *
 * NOTE: this writes to the "HrBranch" table in the sapphire_marketing
 * database, which teletherapy shares with Operations Hub — Operations
 * Hub's own sync writes to the exact same physical rows. Either app's
 * "Sync Branches" button refreshes what both see.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'
const HR_KEY = process.env.HR_API_KEY ?? ''
const HR_BRANCH_URLS = [
  `${HR_API_BASE}/branches/external`,
  'http://127.0.0.1:3457/branches/external', // direct pm2 fallback (same key)
]

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
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  if (!HR_KEY) {
    return NextResponse.json({ error: 'HR_API_KEY is not configured on the server' }, { status: 500 })
  }

  let hrBranches: HRBranch[] = []
  let fetched = false
  let lastErr = ''
  for (const url of HR_BRANCH_URLS) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: 'Bearer ' + HR_KEY },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) { lastErr = 'HR returned ' + res.status + ' from ' + url; continue }
      const data = await res.json()
      hrBranches = data.branches || []
      fetched = true
      break
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
    }
  }
  if (!fetched) {
    return NextResponse.json({ error: 'Cannot reach HR Platform: ' + lastErr }, { status: 502 })
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
