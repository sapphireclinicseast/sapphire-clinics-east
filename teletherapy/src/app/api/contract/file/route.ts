/**
 * GET /api/contract/file[?download=1] — streams the signed-in staff member's
 * own contract PDF from the HR hub. Only ever the caller's own file: HR looks
 * it up by the session email, so no id can be guessed from the browser.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'
const HR_KEY = process.env.TELETHERAPY_HR_API_KEY ?? ''

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!HR_KEY) return NextResponse.json({ error: 'TELETHERAPY_HR_API_KEY is not configured on the server' }, { status: 500 })
  const download = req.nextUrl.searchParams.get('download') === '1'
  let res: Response
  try {
    res = await fetch(`${HR_API_BASE}/internal/staff-contract/file?email=${encodeURIComponent(session.user.email.toLowerCase())}${download ? '&download=1' : ''}`, {
      headers: { 'x-api-key': HR_KEY }, cache: 'no-store',
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to reach HR hub', detail: (err as Error).message }, { status: 502 })
  }
  if (res.status === 404) return NextResponse.json({ error: 'No contract on file' }, { status: 404 })
  if (!res.ok || !res.body) return NextResponse.json({ error: `HR hub returned ${res.status}` }, { status: 502 })
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': res.headers.get('content-disposition') ?? `${download ? 'attachment' : 'inline'}; filename="contract.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
