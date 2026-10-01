import { NextRequest, NextResponse } from 'next/server'

const API_KEY = process.env.EXTERNAL_API_KEY || ''

// Same per-branch httpSMS config as the schedule/campaign senders: each clinic
// has an Android phone with its own SIM running the httpSMS app.
const BRANCH_CONFIG: Record<string, { httpSmsKey: string; phone: string }> = {
  SBEA: { httpSmsKey: process.env.HTTPSMS_API_KEY_SBEA ?? '', phone: '+639171189289' },
  SBGH: { httpSmsKey: process.env.HTTPSMS_API_KEY_SBGH ?? '', phone: '+639177701686' },
}

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length >= 11) return '+' + digits
  if (digits.startsWith('0') && digits.length === 11) return '+63' + digits.slice(1)
  if (digits.length === 10) return '+63' + digits
  return '+' + digits
}

// Authenticated relay for sister apps (Accounting Hub) that hold the shared
// EXTERNAL_API_KEY but not the httpSMS keys: sends ONE SMS through the given
// branch's clinic phone. Deliberately single-recipient — campaigns stay on the
// ops hub's own tranche pipeline (lib/sms.ts) with its daily caps.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { branch, to, message } = await req.json()
  const cfg = BRANCH_CONFIG[String(branch || '').toUpperCase()]
  if (!cfg) return NextResponse.json({ error: 'branch must be SBEA or SBGH' }, { status: 400 })
  if (!cfg.httpSmsKey) return NextResponse.json({ error: `httpSMS is not configured for ${branch}` }, { status: 503 })
  if (!to || !String(to).trim()) return NextResponse.json({ error: 'to (phone) is required' }, { status: 400 })
  const content = String(message || '').trim()
  if (!content) return NextResponse.json({ error: 'message is required' }, { status: 400 })
  if (content.length > 918) return NextResponse.json({ error: 'message too long (max 918 chars / 6 SMS parts)' }, { status: 400 })

  const res = await fetch('https://api.httpsms.com/v1/messages/send', {
    method: 'POST',
    headers: { 'x-api-key': cfg.httpSmsKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      from: cfg.phone,
      to: toE164(String(to)),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[sms/external] httpSMS error:', res.status, text)
    return NextResponse.json({ error: `httpSMS returned ${res.status}` }, { status: 502 })
  }
  return NextResponse.json({ sent: true })
}
