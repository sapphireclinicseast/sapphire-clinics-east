/**
 * Games — live Mirror View transport
 *
 * POST /api/public/games/mirror         — a player's phone pushes a snapshot
 * GET  /api/public/games/mirror          — list active players (for the picker)
 * GET  /api/public/games/mirror?sessionId=X — latest snapshot for one player
 *
 * Public + ephemeral: snapshots live in memory and expire ~12s after the phone
 * stops sending. Used by the /games/mirror backend page at the booth.
 */

import { NextRequest, NextResponse } from 'next/server'
import { putMirror, listMirrors, getMirror } from '@/lib/games-mirror'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_IMAGE_CHARS = 400_000 // ~300KB dataURL cap per frame

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (sessionId) {
    const payload = getMirror(sessionId)
    if (!payload) return NextResponse.json({ ok: false, error: 'No live session.' }, { status: 404 })
    return NextResponse.json({ ok: true, payload }, { headers: { 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json({ ok: true, sessions: listMirrors() }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  }

  const sessionId = String(body.sessionId ?? '').trim().slice(0, 64)
  const name = String(body.name ?? '').trim().slice(0, 80) || 'Player'
  const game = body.game === 'slp-flappy' ? 'slp-flappy' : 'slp-quiz'
  const kind = body.kind === 'image' ? 'image' : 'quiz'
  if (!sessionId) return NextResponse.json({ ok: false, error: 'sessionId required.' }, { status: 400 })

  const image = kind === 'image' ? String(body.image ?? '') : undefined
  if (image && (image.length > MAX_IMAGE_CHARS || !image.startsWith('data:image/'))) {
    return NextResponse.json({ ok: false, error: 'Invalid frame.' }, { status: 413 })
  }

  putMirror({
    sessionId,
    name,
    game,
    kind,
    status: typeof body.status === 'string' ? body.status.slice(0, 24) : undefined,
    image,
    quiz: kind === 'quiz' && body.quiz && typeof body.quiz === 'object' ? body.quiz : undefined,
  })

  return NextResponse.json({ ok: true })
}
