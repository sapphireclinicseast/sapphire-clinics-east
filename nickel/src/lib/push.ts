import webpush from 'web-push'
import { prisma } from '@/lib/prisma'

// Web push via VAPID. Set in the Nickel container env:
//   NICKEL_VAPID_PUBLIC, NICKEL_VAPID_PRIVATE, NICKEL_VAPID_SUBJECT (mailto:…)
let configured = false
export function pushConfigured(): boolean {
  if (configured) return true
  const pub = process.env.NICKEL_VAPID_PUBLIC, priv = process.env.NICKEL_VAPID_PRIVATE
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.NICKEL_VAPID_SUBJECT || 'mailto:main@sapphireclinicseast.org', pub, priv)
  configured = true
  return true
}
export function vapidPublicKey(): string { return process.env.NICKEL_VAPID_PUBLIC || '' }

type Recipient = { patientId?: string | null; providerId?: string | null; doctorId?: string | null }

// Send a push to every browser a recipient has subscribed. Best-effort: prunes
// dead subscriptions (404/410) and never throws to the caller.
export async function sendPush(to: Recipient, payload: { title: string; body?: string; url?: string }): Promise<void> {
  try {
    if (!pushConfigured()) return
    const where = to.patientId ? { patientId: to.patientId } : to.providerId ? { providerId: to.providerId } : to.doctorId ? { doctorId: to.doctorId } : null
    if (!where) return
    const subs = await prisma.pushSubscription.findMany({ where })
    if (subs.length === 0) return
    const data = JSON.stringify({ title: payload.title, body: payload.body ?? '', url: payload.url ?? '/' })
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data)
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {})
      }
    }))
  } catch (e) {
    console.warn('[nickel push] failed', e)
  }
}
