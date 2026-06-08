// GET   /api/public/admission?code=<access>&branch=EAST|GREENHILLS|ALL
// PATCH /api/public/admission?code=<access>
//
// Public endpoints gated by an access code (default "scei") instead of a
// class-portal JWT. Built for the partner school to view + update LIS
// status + remittance status across both branches from a single page
// (/admission).
//
// The PATCH body accepts only the two admission-tracking fields — anyone
// with the code cannot edit student identity, enrollment data, or payments.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCors, corsHeaders } from '../_cors'

const ACCESS_CODE = process.env.ADMISSION_ACCESS_CODE || 'scei'

const LIS_VALUES = ['WAITING_FOR_ENROLLMENT', 'PENDING_ENROLLMENT', 'PENDING_TRANSFER', 'ENROLLED'] as const
const REMIT_VALUES = ['PENDING', 'PAID'] as const
const LSEN_VALUES = [
  'A_VISUAL_IMPAIRMENT', 'A_HEARING_IMPAIRMENT', 'A_LEARNING_DISABILITY',
  'A_INTELLECTUAL_DISABILITY', 'A_AUTISM_SPECTRUM_DISORDER', 'A_EMOTIONAL_BEHAVIORAL_DISORDER',
  'A_ORTHOPEDIC_PHYSICAL_HANDICAP', 'A_SPEECH_LANGUAGE_DISORDER', 'A_CEREBRAL_PALSY',
  'A_SPECIAL_HEALTH_CHRONIC_DISEASE', 'A_MULTIPLE_DISABILITIES',
  'B_DIFFICULTY_SEEING', 'B_DIFFICULTY_HEARING', 'B_DIFFICULTY_BASIC_LEARNING',
  'B_DIFFICULTY_REMEMBERING_CONCENTRATING', 'B_DIFFICULTY_APPLYING_ADAPTIVE_SKILLS',
  'B_DIFFICULTY_INTERPERSONAL_BEHAVIOR', 'B_DIFFICULTY_MOBILITY', 'B_DIFFICULTY_COMMUNICATING',
] as const

