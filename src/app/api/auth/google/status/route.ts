import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import fs from 'fs'
import path from 'path'

const TOKEN_FILE = path.join(process.cwd(), 'uploads', 'google-oauth.json')

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ connected: false }, { status: 401 })

  // Check env var first
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    return NextResponse.json({ connected: true, source: 'env' })
  }

  // Check token file
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'))
      if (data.refresh_token) {
        return NextResponse.json({
          connected: true,
          source: 'oauth',
          savedAt: data.saved_at,
        })
      }
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ connected: false })
}
