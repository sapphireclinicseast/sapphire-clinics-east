// GET /api/internal/class-portal/promissory-notes/[id]
//
// Server-to-server twin of the class-portal JWT route: streams one uploaded
// promissory note to the accounting hub (shared EXTERNAL_API_KEY), which
// proxies it to staff viewing AR → Tuition.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY || ''

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!API_KEY || req.headers.get('authorization') !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalPromissoryNote as any).findUnique({ where: { id } })
    if (!row) return NextResponse.json({ error: 'Note not found.' }, { status: 404 })
    const headers = new Headers({
      'content-type': row.fileType ?? 'application/octet-stream',
      'content-disposition': `inline; filename="${(row.fileName ?? 'promissory-note').replace(/["\\]/g, '_')}"`,
      'cache-control': 'no-store',
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(row.fileData as any, { status: 200, headers })
  } catch (e) {
    console.error('[internal/class-portal/promissory-notes] GET error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
