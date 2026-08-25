import { RoomServiceClient } from 'livekit-server-sdk'
import { egressHost } from './egress'

/**
 * Shared RoomServiceClient — used to read/write room metadata for the
 * host-transfer feature. Room metadata holds `{ hostIdentity: string }`:
 * whoever's LiveKit participant identity matches it currently holds host
 * capability (Record + Broadcast), regardless of which link (host or guest)
 * they originally joined with. This is what lets a host hand off to another
 * participant mid-meeting instead of only being settable at join time.
 */
export function roomServiceClient(): RoomServiceClient | null {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const wsUrl = process.env.LIVEKIT_URL
  if (!apiKey || !apiSecret || !wsUrl) return null
  return new RoomServiceClient(egressHost(), apiKey, apiSecret)
}

export interface RoomHostMeta {
  hostIdentity?: string
}

export function parseHostMeta(metadata: string | undefined | null): RoomHostMeta {
  if (!metadata) return {}
  try {
    const parsed = JSON.parse(metadata)
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

// Current hostIdentity for a room, or null if unset/room doesn't exist yet.
export async function getHostIdentity(rc: RoomServiceClient, room: string): Promise<string | null> {
  const rooms = await rc.listRooms([room])
  return parseHostMeta(rooms[0]?.metadata).hostIdentity ?? null
}

// Claims the host slot for `identity` ONLY if nobody holds it yet — the
// first host-role link to join becomes host; later host-role joins (e.g. a
// second host link, or the original host reconnecting after transferring
// away) do NOT silently reclaim it out from under whoever holds it now.
// Non-fatal by design: video/audio must work even if this fails.
export async function claimHostIfUnset(rc: RoomServiceClient, room: string, identity: string): Promise<void> {
  try {
    const rooms = await rc.listRooms([room])
    const existing = rooms[0]
    const meta = parseHostMeta(existing?.metadata)
    if (meta.hostIdentity) return // someone already holds it
    const metadata = JSON.stringify({ hostIdentity: identity })
    if (!existing) {
      await rc.createRoom({ name: room, metadata })
    } else {
      await rc.updateRoomMetadata(room, metadata)
    }
  } catch (e) {
    console.error('[livekit-room] claimHostIfUnset failed', e)
  }
}
