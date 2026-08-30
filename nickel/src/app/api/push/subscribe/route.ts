import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId, getSessionProviderId, getSessionDoctorId } from '@/lib/auth'
import { vapidPublicKey } from '@/lib/push'

// GET → the VAPID public key (for the browser to subscribe).
export async function GET() {
  return NextResponse.json({ key: vapidPublicKey() })
}

// POST → store this browser's push subscription for the signed-in user.
export async function POST(req: NextRequest) {
  const [patientId, providerId, doctorId] = await Promise.all([getSessionPatientId(), getSessionProviderId(), getSessionDoctorId()])
  if (!patientId && !providerId && !doctorId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } }
  const s = b.subscription
  if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })

  const data = { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, patientId: patientId ?? null, providerId: providerId ?? null, doctorId: doctorId ?? null }
  await prisma.pushSubscription.upsert({ where: { endpoint: s.endpoint }, create: data, update: data })
  return NextResponse.json({ ok: true })
}
