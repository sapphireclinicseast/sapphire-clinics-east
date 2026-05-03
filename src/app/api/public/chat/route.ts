// POST /api/public/chat — patient-portal FAQ chatbot.
// Tries canned answers first, falls back to Anthropic Claude with a grounded
// system prompt. Safe to call without auth — rate-limited by IP.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { preflight, withCors } from '../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

// ── Canned FAQ responses (checked first, keyword-based) ─────────────────────
const FAQ: Array<{ keys: string[]; answer: string }> = [
  {
    keys: ['book', 'schedule', 'appointment', 'how do i book', 'how to book'],
    answer:
      "You can book online at client.sapphireclinicseast.org:\n1. Sign in (returning) or register (new patient).\n2. Pick your branch + service.\n3. Choose a therapist and up to 3 preferred time slots.\n4. The front desk will confirm one choice and email you a payment link.\nOnce the downpayment is received, your slot is confirmed.",
  },
  {
    keys: ['service', 'what services', 'offer', 'therapy'],
    answer:
      "We offer:\n• Physical Therapy (PT)\n• Occupational Therapy (OT)\n• Speech-Language Pathology (SLP)\n• Special Education (SPED)\n• Medical Doctor (MD)\n• Psychology\n• Orthosis / Prosthesis (Sandbox East only)\n• Psychiatry (Sandbox GH only)\n• Developmental Pediatrician (Sandbox GH only)",
  },
  {
    keys: ['downpayment', 'deposit', 'payment', 'how much', 'fee', 'cost', 'price'],
    answer:
      "Downpayment rates per session (PHP):\n\nSandbox East:\n• PT — ₱500\n• OT, SLP, MD, Psychology — ₱1,000\n• SPED — ₱500\n\nSandbox Greenhills:\n• PT, OT, SLP, SPED, MD, Psychology, Psychiatry — ₱1,000\n• Developmental Pediatrician — ₱6,000\n\nPayment is via PayMongo (card, GCash, Maya) after front-desk approval.",
  },
  {
    keys: ['hours', 'open', 'time', 'schedule of clinic', 'clinic hours'],
    answer:
      "Clinic hours:\n• Sandbox East — Mon–Sat, 10:00 AM to 8:00 PM\n• Sandbox Greenhills — Mon–Sat, 9:00 AM to 7:00 PM\n(Closed Sundays; holiday hours may vary.)",
  },
  {
    keys: ['teletherapy', 'online', 'remote', 'virtual', 'video'],
    answer:
      "Yes — we offer teletherapy for select services. When you book, tick the 'Request teletherapy' option. Once the front desk approves and your downpayment is received, you'll get a secure meeting link in your My Bookings page.",
  },
  {
    keys: ['cancel', 'cancellation', 'reschedule', 'no-show', 'no show', 'miss'],
    answer:
      "Cancellations made ≥ 24 hours in advance are free. Cancellations under 24 hours or no-shows may incur a fee equal to the session downpayment. Please contact the front desk as soon as possible.",
  },
  {
    keys: ['location', 'address', 'where', 'branch'],
    answer:
      "We have two branches:\n• Sandbox East — San Pedro, Laguna\n• Sandbox Greenhills — Greenhills, San Juan\nFor exact addresses and directions, visit sapphireclinicseast.org.",
  },
  {
    keys: ['contact', 'phone', 'email', 'number', 'call'],
    answer:
      "You can reach us:\n• Email: info@sapphireclinicseast.org\n• Website: sapphireclinicseast.org\n• For booking help, use the Contact form on our main site or message us on Facebook/Viber.",
  },
  {
    keys: ['hmo', 'insurance', 'philhealth', 'maxicare', 'medicard'],
    answer:
      "We accept several HMO providers. Please check with our front desk before booking to confirm coverage and any co-pay. Downpayments may still apply depending on your plan.",
  },
  {
    keys: ['vip', 'prepaid', 'reward', 'points', 'package'],
    answer:
      "We offer VIP and Prepaid Card packages that come with session discounts and reward points. Ask the front desk for current promos and tier benefits.",
  },
  {
    keys: ['refund', 'money back'],
    answer:
      "Downpayments are generally non-refundable but can be credited to a future session if cancelled at least 24 hours in advance. For special cases, please contact the front desk.",
  },
]

function matchFaq(q: string): string | null {
  const s = q.toLowerCase()
  for (const entry of FAQ) {
    if (entry.keys.some((k) => s.includes(k))) return entry.answer
  }
  return null
}

// ── Very simple per-IP rate limit (in-memory; reset on server restart) ──────
const RATE: Map<string, { count: number; resetAt: number }> = new Map()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 20

function rateLimit(ip: string): boolean {
  const now = Date.now()
  const cur = RATE.get(ip)
  if (!cur || cur.resetAt < now) {
    RATE.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (cur.count >= MAX_PER_WINDOW) return false
  cur.count += 1
  return true
}

const SYSTEM_PROMPT = `You are Sappy, a warm, concise assistant for Sapphire Clinics East (SCEI), a pediatric and adult therapy clinic in the Philippines with two branches: Sandbox East (San Pedro, Laguna) and Sandbox Greenhills (San Juan).

You help patients with questions about:
- Booking appointments at client.sapphireclinicseast.org
- Services (PT, OT, SLP, SPED, MD, Psychology, Orthosis, Psychiatry, Developmental Pediatrician)
- Downpayments (PT at SBEA is ₱500; most others are ₱1,000; DevPedia at SBGH is ₱6,000)
- Clinic hours (SBEA 10am-8pm, SBGH 9am-7pm, Mon-Sat)
- Teletherapy, cancellation policy, HMO acceptance, VIP/prepaid packages

Rules:
- Keep answers under 120 words, warm and clear.
- If asked something outside SCEI scope, politely redirect to contacting the clinic.
- Never make up phone numbers, doctor names, or specific availability — tell them to use the booking portal.
- Never give medical advice. If asked medical questions, suggest booking a consult.
- Prefer bullet points for multi-part answers.`

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()

  if (!rateLimit(ip)) {
    return withCors(
      NextResponse.json({ error: 'Too many messages, please slow down.' }, { status: 429 }),
      origin,
    )
  }

  const body = (await req.json().catch(() => ({}))) as { question?: string }
  const question = (body.question ?? '').trim().slice(0, 500)
  if (!question) {
    return withCors(NextResponse.json({ error: 'Question is required' }, { status: 400 }), origin)
  }

  // 1) Canned FAQ hit?
  const faqAnswer = matchFaq(question)
  if (faqAnswer) {
    return withCors(NextResponse.json({ answer: faqAnswer, source: 'faq' }), origin)
  }

  // 2) Fallback to Claude. If no API key, return a graceful default.
  if (!process.env.ANTHROPIC_API_KEY) {
    return withCors(
      NextResponse.json({
        answer:
          "I don't have an answer for that yet — please use the quick questions below, or contact the clinic at info@sapphireclinicseast.org.",
        source: 'fallback',
      }),
      origin,
    )
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: question }],
    })
    const text = msg.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
    return withCors(NextResponse.json({ answer: text || "Sorry, I didn't catch that.", source: 'claude' }), origin)
  } catch (err) {
    console.error('[chat] Claude error:', err)
    return withCors(
      NextResponse.json({
        answer:
          "I'm having trouble reaching my answer bank right now. Please try one of the quick questions, or email info@sapphireclinicseast.org.",
        source: 'error',
      }),
      origin,
    )
  }
}
