import { EgressClient } from 'livekit-server-sdk'

/**
 * Shared LiveKit Egress helpers — used by the broadcast start/stop/status
 * routes. Egress needs the HTTPS form of the LiveKit host (the room
 * connection URL is wss://, which the SDK's realtime client needs, but the
 * Egress REST/RPC client wants https://).
 */
export function egressHost(): string {
  const ws = process.env.LIVEKIT_URL || ''
  return ws.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://')
}

export function egressClient(): EgressClient | null {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const wsUrl = process.env.LIVEKIT_URL
  if (!apiKey || !apiSecret || !wsUrl) return null
  return new EgressClient(egressHost(), apiKey, apiSecret)
}

// The org's single persistent YouTube stream key + the watch URL it's tied
// to (set up once in YouTube Studio — Go Live -> Stream -> a reusable
// stream key, or a recurring scheduled live event). Every meeting's
// broadcast reuses the SAME key/URL, so "Start Broadcast" needs no
// per-session setup and the link is knowable in advance.
export function youtubeConfig(): { streamKey: string; watchUrl: string } | null {
  const streamKey = process.env.YOUTUBE_STREAM_KEY
  const watchUrl = process.env.YOUTUBE_WATCH_URL
  if (!streamKey || !watchUrl) return null
  return { streamKey, watchUrl }
}
