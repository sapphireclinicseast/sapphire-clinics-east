// GET /api/public/survey-praise — anonymized positive client feedback.
// Pulls free-text "Strengths and Accomplishments" answers from completed
// satisfaction surveys (HR10 q9, HR11 q13) and returns a shuffled, name-free
// list of short quotes for the patient portal hero to display. No auth — only
// exposes positive qualitative text, never names, ratings, or critiques.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { preflight, withCors } from '../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

// Strengths free-text fields by survey type. Improvement/critique fields
// (HR10 q10, HR11 q14) are intentionally excluded.
const STRENGTH_KEYS: Record<string, string[]> = {
  HR10: ['q9'],
  HR11: ['q13'],
}

const MIN_LEN = 12
const MAX_LEN = 240
const MAX_QUOTES = 30

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')

  try {
    const responses = await prisma.surveyResponse.findMany({
      where: { surveyType: { in: ['HR10', 'HR11'] } },
      select: { surveyType: true, responsesJson: true },
      orderBy: { submittedAt: 'desc' },
      take: 400,
    })

    const seen = new Set<string>()
    const quotes: string[] = []

    for (const r of responses) {
      const keys = STRENGTH_KEYS[r.surveyType] ?? []
      const json = r.responsesJson as Record<string, unknown>
      for (const key of keys) {
        const val = json?.[key]
        if (typeof val !== 'string') continue
        const text = val.trim().replace(/\s+/g, ' ')
        if (text.length < MIN_LEN || text.length > MAX_LEN) continue
        const dedupeKey = text.toLowerCase()
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        quotes.push(text)
      }
    }

    return withCors(
      NextResponse.json({ quotes: shuffle(quotes).slice(0, MAX_QUOTES) }),
      origin,
    )
  } catch (err) {
    console.error('[survey-praise] error:', err)
    return withCors(NextResponse.json({ quotes: [] }), origin)
  }
}
