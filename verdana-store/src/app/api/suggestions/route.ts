import { NextResponse } from 'next/server'

const DEFAULT_RECIPIENTS =
  'verdanatrading@gmail.com,main@sapphireclinicseast.org,marketing@sapphireclinicseast.org'
const DEFAULT_FROM = 'Verdana Store <noreply@do-not-reply.sapphireclinicseast.org>'

export async function POST(request: Request) {
  try {
    const { name, email, phone, comment } = await request.json()

    if (!comment || !String(comment).trim()) {
      return NextResponse.json({ error: 'Please tell us what you’d like to see.' }, { status: 400 })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.error('Suggestion email: RESEND_API_KEY is not set')
      return NextResponse.json({ error: 'Email is not configured yet.' }, { status: 500 })
    }

    const from = process.env.RESEND_FROM || DEFAULT_FROM
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

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: `New product suggestion${name ? ` from ${String(name).trim()}` : ''}`,
        text,
        ...(validEmail ? { reply_to: email } : {}),
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('Resend error:', res.status, detail)
      return NextResponse.json({ error: 'Could not send right now. Please try again.' }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Suggestion submit error:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
