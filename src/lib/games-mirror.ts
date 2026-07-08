// In-memory live-mirror store for the marketing games. Players' phones POST a
// compact snapshot of their game (a small JPEG for Flappy, structured state for
// the quiz) every few hundred ms; the backend viewer page reads the latest
// snapshot for a chosen player. Ephemeral by design — a single app instance at
// a booth event, entries expire a few seconds after the phone stops sending.

export type MirrorPayload = {
  sessionId: string
  name: string
  game: 'slp-quiz' | 'slp-flappy'
  kind: 'image' | 'quiz'
  status?: string
  image?: string
  quiz?: Record<string, unknown>
  updatedAt: number
}

const TTL_MS = 12_000
const store = new Map<string, MirrorPayload>()

function prune() {
  const cutoff = Date.now() - TTL_MS
  for (const [k, v] of store) if (v.updatedAt < cutoff) store.delete(k)
}

export function putMirror(p: Omit<MirrorPayload, 'updatedAt'>): void {
  prune()
  store.set(p.sessionId, { ...p, updatedAt: Date.now() })
  // Safety cap so a flood of sessions can't grow memory unbounded.
  if (store.size > 200) {
    const oldest = [...store.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0]
    if (oldest) store.delete(oldest[0])
  }
}

// Lightweight list for the viewer's player picker (no image payloads).
export function listMirrors(): Array<Pick<MirrorPayload, 'sessionId' | 'name' | 'game' | 'status' | 'updatedAt'>> {
  prune()
  return [...store.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ sessionId, name, game, status, updatedAt }) => ({ sessionId, name, game, status, updatedAt }))
}

export function getMirror(sessionId: string): MirrorPayload | null {
  prune()
  return store.get(sessionId) ?? null
}
