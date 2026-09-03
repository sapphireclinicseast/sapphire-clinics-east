// GET /api/internal/loa — LOA submissions for the Accounting Hub.
//
// The hubs run on separate databases (sapphire_marketing / sapphire_accounting),
// so the HMO officer's "LOA Submission" tab under Accounts Receivable reads
// through this rather than querying a table it cannot see.
//
// Auth: EXTERNAL_API_KEY bearer, the same key the class-portal and queue
// integrations use. No session, so no branch scoping by role — the Accounting
// Hub applies its own filters and its own roles on its side.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY || ''

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''
  const hmo = searchParams.get('hmo') || ''
  const status = searchParams.get('status') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (branch) where.branch = branch
  if (hmo) where.hmoName = hmo
  if (status) where.status = status

  const rows = await prisma.loaSubmission.findMany({
    where,
    select: {
      id: true, hmoName: true, branch: true, services: true,
      dateOfApproval: true, status: true, notes: true,
      patientName: true, fileMime: true,
      // Whether a document exists, never where it sits on disk — the file is
      // fetched through the guarded download route, not by path.
      fileUrl: true,
      createdAt: true, updatedAt: true,
      patient: { select: { firstName: true, lastName: true } },
      deckingSlot: { select: { department: true, dayOfWeek: true, startTime: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  })

  const submissions = rows.map(r => ({
    id: r.id,
    patientName: r.patient ? `${r.patient.lastName}, ${r.patient.firstName}` : (r.patientName ?? ''),
    hmoName: r.hmoName,
    branch: r.branch,
    services: r.services,
    department: r.deckingSlot?.department ?? null,
    dateOfApproval: r.dateOfApproval,
    status: r.status,
    notes: r.notes,
    hasFile: !!r.fileUrl,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }))

  // The distinct lists back the tab's filters, so the Accounting Hub does not
  // have to hardcode a provider list that would drift from the ops-hub settings.
  const hmos = [...new Set(rows.map(r => r.hmoName))].sort()
  const branches = [...new Set(rows.map(r => r.branch))].sort()

  return NextResponse.json({ submissions, hmos, branches })
}
