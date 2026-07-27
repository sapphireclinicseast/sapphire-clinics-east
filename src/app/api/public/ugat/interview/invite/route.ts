// POST { id } → email a shortlisted applicant to schedule their interview
// (pick a slot). Full admins only.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, isAdminRole } from '@/lib/ugat-auth'
import { sendUgatInterviewInviteEmail } from '@/lib/ugat-email'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.UGAT_APP_URL || 'https://fellowship.sapphireclinicseast.org'

export async function POST(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  let body: { id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const scholar = await prisma.ugatScholar.findUnique({
    where: { id },
    select: { firstName: true, personalEmail: true, professionalEmail: true, application: { select: { initialDecision: true } } },
  })
  if (!scholar) return NextResponse.json({ error: 'Applicant not found.' }, { status: 404 })
  if (scholar.application?.initialDecision !== 'FOR_INTERVIEW') {
    return NextResponse.json({ error: 'Mark this applicant “For Interview” before sending the schedule invite.' }, { status: 400 })
  }
  const to = [...new Set([scholar.personalEmail, scholar.professionalEmail].filter(Boolean))] as string[]
  if (!to.length) return NextResponse.json({ error: 'No email on file for this applicant.' }, { status: 400 })

  try {
    await sendUgatInterviewInviteEmail({ to, firstName: scholar.firstName, url: APP_URL })
  } catch {
    return NextResponse.json({ error: 'Could not send the email. Please try again.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
