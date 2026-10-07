import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

// POST /api/payroll/consultants/cor { consultantId, corUrl } — records the
// consultant's BIR Certificate of Registration (2303). A consultant with a COR
// on file is expected to issue a Service Invoice every month — the Service
// Invoice tab sorts them to the top and enables the reminder buttons.
// Passing corUrl: null clears it (wrong file uploaded).
// POST { consultantId, no2303: true|false } — marks the consultant as NOT
// BIR-registered (they have no 2303, so there is no Service Invoice to chase);
// false undoes it. Uploading a COR clears the mark — the COR IS the 2303.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { consultantId, corUrl, no2303 } = await req.json()
    if (!consultantId) return NextResponse.json({ error: 'consultantId is required' }, { status: 400 })
    const consultant = await prisma.consultant.findUnique({ where: { id: consultantId }, select: { id: true } })
    if (!consultant) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 })

    if (no2303 !== undefined) {
      const updated = await prisma.consultant.update({
        where: { id: consultantId },
        data: { no2303At: no2303 ? new Date() : null },
        select: { id: true, corUrl: true, corUploadedAt: true, no2303At: true },
      })
      return NextResponse.json(updated)
    }

    const url = typeof corUrl === 'string' && corUrl.trim() ? corUrl.trim() : null
    const updated = await prisma.consultant.update({
      where: { id: consultantId },
      data: { corUrl: url, corUploadedAt: url ? new Date() : null, ...(url ? { no2303At: null } : {}) },
      select: { id: true, corUrl: true, corUploadedAt: true, no2303At: true },
    })
    return NextResponse.json(updated)
  } catch (e) {
    console.error('Consultant COR save error:', e)
    return NextResponse.json({ error: 'Failed to save COR' }, { status: 500 })
  }
}
