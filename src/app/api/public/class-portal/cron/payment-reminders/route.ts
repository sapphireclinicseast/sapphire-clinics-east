// POST /api/public/class-portal/cron/payment-reminders
//
// Daily payment-reminder sweep. Fires once per day (typically 9 AM
// Manila time, but the endpoint is idempotent per (student, period,
// reason) so multi-fires per day are safe — duplicates collapse into
// no-ops via the ClassPortalPaymentReminderLog unique constraint).
//
// For every active student with at least one prior payment record
// (which is how we infer their plan), the cron walks the reminder
// schedule that mirrors the client-side `remindersForStudentOn` logic
// and dispatches a transactional email for each "reason" that hasn't
// already been sent for that period.
//
// Reasons sent (one email each, max 3 per period per student):
//   • WINDOW_OPEN  — when the reminder window opens (1 month in advance
//                     for biannual, ~6 days for monthly)
//   • DUE_SOON     — exactly 1 day before the due date
//   • PAST_DUE     — exactly 1 day after the due date if still unpaid
//
// Auth: requires `x-cron-secret: $CRON_SECRET` header. The secret lives
// in the app's .env on the VPS — never client-visible.
//
// Response (200): { ok, scannedStudents, eligibleStudents, attempted,
//                   sent, failed, skipped, errors }

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTransactionalEmail } from '@/lib/transactional-email'

type Plan = 'MONTHLY' | 'BIANNUAL' | 'ANNUAL'
type Reason = 'WINDOW_OPEN' | 'DUE_SOON' | 'PAST_DUE'
type Severity = 'INFO' | 'WARNING'

interface ReminderDispatch {
  studentId: string
  email: string
  studentName: string
  plan: Plan
  period: string
  dueOn: Date
  reason: Reason
  severity: Severity
  title: string
  bodyText: string
}

const PH_TZ_OFFSET_MIN = 8 * 60

// Convert a UTC Date to "today" in Manila (UTC+8) — we return the YMD
// triple so we can compose other Date objects in PH-local terms without
// worrying about Date-object timezone semantics.
function manilaToday(now: Date): { y: number; m: number; d: number } {
  const ms = now.getTime() + PH_TZ_OFFSET_MIN * 60_000
  const ph = new Date(ms)
  return {
    y: ph.getUTCFullYear(),
    m: ph.getUTCMonth(),
    d: ph.getUTCDate(),
  }
}

function ymdEq(a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d
}

