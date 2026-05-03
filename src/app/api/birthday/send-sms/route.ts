import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const BRANCH_CONFIG: Record<string, { httpSmsKey: string; phone: string }> = {
  SBEA: { httpSmsKey: process.env.HTTPSMS_API_KEY_SBEA ?? '', phone: '+639171189289' },
  SBGH: { httpSmsKey: process.env.HTTPSMS_API_KEY_SBGH ?? '', phone: '+639177701686' },
}

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length >= 11) return '+' + digits
  if (digits.startsWith('0')  && digits.length === 11) return '+63' + digits.slice(1)
  if (digits.length === 10)                             return '+63' + digits
  return '+' + digits
}

// Fail fast — don't let a slow httpSMS response hang the client UI for minutes
export const maxDuration = 15

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { patientId, branch, message } = await req.json()
  if (!patientId || !branch || !message)
    return NextResponse.json({ error: 'patientId, branch, and message are required' }, { status: 400 })

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { phone: true, firstName: true },
  })
  if (!patient)
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  if (!patient.phone)
    return NextResponse.json(
      { error: `${patient.firstName} has no phone number on file` },
      { status: 400 },
    )

  const cfg = BRANCH_CONFIG[branch]
  if (!cfg?.httpSmsKey)
    return NextResponse.json({ error: 'SMS gateway not configured for this branch' }, { status: 500 })

  const to = toE164(patient.phone)
  let res: Response
  try {
    res = await fetch('https://api.httpsms.com/v1/messages/send', {
      method: 'POST',
      headers: { 'x-api-key': cfg.httpSmsKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content:    message,
        from:       cfg.phone,
        to,
        // Keep trying for 24 hours in case the phone is temporarily offline
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `Could not reach httpSMS gateway (${msg}). Check that the phone running httpSMS is online.` },
      { status: 502 },
    )
  }

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `httpSMS error ${res.status}: ${text}` }, { status: 502 })
  }

  console.log(`[birthday-sms] Sent to ${patient.firstName} (${branch})`)
  return NextResponse.json({ ok: true })
}
