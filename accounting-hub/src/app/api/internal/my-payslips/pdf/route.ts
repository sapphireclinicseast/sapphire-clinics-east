/**
 * GET /api/internal/my-payslips/pdf?email=<email>&kind=employee|consultant&id=<payslip-id>
 *
 * Streams the LOCKED payslip PDF for a given (email, kind, id) tuple.
 * Resolution strategy:
 *   1. If a stored PDF exists on disk (uploaded by the accountant when
 *      they Download/Email from the accounting hub), stream that — it's
 *      the version the accountant has already vetted.
 *   2. Otherwise, GENERATE a brand-aligned PDF on the fly from the
 *      payslip row in the DB so clinicians can view their pay even
 *      when no PDF has been uploaded yet.
 *
 * Either way we re-verify status === 'LOCKED' and email match first.
 *
 * Auth: Authorization: Bearer ${TELETHERAPY_INTERNAL_API_KEY}
 */
import { isHeldFromStaff } from '@/lib/payroll/special-runs'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import path from 'path'
import { buildEmployeePayslipPdf, type EmployeePayslipInput } from '@/lib/payslip-pdf-employee'

const PDF_DIR = process.env.PDF_STORAGE_DIR || '/app/uploads/payslips'

function verifyKey(req: NextRequest): boolean {
  const key = process.env.TELETHERAPY_INTERNAL_API_KEY
  if (!key) return false
  return req.headers.get('authorization') === `Bearer ${key}`
}

// ── PDF builders (server-side, jsPDF in Node) ─────────────────────
// The employee payslip is the shared builder the hub's Payroll page uses
// (page 1 + daily attendance page), so the portal copy is identical.
async function buildEmployeePdf(slip: EmployeePayslipInput): Promise<Buffer> {
  const doc = await buildEmployeePayslipPdf(slip)
  // jsPDF returns ArrayBuffer when called with 'arraybuffer' option
  const out = doc.output('arraybuffer') as ArrayBuffer
  return Buffer.from(out)
}

// Build the SAME PDF the accounting hub UI produces, by reconstructing
// the PayrollPreview-like input from the locked PayrollEntry row and
// delegating to the shared library.
import {
  buildConsultantPayslipPdf,
  type ConsultantPayslipPreview,
  type ExtraUnitPayLine,
  type AdjustmentLine,
} from '@/lib/payslip-pdf-consultant'

interface RawItem { unitPayId?: string; unitPayName?: string; unitAmount?: number; quantity?: number; lineTotal?: number; isReduced?: boolean; sessions?: unknown[] }
interface RawExtra { id?: string; unitPayId?: string; unitPayName?: string; unitAmount?: number; qty?: number }
interface RawAdj { id?: string; name?: string; amount?: number; isAddition?: boolean; isTaxed?: boolean; remarks?: string }

interface RawIncentive { ruleId?: string; ruleName?: string; date?: string; patientCount?: number; bonusPerUnit?: number; bonus?: number }

