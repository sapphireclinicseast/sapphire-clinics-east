// POST /api/public/class-portal/payment-reminders/manual
//
// Front-desk / admin sends a one-off tuition reminder email to a
// specific student outside the daily cron schedule. Used by the bell
// button on overdue rows in the Pending Payments — by deadline table.
//
// Auth: ADMIN, BRANCH_ADMIN, FRONTDESK. Branch-scoped server-side for
// the latter two — they can only nudge students in their own branch.
//
// Body: { studentId, period, dueOn }
//   * studentId — target ClassPortalUser id
//   * period    — human label used in the email subject + log row
//                  (e.g. "August 2026" or "First half SY 2026–2027")
//   * dueOn     — ISO date the reminder is for (used in the log +
//                  email dueOn line). Optional; defaults to today.
//
// The log row is written with reason='MANUAL' so it shows up alongside
// the automated sends in the Notifications panel. Only one MANUAL row
// per (studentId, period) — resending replaces the timestamp so staff
// can re-nudge the same student for the same period.
//
// Response (200): { ok: true, sentAt: string }

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { sendTransactionalEmail } from '@/lib/transactional-email'
import { withCors, corsHeaders } from '../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

function jsonError(origin: string | null, e: unknown): NextResponse {
  if (e instanceof Response) {
    const headers = new Headers(e.headers)
    for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
    return new NextResponse(e.body, { status: e.status, headers })
  }
  console.error('[payment-reminders/manual POST]', e)
  return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req, ['ADMIN', 'BRANCH_ADMIN', 'FRONTDESK'])
    const body = await req.json().catch(() => ({})) as {
      studentId?: string
      period?: string
      dueOn?: string
    }
    if (!body.studentId || typeof body.studentId !== 'string') {
      return withCors(NextResponse.json({ error: 'studentId is required.' }, { status: 400 }), origin)
    }
    const period = typeof body.period === 'string' && body.period.trim()
      ? body.period.trim()
      : 'this billing period'

    const student = await prisma.classPortalUser.findUnique({
      where: { id: body.studentId },
      select: { id: true, email: true, firstName: true, lastName: true, branch: true, disabledAt: true },
    })
    if (!student) {
      return withCors(NextResponse.json({ error: 'Student not found.' }, { status: 404 }), origin)
    }
    if (student.disabledAt) {
      return withCors(NextResponse.json({ error: 'Cannot email a disabled student.' }, { status: 400 }), origin)
    }
    if ((auth.role === 'FRONTDESK' || auth.role === 'BRANCH_ADMIN') && auth.branch && student.branch && student.branch !== auth.branch) {
      return withCors(NextResponse.json({ error: 'Out of branch scope.' }, { status: 403 }), origin)
    }

    const studentName = [student.firstName, student.lastName].filter(Boolean).join(' ') || student.email
    const dueOnDate = body.dueOn ? new Date(body.dueOn) : new Date()
    const dueLabel = Number.isFinite(dueOnDate.getTime())
      ? dueOnDate.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' })
      : 'as soon as possible'

    // Compose a plain, past-due-ish email — this endpoint only fires
    // from the "Pending payments — by deadline" table so we can safely
    // assume the parent's already missed a date.
    const subject = `[Aura Academy] Tuition reminder — ${period}`
    const html =
      '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">' +
        '<div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#16a34a;margin-bottom:6px">Payment reminder · Aura Academy for Learning</div>' +
        `<h1 style="margin:0 0 8px;font-size:20px;line-height:1.25;color:#0f172a">Tuition reminder — ${escapeHtml(period)}</h1>` +
        `<div style="color:#64748b;font-size:12px;margin-bottom:18px">Due ${escapeHtml(dueLabel)}</div>` +
        `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">Hi ${escapeHtml(studentName)},</p>` +
        '<p style="font-size:14px;line-height:1.6;margin:0 0 12px">Our records show your tuition for the period above is still outstanding. Please complete the payment at your earliest convenience.</p>' +
        '<p style="font-size:14px;line-height:1.6;margin:0 0 16px">Pay online at <a href="https://class.sapphireclinicseast.org/pay" style="color:#16a34a">class.sapphireclinicseast.org/pay</a>, or coordinate with our front desk. If you have already paid, please disregard this message — your status will reflect on the portal once the cashier confirms it.</p>' +
        '<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">' +
        '<p style="color:#94a3b8;font-size:12px;margin:0">' +
          "You're receiving this because you have an active Aura Academy for Learning Class Portal account. " +
          'Sign in at <a href="https://class.sapphireclinicseast.org" style="color:#16a34a">class.sapphireclinicseast.org</a> for the latest status.' +
        '</p>' +
      '</div>'
    const text =
      `Tuition reminder — ${period}\n` +
      `Due ${dueLabel}\n\n` +
      `Hi ${studentName},\n\n` +
      `Our records show your tuition for the period above is still outstanding. Please complete the payment at your earliest convenience.\n\n` +
      `Pay online: https://class.sapphireclinicseast.org/pay\n\n` +
      `If you have already paid, please disregard this message.\n`

    await sendTransactionalEmail({ to: student.email, subject, html, text })

    // Log with reason='MANUAL'. There's a unique constraint on
    // (studentId, period, reason) so we delete-then-insert to allow
    // staff to re-send the same reminder if the parent doesn't
    // respond — the log row's sentAt captures the freshest attempt.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).classPortalPaymentReminderLog.deleteMany({
      where: { studentId: student.id, period, reason: 'MANUAL' },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await (prisma as any).classPortalPaymentReminderLog.create({
      data: {
        studentId: student.id,
        email: student.email,
        plan: 'MONTHLY',   // plan isn't strictly known here; safe default
        period,
        dueOn: Number.isFinite(dueOnDate.getTime()) ? dueOnDate : new Date(),
        reason: 'MANUAL',
        severity: 'WARNING',
      },
    })

    return withCors(NextResponse.json({
      ok: true,
      sentAt: (created.sentAt instanceof Date ? created.sentAt : new Date()).toISOString(),
    }), origin)
  } catch (e) { return jsonError(origin, e) }
}
