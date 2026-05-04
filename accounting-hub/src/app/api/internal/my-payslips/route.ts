/**
 * GET /api/internal/my-payslips?email=<email>
 *
 * Internal endpoint consumed by the teletherapy hub. Returns the
 * person's LOCKED payslips (both Employee and Consultant), keyed by
 * email. Draft and Final payslips are intentionally excluded so
 * clinicians never see preliminary numbers. If a payslip is later
 * regenerated and re-LOCKED, the new pdfUrl wins because we always
 * read the latest row.
 *
 * Auth: Authorization: Bearer ${TELETHERAPY_INTERNAL_API_KEY}
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { existsSync } from 'fs'
import path from 'path'

const PDF_DIR = process.env.PDF_STORAGE_DIR || '/app/data/payslips'

function verifyKey(req: NextRequest): boolean {
  const key = process.env.TELETHERAPY_INTERNAL_API_KEY
  if (!key) return false
  return req.headers.get('authorization') === `Bearer ${key}`
}

// hasPdf is anchored to the actual on-disk file (which is what the
// PDF endpoint serves), not just the DB pdfUrl column. The column
// can lag behind regeneration runs, but the file is the truth.
function pdfExists(kind: 'employee' | 'consultant', id: string): boolean {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')
  return existsSync(path.join(PDF_DIR, kind, `${safeId}.pdf`))
}

export async function GET(req: NextRequest) {
  if (!verifyKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = (req.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  // Match against both rosters — a clinician can be on either.
  const [employees, consultants] = await Promise.all([
    prisma.employee.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, firstName: true, lastName: true, branch: true },
    }),
    prisma.consultant.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, name: true, branch: true },
    }),
  ])

  const empIds = employees.map((e) => e.id)
  const consIds = consultants.map((c) => c.id)

  const [empSlips, consEntries] = await Promise.all([
    empIds.length === 0
      ? Promise.resolve([])
      : prisma.employeePayslip.findMany({
          where: { employeeId: { in: empIds }, status: 'LOCKED' },
          orderBy: [{ cutoffPeriod: 'desc' }, { createdAt: 'desc' }],
        }),
    consIds.length === 0
      ? Promise.resolve([])
      : prisma.payrollEntry.findMany({
          where: { consultantId: { in: consIds }, status: 'LOCKED' },
          orderBy: [{ cutoffPeriod: 'desc' }, { createdAt: 'desc' }],
        }),
  ])

  // Normalize both shapes into a single payslip list.
  const payslips = [
    ...empSlips.map((s) => ({
      kind: 'employee' as const,
      id: s.id,
      cutoffPeriod: s.cutoffPeriod,
      branch: s.branch,
      grossPay: Number(s.grossPay),
      totalDeductions: Number(s.totalDeductions),
      netPay: Number(s.netPay),
      hasPdf: pdfExists('employee', s.id) || !!s.pdfUrl,
      issuedAt: s.updatedAt.toISOString(),
    })),
    ...consEntries.map((e) => ({
      kind: 'consultant' as const,
      id: e.id,
      cutoffPeriod: e.cutoffPeriod,
      branch: e.branch,
      grossPay: Number(e.grossPay),
      totalDeductions: Number(e.taxAmount), // consultants only have tax withholding
      netPay: Number(e.netPay),
      hasPdf: pdfExists('consultant', e.id) || !!e.pdfUrl,
      issuedAt: e.updatedAt.toISOString(),
    })),
  ]

  // Sort newest cutoff first.
  payslips.sort((a, b) => (b.cutoffPeriod.localeCompare(a.cutoffPeriod)))

  return NextResponse.json({
    email,
    matchedAs: {
      asEmployee: empIds.length > 0,
      asConsultant: consIds.length > 0,
    },
    payslips,
  })
}
