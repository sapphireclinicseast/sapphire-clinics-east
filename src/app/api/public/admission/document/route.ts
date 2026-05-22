// GET /api/public/admission/document?code=...&studentId=...&docKey=...
//
// Code-gated download of a parent-uploaded enrollment document for the
// partner-school /admission view. Same access code as the rest of the
// /admission API (default "scei", overridable via ADMISSION_ACCESS_CODE).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCors, corsHeaders } from '../../_cors'

const ACCESS_CODE = process.env.ADMISSION_ACCESS_CODE || 'scei'

function checkCode(req: Request): boolean {
  const url = new URL(req.url)
  const fromQuery = url.searchParams.get('code')
  const fromHeader = req.headers.get('x-admission-code')
  return (fromQuery === ACCESS_CODE) || (fromHeader === ACCESS_CODE)
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  if (!checkCode(req)) {
    return withCors(NextResponse.json({ error: 'Invalid access code.' }, { status: 401 }), origin)
  }
  const url = new URL(req.url)
  const studentId = url.searchParams.get('studentId')
  const docKey = url.searchParams.get('docKey')
  const inline = url.searchParams.get('inline') === '1'
  if (!studentId || !docKey) {
    return withCors(NextResponse.json({ error: 'studentId and docKey are required.' }, { status: 400 }), origin)
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalDocumentBlob as any).findUnique({
      where: { studentId_docKey: { studentId, docKey } },
    })
    if (!row) {
      return withCors(NextResponse.json({ error: 'Document not found.' }, { status: 404 }), origin)
    }
    const disposition = inline ? 'inline' : 'attachment'
    const headers = new Headers({
      'content-type': row.fileType ?? 'application/octet-stream',
      'content-disposition': `${disposition}; filename="${(row.fileName ?? 'document').replace(/["\\]/g, '_')}"`,
      'cache-control': 'no-store',
      ...corsHeaders(origin),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(row.fileData as any, { status: 200, headers })
  } catch (e) {
    console.error('[admission/document.GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
