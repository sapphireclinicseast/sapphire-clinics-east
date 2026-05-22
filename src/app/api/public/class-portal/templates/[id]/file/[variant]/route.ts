// GET /api/public/class-portal/templates/[id]/file/[variant]
//   variant = pdf | doc

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../../../../_cors'

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; variant: string }> }) {
  const origin = req.headers.get('origin')
  try {
    await requireAuth(req)
    const { id, variant } = await params
    if (variant !== 'pdf' && variant !== 'doc') {
      return withCors(NextResponse.json({ error: 'variant must be pdf | doc.' }, { status: 400 }), origin)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalTemplate as any).findUnique({
      where: { id },
      select: {
        pdfFileName: true, pdfFileType: true, pdfFileData: true,
        docFileName: true, docFileType: true, docFileData: true,
      },
    })
    if (!row) {
      return withCors(NextResponse.json({ error: 'Not found.' }, { status: 404 }), origin)
    }
    const fileName = row[`${variant}FileName`] as string | null
    const fileType = row[`${variant}FileType`] as string | null
    const fileData = row[`${variant}FileData`] as Buffer | null
    if (!fileName || !fileData) {
      return withCors(NextResponse.json({ error: 'Variant not uploaded.' }, { status: 404 }), origin)
    }
    const headers = new Headers({
      'content-type': fileType ?? 'application/octet-stream',
      'content-disposition': `inline; filename="${fileName.replace(/["\\]/g, '_')}"`,
      'cache-control': 'no-store',
      ...corsHeaders(origin),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(fileData as any, { status: 200, headers })
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[templates/file.GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
