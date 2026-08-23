// GET /api/aurora-admin/tickets — admin view of all patient portal tickets,
// newest first, with the patient's name + branch. Token-authed via
// AURORA_ADMIN_TOKEN (injected by the client-portal admin proxy).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { branchLabel } from '@/lib/branch-label'
import { checkAdminToken } from '@/lib/aurora-admin'

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

export async function GET(req: NextRequest) {
  if (!checkAdminToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tickets = await prisma.patientTicket.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // OPEN before RESOLVED, newest first
    take: 500,
    select: {
      id: true, subject: true, description: true, screenshot: true, status: true,
      adminResponse: true, resolvedAt: true, createdAt: true,
      patient: { select: { firstName: true, lastName: true, branch: true, email: true } },
    },
  })

  const rows = tickets.map((t) => ({
    id: t.id,
    subject: t.subject,
    description: t.description,
    screenshot: t.screenshot,
    status: t.status,
    adminResponse: t.adminResponse,
    resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    patientName: titleCase(`${t.patient?.firstName ?? ''} ${t.patient?.lastName ?? ''}`.trim()) || '—',
    patientEmail: t.patient?.email ?? null,
    branch: t.patient?.branch ? (branchLabel(t.patient.branch) ?? t.patient.branch) : '—',
  }))

  const openCount = rows.filter((r) => r.status !== 'RESOLVED').length
  return NextResponse.json({ tickets: rows, openCount, total: rows.length })
}
