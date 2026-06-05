// POST /api/public/chat — patient-portal FAQ chatbot.
// Tries admin-editable canned answers first (loaded from the DB), falls back to
// Anthropic Claude with the admin-editable system prompt. Safe to call without
// auth — rate-limited by IP.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { preflight, withCors } from '../_cors'
import { getChatTemplates, matchFaq } from '@/lib/chat-templates'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
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

  const templates = await getChatTemplates()

  // 1) Canned FAQ hit?
  const faqAnswer = matchFaq(templates.faqs, question)
  if (faqAnswer) {
    return withCors(NextResponse.json({ answer: faqAnswer, source: 'faq' }), origin)
  }

  // 2) Fallback to Claude. If no API key, return the editable default.
  if (!process.env.ANTHROPIC_API_KEY) {
    return withCors(
      NextResponse.json({ answer: templates.fallbackMessage, source: 'fallback' }),
      origin,
    )
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: templates.systemPrompt,
      messages: [{ role: 'user', content: question }],
    })
    const text = msg.content
      .map((b) => (b.type === 'text' ? b.text : ''))
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
