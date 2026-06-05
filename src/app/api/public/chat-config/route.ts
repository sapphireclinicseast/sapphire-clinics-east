// GET /api/public/chat-config — public config for the Aurora chat widget.
// Returns the intro greeting and the quick-reply buttons (enabled FAQ entries
// that have a label). Consumed by the patient-portal Chatbot component.

import { NextRequest, NextResponse } from 'next/server'
import { preflight, withCors } from '../_cors'
import { getChatTemplates } from '@/lib/chat-templates'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const t = await getChatTemplates()

  const quickReplies = t.faqs
    .filter((f) => f.enabled && f.label.trim())
    .map((f) => ({ label: f.label, q: f.label }))

  return withCors(
    NextResponse.json({ intro: t.introMessage, quickReplies }),
    origin,
  )
}
