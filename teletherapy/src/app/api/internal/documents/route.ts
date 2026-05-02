/**
 * GET /api/internal/documents
 *
 * Internal API consumed exclusively by the accounting hub.
 * Returns all Initial Evaluation and Progress Report documents,
 * merged with therapist (Staff) and patient info.
 *
 * Auth: Authorization: Bearer {INTERNAL_API_KEY}
 * Query params:
 *   documentType  INITIAL_EVALUATION | PROGRESS_REPORT (omit = both)
 *   staffId       filter by therapist Staff.id
 *   from          ISO date — uploadedAt >=
 *   to            ISO date — uploadedAt <=
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const VALID_TYPES = ['INITIAL_EVALUATION', 'PROGRESS_REPORT'] as const

function verifyKey(req: NextRequest): boolean {
  const key = process.env.INTERNAL_API_KEY
  if (!key) return false
  return req.headers.get('authorization') === `Bearer ${key}`
}

export async function GET(req: NextRequest) {
  if (!verifyKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const rawType = searchParams.get('documentType') ?? ''
  const staffIdFilter = searchParams.get('staffId') ?? ''
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      documentType: VALID_TYPES.includes(rawType as (typeof VALID_TYPES)[number])
        ? rawType
        : { in: ['INITIAL_EVALUATION', 'PROGRESS_REPORT'] },
    }
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(from)
      if (to)   where.createdAt.lte = new Date(to + 'T23:59:59.999Z')
    }

    const docs = await prisma.patientDocument.findMany({
      where,
      select: {
        id: true,
        patientId: true,
        patient: { select: { firstName: true, lastName: true, branch: true } },
        uploadedById: true,
        department: true,
        documentType: true,
        fileName: true,
        mimeType: true,
        description: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // Batch-load therapist accounts (with Staff info) for all uploaders
    const uploaderIds = [...new Set(docs.map(d => d.uploadedById))]
    const therapists = await prisma.therapistAccount.findMany({
      where: { id: { in: uploaderIds } },
      select: {
        id: true,
        staffId: true,
        staff: { select: { firstName: true, lastName: true, department: true, branch: true } },
      },
    })
    const therapistMap = new Map(therapists.map(t => [t.id, t]))

    // Optionally filter by therapist staffId
    const filteredDocs = staffIdFilter
      ? docs.filter(d => {
          const t = therapistMap.get(d.uploadedById)
          return t?.staffId === staffIdFilter
        })
      : docs

    const result = filteredDocs.map(doc => {
      const t = therapistMap.get(doc.uploadedById)
      return {
        id: doc.id,
        documentType: doc.documentType as string,
        patient: {
          id: doc.patientId,
          name: `${doc.patient.firstName} ${doc.patient.lastName}`.trim(),
          branch: doc.patient.branch ?? null,
        },
        therapist: t
          ? {
              staffId: t.staffId,
              name: `${t.staff.firstName} ${t.staff.lastName}`.trim(),
              department: t.staff.department as string,
              branch: t.staff.branch,
            }
          : null,
        department: doc.department,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        description: doc.description ?? null,
        uploadedAt: doc.createdAt.toISOString(),
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[internal/documents] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
