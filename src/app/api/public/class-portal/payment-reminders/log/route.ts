// GET /api/public/class-portal/payment-reminders/log
//
// Lists ClassPortalPaymentReminderLog rows for the "Notifications" card
// in the class portal's Payments tab. Powers the front desk / admin view
// of who has been auto-emailed by the daily reminder cron and when.
//
// Auth: ADMIN, BRANCH_ADMIN, FRONTDESK. Branch-scoped for the latter two —
// they only see reminders for students in their own branch. ADMIN sees
// everything.
//
// Query params:
//   limit (default 100, max 500)  — hard cap on rows returned
//   sinceDays (default 30)         — window in days from `now` back
//
// Response: { reminders: Array<{
//   id, studentId, studentName, studentEmail, branch,
//   plan, period, dueOn, reason, severity, sentAt
// }> }

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
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
  console.error('[payment-reminders/log GET]', e)
  return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req, ['ADMIN', 'BRANCH_ADMIN', 'FRONTDESK'])

    const url = new URL(req.url)
    const rawLimit = Number(url.searchParams.get('limit') ?? '100')
    const limit = Math.max(1, Math.min(500, Number.isFinite(rawLimit) ? rawLimit : 100))
    const rawSinceDays = Number(url.searchParams.get('sinceDays') ?? '30')
    const sinceDays = Math.max(1, Math.min(365, Number.isFinite(rawSinceDays) ? rawSinceDays : 30))
    const sinceAt = new Date(Date.now() - sinceDays * 86_400_000)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logs = await (prisma as any).classPortalPaymentReminderLog.findMany({
      where: { sentAt: { gte: sinceAt } },
      orderBy: { sentAt: 'desc' },
      take: limit,
    })

    if (logs.length === 0) {
      return withCors(NextResponse.json({ reminders: [] }), origin)
    }

    // Hydrate student names + branch in one round-trip (the log table
    // stores email but not name/branch — we join to ClassPortalUser).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const studentIds = Array.from(new Set(logs.map((l: any) => l.studentId)))
    const students = await prisma.classPortalUser.findMany({
      where: { id: { in: studentIds as string[] } },
      select: { id: true, firstName: true, lastName: true, email: true, branch: true },
    })
    const byId = new Map(students.map(s => [s.id, s]))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let reminders = logs.map((l: any) => {
      const s = byId.get(l.studentId)
      const fullName = s
        ? [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email
        : l.email
      return {
        id: l.id,
        studentId: l.studentId,
        studentName: fullName,
        studentEmail: s?.email ?? l.email,
        branch: s?.branch ?? null,
        plan: l.plan,
        period: l.period,
        dueOn: l.dueOn instanceof Date ? l.dueOn.toISOString() : String(l.dueOn),
        reason: l.reason,
        severity: l.severity,
        sentAt: l.sentAt instanceof Date ? l.sentAt.toISOString() : String(l.sentAt),
      }
    })

    // Branch scope for non-main-admin viewers.
    if (auth.role === 'FRONTDESK' || auth.role === 'BRANCH_ADMIN') {
      if (auth.branch) {
        reminders = reminders.filter((r: { branch: string | null }) => r.branch === auth.branch)
      }
    }

    return withCors(NextResponse.json({ reminders }), origin)
  } catch (e) { return jsonError(origin, e) }
}
