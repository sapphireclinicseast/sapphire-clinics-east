// POST /api/public/class-portal/announcements/[id]/email
//
// Blasts the announcement to every student in the targeted grade
// levels (or all if levels[] is empty). When the announcement has
// `includeTeachers`, teachers receive a copy too.
//
// Role-gated to ADMIN / TEACHER / FRONTDESK. FRONTDESK is branch-
// scoped — they can only blast their own branch's students.
// Disabled accounts are always excluded.
//
// Response shape:
//   { ok: true, sent: <number>, failed: <number>, errors: [{ email, error }] }

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { sendTransactionalEmail } from '@/lib/transactional-email'
import { withCors, corsHeaders } from '../../../../_cors'

// Throttle between each Resend call so we stay well below the API's
// per-second rate cap. Keeps a 30-student blast around ~7.5 s.
const THROTTLE_MS = 250

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (auth.role !== 'ADMIN' && auth.role !== 'TEACHER' && auth.role !== 'FRONTDESK') {
      return withCors(NextResponse.json({ error: 'Only admin, teacher, or front desk can send announcement emails.' }, { status: 403 }), origin)
    }
    const { id } = await params

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const announcement = await (prisma as any).classPortalAnnouncement.findUnique({
      where: { id },
      // Pull poster bytes so we can inline-embed it; the list endpoint
      // strips these by default for payload reasons.
      select: {
        id: true, title: true, body: true, levels: true, includeTeachers: true,
        authorRole: true, authorEmail: true, authorName: true,
        posterFileType: true, posterFileData: true,
        createdAt: true,
      },
    })
    if (!announcement) {
      return withCors(NextResponse.json({ error: 'Announcement not found.' }, { status: 404 }), origin)
    }

    // Resolve recipient pool.
    //   - STUDENT rows, disabled excluded.
    //   - If levels is empty → all levels.
    //   - includeTeachers → also TEACHER rows.
    //   - FRONTDESK is branch-scoped when their token carries a branch.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { disabledAt: null }
    const roles: string[] = ['STUDENT']
    if (announcement.includeTeachers) roles.push('TEACHER')
    where.role = { in: roles }
    if (announcement.levels.length > 0) {
      // Teachers don't have a level — keep them in the pool unconditionally
      // when includeTeachers is on, then filter students by level.
      if (announcement.includeTeachers) {
        where.OR = [
          { role: 'STUDENT', level: { in: announcement.levels } },
          { role: 'TEACHER' },
        ]
        delete where.role
      } else {
        where.level = { in: announcement.levels }
      }
    }
    if (auth.role === 'FRONTDESK' && auth.branch) {
      // Branch-scope: STUDENT rows whose branch matches. Teachers have
      // no branch on the user row (their branch coverage lives in
      // ClassPortalTeacherAssignment); we still include them so a per-
      // branch front desk can email teachers as part of an
      // includeTeachers blast.
      if (where.OR) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        where.OR = (where.OR as any[]).map((clause) => {
          if (clause.role === 'STUDENT') return { ...clause, branch: auth.branch }
          return clause
        })
      } else if (where.role && (where.role as { in?: string[] }).in?.includes('STUDENT')) {
        // Single-clause path: tighten by branch.
        // If teachers are not included we can safely add branch.
        if (!announcement.includeTeachers) {
          where.branch = auth.branch
        } else {
          where.OR = [
            { role: 'STUDENT', branch: auth.branch },
            { role: 'TEACHER' },
          ]
          delete where.role
        }
      }
    }

    const recipients = await prisma.classPortalUser.findMany({
      where,
      // `level` + `branch` come back so we can per-recipient verify the
      // level filter and surface a breakdown in the response. Belt and
      // suspenders: even if a future regression broke the Prisma `where`
      // clause, the loop below would still skip students whose level
      // doesn't actually match the announcement target.
      select: { email: true, firstName: true, lastName: true, role: true, level: true, branch: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    // Defensive secondary filter — never trust the DB query alone for
    // anything addressing real people's inboxes.
    const allowedLevels = new Set<string>(announcement.levels)
    const filteredRecipients = recipients.filter((r: { role: string; level: string | null }) => {
      if (r.role === 'TEACHER') return announcement.includeTeachers
      if (r.role !== 'STUDENT') return false
      if (announcement.levels.length === 0) return true
      if (!r.level) return false
      return allowedLevels.has(r.level)
    })
    const droppedByLevel = recipients.length - filteredRecipients.length

    if (filteredRecipients.length === 0) {
      return withCors(NextResponse.json({ ok: true, sent: 0, failed: 0, errors: [], note: 'No recipients matched.' }), origin)
    }

    // Build the HTML once and reuse for every send. The body is plain
    // text so we wrap it in <p style=white-space:pre-wrap> to preserve
    // line breaks.
    const safeTitle = escapeHtml(announcement.title)
    const safeBody  = escapeHtml(announcement.body)
    const dateLabel = new Date(announcement.createdAt).toLocaleString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
    const authorLabel = escapeHtml(announcement.authorName) + ' · ' + announcement.authorRole

    let posterImgTag = ''
    if (announcement.posterFileData && announcement.posterFileType) {
      // Inline as a data URL. Most modern clients (Gmail / Outlook web /
      // Apple Mail) render these fine; on the rare client that strips
      // them, the rest of the message is unaffected.
      const buf = announcement.posterFileData instanceof Buffer
        ? announcement.posterFileData
        : Buffer.from(announcement.posterFileData)
      const b64 = buf.toString('base64')
      posterImgTag = '<div style="margin:16px 0"><img src="data:' + announcement.posterFileType + ';base64,' + b64 +
        '" alt="Poster" style="max-width:100%;height:auto;border-radius:12px;display:block"></div>'
    }

    const html =
      '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#0f172a">' +
      '<div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#16a34a;margin-bottom:6px">Announcement · Aura Academy for Learning</div>' +
      '<h1 style="margin:0 0 8px;font-size:22px;line-height:1.25;color:#0f172a">' + safeTitle + '</h1>' +
      '<div style="color:#64748b;font-size:12px;margin-bottom:18px">' + authorLabel + ' · ' + escapeHtml(dateLabel) + '</div>' +
      posterImgTag +
      '<p style="white-space:pre-wrap;font-size:14px;line-height:1.6;margin:0">' + safeBody + '</p>' +
      '<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">' +
      '<p style="color:#94a3b8;font-size:12px;margin:0">' +
      'You\'re receiving this because you have an active account on the Aura Academy for Learning Class Portal. ' +
      'Sign in at <a href="https://class.sapphireclinicseast.org" style="color:#16a34a">class.sapphireclinicseast.org</a> for the latest news.' +
      '</p>' +
      '</div>'

    const subject = '[Aura Academy] ' + announcement.title

    // Build a recipient breakdown so the caller (and the admin) can
    // verify exactly which grades got the blast.
    const byLevel: Record<string, number> = {}
    const byRole: Record<string, number> = {}
    for (const r of filteredRecipients) {
      byRole[r.role] = (byRole[r.role] ?? 0) + 1
      const key = r.level ?? '(none)'
      byLevel[key] = (byLevel[key] ?? 0) + 1
    }

    let sent = 0
    let failed = 0
    const errors: Array<{ email: string; error: string }> = []
    for (const r of filteredRecipients) {
      try {
        await sendTransactionalEmail({ to: r.email, subject, html })
        sent += 1
      } catch (e) {
        failed += 1
        errors.push({ email: r.email, error: (e as Error).message.slice(0, 200) })
      }
      // Throttle between calls so we don't burst against the API.
      await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS))
    }

    // Stamp the row with the send result. Even if some sends failed we
    // record the count of successful ones — the admin sees both
    // numbers in the response.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).classPortalAnnouncement.update({
      where: { id },
      data: {
        emailedAt: new Date(),
        emailedBy: auth.email,
        emailedCount: sent,
      },
    })

    return withCors(NextResponse.json({
      ok: true,
      sent,
      failed,
      errors: errors.slice(0, 50), // cap so we don't ship an enormous array
      emailedAt: new Date().toISOString(),
      emailedBy: auth.email,
      // Surface exactly who got the blast so the admin can verify the
      // level filter at a glance. droppedByLevel will be 0 in normal
      // operation — non-zero means the secondary filter caught
      // something the DB query let through.
      recipientBreakdown: { byLevel, byRole },
      allowedLevels: announcement.levels,
      droppedByLevel,
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[announcements email POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