function addDays(y: number, m: number, d: number, days: number): { y: number; m: number; d: number } {
  // UTC math is fine here — we're working in nominal calendar days.
  const t = new Date(Date.UTC(y, m, d)).getTime() + days * 86_400_000
  const r = new Date(t)
  return { y: r.getUTCFullYear(), m: r.getUTCMonth(), d: r.getUTCDate() }
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function monthlyPeriodLabel(y: number, m: number): string {
  return `${MONTH_NAMES[m]} ${y}`
}

function biannualPeriodLabel(firstHalf: boolean, schoolYearStart: number): string {
  return firstHalf
    ? `First half SY ${schoolYearStart}–${schoolYearStart + 1}`
    : `Second half SY ${schoolYearStart}–${schoolYearStart + 1}`
}

function payLinkHtml(): string {
  return '<a href="https://class.sapphireclinicseast.org/pay" style="color:#16a34a">class.sapphireclinicseast.org/pay</a>'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

function buildEmail(d: ReminderDispatch): { subject: string; html: string; text: string } {
  const dueLabel = d.dueOn.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' })
  const lead =
    d.reason === 'WINDOW_OPEN' ? `This is a friendly heads-up — tuition is coming due.` :
    d.reason === 'DUE_SOON'    ? `This is a reminder — tuition is due tomorrow.` :
                                 `Your tuition was due yesterday and our records still show it as unpaid.`
  const subject = `[Aura Academy] ${d.title} — due ${dueLabel}`

  const html =
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">' +
      '<div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#16a34a;margin-bottom:6px">Payment reminder · Aura Academy for Learning</div>' +
      `<h1 style="margin:0 0 8px;font-size:20px;line-height:1.25;color:#0f172a">${escapeHtml(d.title)}</h1>` +
      `<div style="color:#64748b;font-size:12px;margin-bottom:18px">${escapeHtml(d.plan)} plan · ${escapeHtml(d.period)} · due ${escapeHtml(dueLabel)}</div>` +
      `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">Hi ${escapeHtml(d.studentName)},</p>` +
      `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">${escapeHtml(lead)}</p>` +
      `<p style="font-size:14px;line-height:1.6;margin:0 0 16px">Please complete your payment via PayMongo on ${payLinkHtml()}. If you have already paid, you can safely ignore this email — your status will reflect on the portal once the cashier confirms it.</p>` +
      '<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">' +
      '<p style="color:#94a3b8;font-size:12px;margin:0">' +
        'You\'re receiving this because you have an active Aura Academy for Learning Class Portal account on a recurring payment plan. ' +
        `Sign in at <a href="https://class.sapphireclinicseast.org" style="color:#16a34a">class.sapphireclinicseast.org</a> for the latest status.` +
      '</p>' +
    '</div>'

  const text =
    `${d.title}\n` +
    `${d.plan} plan · ${d.period} · due ${dueLabel}\n\n` +
    `Hi ${d.studentName},\n\n` +
    `${lead}\n\n` +
    `Pay online: https://class.sapphireclinicseast.org/pay\n\n` +
    `If you have already paid, you can safely ignore this email.\n`

  return { subject, html, text }
}

// ─── Reminder computation ──────────────────────────────────────────────────

// Compute the list of (period, reason, dueOn) reminders that fire today
// in Manila time for a given plan. Mirrors `remindersForStudentOn` but
// is sharper: instead of "anywhere in the window", we only fire on the
// three trigger days (window-open, day-before-due, day-after-due) so
// each student sees at most 3 emails per period.
function reminderTriggersForToday(plan: Plan, today: { y: number; m: number; d: number }): Array<{
  period: string
  dueOnY: number; dueOnM: number; dueOnD: number
  reason: Reason
  severity: Severity
}> {
  const out: Array<{ period: string; dueOnY: number; dueOnM: number; dueOnD: number; reason: Reason; severity: Severity }> = []

  if (plan === 'BIANNUAL') {
    // Two tranches per calendar year.
    // For "first half SY YYYY–(YYYY+1)" with window opens May 5 (current year),
    // due Jun 5. "Second half SY YYYY–(YYYY+1)" window opens Nov 5 (current
    // year), due Dec 5.
    const y = today.y
    const tranches: Array<{ openM: number; openD: number; dueM: number; dueD: number; label: string }> = [
      { openM: 4,  openD: 5, dueM: 5,  dueD: 5, label: biannualPeriodLabel(true,  y) },
      { openM: 10, openD: 5, dueM: 11, dueD: 5, label: biannualPeriodLabel(false, y) },
    ]
    for (const t of tranches) {
      if (today.m === t.openM && today.d === t.openD) {
        out.push({ period: t.label, dueOnY: y, dueOnM: t.dueM, dueOnD: t.dueD, reason: 'WINDOW_OPEN', severity: 'INFO' })
      }
      const dayBefore = addDays(y, t.dueM, t.dueD, -1)
      if (ymdEq(today, dayBefore)) {
        out.push({ period: t.label, dueOnY: y, dueOnM: t.dueM, dueOnD: t.dueD, reason: 'DUE_SOON', severity: 'INFO' })
      }
      const dayAfter = addDays(y, t.dueM, t.dueD, 1)
      if (ymdEq(today, dayAfter)) {
        out.push({ period: t.label, dueOnY: y, dueOnM: t.dueM, dueOnD: t.dueD, reason: 'PAST_DUE', severity: 'WARNING' })
      }
    }
  }

  if (plan === 'MONTHLY') {
    // Period = current month. Window opens on 30th of prev month
    // (clamped to last day of prev month), due 5th of current month.
    const { y, m, d } = today
    const prevMonth = (m + 11) % 12
    const prevMonthYear = m === 0 ? y - 1 : y
    const prevMonthLastDay = new Date(Date.UTC(prevMonthYear, prevMonth + 1, 0)).getUTCDate()
    const windowOpenDay = Math.min(30, prevMonthLastDay)
    const dueDay = 5

    // WINDOW_OPEN — fire on the window-open day in the PREVIOUS month's
    // calendar; the period being reminded for is THIS month.
    if (y === prevMonthYear ? false : false) { /* never */ }
    // Today might be in the previous month (window open day) or in the
    // current month (due-soon / past-due days). Handle both.
    if (today.y === prevMonthYear && today.m === prevMonth && today.d === windowOpenDay) {
      out.push({
        period: monthlyPeriodLabel(y, m),
        dueOnY: y, dueOnM: m, dueOnD: dueDay,
        reason: 'WINDOW_OPEN', severity: 'INFO',
      })
    }
    if (d === dueDay - 1) {
      out.push({
        period: monthlyPeriodLabel(y, m),
        dueOnY: y, dueOnM: m, dueOnD: dueDay,
        reason: 'DUE_SOON', severity: 'INFO',
      })
    }
    if (d === dueDay + 1) {
      out.push({
        period: monthlyPeriodLabel(y, m),
        dueOnY: y, dueOnM: m, dueOnD: dueDay,
        reason: 'PAST_DUE', severity: 'WARNING',
      })
    }
  }

  return out
}

// ─── Plan inference + paid suppression ─────────────────────────────────────

interface StudentPaymentSnapshot {
  studentId: string
  email: string
  firstName: string | null
  lastName: string | null
  plan: Plan | null
  /** All periods that already have a CONVERTED row — treat as paid. */
  paidPeriods: Set<string>
}

async function buildStudentSnapshots(): Promise<StudentPaymentSnapshot[]> {
  // 1) Active students.
  const students = await prisma.classPortalUser.findMany({
    where: { role: 'STUDENT', disabledAt: null },
    select: { id: true, email: true, firstName: true, lastName: true },
  })

  if (students.length === 0) return []

  // 2) All FrontDeskPayment rows in one query, then group by student.
  const payments = await prisma.classPortalFrontDeskPayment.findMany({
    where: { studentId: { in: students.map(s => s.id) } },
    select: { studentId: true, plan: true, period: true, status: true, createdAt: true },
    orderBy: [{ studentId: 'asc' }, { createdAt: 'desc' }],
  })
  const byStudent = new Map<string, Array<{ plan: string; period: string; status: string; createdAt: Date }>>()
  for (const p of payments) {
    if (!byStudent.has(p.studentId)) byStudent.set(p.studentId, [])
    byStudent.get(p.studentId)!.push(p)
  }

  const out: StudentPaymentSnapshot[] = []
  for (const s of students) {
    const list = byStudent.get(s.id) ?? []
    const latest = list[0] // already sorted desc by createdAt
    const planRaw = latest?.plan
    const plan: Plan | null = planRaw === 'MONTHLY' || planRaw === 'BIANNUAL' || planRaw === 'ANNUAL' ? (planRaw as Plan) : null
    const paidPeriods = new Set<string>()
    for (const p of list) {
      // CONVERTED = paid (front desk confirmed). Treat as suppression
      // regardless of plan — if the student paid for "August 2026" we
      // don't email them about August 2026.
      if (p.status === 'CONVERTED') paidPeriods.add(p.period)
    }
    out.push({
      studentId: s.id,
      email: s.email,
      firstName: s.firstName,
      lastName: s.lastName,
      plan,
      paidPeriods,
    })
  }
  return out
}

function fullName(s: StudentPaymentSnapshot): string {
  return [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email
}

// ─── Handler ───────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured on server.' }, { status: 503 })
  }
  const got = req.headers.get('x-cron-secret') ?? ''
  if (got !== expected) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const now = new Date()
  const today = manilaToday(now)
  const snapshots = await buildStudentSnapshots()

  // Build the dispatch list.
  const dispatches: ReminderDispatch[] = []
  for (const s of snapshots) {
    if (!s.plan) continue
    if (s.plan === 'ANNUAL') continue // Annual is one-shot; no advance reminder cadence.
    const triggers = reminderTriggersForToday(s.plan, today)
    for (const t of triggers) {
      if (s.paidPeriods.has(t.period)) continue
      const dueOn = new Date(Date.UTC(t.dueOnY, t.dueOnM, t.dueOnD))
      const title =
        s.plan === 'BIANNUAL'
          ? `Bi-annual tuition — ${t.period}`
          : `Monthly tuition — ${t.period}`
      dispatches.push({
        studentId: s.studentId,
        email: s.email,
        studentName: fullName(s),
        plan: s.plan,
        period: t.period,
        dueOn,
        reason: t.reason,
        severity: t.severity,
        title,
        bodyText: '',
      })
    }
  }

  // Drop ones we've already logged (idempotent re-runs are no-ops).
  // We trust the unique constraint on (studentId, period, reason) to
  // collapse duplicates if two crons fire simultaneously, but we still
  // pre-filter to avoid spurious email attempts.
  const dispatchKeys = dispatches.map(d => ({ studentId: d.studentId, period: d.period, reason: d.reason }))
  let alreadyLogged = new Set<string>()
  if (dispatchKeys.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma as any).classPortalPaymentReminderLog.findMany({
      where: {
        OR: dispatchKeys.map(k => ({ studentId: k.studentId, period: k.period, reason: k.reason })),
      },
      select: { studentId: true, period: true, reason: true },
    })
    alreadyLogged = new Set(existing.map((e: { studentId: string; period: string; reason: string }) =>
      `${e.studentId}|${e.period}|${e.reason}`))
  }

  let sent = 0
  let failed = 0
  let skipped = 0
  const errors: Array<{ email: string; period: string; reason: string; error: string }> = []
  const THROTTLE_MS = 250

  for (const d of dispatches) {
    const key = `${d.studentId}|${d.period}|${d.reason}`
    if (alreadyLogged.has(key)) { skipped += 1; continue }

    const { subject, html, text } = buildEmail(d)
    try {
      await sendTransactionalEmail({ to: d.email, subject, html, text })
      // Persist the log row inside the same loop iteration. If the insert
      // fails on the unique constraint, that's fine — a parallel cron
      // already logged it.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma as any).classPortalPaymentReminderLog.create({
          data: {
            studentId: d.studentId,
            email: d.email,
            plan: d.plan,
            period: d.period,
            dueOn: d.dueOn,
            reason: d.reason,
            severity: d.severity,
          },
        })
      } catch { /* unique violation tolerated */ }
      sent += 1
    } catch (e) {
      failed += 1
      errors.push({ email: d.email, period: d.period, reason: d.reason, error: (e as Error).message.slice(0, 200) })
    }
    if (THROTTLE_MS > 0) await new Promise(r => setTimeout(r, THROTTLE_MS))
  }

  return NextResponse.json({
    ok: true,
    runAt: now.toISOString(),
    manilaToday: `${today.y}-${String(today.m + 1).padStart(2, '0')}-${String(today.d).padStart(2, '0')}`,
    scannedStudents: snapshots.length,
    eligibleStudents: snapshots.filter(s => s.plan === 'MONTHLY' || s.plan === 'BIANNUAL').length,
    attempted: dispatches.length,
    sent,
    failed,
    skipped,
    errors: errors.slice(0, 50),
  })
}

// GET = lightweight introspection so an admin can curl it (without auth)
// to verify the endpoint is wired up. Doesn't send anything.
export async function GET() {
  return NextResponse.json({
    ok: true,
    purpose: 'daily payment-reminder cron',
    method: 'POST with x-cron-secret header',
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
  })
}
