// GET /api/plush-toy-eligible?branch=SBEA
//
// Patients in the given branch who qualify for the free Aura the Alpaca
// plush-toy perk and haven't received it yet. Qualifies = VIP Digital
// Wallet holder (checked live against Accounting Hub) OR 100+ CONFIRMED
// Schedule sessions since 2026-04-01 (decking-originated visits are already
// counted here — see project note in FrontDeskWelcome.tsx PlushToyEligible).
//
// Front-desk dashboard widget only; excludes patients with plushToyGivenAt set.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const BRANCH_ENUM: Record<string, string> = {
  SBEA: 'SANDBOX_EAST',
  SBGH: 'SANDBOX_GREENHILLS',
}

const MILESTONE_SESSIONS = 100
const MILESTONE_SINCE = new Date('2026-04-01T00:00:00.000Z')

interface Candidate {
  id: string
  firstName: string
  lastName: string
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch')?.toUpperCase() ?? ''
  const branchEnum = BRANCH_ENUM[branch]
  if (!branchEnum) return NextResponse.json({ error: 'branch must be SBEA or SBGH' }, { status: 400 })

  // Raw SQL for the branch/branches enum-array filter — PrismaPg driver
  // adapter doesn't support `has` on Postgres enum arrays (same workaround
  // as getBirthdayPatients in dashboard/page.tsx). Only NOT-yet-given
  // patients are candidates at all.
  const candidates = await prisma.$queryRawUnsafe<Candidate[]>(
    `SELECT id, "firstName", "lastName" FROM "Patient"
     WHERE "plushToyGivenAt" IS NULL
       AND (branch::text = $1 OR $1 = ANY("branches"::text[]))`,
    branchEnum,
  )
  if (candidates.length === 0) return NextResponse.json({ eligible: [] })

  const candidateIds = candidates.map(c => c.id)

  // ── Milestone check: 100+ CONFIRMED sessions since 2026-04-01 ──────────
  const sessionCounts = await prisma.schedule.groupBy({
    by: ['patientId'],
    where: {
      patientId: { in: candidateIds },
      status:    'CONFIRMED',
      date:      { gte: MILESTONE_SINCE },
    },
    _count: { _all: true },
  })
  const milestoneIds = new Set(
    sessionCounts.filter(s => s._count._all >= MILESTONE_SESSIONS).map(s => s.patientId!),
  )

  // ── VIP check: live lookup against Accounting Hub's DigitalWallet ──────
  // POST with a JSON body, batched — a full branch's candidate list (a
  // clinic can have thousands of patients) blew the URL length limit as a
  // query string (HTTP 414 on every single call, silently non-fatal, so
  // NO VIP patient ever surfaced). Batching keeps each request body small
  // regardless of branch size.
  const vipIds = new Set<string>()
  const acctUrl = process.env.ACCOUNTING_HUB_URL ?? 'https://accounting.sapphireclinicseast.org'
  const acctKey = process.env.EXTERNAL_API_KEY ?? ''
  if (acctKey) {
    const BATCH_SIZE = 300
    const batches: string[][] = []
    for (let i = 0; i < candidateIds.length; i += BATCH_SIZE) {
      batches.push(candidateIds.slice(i, i + BATCH_SIZE))
    }
    await Promise.all(batches.map(async batch => {
      try {
        const res = await fetch(`${acctUrl}/api/internal/vip-status`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${acctKey}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ patientIds: batch }),
          cache:   'no-store',
          signal:  AbortSignal.timeout(5000),
        })
        if (res.ok) {
          const data = await res.json()
          for (const id of (data.vipPatientIds as string[] ?? [])) vipIds.add(id)
        } else {
          console.error('[plush-toy-eligible] Accounting Hub VIP check returned', res.status)
        }
      } catch (err) {
        // Non-fatal — front desk still sees milestone-eligible patients even
        // if Accounting Hub is briefly unreachable; VIP-only patients in
        // this batch would just not show up until the next reachable check.
        console.error('[plush-toy-eligible] Accounting Hub VIP check failed:', err)
      }
    }))
  }

  const eligible = candidates
    .filter(c => milestoneIds.has(c.id) || vipIds.has(c.id))
    .map(c => ({
      id:        c.id,
      firstName: c.firstName,
      lastName:  c.lastName,
      isVip:       vipIds.has(c.id),
      isMilestone: milestoneIds.has(c.id),
    }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName))

  return NextResponse.json({ eligible })
}
