// GET /api/patients/[id]/documents — all teletherapy-uploaded patient docs
// (Progress Reports, Initial Evaluations, Other Documents) grouped by type.
// The Patient Profile uses this to render a unified Documents card.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface DocOut {
  id: string
  fileName: string
  mimeType: string | null
  department: string
  createdAt: Date
  informedFrontDeskAt: Date | null
  paidForAt: Date | null
  emailedToPatientAt: Date | null
  description: string | null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const allDocs = await prisma.patientDocument.findMany({
    where: { patientId: id },
    orderBy: { createdAt: 'desc' },
  })

  function project(d: typeof allDocs[number]): DocOut {
    return {
      id: d.id,
      fileName: d.fileName,
      mimeType: d.mimeType,
      department: d.department,
      createdAt: d.createdAt,
      informedFrontDeskAt: d.informedFrontDeskAt,
      paidForAt: d.paidForAt,
      emailedToPatientAt: d.emailedToPatientAt,
      description: d.description,
    }
  }

  return NextResponse.json({
    progressReports: allDocs.filter(d => d.documentType === 'PROGRESS_REPORT').map(project),
    initialEvaluations: allDocs.filter(d => d.documentType === 'INITIAL_EVALUATION').map(project),
    otherDocuments: allDocs.filter(d => d.documentType === 'OTHER_DOCUMENT').map(project),
  })
}
