// GET /api/public/ugat/brochure            → download the current brochure (PDF)
// GET /api/public/ugat/brochure?meta=1      → { exists, filename } (for the
//                                              landing page to decide whether to
//                                              show the download section)
// The brochure is uploaded by admins in the portal's Marketing section.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const BROCHURE = 'BROCHURE'

// Keep the download filename safe for a Content-Disposition header.
function safeName(name: string): string {
  const n = (name || 'UGAT-Brochure.pdf').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120)
  return /\.pdf$/i.test(n) ? n : `${n}.pdf`
}

export async function GET(req: Request) {
  const wantsMeta = new URL(req.url).searchParams.get('meta')
  try {
    if (wantsMeta) {
      const a = await prisma.ugatMarketingAsset.findUnique({ where: { kind: BROCHURE }, select: { filename: true, updatedAt: true } })
      return NextResponse.json({ exists: !!a, filename: a?.filename || null, updatedAt: a?.updatedAt || null })
    }
    const a = await prisma.ugatMarketingAsset.findUnique({ where: { kind: BROCHURE } })
    if (!a) return new NextResponse('Not found', { status: 404 })
    const body = Buffer.from(a.data)
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': a.mimeType || 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName(a.filename)}"`,
        'Content-Length': String(body.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return wantsMeta
      ? NextResponse.json({ exists: false, filename: null, updatedAt: null })
      : new NextResponse('Not found', { status: 404 })
  }
}
