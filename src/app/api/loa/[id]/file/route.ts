// GET /api/loa/[id]/file — download the uploaded LOA (front desk prints it)
//
// LOA documents are NOT served through /api/uploads/[filename]: that route is
// deliberately public (Meta has to fetch post images through it) and would hand
// an insurance document to anyone who guessed the name. These files are written
// to uploads/loa/ instead, which that route cannot reach — it collapses its
// argument with path.basename — so this is the only way in, and it checks the
// session and the caller's branch first.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { LOA_READ_ROLES, LOA_WRITE_ROLES, loaBranchScope } from '@/lib/loa-access'

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
])
const MAX_BYTES = 20 * 1024 * 1024

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!LOA_READ_ROLES.includes(role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const loa = await prisma.loaSubmission.findUnique({
    where: { id },
    select: {
      id: true, branch: true, fileUrl: true, fileMime: true, idFileUrl: true, idFileMime: true, hmoName: true,
      patientName: true, patient: { select: { firstName: true, lastName: true } },
    },
  })
  if (!loa) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { branch: locked, forced } = loaBranchScope(role, null)
  if (forced && loa.branch !== locked)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ?doc=id serves the valid ID instead of the letter. Same route, so the
  // branch and role checks above cover both — a second route would be a second
  // place for that guard to be forgotten.
  const wantsId = req.nextUrl.searchParams.get('doc') === 'id'
  const sourceUrl = wantsId ? loa.idFileUrl : loa.fileUrl
  if (!sourceUrl) {
    return NextResponse.json(
      { error: wantsId ? 'No ID uploaded for this letter' : 'No document uploaded yet' },
      { status: 404 },
    )
  }

  const stored = path.basename(sourceUrl)
  const filePath = path.join(process.cwd(), 'uploads', 'loa', stored)

  let data: Buffer
  try {
    data = await readFile(filePath)
  } catch {
    return NextResponse.json({ error: 'File missing on disk' }, { status: 404 })
  }

  const ext = stored.split('.').pop()?.toLowerCase() ?? ''
  const mime = (wantsId ? loa.idFileMime : loa.fileMime)
    ?? (ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg')

  // A readable filename so a printed stack is sortable by patient and provider.
  const who = loa.patient ? `${loa.patient.lastName}-${loa.patient.firstName}` : (loa.patientName ?? 'patient')
  const safeName = `LOA-${who}-${loa.hmoName}`.replace(/[^A-Za-z0-9\-_]+/g, '-').replace(/-+/g, '-')
  // ?view=1 opens it in a tab to eyeball; the default downloads it to print.
  const disposition = req.nextUrl.searchParams.get('view') ? 'inline' : 'attachment'

  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(data.length),
      'Content-Disposition': `${disposition}; filename="${safeName}.${ext || 'jpg'}"`,
      // Never cache a patient document in a shared browser or proxy.
      'Cache-Control': 'private, no-store',
    },
  })
}

// POST /api/loa/[id]/file — front desk uploads the document themselves.
//
// The QR is for when the patient has the letter on their phone; often they hand
// over a printout or forward an email at the desk instead, and making staff
// generate a link to upload a file they are already holding would be silly.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!LOA_WRITE_ROLES.includes(role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const loa = await prisma.loaSubmission.findUnique({
    where: { id },
    select: { id: true, branch: true, fileUrl: true },
  })
  if (!loa) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { branch: locked, forced } = loaBranchScope(role, null)
  if (forced && loa.branch !== locked)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let form: FormData
  try { form = await req.formData() } catch {
    return NextResponse.json({ error: 'Failed to parse upload' }, { status: 400 })
  }

  const file = form.get('file') as File | null
  if (!file || file.size === 0)
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 413 })

  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED_MIME.has(mime))
    return NextResponse.json({ error: 'Unsupported file type. Please use JPEG, PNG or PDF.' }, { status: 400 })

  const ext = mime === 'application/pdf' ? '.pdf'
    : mime === 'image/png' ? '.png'
    : mime === 'image/webp' ? '.webp'
    : '.jpg'

  const filename = `loa-${crypto.randomBytes(16).toString('hex')}${ext}`
  const uploadDir = path.join(process.cwd(), 'uploads', 'loa')
  await mkdir(uploadDir, { recursive: true })
  await writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()))

  if (loa.fileUrl) {
    const old = path.basename(loa.fileUrl)
    if (old && old !== filename) await unlink(path.join(uploadDir, old)).catch(() => {})
  }

  const updated = await prisma.loaSubmission.update({
    where: { id },
    data: { fileUrl: filename, fileMime: mime, status: 'SUBMITTED' },
    select: { id: true, fileUrl: true, fileMime: true, status: true },
  })
  return NextResponse.json(updated)
}
