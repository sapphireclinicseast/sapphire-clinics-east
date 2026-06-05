import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ── Bot tokens per branch ──────────────────────────────────────────────────────
const VIBER_TOKENS: Record<string, string> = {
  SBEA: process.env.VIBER_BOT_TOKEN_SBEA ?? '',
  SBGH: process.env.VIBER_BOT_TOKEN_SBGH ?? '',
}

const CLINIC_NAMES: Record<string, string> = {
  SBEA: 'East Branch',
  SBGH: 'Greenhills Branch',
}

const CLINIC_PHONES: Record<string, string> = {
  SBEA: '+63 917 118 9289',
  SBGH: '+63 917 770 1686',
}

// ── Normalize Philippine phone for DB matching ─────────────────────────────────
// Handles: +63 956 870 2220  |  09568702220  |  9568702220  |  63956870220
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length >= 11) return '0' + digits.slice(2)
  if (digits.startsWith('0') && digits.length === 11) return digits
  if (digits.length === 10) return '0' + digits
  return digits
}

// ── Send a text message to a subscriber ───────────────────────────────────────
async function sendViberText(viberUserId: string, text: string, token: string) {
  const res = await fetch('https://chatapi.viber.com/pa/send_message', {
    method:  'POST',
    headers: { 'X-Viber-Auth-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiver: viberUserId, type: 'text', text }),
  })
  const json = await res.json()
  if (json.status !== 0) {
    console.error('[viber/webhook] send_message error:', json)
  }
}

// ── Viber sends all events to this webhook ────────────────────────────────────
// URL: /api/viber/webhook?branch=SBEA  or  /api/viber/webhook?branch=SBGH
export async function POST(req: NextRequest) {
  const branch = (req.nextUrl.searchParams.get('branch') ?? 'SBEA').toUpperCase()
  const token  = VIBER_TOKENS[branch]
  const clinic = CLINIC_NAMES[branch] ?? 'Sapphire Clinics East'
  const phone  = CLINIC_PHONES[branch] ?? ''

  // Always respond 200 quickly so Viber doesn't retry
  const event = await req.json().catch(() => ({}))

  // ── Event: user subscribed (first-contact / opened bot profile) ─────────────
  if (event.event === 'subscribed') {
    const viberUserId: string = event.user?.id
    if (viberUserId && token) {
      await sendViberText(
        viberUserId,
        `Hello! Welcome to ${clinic} 🏥\n\n` +
        `To link your account and receive appointment reminders via Viber, ` +
        `please reply with your registered mobile number.\n\n` +
        `Example: 09568702220\n\n` +
        `Questions? Call us at ${phone}.`,
        token,
      )
    }
  }

  // ── Event: user sent a message (we expect their mobile number) ──────────────
  if (event.event === 'message' && event.message?.type === 'text') {
    const viberUserId: string = event.sender?.id
    const text:         string = (event.message?.text ?? '').trim()

    if (!viberUserId || !token) return NextResponse.json({ status: 0 })

    const normalized = normalizePhone(text)

    // Only proceed if input looks like a Philippine mobile number
    if (normalized.startsWith('0') && normalized.length === 11) {
      const last10 = normalized.slice(-10)   // e.g. "9568702220"

      // Search by last 10 digits so any phone format in DB matches
      const patient = await prisma.patient.findFirst({
        where: {
          OR: [
            { phone: { contains: last10 } },
            { phone: normalized },
          ],
        },
      })

      if (patient) {
        // Upsert subscription record
        await prisma.viberSubscription.upsert({
          where:  { viberUserId },
          create: { patientId: patient.id, viberUserId, branch },
          update: { patientId: patient.id, branch },
        })

        await sendViberText(
          viberUserId,
          `✅ You're all set, ${patient.firstName}!\n\n` +
          `Your account has been linked to ${clinic}. You'll now receive ` +
          `appointment reminders here on Viber.\n\n` +
          `See you soon! 😊`,
          token,
        )
        console.log(`[viber/webhook] Linked ${patient.firstName} ${patient.lastName} → viberUserId=${viberUserId} (${branch})`)
      } else {
        await sendViberText(
          viberUserId,
          `We couldn't find a patient registered with that number (${text}).\n\n` +
          `Please double-check your number or contact us at ${phone}.`,
          token,
        )
      }
    } else {
      // Non-phone input — send help message
      await sendViberText(
        viberUserId,
        `To link your account, please send your mobile number.\n\nExample: 09568702220`,
        token,
      )
    }
  }

  return NextResponse.json({ status: 0, status_message: 'ok' })
}

// ── GET: Viber sends a challenge verification when registering the webhook ─────
export async function GET(req: NextRequest) {
  return NextResponse.json({ status: 0 })
}
