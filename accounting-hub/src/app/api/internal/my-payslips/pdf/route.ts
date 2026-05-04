/**
 * GET /api/internal/my-payslips/pdf?email=<email>&kind=employee|consultant&id=<payslip-id>
 *
 * Streams the LOCKED payslip PDF for a given (email, kind, id) tuple.
 * Refuses if:
 *   • Bearer key is missing/wrong
 *   • The payslip's status isn't LOCKED
 *   • The payslip belongs to someone whose email doesn't match
 *
 * Reads the same on-disk PDF the accountant-facing endpoint serves, so
 * if a payslip is regenerated the new PDF is what's returned.
 *
 * Auth: Authorization: Bearer ${TELETHERAPY_INTERNAL_API_KEY}
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import path from 'path'

const PDF_DIR = process.env.PDF_STORAGE_DIR || '/app/uploads/payslips'

function verifyKey(req: NextRequest): boolean {
  const key = process.env.TELETHERAPY_INTERNAL_API_KEY
  if (!key) return false
  return req.headers.get('authorization') === `Bearer ${key}`
}

export async function GET(req: NextRequest) {
  if (!verifyKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = (req.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase()
  const kind = req.nextUrl.searchParams.get('kind') ?? ''
  const id = req.nextUrl.searchParams.get('id') ?? ''

  if (!email || !id || !['employee', 'consultant'].includes(kind)) {
    return NextResponse.json({ error: 'email, kind (employee|consultant), and id are required' }, { status: 400 })
  }

  // Load the payslip and verify ownership + LOCKED status.
  if (kind === 'employee') {
    const slip = await prisma.employeePayslip.findUnique({
      where: { id },
      include: { employee: { select: { email: true, firstName: true, lastName: true } } },
    })
    if (!slip || slip.status !== 'LOCKED') {
      return NextResponse.json({ error: 'Not found or not locked' }, { status: 404 })
    }
    if ((slip.employee.email ?? '').toLowerCase() !== email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    const entry = await prisma.payrollEntry.findUnique({
      where: { id },
      include: { consultant: { select: { email: true, name: true } } },
    })
    if (!entry || entry.status !== 'LOCKED') {
      return NextResponse.json({ error: 'Not found or not locked' }, { status: 404 })
    }
    if ((entry.consultant.email ?? '').toLowerCase() !== email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Sanitize id and read from disk. Always reads the current file so a
  // regenerated payslip's PDF supersedes the previous one transparently.
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')
  const filePath = path.join(PDF_DIR, kind, `${safeId}.pdf`)
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'PDF file missing on server' }, { status: 404 })
  }
  const buffer = await readFile(filePath)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="payslip-${safeId}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
