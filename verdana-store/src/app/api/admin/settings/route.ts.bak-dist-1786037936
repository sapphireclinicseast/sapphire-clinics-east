import { NextResponse } from 'next/server'
import { readSettings, writeSettings } from '@/lib/settings'

export async function GET() {
  const settings = await readSettings()
  return NextResponse.json(settings)
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const current = await readSettings()

    // Merge updates
    if (body.warehouse) {
      current.warehouse = { ...current.warehouse, ...body.warehouse }
    }
    if (body.shipping) {
      current.shipping = { ...current.shipping, ...body.shipping }
    }

    await writeSettings(current)
    return NextResponse.json({ success: true, settings: current })
  } catch (error) {
    console.error('Settings update error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
