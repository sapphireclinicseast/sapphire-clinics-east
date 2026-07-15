/**
 * GET /api/payroll/ie-pr/file?documentId={id}
 *
 * Proxies a patient document file from the teletherapy hub to the
 * authenticated accounting-hub browser session.
 *
 * The accounting hub user's session is verified here; the actual file
 * is fetched from the teletherapy hub using the shared internal API key.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const ALLOWED_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const TELETHERAPY_URL = (process.env.TELETHERAPY_HUB_URL ?? 'https://teletherapy.sapphireclinicseast.org').replace(/\/$/, '')
const INTERNAL_KEY = process.env.TELETHERAPY_INTERNAL_API_KEY ?? ''

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const documentId = searchParams.get('documentId')
  if (!documentId) {
    return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
  }

  if (!INTERNAL_KEY) {
    return NextResponse.json({ error: 'File proxy not configured' }, { status: 503 })
  }

  try {
    const upstream = await fetch(
      `${TELETHERAPY_URL}/api/internal/file?documentId=${encodeURIComponent(documentId)}`,
      { headers: { Authorization: `Bearer ${INTERNAL_KEY}` }, cache: 'no-store' }
    )

    if (!upstream.ok) {
      return NextResponse.json({ error: 'File not found' }, { status: upstream.status })
    }

    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'
    const contentDisposition = upstream.headers.get('content-disposition') ?? 'inline'
    const buffer = await upstream.arrayBuffer()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition,
        'Cache-Control': 'private, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    console.error('[ie-pr/file] proxy error:', err)
    return NextResponse.json({ error: 'Could not reach teletherapy hub' }, { status: 502 })
  }
}
