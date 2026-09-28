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

// GET /api/taxes/wc-computation?branch=SBEA&year=2026&month=07[&monthTo=09]
// Returns the BIR 1601-C (Withholding on Compensation) computation for the
// selected branch + period, derived live from finalized (LOCKED) payslips —
// plus a per-employee register and a computed-vs-recorded discrepancy.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch') || ''
  const year = searchParams.get('year') || ''
  const monthFrom = searchParams.get('month') || '' // '01'..'12' or '' (all)
  const monthTo = searchParams.get('monthTo') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { status: 'LOCKED' }
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
    grossTaxable: number; sss: number; phic: number; hdmf: number; netTaxable: number; recordedTax: number
  }
  const groups = new Map<string, Acc>()
  for (const p of payslips) {
    if (!inRange(p.cutoffPeriod)) continue
    const month = p.cutoffPeriod.slice(0, 7) // "YYYY-MM"
    const key = `${p.employeeId}|${month}`
    let g = groups.get(key)
    if (!g) {
      g = { employeeId: p.employeeId, name: `${p.employee.firstName} ${p.employee.lastName}`, isMWE: p.employee.isMWE, month, grossTaxable: 0, sss: 0, phic: 0, hdmf: 0, netTaxable: 0, recordedTax: 0 }
      groups.set(key, g)
    }
    const sss = Number(p.sssDeduction), phic = Number(p.philhealthDeduction), hdmf = Number(p.pagibigDeduction)
    const details = (p.details ?? {}) as { taxableIncome?: number }
    // Net taxable = what payroll already computed per cutoff; fall back to
    // gross less the mandatory employee contributions when details are absent.
    const netT = typeof details.taxableIncome === 'number' ? details.taxableIncome : Math.max(0, Number(p.grossPay) - sss - phic - hdmf)
    g.sss += sss; g.phic += phic; g.hdmf += hdmf
    g.netTaxable += netT
    g.grossTaxable += netT + sss + phic + hdmf // reconstruct gross taxable comp (V = Z + GovCon)
    g.recordedTax += Number(p.taxDeduction)
  }

  const rows = [...groups.values()].map(g => {
    const govCon = r2(g.sss + g.phic + g.hdmf)
    const netTaxable = r2(g.netTaxable)
    const recordedTax = r2(g.recordedTax)
    // Tax per the BIR graduated table — a CHECK against what payroll actually
    // withheld, not the headline figure (payroll's own computed withholding is
    // authoritative and is what gets remitted on the 1601-C).
    const tableTax = g.isMWE ? 0 : r2(computeTrainTaxMonthly(netTaxable))
    return {
      employeeId: g.employeeId, name: g.name, isMWE: g.isMWE, month: g.month,
      grossTaxable: r2(g.grossTaxable), sss: r2(g.sss), phic: r2(g.phic), hdmf: r2(g.hdmf),
      govCon, netTaxable, recordedTax, tableTax, discrepancy: r2(tableTax - recordedTax),
    }
  }).sort((a, b) => a.month.localeCompare(b.month) || a.name.localeCompare(b.name))

  const sum = (f: (r: typeof rows[number]) => number, filter?: (r: typeof rows[number]) => boolean) =>
    r2(rows.filter(r => !filter || filter(r)).reduce((s, r) => s + f(r), 0))

  const totalGross = sum(r => r.grossTaxable)
  const mweGross = sum(r => r.grossTaxable, r => r.isMWE)
  const amweGovCon = sum(r => r.govCon, r => !r.isMWE)
  const thirteenth = 0 // 13th-month / de-minimis run not yet wired; regular months = 0
  const taxableIncome = r2(totalGross - mweGross - amweGovCon - thirteenth)
  // Split AMWEs by whether payroll actually withheld tax (matches the BIR form's
  // "with tax" / "without tax" lines, which follow the withholding, not a re-run).
  const amwesWithoutTax = sum(r => r.netTaxable, r => !r.isMWE && r.recordedTax <= 0)
  const amwesWithTax = sum(r => r.netTaxable, r => !r.isMWE && r.recordedTax > 0)
  const totalTaxDue = sum(r => r.recordedTax, r => !r.isMWE) // withholding to remit
  const tableTaxDue = sum(r => r.tableTax, r => !r.isMWE)    // graduated-table recompute (check)

  return NextResponse.json({
    rows,
    computation: {
      totalGross, mweGross, amweGovCon, thirteenth, taxableIncome,
      amwesWithoutTax, amwesWithTax, totalTaxDue, tableTaxDue,
      discrepancy: r2(tableTaxDue - totalTaxDue),
    },
  })
}
