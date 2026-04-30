import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// All Progress Reports for a single patient — used by the marketing-hub
// Patient Profile page. Returns docs in chronological order, each with
// status indicators (informed, paid, emailed) and timestamps.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: patientId } = await params

  // @ts-ignore — patientDocument
  const docs = await prisma.patientDocument.findMany({
    where: { patientId, documentType: 'PROGRESS_REPORT' },
    select: {
      id: true,
      fileName: true,
      filePath: true,
      mimeType: true,
      department: true,
      description: true,
      createdAt: true,
      informedFrontDeskAt: true,
      paidForAt: true,
      emailedToPatientAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ documents: docs })
}
