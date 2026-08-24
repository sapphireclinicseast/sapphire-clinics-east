// POST /api/public/ugat/interview/book   (scholar marked "For Interview")
// Body: { slotId }. Books the slot, generates a Jitsi link, stores it on the
// application, and emails the scholar the link + an Add-to-Google-Calendar URL.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest } from '@/lib/ugat-auth'
import { sendUgatInterviewEmail } from '@/lib/ugat-email'
import { meetRoomUrl } from '@/lib/meet-link'

export const dynamic = 'force-dynamic'

function gcalUrl(title: string, start: Date, durationMins: number, details: string, location: string): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const end = new Date(start.getTime() + durationMins * 60000)
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`
}

export async function POST(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || tok.role !== 'SCHOLAR' || !tok.scholarId) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  let body: { slotId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const slotId = String(body.slotId || '')
  if (!slotId) return NextResponse.json({ error: 'Please choose a slot.' }, { status: 400 })

  const scholar = await prisma.ugatScholar.findUnique({
    where: { id: tok.scholarId },
    select: { firstName: true, personalEmail: true, professionalEmail: true, application: { select: { initialDecision: true, interviewSlotId: true } } },
  })
  if (!scholar) return NextResponse.json({ error: 'Account not found.' }, { status: 401 })
  if (scholar.application?.initialDecision !== 'FOR_INTERVIEW') {
    return NextResponse.json({ error: 'You are not eligible to book an interview yet.' }, { status: 403 })
  }

  const slot = await prisma.ugatInterviewSlot.findUnique({ where: { id: slotId } })
  if (!slot) return NextResponse.json({ error: 'That slot is no longer available.' }, { status: 404 })
  if (slot.startsAt.getTime() < Date.now()) return NextResponse.json({ error: 'That slot is in the past.' }, { status: 400 })

  // Capacity check (excluding this scholar's own existing booking of it).
  const booked = await prisma.ugatApplication.count({ where: { interviewSlotId: slotId, scholarId: { not: tok.scholarId } } })
  if (booked >= slot.capacity) return NextResponse.json({ error: 'That slot is already fully booked. Please pick another.' }, { status: 409 })

  const room = `UGAT-Interview-${(scholar.firstName || 'fellow').replace(/[^a-zA-Z]/g, '')}-${Math.random().toString(36).slice(2, 12)}`
  // LiveKit join link (anyone joins directly). Valid until the interview + 2 days.
  const interviewExp = Math.floor(new Date(slot.startsAt).getTime() / 1000) + 2 * 86400
  const jitsiUrl = meetRoomUrl(room, { name: scholar.firstName || 'Fellow', role: 'guest' }, interviewExp)

  await prisma.ugatApplication.update({
    where: { scholarId: tok.scholarId },
    data: { interviewSlotId: slotId, interviewAt: slot.startsAt, interviewDurationMins: slot.durationMins, jitsiUrl },
  })

  const whenText = slot.startsAt.toLocaleString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) + ' (Manila time)'
  const gcal = gcalUrl('UGAT Fellowship Interview', slot.startsAt, slot.durationMins, `Your UGAT Fellowship interview. Join here: ${jitsiUrl}`, jitsiUrl)
  try {
    await sendUgatInterviewEmail({
      to: [...new Set([scholar.personalEmail, scholar.professionalEmail].filter(Boolean))],
      firstName: scholar.firstName,
      whenText, jitsiUrl, gcalUrl: gcal,
    })
  } catch (e) {
    console.error('[ugat] interview email failed:', e)
    return NextResponse.json({ ok: true, emailSent: false, interviewAt: slot.startsAt, jitsiUrl, gcalUrl: gcal })
  }
  return NextResponse.json({ ok: true, emailSent: true, interviewAt: slot.startsAt, jitsiUrl, gcalUrl: gcal })
}
