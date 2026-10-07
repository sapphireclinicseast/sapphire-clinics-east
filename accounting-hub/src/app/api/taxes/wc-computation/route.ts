import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// BIR TRAIN graduated MONTHLY withholding table on compensation.
// Mirrors computeTrainTaxMonthly() in api/payroll/employee-payslips so the
// 1601-C "computed" figure matches what payroll actually withholds.
function computeTrainTaxMonthly(taxableMonthly: number): number {
  if (taxableMonthly <= 0) return 0
  if (taxableMonthly <= 20833) return 0
  if (taxableMonthly <= 33333) return (taxableMonthly - 20833) * 0.15
  if (taxableMonthly <= 66667) return 1875 + (taxableMonthly - 33333) * 0.20
  if (taxableMonthly <= 166667) return 8541.67 + (taxableMonthly - 66667) * 0.25
  if (taxableMonthly <= 666667) return 33541.67 + (taxableMonthly - 166667) * 0.30
  return 183541.67 + (taxableMonthly - 666667) * 0.35
}
const r2 = (n: number) => Math.round(n * 100) / 100

const OVERRIDE_FIELDS = ['totalGross', 'mweGross', 'amweGovCon', 'thirteenth', 'otherNonTaxable', 'deMinimis'] as const
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
// One override row per exact branch+period selection ('' branch = consolidated 'ALL').
const overrideKey = (branch: string, year: string, month: string, monthTo: string) =>
  `${branch || 'ALL'}|${year || ''}|${month || ''}|${monthTo || ''}`

