import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const BRANCH_CONFIG: Record<string, { httpSmsKey: string; phone: string; label: string }> = {
  SANDBOX_EAST:       { httpSmsKey: process.env.HTTPSMS_API_KEY_SBEA ?? '', phone: '+639171189289', label: 'Sapphire Clinics East' },
  SANDBOX_GREENHILLS: { httpSmsKey: process.env.HTTPSMS_API_KEY_SBGH ?? '', phone: '+639177701686', label: 'Sapphire Clinics Greenhills' },
}

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length >= 11) return '+' + digits
  if (digits.startsWith('0') && digits.length === 11)  return '+63' + digits.slice(1)
  if (digits.length === 10)                             return '+63' + digits
  return '+' + digits
}

// 8:00 AM Taipei (UTC+8) = 00:00 UTC that day
function birthdaySendAt(dateStr: string): string {
  return `${dateStr}T00:00:00Z`
}

function branchFromRole(role: string): string | null {
  if (role.startsWith('SBEA_')) return 'SANDBOX_EAST'
  if (role.startsWith('SBGH_')) return 'SANDBOX_GREENHILLS'
  return null
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role       = (session.user as { role?: string }).role ?? ''
  const branchLock = branchFromRole(role)

  // Accept optional patientIds array; if omitted, schedule all this-week celebrants
  const body = await req.json().catch(() => ({}))
  const patientIds: string[] | undefined = body.patientIds

  // Fetch patients
  const patients = await prisma.patient.findMany({
    where: {
      dob:   { not: null },
      phone: { not: null },
      ...(patientIds ? { id: { in: patientIds } } : {}),
    },
    select: { id: true, firstName: true, lastName: true, dob: true, phone: true, branches: true },
  })

  // Build the 7-day window
  const now = new Date()
  const window7: { month: number; day: number; dateStr: string }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    window7.push({ month: d.getMonth() + 1, day: d.getDate(), dateStr: d.toISOString().split('T')[0] })
  }

  const celebrants = patients.filter(p => {
    if (branchLock && !p.branches.includes(branchLock as any)) return false
    const m = p.dob!.getUTCMonth() + 1
    const d = p.dob!.getUTCDate()
    return window7.some(w => w.month === m && w.day === d)
  })

  let scheduled = 0
  let skipped   = 0
  const errors: string[] = []

  for (const p of celebrants) {
    if (!p.phone) { skipped++; continue }

    const m = p.dob!.getUTCMonth() + 1
    const day = p.dob!.getUTCDate()
    const match = window7.find(w => w.month === m && w.day === day)!

    // Determine which branch config to use (first configured branch wins)
    const branchKey = p.branches.find(b => BRANCH_CONFIG[b])
    if (!branchKey) { skipped++; continue }
    const cfg = BRANCH_CONFIG[branchKey]
    if (!cfg.httpSmsKey) { skipped++; continue }

    const message =
      `Happy Birthday, ${p.firstName}! Wishing you good health and happiness today. ` +
      `With love, ${cfg.label} Family.`

    const sendAt = birthdaySendAt(match.dateStr)

    const res = await fetch('https://api.httpsms.com/v1/messages/send', {
      method:  'POST',
      headers: { 'x-api-key': cfg.httpSmsKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content:    message,
        from:       cfg.phone,
        to:         toE164(p.phone!),
        send_at:    sendAt,
        // Expire at midnight PHT on their birthday — no point sending after the day ends
        expires_at: `${match.dateStr}T16:00:00Z`,
      }),
    })

    if (res.ok) {
      scheduled++
      console.log(`[birthday-sms] scheduled → ${p.firstName} ${p.lastName} on ${match.dateStr} via ${branchKey}`)
    } else {
      const text = await res.text()
      errors.push(`${p.firstName} ${p.lastName}: httpSMS ${res.status} — ${text}`)
    }
  }

  return NextResponse.json({ ok: true, scheduled, skipped, errors })
}