function checkCode(req: Request): boolean {
  const url = new URL(req.url)
  const fromQuery = url.searchParams.get('code')
  const fromHeader = req.headers.get('x-admission-code')
  return (fromQuery === ACCESS_CODE) || (fromHeader === ACCESS_CODE)
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  if (!checkCode(req)) {
    return withCors(NextResponse.json({ error: 'Invalid access code.' }, { status: 401 }), origin)
  }
  const url = new URL(req.url)
  const branchFilter = url.searchParams.get('branch')?.toUpperCase()

  try {
    // Restrict to STUDENT rows that:
    //   - aren't soft-disabled (admin disabled the account; they should
    //     not show up in the partner-school tracker at all), AND
    //   - have at least one CONVERTED ClassPortalFrontDeskPayment row
    //     (i.e. the cashier has confirmed tuition payment in the
    //     accounting hub). Unpaid / pending students are intentionally
    //     hidden — the partner school only tracks admission for those
    //     who actually paid.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paidRows = await (prisma.classPortalFrontDeskPayment as any).findMany({
      where: { status: 'CONVERTED' },
      distinct: ['studentId'],
      select: { studentId: true },
    })
    const paidStudentIds: string[] = paidRows.map((r: { studentId: string }) => r.studentId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      role: 'STUDENT',
      disabledAt: null,
      id: { in: paidStudentIds },
    }
    if (branchFilter === 'EAST' || branchFilter === 'GREENHILLS') {
      where.branch = branchFilter
    }
    const rows = paidStudentIds.length === 0
      ? []
      : await prisma.classPortalUser.findMany({
          where,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        })

    // Pull document-blob keys for every student in one query so the
    // /admission table can render an up/down indicator per slot.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blobs = await (prisma.classPortalDocumentBlob as any).findMany({
      where: { studentId: { in: rows.map((r: { id: string }) => r.id) } },
      select: { studentId: true, docKey: true, fileName: true, fileSize: true, fileType: true, updatedAt: true },
    }).catch(() => [] as Array<{ studentId: string; docKey: string; fileName: string; fileSize: number; fileType: string; updatedAt: Date }>)
    const blobsByStudent = new Map<string, Array<{ docKey: string; fileName: string; fileSize: number; fileType: string; updatedAt: string }>>()
    for (const b of blobs) {
      const list = blobsByStudent.get(b.studentId) ?? []
      list.push({
        docKey: b.docKey,
        fileName: b.fileName,
        fileSize: b.fileSize,
        fileType: b.fileType,
        updatedAt: b.updatedAt instanceof Date ? b.updatedAt.toISOString() : String(b.updatedAt),
      })
      blobsByStudent.set(b.studentId, list)
    }

    // Trim heavy fields from the bulk response. The base64-encoded
    // `certSignatureDataUrl` is ~400 KB per student — six students
    // ballooned the payload to 700 KB and made the partner-school
    // tracker take 6+ seconds to load, with most users perceiving
    // it as "stuck". The signature is only needed for the per-student
    // PDF rebuild; the dedicated single-student endpoint below ships
    // it on demand when the partner clicks "View" / "Download" PDF.
    function trimEnrollmentForList(e: Record<string, unknown>): Record<string, unknown> {
      // Shallow copy + delete the heavy keys. Other base64 data URLs
      // can be added here if they show up in future enrollments.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { certSignatureDataUrl: _omit, ...rest } = e as { certSignatureDataUrl?: string } & Record<string, unknown>
      return rest
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const students = rows.map((r: any) => {
      const e = (r.enrollment ?? {}) as Record<string, unknown>
      const father = (e.father ?? {}) as Record<string, string>
      const mother = (e.mother ?? {}) as Record<string, string>
      const guardian = (e.guardian ?? {}) as Record<string, string>
      const fatherName = [father.lastName, father.firstName, father.middleName].filter(Boolean).join(', ')
      const motherName = [mother.lastName, mother.firstName, mother.middleName].filter(Boolean).join(', ')
      const guardianName = [guardian.lastName, guardian.firstName, guardian.middleName].filter(Boolean).join(', ')

      return {
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        branch: r.branch,
        level: r.level,
        // Full enrollment surface for the partner-school view:
        schoolYear: e.schoolYearFrom && e.schoolYearTo ? `${e.schoolYearFrom}–${e.schoolYearTo}` : null,
        lrnStatus: (e.lrnStatus as string) ?? null,
        lrn: (e.lrn as string) ?? null,
        psaBirthCertNo: (e.psaBirthCertNo as string) ?? null,
        middleName: (e.middleName as string) ?? null,
        extensionName: (e.extensionName as string) ?? null,
        dob: (e.dob as string) ?? null,
        sex: (e.sex as string) ?? null,
        ipMember: (e.ipMember as string) ?? null,
        ipCommunity: (e.ipCommunity as string) ?? null,
        motherTongue: (e.motherTongue as string) ?? null,
        religion: (e.religion as string) ?? null,
        nationality: (e.nationality as string) ?? null,
        diagnosis: (e.diagnosis as string) ?? null,
        pwdIdNumber: (e.pwdIdNumber as string) ?? null,
        lsenClassification: (e.lsenClassification as string) ?? null,
        houseStreet: (e.houseStreet as string) ?? null,
        barangay: (e.barangay as string) ?? null,
        cityProvinceCountry: (e.cityProvinceCountry as string) ?? null,
        zipCode: (e.zipCode as string) ?? null,
        fatherName,
        fatherOccupation: (e.fatherOccupation as string) ?? null,
        motherName,
        motherOccupation: (e.motherOccupation as string) ?? null,
        guardianName,
        guardianOfRecord: (e.guardianOfRecord as string) ?? null,
        telephone: (e.telephone as string) ?? null,
        cellphone: (e.cellphone as string) ?? null,
        isReturningOrTransferee: (e.isReturningOrTransferee as string) ?? null,
        lastGradeCompleted: (e.lastGradeCompleted as string) ?? null,
        lastSchoolYearCompleted: (e.lastSchoolYearCompleted as string) ?? null,
        previousSchoolName: (e.previousSchoolName as string) ?? null,
        previousSchoolId: (e.previousSchoolId as string) ?? null,
        previousSchoolAddress: (e.previousSchoolAddress as string) ?? null,
        // Tracker columns:
        lisStatus: (e.lisStatus as string) ?? null,
        remittanceStatus: (e.remittanceStatus as string) ?? null,
        admissionComments: (e.admissionComments as string) ?? null,
        // Trimmed enrollment blob for the table view. The signature
        // data URL is fetched on demand via /api/public/admission/enrollment.
        enrollment: trimEnrollmentForList(e),
        // Server-side document blobs available for download.
        documentBlobs: blobsByStudent.get(r.id) ?? [],
        // Local-only docs metadata (whether the parent uploaded into
        // IndexedDB; useful as a fallback indicator).
        documentsMeta: (e.documents ?? {}) as Record<string, { name: string; size: number; type?: string; fileId?: string }>,
        // Waiver signed timestamp
        waiverSignedAt: (e.waiverSignedAt as string) ?? null,
        createdAt: r.createdAt.toISOString(),
      }
    })
    return withCors(NextResponse.json({ students }), origin)
  } catch (e) {
    console.error('[admission GET]', e)
    return withCors(NextResponse.json({ error: 'Server error' }, { status: 500 }), origin)
  }
}

