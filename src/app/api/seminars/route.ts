import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'
const HR_API_KEY = process.env.HR_API_KEY ?? ''

interface HRSeminar {
  id: string
  title: string
  date: string
  timeStart: string
  timeEnd: string
  format: 'virtual' | 'face-to-face' | 'hybrid' | string
  location: string
  meetingLink: string
  speakerName: string
  speakerTitle: string
  speakerHeadshot: string | null
  description: string
  disciplineFocus: string[]
  targetAudience: string
  feeAmount: number
  hasParticipantLimit: boolean
  maxParticipants: number
  registeredCount: number
  registeredEmails: string[]
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
  const seminars = (data.seminars ?? []).map((s) => {
    const registered = (s.registeredEmails ?? []).includes(myEmail)
    // Only expose meetingLink if I'm registered.
    const { registeredEmails: _omit, meetingLink, ...rest } = s
    return {
      ...rest,
      myRegistration: registered ? { registered: true } : { registered: false },
      meetingLink: registered ? meetingLink : '',
    }
  })

  return NextResponse.json({ seminars })
}
