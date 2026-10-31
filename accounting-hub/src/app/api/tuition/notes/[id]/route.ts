// GET /api/tuition/notes/[id] — view a promissory note uploaded in Class Hub.
// The file lives in the ops app; this streams it through for signed-in staff.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { TUITION_READ_ROLES, fetchClassHubNote } from '@/lib/tuition-server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!TUITION_READ_ROLES.includes((session.user as { role?: string }).role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const res = await fetchClassHubNote(id).catch(() => null)
  if (!res || !res.ok || !res.body) {
    return NextResponse.json({ error: res?.status === 404 ? 'Note not found in Class Hub.' : 'Could not reach Class Hub.' }, { status: res?.status === 404 ? 404 : 502 })
  }
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      'content-type': res.headers.get('content-type') || 'application/octet-stream',
      'content-disposition': res.headers.get('content-disposition') || 'inline',
      'cache-control': 'no-store',
    },
  })
}