export async function PATCH(req: Request) {
  const origin = req.headers.get('origin')
  if (!checkCode(req)) {
    return withCors(NextResponse.json({ error: 'Invalid access code.' }, { status: 401 }), origin)
  }
  let body: { studentId?: string; lisStatus?: string | null; remittanceStatus?: string | null; admissionComments?: string | null; lsenClassification?: string | null }
  try { body = await req.json() } catch {
    return withCors(NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }), origin)
  }
  if (!body.studentId) {
    return withCors(NextResponse.json({ error: 'studentId required' }, { status: 400 }), origin)
  }

  // Whitelist the admission columns; anything else is silently dropped.
  const patch: Record<string, string | null> = {}
  if (body.lisStatus === null || (typeof body.lisStatus === 'string' && (LIS_VALUES as readonly string[]).includes(body.lisStatus))) {
    patch.lisStatus = body.lisStatus
  } else if (body.lisStatus !== undefined) {
    return withCors(NextResponse.json({ error: 'Invalid lisStatus' }, { status: 400 }), origin)
  }
  if (body.remittanceStatus === null || (typeof body.remittanceStatus === 'string' && (REMIT_VALUES as readonly string[]).includes(body.remittanceStatus))) {
    patch.remittanceStatus = body.remittanceStatus
  } else if (body.remittanceStatus !== undefined) {
    return withCors(NextResponse.json({ error: 'Invalid remittanceStatus' }, { status: 400 }), origin)
  }
  if (body.admissionComments !== undefined) {
    if (body.admissionComments === null) {
      patch.admissionComments = null
    } else if (typeof body.admissionComments === 'string') {
      patch.admissionComments = body.admissionComments.slice(0, 2000)
    } else {
      return withCors(NextResponse.json({ error: 'Invalid admissionComments' }, { status: 400 }), origin)
    }
  }
  if (body.lsenClassification === null || (typeof body.lsenClassification === 'string' && (LSEN_VALUES as readonly string[]).includes(body.lsenClassification))) {
    patch.lsenClassification = body.lsenClassification
  } else if (body.lsenClassification !== undefined) {
    return withCors(NextResponse.json({ error: 'Invalid lsenClassification' }, { status: 400 }), origin)
  }
  if (Object.keys(patch).length === 0) {
    return withCors(NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 }), origin)
  }

  try {
    const existing = await prisma.classPortalUser.findUnique({ where: { id: body.studentId } })
    if (!existing) {
      return withCors(NextResponse.json({ error: 'Student not found' }, { status: 404 }), origin)
    }
    const enrollment = { ...((existing.enrollment as Record<string, unknown>) ?? {}), ...patch }
    const updated = await prisma.classPortalUser.update({
      where: { id: body.studentId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { enrollment: enrollment as any },
    })
    const e = (updated.enrollment ?? {}) as Record<string, unknown>
    return withCors(NextResponse.json({
      student: {
        id: updated.id,
        lisStatus: (e.lisStatus as string) ?? null,
        remittanceStatus: (e.remittanceStatus as string) ?? null,
        admissionComments: (e.admissionComments as string) ?? null,
        lsenClassification: (e.lsenClassification as string) ?? null,
      },
    }), origin)
  } catch (e) {
    console.error('[admission PATCH]', e)
    return withCors(NextResponse.json({ error: 'Server error' }, { status: 500 }), origin)
  }
}