// GET /api/taxes/wc-computation?branch=SBEA&year=2026&month=07[&monthTo=09]
// (branch omitted or ALL → consolidated across every branch)
// Returns the BIR 1601-C (Withholding on Compensation) computation for the
// selected branch + period, derived live from finalized (LOCKED) payslips —
// plus a per-employee register and a computed-vs-recorded discrepancy.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branchParam = searchParams.get('branch') || ''
  const branch = branchParam === 'ALL' ? '' : branchParam
  const year = searchParams.get('year') || ''
  const monthFrom = searchParams.get('month') || '' // '01'..'12' or '' (all)
  const monthTo = searchParams.get('monthTo') || ''

  // FINAL and LOCKED both mean the payslip figures are done — LOCKED only adds
  // that the cutoff's payroll was posted to the GL. Counting LOCKED alone made
  // a month show HALF its compensation whenever one of its two cutoffs hadn't
  // been ledger-posted yet, right when the 1601-C is being prepared. DRAFT
  // stays out: those figures are still being edited.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { status: { in: ['FINAL', 'LOCKED'] } }
  if (branch) where.branch = branch
  if (year) where.cutoffPeriod = { startsWith: `${year}-` }

  const payslips = await prisma.employeePayslip.findMany({
    where,
    include: { employee: { select: { id: true, firstName: true, lastName: true, isMWE: true } } },
    orderBy: [{ cutoffPeriod: 'asc' }],
  })

  // Month range filter on cutoffPeriod "YYYY-MM-H"
  const [lo, hi] = monthFrom ? [monthFrom, monthTo || monthFrom].sort() : ['', '']
  const inRange = (cp: string) => {
    if (!monthFrom) return true
    const mm = cp.slice(5, 7)
    return mm >= lo && mm <= hi
  }

  // Withholding is a MONTHLY computation, so group each employee's two cutoffs
  // into one month before applying the graduated table.
  type Acc = {
    employeeId: string; name: string; isMWE: boolean; month: string
    gross: number; grossTaxable: number; sss: number; phic: number; hdmf: number; netTaxable: number; recordedTax: number
    exempt13th: number; exemptOther: number
  }
  const groups = new Map<string, Acc>()
  for (const p of payslips) {
    if (!inRange(p.cutoffPeriod)) continue
    const month = p.cutoffPeriod.slice(0, 7) // "YYYY-MM"
    const key = `${p.employeeId}|${month}`
    let g = groups.get(key)
    if (!g) {
      g = { employeeId: p.employeeId, name: `${p.employee.firstName} ${p.employee.lastName}`, isMWE: p.employee.isMWE, month, gross: 0, grossTaxable: 0, sss: 0, phic: 0, hdmf: 0, netTaxable: 0, recordedTax: 0, exempt13th: 0, exemptOther: 0 }
      groups.set(key, g)
    }
    const sss = Number(p.sssDeduction), phic = Number(p.philhealthDeduction), hdmf = Number(p.pagibigDeduction)
    const details = (p.details ?? {}) as { taxableIncome?: number; exempt13th?: number; exemptOther?: number }
    // Net taxable = what payroll already computed per cutoff; fall back to
    // gross less the mandatory employee contributions when details are absent.
    const netT = typeof details.taxableIncome === 'number' ? details.taxableIncome : Math.max(0, Number(p.grossPay) - sss - phic - hdmf)
    g.sss += sss; g.phic += phic; g.hdmf += hdmf
    g.netTaxable += netT
    g.grossTaxable += netT + sss + phic + hdmf // reconstruct gross taxable comp (V = Z + GovCon)
    g.gross += Number(p.grossPay) // ACTUAL pay — taxable + govcon + non-taxable allowances/de minimis
    g.recordedTax += Number(p.taxDeduction)
    // Special pay runs (Payroll › 13th Month / Maternity / Final Pay) carry their
    // tax-exempt part in details: 13th-month pay within the ₱90,000 ceiling, and
    // other exempt pay (maternity salary differential, the first 10 days of
    // converted leave). Their taxable part is already in details.taxableIncome above.
    g.exempt13th += Number(details.exempt13th) || 0
    g.exemptOther += Number(details.exemptOther) || 0
  }

  const rows = [...groups.values()].map(g => {
    const govCon = r2(g.sss + g.phic + g.hdmf)
    const netTaxable = r2(g.netTaxable)
    const recordedTax = r2(g.recordedTax)
    // Actual gross can't be below the parts we know of it (a special run may
    // carry its exempt pay only in details) — keeps the de-minimis residual ≥ 0.
    const gross = r2(Math.max(g.gross, g.netTaxable + g.sss + g.phic + g.hdmf + g.exempt13th + g.exemptOther))
    // Tax per the BIR graduated table — a CHECK against what payroll actually
    // withheld, not the headline figure (payroll's own computed withholding is
    // authoritative and is what gets remitted on the 1601-C).
    const tableTax = g.isMWE ? 0 : r2(computeTrainTaxMonthly(netTaxable))
    return {
      employeeId: g.employeeId, name: g.name, isMWE: g.isMWE, month: g.month,
      gross, grossTaxable: r2(g.grossTaxable), sss: r2(g.sss), phic: r2(g.phic), hdmf: r2(g.hdmf),
      govCon, netTaxable, recordedTax, tableTax, discrepancy: r2(tableTax - recordedTax),
      exempt13th: r2(g.exempt13th), exemptOther: r2(g.exemptOther),
    }
  }).sort((a, b) => a.month.localeCompare(b.month) || a.name.localeCompare(b.name))

  const sum = (f: (r: typeof rows[number]) => number, filter?: (r: typeof rows[number]) => boolean) =>
    r2(rows.filter(r => !filter || filter(r)).reduce((s, r) => s + f(r), 0))

  // Total compensation is ACTUAL gross pay, with each non-taxable part
  // subtracted on its own line, exactly as the 1601-C lays it out. The
  // de-minimis line is the residual gross pay that payroll never taxed
  // (allowances, de minimis) — without it the total used to show only
  // taxable + contributions and looked like a missing cutoff. Exempt lines
  // cover non-MWE employees only: MWE pay leaves in full via its own line.
  const thirteenth = sum(r => r.exempt13th, r => !r.isMWE)
  const otherNonTaxable = sum(r => r.exemptOther, r => !r.isMWE)
  const totalGross = sum(r => r.gross)
  const mweGross = sum(r => r.gross, r => r.isMWE)
  const amweGovCon = sum(r => r.govCon, r => !r.isMWE)
  const deMinimis = r2(sum(r => r.gross - r.govCon - r.netTaxable - r.exempt13th - r.exemptOther, r => !r.isMWE))
  const taxableIncome = r2(totalGross - mweGross - amweGovCon - thirteenth - otherNonTaxable - deMinimis)
  // Split AMWEs by whether payroll actually withheld tax (matches the BIR form's
  // "with tax" / "without tax" lines, which follow the withholding, not a re-run).
  const amwesWithoutTax = sum(r => r.netTaxable, r => !r.isMWE && r.recordedTax <= 0)
  const amwesWithTax = sum(r => r.netTaxable, r => !r.isMWE && r.recordedTax > 0)
  const totalTaxDue = sum(r => r.recordedTax, r => !r.isMWE) // withholding to remit
  const tableTaxDue = sum(r => r.tableTax, r => !r.isMWE)    // graduated-table recompute (check)

  const ovRow = await prisma.wcComputationOverride.findUnique({ where: { id: overrideKey(branch, year, monthFrom, monthTo) } })
  const overrides = (ovRow?.data && typeof ovRow.data === 'object' && !Array.isArray(ovRow.data)) ? ovRow.data : {}

  return NextResponse.json({
    rows,
    overrides,
    computation: {
      totalGross, mweGross, amweGovCon, thirteenth, otherNonTaxable, deMinimis, taxableIncome,
      amwesWithoutTax, amwesWithTax, totalTaxDue, tableTaxDue,
      discrepancy: r2(tableTaxDue - totalTaxDue),
    },
  })
}

// PUT { branch, year, month?, monthTo?, overrides: { field: number } }
// Saves the manually-typed amounts for the five compensation lines of this
// exact branch+period selection; an empty overrides map removes the row.
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const branch = typeof body.branch === 'string' && body.branch !== 'ALL' ? body.branch : ''
    const year = typeof body.year === 'string' ? body.year : ''
    if (!year) return NextResponse.json({ error: 'year is required' }, { status: 400 })
    const month = typeof body.month === 'string' ? body.month : ''
    const monthTo = typeof body.monthTo === 'string' ? body.monthTo : ''
    const raw = (body.overrides && typeof body.overrides === 'object' && !Array.isArray(body.overrides)) ? body.overrides : {}
    const clean: Record<string, number> = {}
    for (const f of OVERRIDE_FIELDS) {
      const v = (raw as Record<string, unknown>)[f]
      if (typeof v === 'number' && isFinite(v) && v >= 0) clean[f] = r2(v)
    }
    const id = overrideKey(branch, year, month, monthTo)
    if (Object.keys(clean).length === 0) {
      await prisma.wcComputationOverride.deleteMany({ where: { id } })
    } else {
      await prisma.wcComputationOverride.upsert({
        where: { id },
        create: { id, data: clean, updatedById: session.user.id as string },
        update: { data: clean, updatedById: session.user.id as string },
      })
    }
    return NextResponse.json({ ok: true, overrides: clean })
  } catch (e) {
    console.error('WC override PUT failed', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
