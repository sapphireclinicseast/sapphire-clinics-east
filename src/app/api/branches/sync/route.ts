/**
 * Branches Sync — Pull the Branches Registry from HR Platform
 *
 * HR Platform is the source of truth for branch identity/contact config.
 * This is a full-replace sync (delete rows no longer present, upsert the
 * rest by id) — branches have no ambiguous-identity problem the way staff
 * do, so there's no name-matching merge logic needed here.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Try multiple Docker bridge addresses in case HR_PLATFORM_URL is not set —
// same fallback chain as /api/staff/sync.
const HR_URLS = [
  process.env.HR_PLATFORM_URL,
  'http://172.17.0.1:3457',
  'http://172.18.0.1:3457',
  'http://host.docker.internal:3457',
  'http://127.0.0.1:3457',
].filter(Boolean) as string[]
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

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
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (!HR_KEY) {
    return NextResponse.json({ error: 'HR Platform API key not configured' }, { status: 500 })
  }

  let hrBranches: HRBranch[] = []
  {
    let fetched = false
    let lastErr = ''
    for (const hrUrl of HR_URLS) {
      try {
        const res = await fetch(hrUrl + '/branches/external', {
          headers: { Authorization: 'Bearer ' + HR_KEY },
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) {
          lastErr = 'HR returned ' + res.status + ' from ' + hrUrl
          continue
        }
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
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(b.id + ': ' + msg)
    }
  }

  const toDelete = existing.filter(e => !seenIds.has(e.id))
  let deleted = 0
  for (const e of toDelete) {
    try {
      await prisma.hrBranch.delete({ where: { id: e.id } })
      deleted++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push('Delete ' + e.id + ': ' + msg)
    }
  }

  return NextResponse.json({ synced: created + updated, created, updated, deleted, errors, total: hrBranches.length })
}
