// GET /api/patients/lifetime-by-dept?branches=SANDBOX_EAST,...
//
// Average patient lifetime per department: for each patient, the span from
// their first recorded session to their last, averaged across the department.
// Powers the "Patient Lifetime by Service" section of the Patient Dashboard.
//
// Why two averages are returned rather than one
// ─────────────────────────────────────────────
// A patient seen exactly once has a first session and a last session on the
// same day, so their lifetime is legitimately 0. In the consult-led
// departments that is most of the population — roughly three quarters of MD
// patients and half of Psychology's are one-visit — so the plain average
// collapses towards zero and reads as though those patients churn in a month.
// They do not: they came for one assessment and were never meant to return.
// `avgDaysRepeat` therefore reports the same average over patients who came
// back at least once, and `oneSession` reports how many were excluded, so the
// section can state both without either number misleading on its own.
//
// Scope matches the sibling "Patients by Service" route deliberately — same
// CONFIRMED-only filter, same department list — so the two sections reconcile.
// A patient counted under two departments appears in both, each with the span
// measured WITHIN that department (see the firstDayOfConsult note below).

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { loadPosHistory } from '@/lib/pos-history'

// Mirrors /api/patients/dept-breakdown so the two sections cover the same
// services in the same order.
const DEPTS = ['PT', 'OT', 'SLP', 'MD', 'PSYCHOLOGY', 'ORTHOSIS', 'SPED'] as const
type Dept = (typeof DEPTS)[number]

const DAY_MS = 1000 * 60 * 60 * 24

interface Span { first: number; last: number; n: number }

/** percentile_cont(0.5) — interpolating, so this matches the figures the
 *  equivalent SQL produces. The median is carried alongside the mean because
 *  these distributions are heavily right-skewed: a handful of multi-year
 *  patients pull the mean well above what a typical patient experiences. */
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const a = [...values].sort((x, y) => x - y)
  const pos = 0.5 * (a.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return Math.round(lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (pos - lo))
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length)
}

