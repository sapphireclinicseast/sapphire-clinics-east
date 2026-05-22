// GET  /api/public/class-portal/curriculum
//   Returns the curriculum library (metadata only — no file bytes). Visible
//   to any authenticated class-portal user.
//
// POST /api/public/class-portal/curriculum
//   Multipart upsert. Fields: id, level, title, optional pdfFile, docFile,
//   xlsFile. Admin / branch admin / teacher / front desk can upload.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../_cors'

const MAX_BYTES = 25 * 1024 * 1024 // 25MB cap per file

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

function canWrite(role: string): boolean {
  return role === 'ADMIN' || role === 'BRANCH_ADMIN' || role === 'TEACHER' || role === 'FRONTDESK'
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    await requireAuth(req)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma.classPortalCurriculum as any).findMany({
      select: {
        id: true, level: true, title: true,
        pdfFileName: true, pdfFileType: true, pdfFileSize: true,
        docFileName: true, docFileType: true, docFileSize: true,
        xlsFileName: true, xlsFileType: true, xlsFileSize: true,
        uploadedBy: true, createdAt: true, updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    })
    return withCors(NextResponse.json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: rows.map((r: any) => ({
        id: r.id,
        level: r.level,
        title: r.title,
        pdf: r.pdfFileName ? { fileName: r.pdfFileName, fileType: r.pdfFileType ?? '', fileSize: r.pdfFileSize ?? 0 } : null,
        doc: r.docFileName ? { fileName: r.docFileName, fileType: r.docFileType ?? '', fileSize: r.docFileSize ?? 0 } : null,
        xls: r.xlsFileName ? { fileName: r.xlsFileName, fileType: r.xlsFileType ?? '', fileSize: r.xlsFileSize ?? 0 } : null,
        uploadedBy: r.uploadedBy ?? '',
        uploadedAt: r.updatedAt.toISOString(),
      })),
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[curriculum.GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (!canWrite(auth.role)) {
      return withCors(NextResponse.json({ error: 'Only staff can upload curriculum.' }, { status: 403 }), origin)
    }
    const form = await req.formData()
    const id = String(form.get('id') ?? '').trim()
    const level = String(form.get('level') ?? '').trim()
    const title = String(form.get('title') ?? '').trim()
    if (!id || !level || !title) {
      return withCors(NextResponse.json({ error: 'id, level, and title are required.' }, { status: 400 }), origin)
    }
    const pdfFile = form.get('pdfFile')
    const docFile = form.get('docFile')
    const xlsFile = form.get('xlsFile')
    if (!(pdfFile instanceof File) && !(docFile instanceof File) && !(xlsFile instanceof File)) {
      return withCors(NextResponse.json({ error: 'At least one file (pdfFile / docFile / xlsFile) is required.' }, { status: 400 }), origin)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { id, level, title, uploadedBy: auth.email }
    async function fill(prefix: 'pdf' | 'doc' | 'xls', file: unknown) {
      if (!(file instanceof File)) return
      if (file.size > MAX_BYTES) {
        throw new Error(`${prefix.toUpperCase()} file is larger than 25 MB.`)
      }
      const buf = Buffer.from(await file.arrayBuffer())
      data[`${prefix}FileName`] = file.name
      data[`${prefix}FileType`] = file.type || 'application/octet-stream'
      data[`${prefix}FileSize`] = file.size
      data[`${prefix}FileData`] = buf
    }
    try {
      await fill('pdf', pdfFile)
      await fill('doc', docFile)
      await fill('xls', xlsFile)
    } catch (e) {
      return withCors(NextResponse.json({ error: (e as Error).message }, { status: 413 }), origin)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalCurriculum as any).upsert({
      where: { id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: data as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: data as any,
    })

    return withCors(NextResponse.json({
      item: {
        id: row.id,
        level: row.level,
        title: row.title,
        pdf: row.pdfFileName ? { fileName: row.pdfFileName, fileType: row.pdfFileType, fileSize: row.pdfFileSize } : null,
        doc: row.docFileName ? { fileName: row.docFileName, fileType: row.docFileType, fileSize: row.docFileSize } : null,
        xls: row.xlsFileName ? { fileName: row.xlsFileName, fileType: row.xlsFileType, fileSize: row.xlsFileSize } : null,
        uploadedBy: row.uploadedBy ?? '',
        uploadedAt: row.updatedAt.toISOString(),
      },
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[curriculum.POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
