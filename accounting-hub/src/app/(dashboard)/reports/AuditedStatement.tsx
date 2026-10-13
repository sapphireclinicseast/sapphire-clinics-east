'use client'

/**
 * Audited Income Statement — the declarable view of the year.
 *
 * Only the Income Statement, built from source records under the audit rules:
 *   · Sales WITH a Sales Invoice only (POS orders by SI-declared date,
 *     AR collections issued an SI, migrated workbook invoices)
 *   · Expenses tagged Valid only (VAT entries net of input VAT; payroll-pattern
 *     lines excluded — compensation reports from Payroll, never twice)
 *   · All salaries to employees (finalized payslips, gross)
 *   · Professional fees ONLY for consultants with a BIR COR (2303) on file
 */

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Download, Printer, ShieldCheck } from 'lucide-react'
import { downloadXlsx, downloadPdf } from '@/lib/export'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const BRANCHES = [
  { value: 'ALL', label: 'All Branches' },
  { value: 'SANDBOX_EAST', label: 'East Branch (AHEA)' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch (AHGH)' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
]

interface AuditedData {
  year: number
  branch: string
  sales: { orders: number[]; arCollections: number[]; migrated: number[]; byMonth: number[]; total: number; migratedUndated: number }
  expenses: { lines: { title: string; byMonth: number[]; total: number }[]; byMonth: number[]; total: number; payrollPatternExcluded: number }
  salaries: { byMonth: number[]; total: number }
  professionalFees: { byMonth: number[]; total: number; excludedNoCorTotal: number; excludedNoCorCount: number }
  netIncome: { byMonth: number[]; total: number }
}

const n2 = (v: number) =>
  v === 0 ? '—' : v < 0
    ? `(${Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
    : v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function AuditedStatement() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [branch, setBranch] = useState('ALL')
  const [data, setData] = useState<AuditedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/reports/audited-income-statement?year=${year}&branch=${branch}`)
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Failed to load'); setData(null); return }
      setData(d)
    } catch { setError('Failed to load'); setData(null) }
    finally { setLoading(false) }
  }, [year, branch])
  useEffect(() => { load() }, [load])

  const branchLabel = BRANCHES.find(b => b.value === branch)?.label || branch

  const buildRows = (): (string | number)[][] => {
    if (!data) return []
    const row = (label: string, byMonth: number[], total: number) => [label, ...byMonth.map(v => v || 0), total]
    const rows: (string | number)[][] = [['', ...MONTHS, 'Total']]
    rows.push(['SALES — WITH SALES INVOICE', ...Array(13).fill('')])
    rows.push(row('  POS sales with SI', data.sales.orders, data.sales.orders.reduce((s, v) => s + v, 0)))
    rows.push(row('  AR collections with SI', data.sales.arCollections, data.sales.arCollections.reduce((s, v) => s + v, 0)))
    if (data.sales.migrated.some(v => v > 0)) rows.push(row('  Migrated workbook invoices', data.sales.migrated, data.sales.migrated.reduce((s, v) => s + v, 0)))
    rows.push(row('TOTAL SALES', data.sales.byMonth, data.sales.total))
    rows.push(['LESS: VALID EXPENSES', ...Array(13).fill('')])
    for (const l of data.expenses.lines) rows.push(row(`  ${l.title}`, l.byMonth, l.total))
    rows.push(row('TOTAL VALID EXPENSES', data.expenses.byMonth, data.expenses.total))
    rows.push(row('LESS: SALARIES & WAGES (EMPLOYEES)', data.salaries.byMonth, data.salaries.total))
    rows.push(row('LESS: PROFESSIONAL FEES (WITH COR)', data.professionalFees.byMonth, data.professionalFees.total))
    rows.push(row('NET INCOME', data.netIncome.byMonth, data.netIncome.total))
    return rows
  }
  const exportReport = (fmt: 'xlsx' | 'pdf') => {
    const rows = buildRows()
    if (rows.length < 2) return
    const [headers, ...body] = rows
    if (fmt === 'xlsx') downloadXlsx(`audited-income-statement-${year}`, [{ name: `Audited IS ${year}`, headers: headers as string[], rows: body }])
    else downloadPdf({
      title: `Audited Income Statement — ${year}`,
      subtitle: `${branchLabel} · SI sales only · Valid expenses · Employee salaries · COR professional fees`,
      headers: headers as string[],
      rows: body.map(r => r.map((c, i) => (i === 0 ? String(c) : typeof c === 'number' ? n2(c) : String(c)))),
      landscape: true,
    })
  }

  const section = { background: 'var(--off-white)', fontWeight: 700 as const }
  const totalRow = { borderTop: '2px solid var(--light-gray)', fontWeight: 700 as const }

  const Tr = ({ label, byMonth, total, bold, indent, color }: { label: string; byMonth: number[]; total: number; bold?: boolean; indent?: boolean; color?: string }) => (
    <tr style={bold ? totalRow : undefined} className="border-t" >
      <td className="px-3 py-1.5 sticky left-0 bg-white whitespace-nowrap" style={{ paddingLeft: indent ? '1.75rem' : undefined, fontWeight: bold ? 700 : undefined, color: color || 'var(--charcoal)' }}>{label}</td>
      {byMonth.map((v, i) => <td key={i} className="px-2 py-1.5 text-right font-mono text-xs whitespace-nowrap" style={{ color: v < 0 ? '#b91c1c' : v === 0 ? 'var(--light-gray)' : color || 'var(--charcoal)', fontWeight: bold ? 700 : undefined }}>{n2(v)}</td>)}
      <td className="px-2 py-1.5 text-right font-mono text-xs whitespace-nowrap" style={{ color: total < 0 ? '#b91c1c' : color || 'var(--charcoal)', fontWeight: 700 }}>{n2(total)}</td>
    </tr>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap print:hidden">
        <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--deep-teal)' }}>
          <ShieldCheck size={16} /> Audited Income Statement
        </span>
        <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border text-sm bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          {[0, 1, 2, 3, 4].map(i => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={branch} onChange={e => setBranch(e.target.value)} className="px-3 py-2 rounded-xl border text-sm bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => exportReport('xlsx')} disabled={!data} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}><Download size={15} /> Excel</button>
          <button onClick={() => exportReport('pdf')} disabled={!data} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}><Printer size={15} /> PDF</button>
        </div>
      </div>

      <p className="text-xs print:hidden" style={{ color: 'var(--mid-gray)' }}>
        Declarable view only: sales <strong>with a Sales Invoice</strong> (attributed to their SI declaration date), expenses tagged <strong>Valid</strong> (VAT entries net of input VAT), all <strong>employee salaries</strong>, and professional fees for consultants <strong>with a COR on file</strong>. Everything else is left out by design.
      </p>

      {loading ? (
        <div className="py-16 text-center"><Loader2 size={20} className="inline animate-spin" style={{ color: 'var(--teal)' }} /></div>
      ) : error ? (
        <div className="px-4 py-3 rounded-xl text-sm bg-red-50 text-red-700">{error}</div>
      ) : data && (
        <>
          <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)', maxHeight: '70vh' }}>
            <table className="w-full text-sm" style={{ minWidth: 1100 }}>
              <thead>
                <tr style={{ background: 'var(--off-white)' }}>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide sticky left-0" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)', minWidth: 230 }}>
                    {branchLabel} · {year}
                  </th>
                  {MONTHS.map(m => <th key={m} className="px-2 py-2.5 text-right text-xs font-semibold uppercase" style={{ color: 'var(--mid-gray)' }}>{m}</th>)}
                  <th className="px-2 py-2.5 text-right text-xs font-semibold uppercase" style={{ color: 'var(--charcoal)' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colSpan={14} className="px-3 py-2 text-xs font-bold sticky left-0" style={section}>SALES — WITH SALES INVOICE</td></tr>
                <Tr label="POS sales with SI" indent byMonth={data.sales.orders} total={data.sales.orders.reduce((s, v) => s + v, 0)} />
                <Tr label="AR collections with SI" indent byMonth={data.sales.arCollections} total={data.sales.arCollections.reduce((s, v) => s + v, 0)} />
                {data.sales.migrated.some(v => v > 0) && (
                  <Tr label="Migrated workbook invoices" indent byMonth={data.sales.migrated} total={data.sales.migrated.reduce((s, v) => s + v, 0)} />
                )}
                <Tr label="Total Sales" bold byMonth={data.sales.byMonth} total={data.sales.total} color="var(--deep-teal)" />

                <tr><td colSpan={14} className="px-3 py-2 text-xs font-bold sticky left-0" style={section}>LESS: VALID EXPENSES</td></tr>
                {data.expenses.lines.map(l => <Tr key={l.title} label={l.title} indent byMonth={l.byMonth} total={l.total} />)}
                <Tr label="Total Valid Expenses" bold byMonth={data.expenses.byMonth} total={data.expenses.total} />

                <tr><td colSpan={14} className="px-3 py-2 text-xs font-bold sticky left-0" style={section}>LESS: PAYROLL</td></tr>
                <Tr label="Salaries & Wages — employees" indent byMonth={data.salaries.byMonth} total={data.salaries.total} />
                <Tr label="Professional Fees — consultants with COR" indent byMonth={data.professionalFees.byMonth} total={data.professionalFees.total} />

                <Tr label="NET INCOME" bold byMonth={data.netIncome.byMonth} total={data.netIncome.total} color={data.netIncome.total < 0 ? '#b91c1c' : 'var(--deep-teal)'} />
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border px-4 py-3 text-xs space-y-1 print:hidden" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            <p><strong style={{ color: 'var(--charcoal)' }}>Left out by the audit rules:</strong></p>
            <p>· Professional fees without a COR: {data.professionalFees.excludedNoCorCount} payroll entr{data.professionalFees.excludedNoCorCount === 1 ? 'y' : 'ies'} totalling ₱{data.professionalFees.excludedNoCorTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
            {data.expenses.payrollPatternExcluded > 0 && <p>· {data.expenses.payrollPatternExcluded} Valid expense entr{data.expenses.payrollPatternExcluded === 1 ? 'y' : 'ies'} with a salary/payroll pattern — compensation is reported from Payroll above, never twice</p>}
            {data.sales.migratedUndated > 0 && <p>· {data.sales.migratedUndated} migrated workbook invoice(s) carry no date and cannot join a monthly statement</p>}
            <p>· Sales without a Sales Invoice, expenses tagged Invalid or untagged, and non-COR professional fees are excluded by design.</p>
          </div>
        </>
      )}
    </div>
  )
}
