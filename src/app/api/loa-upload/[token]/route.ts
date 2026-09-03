// Public endpoint — no auth (access controlled by the one-time token)
// GET  → verify the token, return what the patient needs to see
// POST → accept the file, attach it to the letter, mark the token used
//
// Mirrors /api/referral-upload/[token]. Files land in uploads/loa/ rather than
// uploads/, so the public /api/uploads/[filename] route cannot serve them —
// see /api/loa/[id]/file for the guarded way back out.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getBranchOptions } from '@/lib/branch-options'
import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
])
const MAX_BYTES = 20 * 1024 * 1024

async function resolveToken(token: string) {
  const record = await prisma.loaUploadToken.findUnique({
    where: { token },
    include: {
      loa: {
        select: {
          id: true, hmoName: true, branch: true, fileUrl: true, services: true,
          patientName: true, patient: { select: { firstName: true } },
        },
      },
    },
  })
  if (!record) return { error: 'Invalid or expired link', status: 404 as const }
  if (record.used) return { error: 'This link has already been used', status: 410 as const }
  if (record.expiresAt < new Date())
    return { error: 'This link has expired. Please ask the clinic for a new one.', status: 410 as const }
  return { record }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await resolveToken(token)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })

  const { loa } = result.record

  // The pickers travel with the page: the patient fills in the HMO, the branch,
  // the date and the services, so the form needs the same settings-managed
  // lists the clinic maintains — and the branch list still comes from HR Hub.
  const [hmos, services, branches] = await Promise.all([
    prisma.hmoProvider.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.loaServiceOption.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    getBranchOptions(),
  ])

  return NextResponse.json({
    firstName: loa.patient?.firstName ?? loa.patientName ?? '',
    // Anything the clinic already knew (a letter raised from a decked HMO slot
    // carries its branch) comes back as the starting value.
    hmoName: loa.hmoName === 'UNSPECIFIED' ? '' : loa.hmoName,
    branch: loa.branch || '',
    services: loa.services,
    hasExisting: !!loa.fileUrl,
    options: { hmos, services, branches },
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await resolveToken(token)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })

  const { record } = result
  const loaId = record.loa.id

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
    return NextResponse.json({ error: 'Unsupported file type. Please use a photo or a PDF.' }, { status: 400 })

  const ext = mime === 'application/pdf' ? '.pdf'
    : mime === 'image/png' ? '.png'
    : mime === 'image/webp' ? '.webp'
    : '.jpg'

  // Random name, not the letter id: the id travels in URLs and logs, and a
  // guessable filename is the one thing standing between uploads/loa and a
  // future route that serves the directory.
  const filename = `loa-${crypto.randomBytes(16).toString('hex')}${ext}`
  const uploadDir = path.join(process.cwd(), 'uploads', 'loa')
  await fs.mkdir(uploadDir, { recursive: true })
  await fs.writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()))

  // Replace an earlier document rather than leaving it orphaned on disk.
  if (record.loa.fileUrl) {
    const old = path.basename(record.loa.fileUrl)
    if (old && old !== filename) await fs.unlink(path.join(uploadDir, old)).catch(() => {})
  }

  const patch: Record<string, unknown> = {
    fileUrl: filename,
    fileMime: mime,
    status: 'SUBMITTED',
  }

  // The rest of the form. Values are validated against the clinic's own lists
  // rather than stored as typed: this endpoint is public, so a field arriving
  // here is whatever the sender chose to put in it.
  const hmoName = form.get('hmoName')
  if (typeof hmoName === 'string' && hmoName.trim()) {
    const known = await prisma.hmoProvider.findUnique({ where: { name: hmoName.trim() } })
    if (!known) return NextResponse.json({ error: 'Unknown HMO' }, { status: 400 })
    patch.hmoName = known.name
  }

  const branch = form.get('branch')
  if (typeof branch === 'string' && branch.trim()) {
    const allowed = await getBranchOptions()
    if (!allowed.some(b => b.shortCode === branch.trim()))
      return NextResponse.json({ error: 'Unknown branch' }, { status: 400 })
    patch.branch = branch.trim()
  }

  const servicesRaw = form.getAll('services').filter((v): v is string => typeof v === 'string')
  if (servicesRaw.length) {
    const known = await prisma.loaServiceOption.findMany({
      where: { name: { in: servicesRaw } }, select: { name: true },
    })
    patch.services = known.map(k => k.name)
  }

  const dateOfApproval = form.get('dateOfApproval')
  // Accept it if it parses, ignore it otherwise rather than failing the upload.
  if (typeof dateOfApproval === 'string' && dateOfApproval.trim()) {
    const d = new Date(dateOfApproval)
    if (!Number.isNaN(d.getTime())) patch.dateOfApproval = d
  }

  await prisma.$transaction([
    prisma.loaSubmission.update({ where: { id: loaId }, data: patch }),
    prisma.loaUploadToken.update({ where: { token }, data: { used: true } }),
  ])

  return NextResponse.json({ ok: true })
}
