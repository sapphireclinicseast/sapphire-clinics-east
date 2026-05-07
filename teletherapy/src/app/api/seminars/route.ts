import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'
const HR_API_KEY = process.env.HR_API_KEY ?? ''

interface HRSeminar {
  id: string
  title: string
  date: string
  // HR sets dateUndefined=true and scheduledMonth='YYYY-MM' for tentative
  // seminars whose calendar date hasn't been finalised yet.
  dateUndefined?: boolean
  scheduledMonth?: string
  timeStart: string
  timeEnd: string
  format: 'virtual' | 'face-to-face' | 'hybrid' | string
  location: string
  meetingLink: string
  speakerName: string
  speakerTitle: string
  speakerHeadshot: string | null
  // Workshop / Webinar / Conference / Symposium / etc. The HR creator
  // form lets curators pick a preset or enter a freeform value via
  // classificationOther — we surface both so the UI can show whichever
  // is set without having to know the preset list.
  classification?: string
  classificationOther?: string
  // Long-form bio of the speaker, shown in the "About Speaker" modal
  // on each seminar card.
  aboutSpeaker?: string
  description: string
  disciplineFocus: string[]
  targetAudience: string
  feeAmount: number
  hasParticipantLimit: boolean
  maxParticipants: number
  registeredCount: number
  registeredEmails: string[]
  // Lowercase emails of registrants whose certificateFile is set on
  // HR. Used to decide whether the logged-in user can still
  // unregister — once their cert is uploaded they cannot.
  registeredCertEmails?: string[]
}

// GET /api/seminars
// Lists upcoming seminars from HR hub, marks each with `myRegistration`
// (whether the logged-in clinician is registered). For seminars the
// clinician is registered to AND that have a meeting link, the link is
// included; otherwise it is omitted regardless of format.
export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!HR_API_KEY) {
    return NextResponse.json(
      { error: 'HR_API_KEY is not configured on the server' },
      { status: 500 }
    )
  }

  let res: Response
  try {
    res = await fetch(`${HR_API_BASE}/internal/seminars`, {
      headers: { Authorization: `Bearer ${HR_API_KEY}` },
      cache: 'no-store',
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to reach HR hub', detail: (err as Error).message },
      { status: 502 }
    )
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: `HR hub returned ${res.status}` },
      { status: 502 }
    )
  }

  const data = (await res.json()) as { ok: boolean; seminars?: HRSeminar[] }
  if (!data.ok) {
    return NextResponse.json({ error: 'HR hub error' }, { status: 502 })
  }

  const myEmail = session.user.email.toLowerCase()

  // ── Department-scoped visibility ──
  // HR tags each seminar with disciplineFocus[], e.g. ["OT"] or
  // ["OT","PT","SLP","SPED","Psych"]. We hide a seminar from a clinician
  // whose department isn't in that list. Empty / missing list = visible
  // to everyone (general seminar). Admins also see all.
  //
  // Normalize both sides because HR uses short codes (Psych, MD) while
  // the teletherapy session enum is sometimes spelled out (PSYCHOLOGY).
  const myRole = (session.user as { role?: string }).role ?? ''
  const myDept = ((session.user as { department?: string }).department ?? '').toUpperCase()
  const isAdmin = myRole === 'ADMIN'

  function normDept(s: string): string {
    const u = (s || '').trim().toUpperCase()
    if (u === 'PSYCH' || u === 'PSYCHOLOGY') return 'PSYCHOLOGY'
    if (u === 'MD' || u === 'DOCTOR') return 'MD'
    return u
  }
  const myDeptNorm = normDept(myDept)

  function visibleToMe(s: HRSeminar): boolean {
    if (isAdmin) return true
    const focus = (s.disciplineFocus ?? []).map(normDept).filter(Boolean)
    if (focus.length === 0) return true                   // untagged → all
    if (!myDeptNorm) return true                          // no dept on user → don't hide
    return focus.includes(myDeptNorm)
  }

  // HR returns speakerHeadshot as a relative path (e.g.
  // /seminar-attachments/<id>.png) served by the HR origin. The
  // teletherapy frontend has no proxy for those files, so absolutise
  // here so <img src> works directly. Same pattern as the templates
  // proxy.
  const HR_ORIGIN = HR_API_BASE.replace(/\/api\/?$/, '')
  function absHeadshot(u: string | null | undefined): string | null {
    if (!u) return null
    if (/^https?:\/\//i.test(u)) return u
    return `${HR_ORIGIN}${u.startsWith('/') ? u : '/' + u}`
  }

  const seminars = (data.seminars ?? [])
    .filter(visibleToMe)
    .map((s) => {
      const registered = (s.registeredEmails ?? []).includes(myEmail)
      // myHasCertificate locks the unregister UI on the frontend.
      // Server-side the HR unregister handler also rejects with 409
      // for any email in registeredCertEmails, so this is just the
      // cosmetic mirror.
      const myHasCertificate = (s.registeredCertEmails ?? []).includes(myEmail)
      // Only expose meetingLink if I'm registered.
      const { registeredEmails: _omit, registeredCertEmails: _omit2, meetingLink, ...rest } = s
      return {
        ...rest,
        speakerHeadshot: absHeadshot(s.speakerHeadshot),
        myRegistration: registered ? { registered: true } : { registered: false },
        myHasCertificate,
        meetingLink: registered ? meetingLink : '',
      }
    })

  return NextResponse.json({ seminars })
}
