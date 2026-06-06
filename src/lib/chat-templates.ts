// Shared loader for Aurora's admin-editable chatbot templates.
// Reads ChatFaq + ChatSetting from the DB with a short in-memory cache so the
// public chat endpoint doesn't hit Postgres on every keystroke. Falls back to
// the original hardcoded copy if the DB is unavailable (e.g. build time).

import { prisma } from '@/lib/prisma'

export interface FaqEntry {
  id: string
  label: string
  keywords: string[]
  answer: string
  enabled: boolean
  sortOrder: number
}

export interface ChatTemplates {
  faqs: FaqEntry[]
  introMessage: string
  systemPrompt: string
  fallbackMessage: string
}

export const DEFAULT_INTRO =
  "Hi! I'm Aurora, the Sapphire Clinics East assistant. Ask me anything about booking, services, or our clinics — or tap one of the quick questions below."

export const DEFAULT_FALLBACK =
  "I don't have an answer for that yet — please use the quick questions below, or contact the clinic at info@sapphireclinicseast.org."

export const DEFAULT_SYSTEM_PROMPT = `You are Aurora, a warm, concise assistant for Sapphire Clinics East (SCEI), a pediatric and adult therapy clinic in the Philippines with two branches: East Branch (San Pedro, Laguna) and Greenhills Branch (San Juan).

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

// Fallback FAQ used only if the DB is unreachable. Mirrors the seed data.
const DEFAULT_FAQS: FaqEntry[] = [
  { id: 'faq_book', label: 'How do I book?', keywords: ['book', 'schedule', 'appointment', 'how do i book', 'how to book'], enabled: true, sortOrder: 10,
    answer: 'You can book online at client.sapphireclinicseast.org:\n1. Sign in (returning) or register (new patient).\n2. Pick your branch + service.\n3. Choose a therapist and up to 3 preferred time slots.\n4. The front desk will confirm one choice and email you a payment link.\nOnce the downpayment is received, your slot is confirmed.' },
  { id: 'faq_services', label: 'What are your services?', keywords: ['service', 'what services', 'offer', 'therapy'], enabled: true, sortOrder: 20,
    answer: 'We offer:\n• Physical Therapy (PT)\n• Occupational Therapy (OT)\n• Speech-Language Pathology (SLP)\n• Special Education (SPED)\n• Medical Doctor (MD)\n• Psychology\n• Orthosis / Prosthesis (East Branch only)\n• Psychiatry (Greenhills Branch only)\n• Developmental Pediatrician (Greenhills Branch only)' },
  { id: 'faq_downpayment', label: 'Downpayment', keywords: ['downpayment', 'deposit', 'payment', 'how much', 'fee', 'cost', 'price'], enabled: true, sortOrder: 30,
    answer: 'Downpayment rates per session (PHP):\n\nEast Branch:\n• PT — ₱500\n• OT, SLP, MD, Psychology — ₱1,000\n• SPED — ₱500\n\nGreenhills Branch:\n• PT, OT, SLP, SPED, MD, Psychology, Psychiatry — ₱1,000\n• Developmental Pediatrician — ₱6,000\n\nPayment is via PayMongo (card, GCash, Maya) after front-desk approval.' },
  { id: 'faq_hours', label: 'Clinic hours', keywords: ['hours', 'open', 'time', 'schedule of clinic', 'clinic hours'], enabled: true, sortOrder: 40,
    answer: 'Clinic hours:\n• East Branch — Mon–Sat, 10:00 AM to 8:00 PM\n• Greenhills Branch — Mon–Sat, 9:00 AM to 7:00 PM\n(Closed Sundays; holiday hours may vary.)' },
  { id: 'faq_teletherapy', label: 'Teletherapy', keywords: ['teletherapy', 'online', 'remote', 'virtual', 'video'], enabled: true, sortOrder: 50,
    answer: "Yes — we offer teletherapy for select services. When you book, tick the 'Request teletherapy' option. Once the front desk approves and your downpayment is received, you'll get a secure meeting link in your My Bookings page." },
  { id: 'faq_cancellation', label: 'Cancellation', keywords: ['cancel', 'cancellation', 'reschedule', 'no-show', 'no show', 'miss'], enabled: true, sortOrder: 60,
    answer: 'Cancellations made ≥ 24 hours in advance are free. Cancellations under 24 hours or no-shows may incur a fee equal to the session downpayment. Please contact the front desk as soon as possible.' },
  { id: 'faq_location', label: '', keywords: ['location', 'address', 'where', 'branch'], enabled: true, sortOrder: 70,
    answer: 'We have two branches:\n• East Branch — San Pedro, Laguna\n• Greenhills Branch — Greenhills, San Juan\nFor exact addresses and directions, visit sapphireclinicseast.org.' },
  { id: 'faq_contact', label: '', keywords: ['contact', 'phone', 'email', 'number', 'call'], enabled: true, sortOrder: 80,
    answer: 'You can reach us:\n• Email: info@sapphireclinicseast.org\n• Website: sapphireclinicseast.org\n• For booking help, use the Contact form on our main site or message us on Facebook/Viber.' },
  { id: 'faq_hmo', label: '', keywords: ['hmo', 'insurance', 'philhealth', 'maxicare', 'medicard'], enabled: true, sortOrder: 90,
    answer: 'We accept several HMO providers. Please check with our front desk before booking to confirm coverage and any co-pay. Downpayments may still apply depending on your plan.' },
  { id: 'faq_vip', label: '', keywords: ['vip', 'prepaid', 'reward', 'points', 'package'], enabled: true, sortOrder: 100,
    answer: 'We offer VIP and Prepaid Card packages that come with session discounts and reward points. Ask the front desk for current promos and tier benefits.' },
  { id: 'faq_refund', label: '', keywords: ['refund', 'money back'], enabled: true, sortOrder: 110,
    answer: 'Downpayments are generally non-refundable but can be credited to a future session if cancelled at least 24 hours in advance. For special cases, please contact the front desk.' },
]

function splitKeywords(raw: string): string[] {
  return raw
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
}

const CACHE_MS = 30_000
let cache: { data: ChatTemplates; at: number } | null = null

export function invalidateChatTemplatesCache() {
  cache = null
}

export async function getChatTemplates(): Promise<ChatTemplates> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data

  try {
    const [rows, settingRows] = await Promise.all([
      prisma.chatFaq.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.chatSetting.findMany(),
    ])

    const settings = new Map(settingRows.map((s) => [s.key, s.value]))
    const faqs: FaqEntry[] = rows.map((r) => ({
      id: r.id,
      label: r.label,
      keywords: splitKeywords(r.keywords),
      answer: r.answer,
      enabled: r.enabled,
      sortOrder: r.sortOrder,
    }))

    const data: ChatTemplates = {
      faqs: faqs.length ? faqs : DEFAULT_FAQS,
      introMessage: settings.get('intro_message') || DEFAULT_INTRO,
      systemPrompt: settings.get('system_prompt') || DEFAULT_SYSTEM_PROMPT,
      fallbackMessage: settings.get('fallback_message') || DEFAULT_FALLBACK,
    }
    cache = { data, at: Date.now() }
    return data
  } catch (err) {
    console.error('[chat-templates] DB load failed, using defaults:', err)
    return {
      faqs: DEFAULT_FAQS,
      introMessage: DEFAULT_INTRO,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      fallbackMessage: DEFAULT_FALLBACK,
    }
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Keyword match against enabled FAQ entries. A keyword only matches when it
// begins at a word boundary (start of string or after a non-alphanumeric
// character), so "therapy" does NOT match inside "teletherapy". The keyword's
// end is left open so plurals still match ("sped class" → "sped classes").
// When several FAQs match, the most specific one wins — the longest matching
// keyword, breaking ties by sortOrder. This lets a dedicated "sped class" FAQ
// beat a generic "offer" keyword on the services FAQ.
export function matchFaq(faqs: FaqEntry[], question: string): string | null {
  const s = question.toLowerCase()
  let best: { answer: string; len: number; sortOrder: number } | null = null
  for (const f of faqs) {
    if (!f.enabled) continue
    for (const k of f.keywords) {
      if (!k) continue
      if (!new RegExp('(?:^|[^a-z0-9])' + escapeRegExp(k)).test(s)) continue
      if (!best || k.length > best.len || (k.length === best.len && f.sortOrder < best.sortOrder)) {
        best = { answer: f.answer, len: k.length, sortOrder: f.sortOrder }
      }
    }
  }
  return best ? best.answer : null
}
