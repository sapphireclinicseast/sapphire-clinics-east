// Reads the per-game on/off switches from the HR Platform (the admin toggles
// them under Seminars & Trainings → Marketing Vouchers → Game Controls).

const HR_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'

export type GameSettings = { quiz: boolean; flappy: boolean }

// Menu read: fail OPEN (assume enabled) if HR is briefly unreachable, so a
// blip doesn't hide the games at an event.
export async function getGameSettings(): Promise<GameSettings> {
  try {
    const res = await fetch(`${HR_URL}/marketing-games/settings`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    })
    const data = await res.json().catch(() => null)
    if (data?.ok && data.settings) {
      return { quiz: data.settings.quiz !== false, flappy: data.settings.flappy !== false }
    }
  } catch (e: any) {
    console.error('[games-settings] HR fetch failed:', e?.message || e)
  }
  return { quiz: true, flappy: true }
}

// Voucher issue guard. Only blocks when HR explicitly reports the game OFF; if
// HR is unreachable or hasn't got the settings endpoint yet, it fails OPEN so a
// transient blip (or a not-yet-deployed HR) can't silently kill every voucher.
// The anti-farming switch still works whenever HR is up and the toggle is off.
export async function isGameEnabled(game: string): Promise<boolean> {
  const s = await getGameSettings()
  return game === 'slp-flappy' ? s.flappy : s.quiz
}
