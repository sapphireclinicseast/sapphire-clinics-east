/**
 * Games — per-game on/off settings (read-only proxy)
 *
 * GET /api/public/games/settings  →  { quiz: boolean, flappy: boolean }
 *
 * Reads the admin-controlled game switches from the HR Platform so the /games
 * page can hide a disabled game. Defaults to both enabled if HR is unreachable
 * (fail-open for the public menu; the /win route fails closed separately).
 */

import { NextResponse } from 'next/server'
import { getGameSettings } from '@/lib/games-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const settings = await getGameSettings()
  return NextResponse.json(
    { ok: true, settings },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
