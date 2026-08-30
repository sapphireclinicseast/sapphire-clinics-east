import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionProvider } from '@/lib/auth'
import { schemaFor, variantForAge, DOC_TYPE_LABEL, type DocType } from '@/lib/forms/schemas'
import { generateFormPdf } from '@/lib/forms/pdf'
import { notify } from '@/lib/notify'

const TYPES: DocType[] = ['INITIAL_EVAL', 'RE_EVAL', 'TREATMENT', 'PROGRESS_REPORT', 'HEP']

// GET /api/provider/document?bookingId=  — docs for a booking (or ?patientId=)
export async function GET(req: NextRequest) {
  const provider = await getSessionProvider()
  if (!provider) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const bookingId = req.nextUrl.searchParams.get('bookingId')
  const patientId = req.nextUrl.searchParams.get('patientId')
  const where = { providerId: provider.id, ...(bookingId ? { bookingId } : {}), ...(patientId ? { patientId } : {}) }
  const docs = await prisma.sessionDocument.findMany({ where, orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ documents: docs.map((d) => ({ id: d.id, type: d.type, variant: d.variant, status: d.status, source: d.source, hasFile: !!d.file, data: d.data, createdAt: d.createdAt })) })
}

// POST — create/update a form doc; finalize generates the Nickel PDF.
export async function POST(req: NextRequest) {
  const provider = await getSessionProvider()
  if (!provider) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { id?: string; bookingId?: string; type?: string; data?: Record<string, unknown>; finalize?: boolean; file?: string; source?: string }

  const type = String(b.type ?? '') as DocType
  if (!TYPES.includes(type)) return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })

  // Resolve the patient (from the booking, or an existing doc).
  let patientId: string | null = null
  if (b.bookingId) {
    const bk = await prisma.booking.findFirst({ where: { id: b.bookingId, providerId: provider.id }, select: { patientId: true } })
    if (!bk) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    patientId = bk.patientId
  } else if (b.id) {
    const ex = await prisma.sessionDocument.findFirst({ where: { id: b.id, providerId: provider.id }, select: { patientId: true } })
    patientId = ex?.patientId ?? null
  }
  if (!patientId) return NextResponse.json({ error: 'Missing booking/patient' }, { status: 400 })

  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { firstName: true, lastName: true, dob: true } })
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  const variant = type === 'PROGRESS_REPORT' || type === 'HEP' ? null : variantForAge(patient.dob)

  // Uploaded PDF / photo path (Phase 4) — accept a data URI directly.
  const uploaded = typeof b.file === 'string' && b.file.startsWith('data:') ? b.file : null
  if (uploaded && uploaded.length > 12_000_000) return NextResponse.json({ error: 'File too large (max ~9 MB).' }, { status: 413 })

  let file: string | null = uploaded
  if (b.finalize && !uploaded) {
    const schema = schemaFor(type, variant ?? 'ADULT')
    file = await generateFormPdf(schema, b.data ?? {}, {
      patientName: `${patient.firstName} ${patient.lastName}`,
      patientDob: patient.dob ? patient.dob.toISOString().slice(0, 10) : null,
      therapistName: `${provider.firstName} ${provider.lastName}${provider.postNominals ? `, ${provider.postNominals}` : ''}`,
      license: provider.prcNumber, signature: provider.signature,
      generatedOn: new Date().toISOString().slice(0, 10),
    })
  }

  const source = uploaded ? (b.source === 'PHOTO' ? 'PHOTO' : 'UPLOAD') : 'FORM'
  const status = b.finalize || uploaded ? 'COMPLETED' : 'DRAFT'
  const payload = { patientId, providerId: provider.id, bookingId: b.bookingId ?? null, type, variant: variant as never, data: (b.data ?? {}) as never, source: source as never, status: status as never, ...(file ? { file } : {}) }

  let doc
  if (b.id) doc = await prisma.sessionDocument.update({ where: { id: b.id }, data: payload })
  else doc = await prisma.sessionDocument.create({ data: payload })

  if (status === 'COMPLETED') {
    await notify({ to: 'PATIENT', patientId, bookingId: b.bookingId ?? null, type: 'DOC_READY', title: `${DOC_TYPE_LABEL[type]} ready`, body: `Your therapist shared your ${DOC_TYPE_LABEL[type].toLowerCase()}. Open My bookings to view it.` })
  }
  return NextResponse.json({ ok: true, id: doc.id, status: doc.status, hasFile: !!doc.file })
}
