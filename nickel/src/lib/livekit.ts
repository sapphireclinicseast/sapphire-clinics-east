import { AccessToken } from 'livekit-server-sdk'

// Nickel's OWN LiveKit project (separate from the Sapphire staff-portal server).
// Set in the Nickel container env:
//   NICKEL_LIVEKIT_URL         wss://<your-nickel-project>.livekit.cloud
//   NICKEL_LIVEKIT_API_KEY     <api key>
//   NICKEL_LIVEKIT_API_SECRET  <api secret>
export function livekitConfigured(): boolean {
  return !!(process.env.NICKEL_LIVEKIT_URL && process.env.NICKEL_LIVEKIT_API_KEY && process.env.NICKEL_LIVEKIT_API_SECRET)
}
export function livekitUrl(): string { return process.env.NICKEL_LIVEKIT_URL || '' }

// A join token for one participant in one consult room.
export async function mintConsultToken(room: string, identity: string, name: string): Promise<string> {
  const at = new AccessToken(process.env.NICKEL_LIVEKIT_API_KEY!, process.env.NICKEL_LIVEKIT_API_SECRET!, { identity, name, ttl: '2h' })
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true })
  return at.toJwt()
}
