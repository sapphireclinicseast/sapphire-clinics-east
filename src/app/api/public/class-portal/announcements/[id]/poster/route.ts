// GET /api/public/class-portal/announcements/[id]/poster
//   Streams the poster image bytes back. Any authenticated viewer can
//   fetch — visibility on the parent announcement is enforced server-
//   side by the list endpoint; if they have a valid token, surfacing
//   the poster directly is fine.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { corsHeaders } from '../../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    await requireAuth(req)
    const { id } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).classPortalAnnouncement.findUnique({
      where: { id },
      select: { posterFileName: true, posterFileType: true, posterFileData: true },
    })
    if (!row || !row.posterFileData) {
      const headers = new Headers({ 'content-type': 'application/json', ...corsHeaders(origin) })
      return new NextResponse(JSON.stringify({ error: 'No poster on file.' }), { status: 404, headers })
    }
    // Fixed-length response so the browser knows when to stop reading.
    // Same pattern as the upload-token file GET.
    const bytes = row.posterFileData instanceof Buffer
      ? new Uint8Array(row.posterFileData.buffer, row.posterFileData.byteOffset, row.posterFileData.byteLength)
      : new Uint8Array(row.posterFileData)
    const headers = new Headers({
      'content-type': row.posterFileType ?? 'application/octet-stream',
      'content-length': String(bytes.byteLength),
      'content-disposition': `inline; filename="${(row.posterFileName ?? 'poster').replace(/["\\]/g, '_')}"`,
      'cache-control': 'private, max-age=300',
      ...corsHeaders(origin),
    })
    return new NextResponse(bytes, { status: 200, headers })
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[announcements poster GET]', e)
    const headers = new Headers({ 'content-type': 'application/json', ...corsHeaders(origin) })
    return new NextResponse(JSON.stringify({ error: 'Server error.' }), { status: 500, headers })
  }
}
