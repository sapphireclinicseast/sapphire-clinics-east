import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Mark a Progress Report as "informed to front desk"
// This makes it appear in the marketing-hub front desk dashboard widget.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: patientId, docId } = await params

  // @ts-ignore
  const doc = await prisma.patientDocument.findUnique({ where: { id: docId } })
  if (!doc || doc.patientId !== patientId) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (doc.documentType !== 'PROGRESS_REPORT') {
    return NextResponse.json(
      { error: 'Only Progress Reports can be flagged for front desk' },
      { status: 400 }
    )
  }

  // Authorization: same department or admin
  const isAdmin = session.user.role === 'ADMIN'
  if (!isAdmin) {
    const account = await prisma.therapistAccount.findUnique({
      where: { id: session.user.id },
      include: { staff: { select: { department: true } } },
    })
    if (!account || account.staff.department !== doc.department) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // @ts-ignore
  const updated = await prisma.patientDocument.update({
    where: { id: docId },
    data: {
      informedFrontDeskAt: new Date(),
      informedById: session.user.id,
    },
  })

  return NextResponse.json({
    success: true,
    informedAt: updated.informedFrontDeskAt,
  })
}
