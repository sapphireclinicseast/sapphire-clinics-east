// POST /api/public/ugat/interview/notify-rejected   (full admin)
// Sends the empathic "not considered for the next step" email to applicants
// marked NOT_CONSIDERED (at either stage) who haven't been notified yet, then
// stamps rejectionEmailedAt so nobody is emailed twice.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, isAdminRole } from '@/lib/ugat-auth'
import { sendUgatRejectionEmail } from '@/lib/ugat-email'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })

  const apps = await prisma.ugatApplication.findMany({
    where: {
      submittedAt: { not: null },
      rejectionEmailedAt: null,
      OR: [{ initialDecision: 'NOT_CONSIDERED' }, { interviewDecision: 'NOT_CONSIDERED' }],
    },
    select: { id: true, scholar: { select: { firstName: true, personalEmail: true, professionalEmail: true, disabledAt: true } } },
  })
  const targets = apps.filter((a) => a.scholar && !a.scholar.disabledAt)
  if (targets.length === 0) return NextResponse.json({ ok: true, sent: 0, message: 'No new applicants to notify.' })

  let sent = 0
  const failed: string[] = []
  for (const a of targets) {
    const to = [...new Set([a.scholar.personalEmail, a.scholar.professionalEmail].filter(Boolean))]
    try {
      await sendUgatRejectionEmail({ to, firstName: a.scholar.firstName })
      await prisma.ugatApplication.update({ where: { id: a.id }, data: { rejectionEmailedAt: new Date() } })
      sent++
    } catch (e) {
      console.error('[ugat] rejection email failed:', e)
      failed.push(a.id)
    }
  }
  if (sent === 0) {
    return NextResponse.json({ error: 'Could not send emails. Make sure the scholarship@ Gmail account is connected (Settings ▸ Accounts).' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, sent, failed: failed.length })
}
