import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']
// Defaults to /app/uploads/payslips so the file ends up on the host
// bind mount (/opt/accounting/uploads/payslips), not ephemeral
// in-container storage that gets wiped on every redeploy.
const PDF_DIR = process.env.PDF_STORAGE_DIR || '/app/uploads/payslips'

// POST: Store a PDF and update the payslip record
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, type, pdfBase64, consultantId, cutoffPeriod, branch } = await req.json()
  // type: 'employee' or 'consultant'

  if (!pdfBase64 || !type) {
    return NextResponse.json({ error: 'Missing type or pdfBase64' }, { status: 400 })
  }

  // For consultant type, look up by composite key if no id provided
  let recordId = id
  if (type === 'consultant' && !recordId && consultantId && cutoffPeriod && branch) {
    const entry = await prisma.payrollEntry.findUnique({
      where: { consultantId_cutoffPeriod_branch: { consultantId, cutoffPeriod, branch } },
    })
    if (entry) recordId = entry.id
  }

  if (!recordId) {
    return NextResponse.json({ error: 'Missing id or lookup fields' }, { status: 400 })
  }

  const pdfData = pdfBase64.includes('base64,') ? pdfBase64.split('base64,')[1] : pdfBase64
  const buffer = Buffer.from(pdfData, 'base64')

  // Create directory structure
  const subDir = path.join(PDF_DIR, type)
  if (!existsSync(subDir)) {
    await mkdir(subDir, { recursive: true })
  }

  const fileName = `${recordId}.pdf`
  const filePath = path.join(subDir, fileName)
  await writeFile(filePath, buffer)

  const pdfUrl = `/api/payroll/payslip-pdf?type=${type}&id=${recordId}`

  // Update the record with pdfUrl
  if (type === 'employee') {
    await prisma.employeePayslip.update({ where: { id: recordId }, data: { pdfUrl } })
  } else if (type === 'consultant') {
    await prisma.payrollEntry.update({ where: { id: recordId }, data: { pdfUrl } })
  }

  return NextResponse.json({ pdfUrl })
}

// GET: Serve a stored PDF
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || ''
  const id = searchParams.get('id') || ''

  if (!type || !id || !['employee', 'consultant'].includes(type)) {
    return NextResponse.json({ error: 'Missing type or id' }, { status: 400 })
  }

  // Sanitize id to prevent path traversal
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')
  const filePath = path.join(PDF_DIR, type, `${safeId}.pdf`)

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'PDF not found' }, { status: 404 })
  }

  const { readFile } = await import('fs/promises')
  const buffer = await readFile(filePath)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="payslip-${safeId}.pdf"`,
    },
  })
}
