// POST /api/patient-relationship/followup-sms
// Sends a follow-up reminder SMS via httpSMS (branch-specific), and writes a
// FollowUpReminder row so the UI can show a permanent "Sent" state.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const BRANCH_CONFIG: Record<string, { httpSmsKey: string; phone: string; label: string }> = {
  SBEA: { httpSmsKey: process.env.HTTPSMS_API_KEY_SBEA ?? '', phone: '+639171189289', label: 'East' },
  SBGH: { httpSmsKey: process.env.HTTPSMS_API_KEY_SBGH ?? '', phone: '+639177701686', label: 'Greenhills' },
}

const DEPT_LABEL: Record<string, string> = {
  OT: 'OT', PT: 'PT', SLP: 'SLP', SPED: 'SPED',
  PSYCHOLOGY: 'Psych', MD: 'MD',
}

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length >= 11) return '+' + digits
  if (digits.startsWith('0')  && digits.length === 11) return '+63' + digits.slice(1)
  if (digits.length === 10)                             return '+63' + digits
  return '+' + digits
}

export function buildFollowUpMessage(firstName: string, branch: string, department: string): string {
  const branchLabel = BRANCH_CONFIG[branch]?.label ?? branch
  const deptLabel = DEPT_LABEL[department] ?? department
  // Kept under 160 chars for a single SMS.
  return `Hi ${firstName}, SAPPHIRE Clinics ${branchLabel} here. Please book your follow-up ${deptLabel} session with us. Reply or call to schedule. Thank you!`
}

export const maxDuration = 15

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as { id?: string } | undefined)?.id ?? null

  const { patientId, department, branch } = await req.json()
  if (!patientId || !department || !branch)
    return NextResponse.json({ error: 'patientId, department, branch are required' }, { status: 400 })

  // Already sent? Short-circuit so multiple clicks don't spam.
  const existing = await prisma.followUpReminder.findUnique({
    where: { patientId_department: { patientId, department } },
  })
  if (existing) {
    return NextResponse.json({ ok: true, alreadySent: true, sentAt: existing.sentAt })
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { phone: true, firstName: true },
  })
  if (!patient)
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  if (!patient.phone)
    return NextResponse.json({ error: `${patient.firstName} has no phone number on file` }, { status: 400 })

  const cfg = BRANCH_CONFIG[branch]
  if (!cfg?.httpSmsKey)
    return NextResponse.json({ error: 'SMS gateway not configured for this branch' }, { status: 500 })

  const message = buildFollowUpMessage(patient.firstName, branch, department)
  const to = toE164(patient.phone)

  let res: Response
  try {
    res = await fetch('https://api.httpsms.com/v1/messages/send', {
      method: 'POST',
      headers: { 'x-api-key': cfg.httpSmsKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: message,
        from:    cfg.phone,
        to,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Could not reach httpSMS gateway (${msg})` }, { status: 502 })
  }

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `httpSMS error ${res.status}: ${text}` }, { status: 502 })
  }

  // Persist the send so the UI can keep showing "Sent" on refresh.
  const reminder = await prisma.followUpReminder.create({
    data: { patientId, department, branch, message, sentBy: userId },
  })

  console.log(`[followup-sms] Sent to ${patient.firstName} (${branch} ${department})`)
  return NextResponse.json({ ok: true, sentAt: reminder.sentAt, message })
}
