import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionDoctor } from '@/lib/auth'
import { doctorSchemaFor, DOCTOR_DOC_LABEL, type DoctorDocType } from '@/lib/forms/doctor-schemas'
import { generateFormPdf } from '@/lib/forms/pdf'
import { notify } from '@/lib/notify'

const TYPES: DoctorDocType[] = ['MD_INITIAL', 'MD_FOLLOWUP', 'MED_CERT', 'PRESCRIPTION']

// POST — create/update an MD document; finalize generates the Nickel PDF.
export async function POST(req: NextRequest) {
  const doctor = await getSessionDoctor()
  if (!doctor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { id?: string; consultId?: string; type?: string; data?: Record<string, unknown>; finalize?: boolean; file?: string; source?: string }

  const type = String(b.type ?? '') as DoctorDocType
  if (!TYPES.includes(type)) return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })

  // Resolve the patient from the consult (or an existing doc).
  let patientId: string | null = null
  let consultId: string | null = b.consultId ?? null
  if (b.consultId) {
    const c = await prisma.consult.findFirst({ where: { id: b.consultId, doctorId: doctor.id }, select: { patientId: true } })
    if (!c) return NextResponse.json({ error: 'Consult not found' }, { status: 404 })
    patientId = c.patientId
  } else if (b.id) {
    const ex = await prisma.sessionDocument.findFirst({ where: { id: b.id, doctorId: doctor.id }, select: { patientId: true, consultId: true } })
    patientId = ex?.patientId ?? null
    consultId = ex?.consultId ?? null
  }
  if (!patientId) return NextResponse.json({ error: 'Missing consult/patient' }, { status: 400 })

  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { firstName: true, lastName: true, dob: true } })
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  const uploaded = typeof b.file === 'string' && b.file.startsWith('data:') ? b.file : null
  if (uploaded && uploaded.length > 12_000_000) return NextResponse.json({ error: 'File too large (max ~9 MB).' }, { status: 413 })

  let file: string | null = uploaded
  if (b.finalize && !uploaded) {
    const schema = doctorSchemaFor(type)
    file = await generateFormPdf(schema, b.data ?? {}, {
      patientName: `${patient.firstName} ${patient.lastName}`,
      patientDob: patient.dob ? patient.dob.toISOString().slice(0, 10) : null,
      therapistName: `Dr. ${doctor.firstName} ${doctor.lastName}${doctor.postNominals ? `, ${doctor.postNominals}` : ''}`,
      license: doctor.prcNumber,
      ptr: doctor.ptrNumber,
      signature: doctor.signature, // e-sig auto-filled on every MD document
      preparedByLabel: 'Physician:',
      generatedOn: new Date().toISOString().slice(0, 10),
    })
  }

  const source = uploaded ? (b.source === 'PHOTO' ? 'PHOTO' : 'UPLOAD') : 'FORM'
  const status = b.finalize || uploaded ? 'COMPLETED' : 'DRAFT'
  const payload = { patientId, doctorId: doctor.id, consultId, type: type as never, data: (b.data ?? {}) as never, source: source as never, status: status as never, ...(file ? { file } : {}) }

  let doc
  if (b.id) doc = await prisma.sessionDocument.update({ where: { id: b.id }, data: payload })
  else doc = await prisma.sessionDocument.create({ data: payload })

  if (status === 'COMPLETED') {
    await notify({ to: 'PATIENT', patientId, consultId, type: 'DOC_READY', title: `${DOCTOR_DOC_LABEL[type]} ready`, body: `Dr. ${doctor.lastName} shared your ${DOCTOR_DOC_LABEL[type].toLowerCase()}. Open My bookings to view it.` })
  }
  return NextResponse.json({ ok: true, id: doc.id, status: doc.status, hasFile: !!doc.file })
}
