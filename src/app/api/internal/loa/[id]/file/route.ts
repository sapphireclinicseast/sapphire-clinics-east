// GET /api/internal/loa/[id]/file — LOA document for the Accounting Hub.
//
// Same cross-hub contract as /api/internal/loa: EXTERNAL_API_KEY bearer, no
// session. The Accounting Hub applies its own roles and branch scoping before
// proxying here (the row's branch is echoed in x-loa-branch so the proxy can
// enforce its locked-branch roles). Files live in uploads/loa/, which the
// public /api/uploads route deliberately cannot reach.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { readFile } from 'fs/promises'
import path from 'path'

const API_KEY = process.env.EXTERNAL_API_KEY || ''

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const loa = await prisma.loaSubmission.findUnique({
    where: { id },
    select: {
      id: true, branch: true, fileUrl: true, fileMime: true, hmoName: true,
      patientName: true, patient: { select: { firstName: true, lastName: true } },
    },
  })
  if (!loa) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!loa.fileUrl) return NextResponse.json({ error: 'No document uploaded yet' }, { status: 404 })

  const stored = path.basename(loa.fileUrl)
  const filePath = path.join(process.cwd(), 'uploads', 'loa', stored)
  let data: Buffer
  try {
    data = await readFile(filePath)
  } catch {
    return NextResponse.json({ error: 'File missing on disk' }, { status: 404 })
  }

  const ext = stored.split('.').pop()?.toLowerCase() ?? ''
  const mime = loa.fileMime
    ?? (ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg')
  const who = loa.patient ? `${loa.patient.lastName}-${loa.patient.firstName}` : (loa.patientName ?? 'patient')
  const safeName = `LOA-${who}-${loa.hmoName}`.replace(/[^A-Za-z0-9\-_]+/g, '-').replace(/-+/g, '-')

  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(data.length),
      'Content-Disposition': `inline; filename="${safeName}.${ext || 'jpg'}"`,
      'x-loa-branch': loa.branch,
      'Cache-Control': 'private, no-store',
    },
  })
}