// "Seen once" is now a span of zero days rather than a session count.
//
// Once Schedule sessions and POS billing are merged, counts stop being
// trustworthy: one visit can appear in both sources, so adding them double
// counts, and the POS side reports a date range rather than a tally. A span of
// zero says exactly what matters here — first and last contact fell on the same
// day — and it cannot be inflated by the same visit arriving twice.
function summarise(spans: Span[]) {
  const all = spans.map((s) => (s.last - s.first) / DAY_MS)
  const repeat = all.filter((d) => d > 0)
  return {
    patients: spans.length,
    singleDay: all.filter((d) => d === 0).length,
    avgDaysAll: mean(all),
    avgDaysRepeat: mean(repeat),
    medianDays: median(all),
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const branchParam = req.nextUrl.searchParams.get('branches')
  const filterBranches = branchParam
    ? branchParam.split(',').map((b) => b.trim()).filter(Boolean)
    : null

  // Sessions still to come are bookings, not lifetime already earned, so the
  // window stops at today — otherwise next month's appointment would extend a
  // patient's measured relationship past the present.
  const now = new Date()

  const schedules = await prisma.schedule.findMany({
    where: { status: 'CONFIRMED', patientId: { not: null }, date: { lte: now } },
    select: {
      patientId: true,
      date: true,
      staff: { select: { department: true } },
      patient: {
        select: { branches: true, branch: true, firstDayOfConsult: true },
      },
    },
  })

  // Branch filter applied in JS, mirroring /api/patients/stats and
  // dept-breakdown — the Prisma PG adapter can't filter on the enum array.
  const rows = filterBranches
    ? schedules.filter((s) => {
        if (!s.patient) return false
        const bs: string[] =
          (s.patient.branches as unknown as string[]).length > 0
            ? (s.patient.branches as unknown as string[])
            : s.patient.branch
            ? [s.patient.branch as unknown as string]
            : []
        return bs.some((b) => filterBranches.includes(b))
      })
    : schedules

  // (patient, department) → span. Keyed per department because the question is
  // how long a patient stays with a SERVICE: someone who started OT in 2024 and
  // added SLP this year has two different relationships, and collapsing them
  // onto one patient-level span would credit SLP with OT's history.
  const perDept = new Map<string, Span>()
  // Patient-level span for the company-wide figure.
  const perPatient = new Map<string, Span>()
  const firstConsult = new Map<string, number>()

  // Merge a dated range into a span, creating it if the key is new. POS gives
  // a first/last pair rather than one timestamp per visit, so it widens an
  // existing span instead of appending to it.
  const widen = (map: Map<string, Span>, key: string, first: number, last: number) => {
    const cur = map.get(key)
    if (!cur) { map.set(key, { first, last, n: 1 }); return }
    if (first < cur.first) cur.first = first
    if (last > cur.last) cur.last = last
  }

  const track = (map: Map<string, Span>, key: string, t: number) => {
    const cur = map.get(key)
    if (!cur) map.set(key, { first: t, last: t, n: 1 })
    else {
      if (t < cur.first) cur.first = t
      if (t > cur.last) cur.last = t
      cur.n++
    }
  }

  for (const s of rows) {
    if (!s.patientId) continue
    const t = new Date(s.date).getTime()
    track(perDept, `${s.patientId}|${s.staff.department}`, t)
    track(perPatient, s.patientId, t)
    const fdc = s.patient?.firstDayOfConsult
    if (fdc && !firstConsult.has(s.patientId)) {
      firstConsult.set(s.patientId, new Date(fdc).getTime())
    }
  }

  // firstDayOfConsult is the front desk's manual record of when a patient first
  // consulted us, and it can predate anything in Schedule. It applies to the
  // company-wide figure only: the field is patient-level, so using it as the
  // start of a per-department span would hand every department the patient's
  // entire history with the clinic rather than its own.
  // Currently set on a minority of the roster, so it widens some spans and
  // leaves the rest measured from their first recorded session.
  for (const [pid, span] of perPatient) {
    const fdc = firstConsult.get(pid)
    if (fdc !== undefined && fdc < span.first) span.first = fdc
  }

  // ── Merge POS billing history ─────────────────────────────────────────────
  // Schedule alone misses two things: patients whose treatment was billed but
  // never scheduled in this hub, and the earlier part of a history that began
  // before a department started using the Clinic Schedule. Both were silently
  // shortening this metric — worst in the consult-led departments, which is
  // exactly where the "seen once" reading came from.
  //
  // Additive, like every other consumer of this feed: if the Accounting Hub is
  // unreachable the panel still renders from Schedule alone, just narrower.
  let posMerged = 0
  let posOnlyPatients = 0
  try {
    const pos = await loadPosHistory(filterBranches, DEPTS)
    if (pos) {
      for (const [sk, span] of pos.spans) {
        const sep = sk.lastIndexOf('|')
        const key = sk.slice(0, sep)
        const dept = sk.slice(sep + 1)
        if (!(DEPTS as readonly string[]).includes(dept)) continue

        const first = new Date(`${span.first}T00:00:00.000Z`).getTime()
        const last = new Date(`${span.last}T00:00:00.000Z`).getTime()
        if (!Number.isFinite(first) || !Number.isFinite(last)) continue

        if (!perDept.has(`${key}|${dept}`)) posOnlyPatients++
        posMerged++
        widen(perDept, `${key}|${dept}`, first, last)
        widen(perPatient, key, first, last)
      }
    }
  } catch (err) {
    console.error('[lifetime-by-dept] POS merge failed:', err)
  }

  const byDept = new Map<Dept, Span[]>(DEPTS.map((d) => [d, [] as Span[]]))
  for (const [key, span] of perDept) {
    const dept = key.slice(key.indexOf('|') + 1) as Dept
    if (byDept.has(dept)) byDept.get(dept)!.push(span)
  }

  const dates = rows.map((s) => new Date(s.date).getTime())

  return NextResponse.json({
    window: {
      from: dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : null,
      to: dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : null,
    },
    // Stated rather than hidden: the panel says what the figures rest on, and
    // zero here means the Accounting Hub did not answer.
    posSpansMerged: posMerged,
    posOnlyPatients,
    overall: summarise(Array.from(perPatient.values())),
    departments: DEPTS.map((d) => ({ dept: d, ...summarise(byDept.get(d)!) })),
  })
}
