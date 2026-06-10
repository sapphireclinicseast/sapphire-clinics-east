/**
 * GET /api/manuals/[id]/page/[n]
 *
 * Streams a single rendered page IMAGE of a manual to the logged-in
 * clinician. The browser never receives the source PDF — only PNGs of
 * pages the user's department is allowed to see. We re-check scope
 * against the HR /manuals/public listing on every request, then proxy
 * the image from the HR hub using the shared service key.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { allowedDeptsFor, manualInScope } from '@/lib/manual-scope'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'
const HR_KEY = process.env.TELETHERAPY_HR_API_KEY ?? ''

interface HRManualMeta {
  id: string
  departments: string[]
  pageCount: number
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; n: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, n } = await params
  const pageNum = parseInt(n, 10)
  if (!Number.isInteger(pageNum) || pageNum < 1) {
    return NextResponse.json({ error: 'Bad page number' }, { status: 400 })
  }

  const myRole = (session.user as { role?: string }).role ?? ''
  const allowed = allowedDeptsFor(myRole, (session.user as { department?: string }).department ?? '')

  // Confirm this manual is visible to the user (and get its page count).
  let listRes: Response
  try {
    listRes = await fetch(`${HR_API_BASE}/manuals/public`, { cache: 'no-store' })
  } catch {
    return NextResponse.json({ error: 'HR hub unreachable' }, { status: 502 })
  }
  if (!listRes.ok) {
    return NextResponse.json({ error: 'Upstream error' }, { status: 502 })
  }
  const listData = (await listRes.json()) as { ok: boolean; manuals?: HRManualMeta[] }
  const manual = (listData.manuals ?? []).find((m) => m.id === id)
  if (!manual) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!manualInScope(manual.departments, allowed)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (pageNum > (manual.pageCount || 0)) {
    return NextResponse.json({ error: 'Page out of range' }, { status: 404 })
  }

  let imgRes: Response
  try {
    imgRes = await fetch(`${HR_API_BASE}/manuals/${id}/page/${pageNum}`, {
      headers: { 'x-api-key': HR_KEY },
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'HR hub unreachable' }, { status: 502 })
  }
  if (!imgRes.ok) {
    return NextResponse.json({ error: 'Image unavailable' }, { status: imgRes.status })
  }

  const buf = Buffer.from(await imgRes.arrayBuffer())
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
