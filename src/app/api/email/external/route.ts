import { NextRequest, NextResponse } from 'next/server'
import { sendTransactionalEmail } from '@/lib/transactional-email'

const API_KEY = process.env.EXTERNAL_API_KEY || ''

// Authenticated email relay for host-side scripts and sister apps that hold
// the shared EXTERNAL_API_KEY but no mail credentials of their own — the VPS
// safeguards (scei-alert.sh) send their alerts through here now that Resend
// is retired. Deliberately single-recipient and plain-text: bulk mail stays
// on the campaign pipeline, richer transactional mail calls the lib directly.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: { to?: string; subject?: string; text?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const to = String(body.to || '').trim()
  const subject = String(body.subject || '').trim()
  const text = String(body.text || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: 'to must be a single email address' }, { status: 400 })
  if (!subject) return NextResponse.json({ error: 'subject is required' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })
  if (subject.length > 200) return NextResponse.json({ error: 'subject too long (max 200 chars)' }, { status: 400 })
  if (text.length > 20000) return NextResponse.json({ error: 'text too long (max 20,000 chars)' }, { status: 400 })

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  try {
    await sendTransactionalEmail({
      to,
      subject,
      html: `<pre style="font-family: ui-monospace, Menlo, monospace; font-size: 13px; white-space: pre-wrap;">${esc(text)}</pre>`,
      text,
    })
    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('External email relay failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Send failed' }, { status: 502 })
  }
}
