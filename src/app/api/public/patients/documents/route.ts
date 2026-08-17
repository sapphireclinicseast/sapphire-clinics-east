// GET /api/public/patients/documents?token=…&department=OT
// The signed-in patient's own clinical documents (uploaded by their therapist),
// grouped by type. Optional ?department= filters to one department (e.g. OT).
// File contents are served separately by /documents/[id]/file.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { preflight, withCors } from '../../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

interface DocRow {
  id: string
  fileName: string
  documentType: string
  department: string
  description: string | null
  createdAt: string
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const url = new URL(req.url)
  const token = url.searchParams.get('token') ?? ''
  const department = (url.searchParams.get('department') ?? '').toUpperCase().trim()
  const session = verifyPatientToken(token)
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  const docs = await prisma.patientDocument.findMany({
    where: {
      patientId: session.patientId,
      ...(department ? { department } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, fileName: true, documentType: true, department: true,
      description: true, createdAt: true,
    },
  })

  const project = (d: (typeof docs)[number]): DocRow => ({
    id: d.id,
    fileName: d.fileName,
    documentType: d.documentType,
    department: d.department,
    description: d.description ?? null,
    createdAt: d.createdAt.toISOString(),
  })

  return withCors(
    NextResponse.json({
      initialEvaluations: docs.filter((d) => d.documentType === 'INITIAL_EVALUATION').map(project),
      progressReports: docs.filter((d) => d.documentType === 'PROGRESS_REPORT').map(project),
      otherDocuments: docs.filter((d) => d.documentType === 'OTHER_DOCUMENT').map(project),
      total: docs.length,
    }),
    origin,
  )
}
