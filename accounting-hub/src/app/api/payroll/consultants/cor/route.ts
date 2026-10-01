import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

// POST /api/payroll/consultants/cor { consultantId, corUrl }
// Records the consultant's BIR Certificate of Registration (2303). A consultant
// with a COR on file is expected to issue a Service Invoice every month — the
// Service Invoice tab sorts them to the top and enables the reminder buttons.
// Passing corUrl: null clears it (wrong file uploaded).
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { consultantId, corUrl } = await req.json()
    if (!consultantId) return NextResponse.json({ error: 'consultantId is required' }, { status: 400 })
    const consultant = await prisma.consultant.findUnique({ where: { id: consultantId }, select: { id: true } })
    if (!consultant) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 })
    const url = typeof corUrl === 'string' && corUrl.trim() ? corUrl.trim() : null
    const updated = await prisma.consultant.update({
      where: { id: consultantId },
      data: { corUrl: url, corUploadedAt: url ? new Date() : null },
      select: { id: true, corUrl: true, corUploadedAt: true },
    })
    return NextResponse.json(updated)
  } catch (e) {
    console.error('Consultant COR save error:', e)
    return NextResponse.json({ error: 'Failed to save COR' }, { status: 500 })
  }
}
