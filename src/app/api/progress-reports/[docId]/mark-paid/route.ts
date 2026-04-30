import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = new Set([
  'SBEA_FRONT_DESK', 'SBGH_FRONT_DESK',
  'SBEA_ADMIN', 'SBGH_ADMIN', 'SUPER_ADMIN',
])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: 'Front desk role required' }, { status: 403 })
  }

  const { docId } = await params
  const { paid } = await req.json().catch(() => ({ paid: true }))

  // @ts-ignore
  const doc = await prisma.patientDocument.findUnique({ where: { id: docId } })
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (doc.documentType !== 'PROGRESS_REPORT') {
    return NextResponse.json({ error: 'Not a progress report' }, { status: 400 })
  }

  // @ts-ignore
  const updated = await prisma.patientDocument.update({
    where: { id: docId },
    data: paid === false
      ? { paidForAt: null, paidById: null }
      : { paidForAt: new Date(), paidById: user.id ?? user.email ?? null },
  })

  return NextResponse.json({
    success: true,
    paidForAt: updated.paidForAt,
  })
}
