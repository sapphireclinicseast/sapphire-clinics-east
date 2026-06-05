// GET /api/public/survey-praise — anonymized positive client feedback.
// Mirrors the "Customer Survey › Results › Social Media Highlights" admin view
// (src/app/api/customer-survey/route.ts, view=highlights): it pulls the same
// free-text "strengths / comments" field per survey type, ranks by the
// response's average rating (most positive first), and takes the top pool.
// Here we strip ALL identifying context (no staff names, patient names, or
// ratings) and return only a shuffled list of short quote strings for the
// patient-portal hero. No auth — only positive qualitative text is exposed.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { preflight, withCors } from '../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

// Strength / testimonial free-text field per survey type — identical mapping
// to the Social Media Highlights view. Improvement/critique fields are not
// among these keys, so they are never surfaced.
function strengthKeys(surveyType: string): string[] {
  if (surveyType === 'HR11') return ['q13']
  if (surveyType === 'HR12') return ['q10']
  if (surveyType === 'HR16') return ['q11']
  return ['q9'] // HR10
}

const MIN_LEN = 12
const MAX_LEN = 240
const HIGHLIGHT_POOL = 50 // match the highlights view's top-N before we shuffle
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
      where: { surveyType: { in: ['HR10', 'HR11', 'HR12', 'HR16'] } },
      select: { surveyType: true, responsesJson: true },
      orderBy: { submittedAt: 'desc' },
      take: 600,
    })

    type Ranked = { text: string; avgRating: number }
    const seen = new Set<string>()
    const ranked: Ranked[] = []

    for (const r of responses) {
      const json = r.responsesJson as Record<string, unknown> & {
        ratings?: { name: string; value: number }[]
      }

      // Average rating for this response (used only for ranking, never shown).
      let avg = 0
      if (Array.isArray(json?.ratings) && json.ratings.length > 0) {
        const sum = json.ratings.reduce((a, b) => a + (Number(b?.value) || 0), 0)
        avg = sum / json.ratings.length
      }

      for (const key of strengthKeys(r.surveyType)) {
        const val = json?.[key]
        if (typeof val !== 'string') continue
        const text = val.trim().replace(/\s+/g, ' ')
        if (text.length < MIN_LEN || text.length > MAX_LEN) continue
        const dedupeKey = text.toLowerCase()
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        ranked.push({ text, avgRating: avg })
      }
    }

    // Highest-rated first (same ordering intent as the highlights view), then
    // take the top pool and shuffle it so the hero rotates through the best
    // feedback in a fresh order on each load.
    ranked.sort((a, b) => b.avgRating - a.avgRating)
    const pool = ranked.slice(0, HIGHLIGHT_POOL).map((r) => r.text)
    const quotes = shuffle(pool).slice(0, MAX_QUOTES)

    return withCors(NextResponse.json({ quotes }), origin)
  } catch (err) {
    console.error('[survey-praise] error:', err)
    return withCors(NextResponse.json({ quotes: [] }), origin)
  }
}
