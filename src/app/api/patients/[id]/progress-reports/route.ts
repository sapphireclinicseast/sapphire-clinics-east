// GET /api/patients/[id]/progress-reports — used by Patient Profile page.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const docs = await prisma.patientDocument.findMany({
    where: { patientId: id, documentType: 'PROGRESS_REPORT' },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    docs: docs.map(d => ({
      id: d.id,
      fileName: d.fileName,
      mimeType: d.mimeType,
      department: d.department,
      createdAt: d.createdAt,
      informedFrontDeskAt: d.informedFrontDeskAt,
      paidForAt: d.paidForAt,
      emailedToPatientAt: d.emailedToPatientAt,
    })),
  })
}
