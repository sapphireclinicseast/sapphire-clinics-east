// POST /api/loa-form — the standing public LOA form submits here.
//
// Public and unauthenticated: this is the form behind the permanent link/QR the
// clinic hands out, so there is no token to check. The patient identifies
// themselves by picking their record from /api/loa-form/patients, which is why
// front desk must create the patient in the CRM first.
//
// Everything the form sends is validated against the clinic's own lists —
// nothing arriving here is trusted as typed.

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

// Same shape of limiter as the search route — an open submit endpoint should
// not accept an unbounded stream of uploads from one source.
const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_WINDOW = 12
const hits = new Map<string, { count: number; resetAt: number }>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const rec = hits.get(ip)
  if (!rec || now > rec.resetAt) { hits.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return false }
  rec.count += 1
  return rec.count > MAX_PER_WINDOW
}

// GET — the pickers the form renders. Lists only; no patient data.
export async function GET() {
  const [hmos, services, branches] = await Promise.all([
    prisma.hmoProvider.findMany({
      where: { active: true },
      // Alphabetical — a patient hunting for their HMO in a 20-long dropdown
      // needs it where they expect it, and creation order tells them nothing.
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    // Services keep sortOrder: that IS a meaningful order (OT, PT, SLP…),
    // set deliberately rather than by when the row was made.
    prisma.loaServiceOption.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    getBranchOptions(),
  ])
  return NextResponse.json({ hmos, services, branches })
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip') || 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 })
  }

  let form: FormData
  try { form = await req.formData() } catch {
    return NextResponse.json({ error: 'Failed to parse the form' }, { status: 400 })
  }

  // ── Patient — must be an existing record, chosen from the search ──
  const patientId = form.get('patientId')
  if (typeof patientId !== 'string' || !patientId.trim())
    return NextResponse.json({ error: 'Please find and select your name first.' }, { status: 400 })
  const patient = await prisma.patient.findUnique({
    where: { id: patientId.trim() },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!patient)
    return NextResponse.json({
      error: 'We could not find that patient record. Please search for your name again, or ask the clinic front desk to register you first.',
    }, { status: 404 })

  // ── HMO ──
  const hmoRaw = form.get('hmoName')
  if (typeof hmoRaw !== 'string' || !hmoRaw.trim())
    return NextResponse.json({ error: 'Please choose your HMO.' }, { status: 400 })
  const hmo = await prisma.hmoProvider.findUnique({ where: { name: hmoRaw.trim() } })
  if (!hmo) return NextResponse.json({ error: 'Unknown HMO' }, { status: 400 })

  // ── Branch ──
  const branchRaw = form.get('branch')
  if (typeof branchRaw !== 'string' || !branchRaw.trim())
    return NextResponse.json({ error: 'Please choose the clinic branch.' }, { status: 400 })
  const allowed = await getBranchOptions()
  if (!allowed.some(b => b.shortCode === branchRaw.trim()))
    return NextResponse.json({ error: 'Unknown branch' }, { status: 400 })

  // ── Services (optional, validated against the clinic's list) ──
  const servicesRaw = form.getAll('services').filter((v): v is string => typeof v === 'string')
  const services = servicesRaw.length
    ? (await prisma.loaServiceOption.findMany({
        where: { name: { in: servicesRaw } }, select: { name: true },
      })).map(s => s.name)
    : []

  // ── Date of approval ──
  let dateOfApproval: Date | null = null
  const dateRaw = form.get('dateOfApproval')
  if (typeof dateRaw === 'string' && dateRaw.trim()) {
    const d = new Date(dateRaw)
    if (!Number.isNaN(d.getTime())) dateOfApproval = d
  }

  // ── The document ──
  const file = form.get('file') as File | null
  if (!file || file.size === 0)
    return NextResponse.json({ error: 'Please attach a photo or PDF of your LOA.' }, { status: 400 })
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 413 })
  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED_MIME.has(mime))
    return NextResponse.json({ error: 'Unsupported file type. Please use a photo or a PDF.' }, { status: 400 })

  const ext = mime === 'application/pdf' ? '.pdf'
    : mime === 'image/png' ? '.png'
    : mime === 'image/webp' ? '.webp'
    : '.jpg'
  const filename = `loa-${crypto.randomBytes(16).toString('hex')}${ext}`
  const uploadDir = path.join(process.cwd(), 'uploads', 'loa')
  await fs.mkdir(uploadDir, { recursive: true })
  await fs.writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()))

  const created = await prisma.loaSubmission.create({
    data: {
      patientId: patient.id,
      patientName: `${patient.lastName}, ${patient.firstName}`,
      hmoName: hmo.name,
      branch: branchRaw.trim(),
      services,
      dateOfApproval,
      fileUrl: filename,
      fileMime: mime,
      status: 'SUBMITTED',
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
}