async function buildConsultantPdf(entry: {
  id: string; cutoffPeriod: string; branch: string
  items: unknown; extraItems: unknown; adjustments: unknown
  incentives?: unknown; incentiveTotal?: unknown
  grossPay: unknown; retainerAmount: unknown; taxAmount: unknown; netPay: unknown
  sssDeduction?: unknown; philhealthDeduction?: unknown; pagibigDeduction?: unknown
  consultant: { name: string; department: string; taxDeduction: string }
}): Promise<Buffer> {
  const num = (v: unknown) => Number(v ?? 0)
  const items = (Array.isArray(entry.items) ? entry.items : []) as RawItem[]
  const extras = (Array.isArray(entry.extraItems) ? entry.extraItems : []) as RawExtra[]
  const adjs = (Array.isArray(entry.adjustments) ? entry.adjustments : []) as RawAdj[]
  const incentives = (Array.isArray(entry.incentives) ? entry.incentives : []) as RawIncentive[]

  // unitPayTotal is the sum of BASE items ONLY (no extras). The shared
  // computeTotals() adds extras itself; pre-summing them here would
  // double-count and inflate Gross / NET PAY by the extras amount.
  // Threshold-reduced item rates are baked into each item's lineTotal
  // upstream (the generate route applies isReduced + reduced unitAmount
  // before saving), so no per-row reduction logic needed here.
  const unitPayTotal = items.reduce((s, it) => s + Number(it.lineTotal ?? 0), 0)

  const preview: ConsultantPayslipPreview = {
    consultantId: entry.id,
    consultantName: entry.consultant.name,
    department: entry.consultant.department,
    branch: entry.branch,
    taxDeduction: entry.consultant.taxDeduction,
    items: items.map(it => ({
      unitPayId: it.unitPayId,
      unitPayName: it.unitPayName ?? '—',
      unitAmount: Number(it.unitAmount ?? 0),
      quantity: Number(it.quantity ?? 0),
      lineTotal: Number(it.lineTotal ?? 0),
      isReduced: it.isReduced,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sessions: (it.sessions ?? []) as any,
    })),
    unitPayTotal,
    retainerAmount: num(entry.retainerAmount),
    incentives: incentives.map(i => ({
      ruleId: i.ruleId,
      ruleName: i.ruleName ?? '—',
      date: i.date ?? '',
      patientCount: Number(i.patientCount ?? 0),
      bonusPerUnit: Number(i.bonusPerUnit ?? 0),
      bonus: Number(i.bonus ?? 0),
    })),
    incentiveTotal: num(entry.incentiveTotal),
    grossPay: num(entry.grossPay),
    taxAmount: num(entry.taxAmount),
    sssDeduction: num(entry.sssDeduction),
    philhealthDeduction: num(entry.philhealthDeduction),
    pagibigDeduction: num(entry.pagibigDeduction),
    netPay: num(entry.netPay),
  }
  const extraLines: ExtraUnitPayLine[] = extras.map(e => ({
    id: e.id ?? '',
    unitPayId: e.unitPayId ?? '',
    unitPayName: e.unitPayName ?? '—',
    unitAmount: Number(e.unitAmount ?? 0),
    qty: Number(e.qty ?? 0),
  }))
  const adjLines: AdjustmentLine[] = adjs.map(a => ({
    id: a.id ?? '',
    name: a.name ?? '—',
    amount: Number(a.amount ?? 0),
    isAddition: !!a.isAddition,
    isTaxed: !!a.isTaxed,
    remarks: a.remarks ?? '',
  }))

  // Let computeTotals derive Gross / Tax / NET PAY from the line items
  // (incentive bonus is included via the shared formula). NOT using
  // overrideTotals here means a re-render always reflects the current
  // computeTotals semantics — even for older locked rows whose DB
  // grossPay/netPay were saved before incentives were folded in.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = await buildConsultantPayslipPdf(
    preview, extraLines, adjLines, entry.cutoffPeriod,
  )
  const out = doc.output('arraybuffer') as ArrayBuffer
  return Buffer.from(out)
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

  let buffer: Buffer | null = null

  if (kind === 'employee') {
    const slip = await prisma.employeePayslip.findUnique({
      where: { id },
      include: { employee: { select: { email: true, firstName: true, lastName: true } } },
    })
    if (!slip || slip.status !== 'LOCKED' || isHeldFromStaff(slip.details)) {
      return NextResponse.json({ error: 'Not found or not locked' }, { status: 404 })
    }
    if ((slip.employee.email ?? '').toLowerCase() !== email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Prefer stored PDF if present on disk (accountant has vetted it).
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')
    const filePath = path.join(PDF_DIR, kind, `${safeId}.pdf`)
    if (existsSync(filePath)) {
      buffer = await readFile(filePath)
    } else {
      buffer = await buildEmployeePdf(slip)
    }
  } else {
    const entry = await prisma.payrollEntry.findUnique({
      where: { id },
      include: { consultant: { select: { email: true, name: true, department: true, taxDeduction: true } } },
    })
    if (!entry || entry.status !== 'LOCKED') {
      return NextResponse.json({ error: 'Not found or not locked' }, { status: 404 })
    }
    if ((entry.consultant.email ?? '').toLowerCase() !== email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')
    const filePath = path.join(PDF_DIR, kind, `${safeId}.pdf`)
    if (existsSync(filePath)) {
      buffer = await readFile(filePath)
    } else {
      // Pass through incentives + incentiveTotal so the SUMMARY shows the
      // INCENTIVE BONUS row and gross/tax/net match what the accountant
      // sees in the live preview. Fields default to []/0 for older
      // locked rows that pre-date the 20260504 migration.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = entry as any
      buffer = await buildConsultantPdf({
        ...entry,
        incentives: e.incentives ?? [],
        incentiveTotal: e.incentiveTotal ?? 0,
      })
    }
  }

  // Convert Buffer → Uint8Array so it's a valid BodyInit for NextResponse.
  const body = new Uint8Array(buffer)
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="payslip-${id}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
