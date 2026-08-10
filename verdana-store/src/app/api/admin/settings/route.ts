import { NextResponse } from 'next/server'
import { readSettings, writeSettings } from '@/lib/settings'

// The routing key is a secret and this GET is unauthenticated, so it is NEVER
// returned. The admin UI only needs to know whether a key is on file.
function redact(settings: Awaited<ReturnType<typeof readSettings>>) {
  const { routingApiKey, ...shipping } = settings.shipping as typeof settings.shipping & {
    routingApiKey?: string
  }
  return {
    ...settings,
    shipping: { ...shipping, hasRoutingKey: !!(routingApiKey && routingApiKey.trim()) },
  }
}

export async function GET() {
  const settings = await readSettings()
  return NextResponse.json(redact(settings))
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const current = await readSettings()

    if (body.warehouse) {
      current.warehouse = { ...current.warehouse, ...body.warehouse }
    }
    if (body.shipping) {
      // Handle the secret key separately: only overwrite when a real new value is
      // supplied. Empty string / missing / the masked placeholder keep the stored key.
      const incoming = { ...body.shipping }
      const newKey = incoming.routingApiKey
      delete incoming.routingApiKey
      delete (incoming as { hasRoutingKey?: boolean }).hasRoutingKey

      current.shipping = { ...current.shipping, ...incoming }

      if (typeof newKey === 'string') {
        const trimmed = newKey.trim()
        // Only overwrite with a genuinely new key; empty/masked leaves the stored key intact.
        if (trimmed && trimmed !== '••••••••') {
          current.shipping.routingApiKey = trimmed
        }
      }
    }

    await writeSettings(current)
    return NextResponse.json({ success: true, settings: redact(current) })
  } catch (error) {
    console.error('Settings update error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
