// Discharge certificates — list for a patient, and issue a new one.
//
//   GET  /api/patients/certificates?patientId=…   one patient's certificates
//   GET  /api/patients/certificates?counts=1      count per patient, for the CRM badge
//   POST /api/patients/certificates               issue one
//
// An issued certificate is STORED, not rebuilt on demand. A reprint a year
// later has to be the same piece of paper the family was handed, and the
// signatory list will have moved on by then.

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildDischargeCertificate, formatAwardDate } from '@/lib/discharge-certificate'
import { CERT_DIR, SIG_DIR, ensureCertDirs, readStored } from '@/lib/certificate-files'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)

  // Counts drive the CRM's Certificate column. Returned as a map rather than
  // rows so opening the directory doesn't pull every certificate record into
  // the browser.
  if (url.searchParams.get('counts')) {
    const grouped = await prisma.dischargeCertificate.groupBy({
      by: ['patientId'],
      _count: { _all: true },
    })
    const counts: Record<string, number> = {}
    for (const g of grouped) counts[g.patientId] = g._count._all
    return NextResponse.json({ counts })
  }

  const patientId = (url.searchParams.get('patientId') ?? '').trim()
  const rows = await prisma.dischargeCertificate.findMany({
    where: patientId ? { patientId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: patientId ? 100 : 500,
    select: {
      id: true, patientId: true, patientName: true, service: true,
      dischargeDate: true, awardedOn: true, therapistName: true,
      managerName: true, issuedByName: true, createdAt: true,
    },
  })
  return NextResponse.json({ certificates: rows })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const patientId = String(body.patientId ?? '').trim()
  const patientName = String(body.patientName ?? '').trim()
  const service = String(body.service ?? '').trim()
  const dischargeDate = String(body.dischargeDate ?? '').slice(0, 10)

  if (!patientId) return NextResponse.json({ error: 'Patient is required' }, { status: 400 })
  if (!patientName) return NextResponse.json({ error: 'Patient name is required' }, { status: 400 })
  if (!service) return NextResponse.json({ error: 'Service is required' }, { status: 400 })

  const awardedOn = formatAwardDate(dischargeDate)
  if (!awardedOn) {
    return NextResponse.json({ error: 'Discharge date must be a real date' }, { status: 400 })
  }

  // The patient must exist: the row carries a foreign key, and a certificate
  // for nobody is worse than an error.
  const patient = await prisma.patient.findUnique({
    where: { id: patientId }, select: { id: true },
  })
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  const pick = async (id: unknown) => {
    const sid = String(id ?? '').trim()
    if (!sid) return null
    return prisma.certificateSignatory.findUnique({ where: { id: sid } })
  }
  const therapist = await pick(body.therapistSignatoryId)
  const manager = await pick(body.managerSignatoryId)

  let pdf: Buffer
  try {
    pdf = await buildDischargeCertificate({
      patientName,
      service,
      awardedOn,
      therapistName: therapist?.name ?? '',
      // A signature missing from disk prints the name and a clear rule rather
      // than failing — see readStored().
      therapistSignature: await readStored(SIG_DIR, therapist?.signaturePath),
      managerName: manager?.name ?? '',
      managerSignature: await readStored(SIG_DIR, manager?.signaturePath),
    })
  } catch (err) {
    console.error('[certificates] build failed:', (err as Error).message)
    return NextResponse.json(
      { error: 'Could not build the certificate: ' + (err as Error).message },
      { status: 500 },
    )
  }

  await ensureCertDirs()
  const filePath = `cert-${patientId}-${Date.now()}.pdf`
  await fs.writeFile(path.join(CERT_DIR, filePath), pdf)

  const user = session.user as { name?: string | null; email?: string | null }
  // Printed names are copied onto the row, not referenced: the signatory list
  // is editable, what this certificate says is not.
  const row = await prisma.dischargeCertificate.create({
    data: {
      patientId,
      patientName,
      service,
      dischargeDate: new Date(`${dischargeDate}T00:00:00.000Z`),
      awardedOn,
      therapistName: therapist?.name ?? '',
      managerName: manager?.name ?? '',
      filePath,
      issuedByName: user?.name || user?.email || '',
    },
    select: {
      id: true, patientId: true, patientName: true, service: true,
      dischargeDate: true, awardedOn: true, therapistName: true,
      managerName: true, issuedByName: true, createdAt: true,
    },
  })

  return NextResponse.json({ certificate: row })
}
