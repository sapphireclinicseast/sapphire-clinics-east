// GET /api/plush-toy-eligible?branch=SBEA
//
// Patients in the given branch who qualify for the free Aura the Alpaca
// plush-toy perk and haven't received it yet. Qualifies = VIP Digital
// Wallet holder (checked live against Accounting Hub) OR 100+ CONFIRMED
// Schedule sessions since 2026-04-01 (decking-originated visits are already
// counted here — see project note in FrontDeskWelcome.tsx PlushToyEligible).
//
// Front-desk dashboard widget only. Includes patients who have ALREADY been
// given a toy, flagged with givenAt/givenBy, so the widget can show a locked
// record instead of the row silently disappearing.

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
  plushToyGivenAt: Date | string | null
  plushToyGivenBy: string | null
  branchCode: string | null
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch')?.toUpperCase() ?? ''
  const branchEnum = BRANCH_ENUM[branch]
  // Main admins are not scoped to one clinic, so they may request both. Branch
  // admins and front desk stay pinned to their own branch — the widget hands
  // out a physical item, so who can see whose patients matters.
  const role = (session.user as { role?: string })?.role ?? ''
  const MAIN_ADMIN_ROLES = ['ADMIN', 'MARKETING_ADMIN']
  const wantsAll = branch === 'ALL'
  if (wantsAll && !MAIN_ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Not permitted to view all branches' }, { status: 403 })
  }
  if (!wantsAll && !branchEnum) {
    return NextResponse.json({ error: 'branch must be SBEA, SBGH or ALL' }, { status: 400 })
  }

  // Raw SQL for the branch/branches enum-array filter — PrismaPg driver
  // adapter doesn't support `has` on Postgres enum arrays (same workaround
  // as getBirthdayPatients in dashboard/page.tsx).
  //
  // Already-given patients are deliberately INCLUDED. They used to be filtered
  // out here, which meant the card simply vanished once marked: the record
  // persisted in the DB, but front desk had no way to tell "already received
  // one" apart from "never qualified", so a returning patient could be handed
  // a second toy on a hunch. They now come back flagged and render as a locked
  // green card.
  const candidates = wantsAll
    ? await prisma.$queryRawUnsafe<Candidate[]>(
        `SELECT id, "firstName", "lastName", "plushToyGivenAt", "plushToyGivenBy",
                COALESCE(branch::text, ("branches"::text[])[1]) AS "branchCode"
         FROM "Patient"
         WHERE branch::text IN ('SANDBOX_EAST','SANDBOX_GREENHILLS')
            OR "branches"::text[] && ARRAY['SANDBOX_EAST','SANDBOX_GREENHILLS']`,
      )
    : await prisma.$queryRawUnsafe<Candidate[]>(
        `SELECT id, "firstName", "lastName", "plushToyGivenAt", "plushToyGivenBy",
                $1::text AS "branchCode"
         FROM "Patient"
         WHERE (branch::text = $1 OR $1 = ANY("branches"::text[]))`,
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
  // VIP wallets that exist but could not be tied to any patient record here.
  // Surfaced rather than dropped — see below.
  const unplaceableVip: string[] = []
  const acctUrl = process.env.ACCOUNTING_HUB_URL ?? 'https://accounting.sapphireclinicseast.org'
  const acctKey = process.env.EXTERNAL_API_KEY ?? ''

  if (acctKey) {
    let wallets: { patientId: string; patientName: string | null }[] | null = null
    try {
      const res = await fetch(`${acctUrl}/api/internal/vip-status`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${acctKey}`, 'Content-Type': 'application/json' },
        // The whole active VIP list — about a dozen rows — rather than asking
        // "are any of these 1,400 ids VIP?". Matching moves here, where the
        // patient records are, so a wallet can also be matched by NAME.
        body:    JSON.stringify({ includeAllActive: true }),
        cache:   'no-store',
        signal:  AbortSignal.timeout(8000),
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.activeVipWallets)) wallets = data.activeVipWallets
      } else {
        console.error('[plush-toy-eligible] Accounting Hub VIP check returned', res.status)
      }
    } catch (err) {
      console.error('[plush-toy-eligible] Accounting Hub VIP check failed:', err)
    }

    if (wallets) {
      // ── Resolve each wallet to a patient here: by id, then by name ──
      //
      // The two hubs' patient ids drift apart. When a patient is re-registered
      // in this hub they get a new id while the wallet keeps the old one, and
      // an id-only match then silently reports "not VIP" — which is how a real
      // VIP patient came to be missing from the front-desk list entirely. 233
      // of the 1,264 active wallets point at an id that no longer exists here.
      const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ')
      const walletIds = wallets.map(w => w.patientId)
      const walletNames = wallets.map(w => norm(w.patientName ?? '')).filter(Boolean)

      // Deliberately NOT restricted to this branch's candidates: a wallet must
      // be judged unplaceable against the whole patient list, or every other
      // branch's VIPs would be reported as errors on this one's dashboard.
      // The name lookup is raw SQL and the id lookup is not, so they are
      // allowed to fail independently: a broken name match degrades to the
      // id-only behaviour this endpoint already had, rather than throwing and
      // taking the whole widget — milestone patients included — down with it.
      const [byIdRows, byNameRows] = await Promise.all([
        walletIds.length
          ? prisma.patient.findMany({ where: { id: { in: walletIds } }, select: { id: true } })
              .catch(() => [] as { id: string }[])
          : Promise.resolve([] as { id: string }[]),
        walletNames.length
          ? prisma.$queryRawUnsafe<{ id: string; fullName: string }[]>(
              // regexp_replace mirrors norm() above — collapsing runs of
              // whitespace, so "MA.  CASSANDRA" matches "MA. CASSANDRA".
              `SELECT id,
                      regexp_replace(UPPER(TRIM("firstName") || ' ' || TRIM("lastName")), '\\s+', ' ', 'g') AS "fullName"
               FROM "Patient"
               WHERE regexp_replace(UPPER(TRIM("firstName") || ' ' || TRIM("lastName")), '\\s+', ' ', 'g') = ANY($1::text[])`,
              walletNames,
            ).catch(err => {
              console.error('[plush-toy-eligible] VIP name match failed:', err)
              return [] as { id: string; fullName: string }[]
            })
          : Promise.resolve([] as { id: string; fullName: string }[]),
      ])

      const knownIds = new Set(byIdRows.map(r => r.id))
      const idsByName = new Map<string, string[]>()
      for (const r of byNameRows) {
        idsByName.set(r.fullName, [...(idsByName.get(r.fullName) ?? []), r.id])
      }

      for (const w of wallets) {
        if (knownIds.has(w.patientId)) { vipIds.add(w.patientId); continue }
        const name = norm(w.patientName ?? '')
        const hits = name ? idsByName.get(name) ?? [] : []
        // Exactly one match, or none. Two patients sharing a name is not a
        // match this may guess at — the outcome is a physical gift handed to a
        // person, so an ambiguous wallet is reported, never resolved by luck.
        if (hits.length === 1) vipIds.add(hits[0])
        else unplaceableVip.push(w.patientName || w.patientId)
      }
    } else {
      // Accounting Hub unreachable, or running a build without
      // includeAllActive. Fall back to the id-only batch check so the widget
      // keeps working exactly as it did rather than showing no VIPs at all.
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
          }
        } catch {
          // Non-fatal: milestone-eligible patients still list.
        }
      }))
    }
  }

  const eligible = candidates
    // Someone already given a toy stays listed even if their VIP wallet has
    // since lapsed — the point of the row is the permanent record that they
    // received one, not current eligibility.
    .filter(c => milestoneIds.has(c.id) || vipIds.has(c.id) || c.plushToyGivenAt)
    .map(c => ({
      id:        c.id,
      firstName: c.firstName,
      lastName:  c.lastName,
      isVip:       vipIds.has(c.id),
      isMilestone: milestoneIds.has(c.id),
      givenAt:     c.plushToyGivenAt ? new Date(c.plushToyGivenAt).toISOString() : null,
      givenBy:     c.plushToyGivenBy ?? null,
      // Only meaningful in the all-branches view; lets a main admin see which
      // clinic each patient belongs to before handing anything over.
      branch:      c.branchCode === 'SANDBOX_EAST' ? 'East'
                 : c.branchCode === 'SANDBOX_GREENHILLS' ? 'Greenhills'
                 : null,
    }))
    // Pending first, then given — the actionable rows stay at the top.
    .sort((a, b) =>
      (a.givenAt ? 1 : 0) - (b.givenAt ? 1 : 0) ||
      a.lastName.localeCompare(b.lastName))

  // Reported alongside the list so a VIP wallet that cannot be tied to a
  // patient record is visible to front desk instead of being a name they
  // expect and never see.
  return NextResponse.json({ eligible, unplaceableVip })
}
