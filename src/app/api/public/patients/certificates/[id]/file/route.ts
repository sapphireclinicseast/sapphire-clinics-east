// GET /api/public/patients/certificates/[id]/file?token=…
// Streams one of the signed-in patient's own discharge certificates.
//
// Ownership is checked HERE, against the portal token, and again by HR, which
// is given the same id list and refuses anything outside it. Either check
// alone would be enough today; both are kept because a certificate id is a
// short opaque string that will end up in browser history and print dialogs,
// and it must never be sufficient on its own to fetch somebody else's.

import { NextRequest, NextResponse } from 'next/server'
import { verifyPatientToken } from '@/lib/patient-session'
import { linkedPatientIds } from '@/lib/patient-links'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const session = verifyPatientToken(token)
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const patientIds = await linkedPatientIds(session.patientId)
  if (patientIds.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const base = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
  const key  = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''
  if (!key) {
    console.error('[patients/certificates/file] no HR service key configured')
    return NextResponse.json({ error: 'Not available' }, { status: 503 })
  }

  let upstream: Response
  try {
    const url = new URL(`${base}/external/discharge-certificates/${encodeURIComponent(id)}/file`)
    url.searchParams.set('patientIds', patientIds.join(','))
    upstream = await fetch(url, {
      headers: { 'x-api-key': key },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
  } catch (err) {
    console.error('[patients/certificates/file] HR unreachable:', (err as Error).message)
    return NextResponse.json({ error: 'Certificate temporarily unavailable' }, { status: 502 })
  }

  // HR answers 404 both for "no such certificate" and "not this patient's".
  // Pass that through unchanged rather than distinguishing them — telling a
  // caller which of the two it was confirms that an id exists.
  if (!upstream.ok) {
    return NextResponse.json({ error: 'Not found' }, { status: upstream.status === 404 ? 404 : 502 })
  }

  const buf = Buffer.from(await upstream.arrayBuffer())
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      // inline: families open these to look at and print, not to file away.
      'Content-Disposition': `inline; filename="discharge-certificate.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
