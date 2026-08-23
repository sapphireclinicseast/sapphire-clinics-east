import { NextResponse } from 'next/server'
import { sendGmail, gmailConfigured } from '@/lib/gmail'

const DEFAULT_RECIPIENTS =
  'verdanatrading@gmail.com,main@sapphireclinicseast.org,marketing@sapphireclinicseast.org'

export async function POST(request: Request) {
  try {
    const { name, email, phone, comment } = await request.json()

    if (!comment || !String(comment).trim()) {
      return NextResponse.json({ error: 'Please tell us what you’d like to see.' }, { status: 400 })
    }

    if (!gmailConfigured()) {
      console.error('Suggestion email: Gmail is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN)')
      return NextResponse.json({ error: 'Email is not configured yet.' }, { status: 500 })
    }

    const to = (process.env.SUGGESTION_RECIPIENTS || DEFAULT_RECIPIENTS)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const clean = (v: unknown) => String(v ?? '').trim() || '—'
    const text =
      `New product suggestion from verdanarehab.com\n\n` +
      `Name:  ${clean(name)}\n` +
      `Email: ${clean(email)}\n` +
      `Phone: ${clean(phone)}\n\n` +
      `Suggestion:\n${clean(comment)}\n`

    const validEmail = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

    const res = await sendGmail({
      to,
      subject: `New product suggestion${name ? ` from ${String(name).trim()}` : ''}`,
      text,
      // Reply-To is the suggester, so the team can answer them directly.
      ...(validEmail ? { replyTo: email as string } : {}),
    })

    if (!res.ok) {
      console.error('Suggestion email Gmail error:', res.error)
      return NextResponse.json({ error: 'Could not send right now. Please try again.' }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Suggestion submit error:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
