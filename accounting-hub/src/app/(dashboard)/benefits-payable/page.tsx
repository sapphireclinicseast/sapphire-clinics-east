'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Shield, Loader2, X, BadgeDollarSign } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import Availments from './Availments'
import { useRfpOtherFees, RfpOtherFeesSection } from '@/components/RfpOtherFees'

const BRANCHES = [
  { value: 'SBEA', label: 'East Branch' },
  { value: 'SBGH', label: 'Greenhills Branch' },
  { value: 'VERDANA', label: 'Verdana Store' },
  { value: 'AHI', label: 'Aura Health Institute' },
]

// Subtabs are per government agency — SSS/PHIC/HDMF are remitted separately.
const AGENCIES = [
  { key: 'SSS', label: 'SSS', benefitType: 'SSS', eeField: 'sssEE', erField: 'sssER', rfpField: 'sssRfpId' },
  { key: 'PHIC', label: 'PhilHealth (PHIC)', benefitType: 'PHILHEALTH', eeField: 'philEE', erField: 'philER', rfpField: 'philhealthRfpId' },
  { key: 'HDMF', label: 'Pag-IBIG (HDMF)', benefitType: 'PAGIBIG', eeField: 'pagEE', erField: 'pagER', rfpField: 'pagibigRfpId' },
] as const

interface Row {
  id: string; type: 'employee' | 'consultant'; personId: string; name: string; department: string
  branch: string; cutoffPeriod: string
  sssEE: number; sssER: number; philEE: number; philER: number; pagEE: number; pagER: number
  totalBenefitsPayable: number; benefitsRemitted: boolean; benefitRfpId: string | null
  sssRfpId: string | null; philhealthRfpId: string | null; pagibigRfpId: string | null
}
// Branch column display codes (Aura Health branding): SBEA→AHEA, SBGH→AHGH, etc.
const BRANCH_DISPLAY: Record<string, string> = { SBEA: 'AHEA', SBGH: 'AHGH', VERDANA: 'VERD', AHI: 'AHI' }

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

export default function BenefitsPayablePage() {
  const [branch, setBranch] = useState('SBEA')
  const [agencyKey, setAgencyKey] = useState<typeof AGENCIES[number]['key']>('SSS')
  // Availments sit beside the remittance tabs but are the opposite flow: SSS owes
  // us, rather than us owing SSS, so the view is separate rather than a filter.
  const [showAvailments, setShowAvailments] = useState(false)
  const agency = AGENCIES.find(a => a.key === agencyKey)!
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [fType, setFType] = useState<'' | 'employee' | 'consultant'>('')
  const [fYear, setFYear] = useState('')
  const [fMonth, setFMonth] = useState('')
  const [fCutoff, setFCutoff] = useState('')
  // Show ALL locked-payroll benefits by default (spec: "all benefits from locked payroll
  // are to be seen here"); remitted/in-RFP rows appear with a status and can't be re-ticked.
  const [hideRemitted, setHideRemitted] = useState(false)

  const [selected, setSelected] = useState<Set<string>>(new Set())

  // RFP modal
  const [rfpOpen, setRfpOpen] = useState(false)
  const [rfpSeq, setRfpSeq] = useState('')
  const [creating, setCreating] = useState(false)
  const otherFees = useRfpOtherFees()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Always fetch everything from locked payroll; remitted rows are shown with a
      // status (hidden only if the user opts to). Consultant + employee both included.
      const p = new URLSearchParams({ branch, showRemitted: 'true' })
      const res = await fetch(`/api/payroll/benefits-payable?${p}`)
      setRows(res.ok ? await res.json() : [])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [branch])
  useEffect(() => { load() }, [load])
  useEffect(() => { setSelected(new Set()) }, [branch, agencyKey, fType, fYear, fMonth, fCutoff, hideRemitted])

  const ee = (r: Row) => r[agency.eeField] as number
  const er = (r: Row) => r[agency.erField] as number
  const rfpOf = (r: Row) => r[agency.rfpField] as string | null

  const years = useMemo(() => Array.from(new Set(rows.map(r => r.cutoffPeriod.split('-')[0]))).sort().reverse(), [rows])

  // Rows relevant to the current agency subtab + filters
  const shown = useMemo(() => rows.filter(r => {
    if (ee(r) + er(r) <= 0) return false
    if (hideRemitted && r.benefitsRemitted) return false
    if (fType && r.type !== fType) return false
    const [y, m, half] = r.cutoffPeriod.split('-')
    if (fYear && y !== fYear) return false
    if (fMonth && m !== fMonth) return false
    if (fCutoff && half !== fCutoff) return false
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows, agencyKey, fType, fYear, fMonth, fCutoff, hideRemitted])

  const selectable = shown.filter(r => !rfpOf(r) && !r.benefitsRemitted)
  const selRows = shown.filter(r => selected.has(r.id))
  const selTotal = selRows.reduce((s, r) => s + ee(r) + er(r), 0)

  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = (on: boolean) => setSelected(on ? new Set(selectable.map(r => r.id)) : new Set())

  const feesTotal = otherFees.feesTotal
  const rfpTotal = selTotal + feesTotal

  const openRfp = async () => {
    if (selRows.length === 0) return
    setRfpSeq('')
    // Preload the branch's saved "Other Fees" template.
    await otherFees.loadTemplate(branch)
    setRfpOpen(true)
  }

  const generate = async () => {
    setCreating(true); setError('')
    try {
      const cleanedFees = otherFees.cleaned()
      // A selection may span both employee and consultant rows; payable-rfp takes one
      // payableType per call, so create one RFP per type present. Fees attach to the first.
      const byType: Record<string, string[]> = {}
      for (const r of selRows) { (byType[r.type] ||= []).push(r.id) }
      const types = Object.keys(byType)
      let made = 0
      for (let i = 0; i < types.length; i++) {
        const t = types[i]
        const body = {
          source: 'benefit', benefitType: agency.benefitType,
          payableType: t === 'consultant' ? 'CONSULTANT' : 'EMPLOYEE',
          ids: byType[t], branch,
          manualSeq: types.length === 1 && rfpSeq.trim() ? rfpSeq.trim() : undefined,
          otherFees: i === 0 ? cleanedFees : [],
        }
        const res = await fetch('/api/payroll/payable-rfp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to create RFP') }
        made++
      }
      setRfpOpen(false); setSelected(new Set())
      await load()
      alert(`${made} RFP${made === 1 ? '' : 's'} created in Expenses.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create RFP') }
    finally { setCreating(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <Shield size={22} style={{ color: 'var(--teal)' }} /> Benefits Payable
        </h1>
      </div>
      <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>SSS, PhilHealth and Pag-IBIG contributions from locked payroll (employees & consultants). Tick lines and generate an RFP per agency — it appears under Expenses → RFP.</p>

      {/* Branch */}
      <div className="flex rounded-xl overflow-hidden border w-fit" style={{ borderColor: 'var(--light-gray)' }}>
        {BRANCHES.map(b => <button key={b.value} onClick={() => setBranch(b.value)} className="px-4 py-2 text-xs font-semibold" style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{b.label}</button>)}
      </div>

      {/* Agency subtabs */}
      <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        {AGENCIES.map(a => (
          <button key={a.key} onClick={() => { setAgencyKey(a.key); setShowAvailments(false) }} className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={{ borderColor: !showAvailments && agencyKey === a.key ? 'var(--teal)' : 'transparent', color: !showAvailments && agencyKey === a.key ? 'var(--teal)' : 'var(--mid-gray)' }}>{a.label}</button>
        ))}
        <button onClick={() => setShowAvailments(true)} className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
          style={{ borderColor: showAvailments ? 'var(--teal)' : 'transparent', color: showAvailments ? 'var(--teal)' : 'var(--mid-gray)' }}>
          Benefit Availments
        </button>
      </div>

      {showAvailments && <Availments branch={branch} />}
      {!showAvailments && (<>

      {/* Filters */}
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Type</label>
          <select value={fType} onChange={e => setFType(e.target.value as '' | 'employee' | 'consultant')} className="px-3 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="">All</option><option value="employee">Employees</option><option value="consultant">Consultants</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Year</label>
          <select value={fYear} onChange={e => setFYear(e.target.value)} className="px-3 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="">All</option>{years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Month</label>
          <select value={fMonth} onChange={e => setFMonth(e.target.value)} className="px-3 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="">All</option>{MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Cutoff</label>
          <select value={fCutoff} onChange={e => setFCutoff(e.target.value)} className="px-3 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="">All</option><option value="1">1st (1–15)</option><option value="2">2nd (16–EOM)</option>
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs ml-2" style={{ color: 'var(--mid-gray)' }}>
          <input type="checkbox" checked={hideRemitted} onChange={e => setHideRemitted(e.target.checked)} /> Hide remitted
        </label>
        {selected.size > 0 && (
          <button onClick={openRfp} className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>
            <BadgeDollarSign size={14} /> Generate RFP ({selected.size})
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--off-white)' }}>
              <th className="text-center px-2 py-2.5">
                <input type="checkbox" checked={selectable.length > 0 && selectable.every(r => selected.has(r.id))} onChange={e => toggleAll(e.target.checked)} />
              </th>
              <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Name</th>
              <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Type</th>
              <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Department</th>
              <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Branch</th>
              <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Cutoff</th>
              <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>{agency.label} EE</th>
              <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>{agency.label} ER</th>
              <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Total</th>
              <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}><Loader2 size={18} className="inline animate-spin" /></td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}>
                No {agency.label} contributions in locked payroll for this filter.
                <div className="mt-1 text-[11px]">Contributions appear once payroll is <strong>locked</strong> and the {agency.label} deduction falls on the selected cutoff.</div>
              </td></tr>
            ) : shown.map(r => {
              const locked = !!rfpOf(r) || r.benefitsRemitted
              return (
                <tr key={r.id} className="border-t hover:bg-gray-50/50" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="text-center px-2 py-2.5">
                    <input type="checkbox" disabled={locked} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>{r.name}</td>
                  <td className="px-3 py-2.5"><span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={r.type === 'consultant' ? { background: '#eef2ff', color: '#4338ca' } : { background: '#ecfeff', color: '#0e7490' }}>{r.type === 'consultant' ? 'Consultant' : 'Employee'}</span></td>
                  <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{r.department}</td>
                  <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{BRANCH_DISPLAY[r.branch] || r.branch}</td>
                  <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--mid-gray)' }}>{r.cutoffPeriod}</td>
                  <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{formatCurrency(ee(r))}</td>
                  <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{formatCurrency(er(r))}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(ee(r) + er(r))}</td>
                  <td className="px-3 py-2.5">
                    {r.benefitsRemitted ? <span className="text-[11px] font-medium" style={{ color: '#166534' }}>Remitted</span>
                      : rfpOf(r) ? <span className="text-[11px] font-medium" style={{ color: '#c44b00' }}>In RFP</span>
                      : <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Pending</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr style={{ background: 'var(--off-white)' }}>
                <td colSpan={6} className="px-3 py-2.5 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>Shown total</td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(shown.reduce((s, r) => s + ee(r), 0))}</td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(shown.reduce((s, r) => s + er(r), 0))}</td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(shown.reduce((s, r) => s + ee(r) + er(r), 0))}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>Selected: <strong style={{ color: 'var(--deep-teal)' }}>{formatCurrency(selTotal)}</strong> · {selected.size} line{selected.size === 1 ? '' : 's'}</span>
          <button onClick={openRfp} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>
            <BadgeDollarSign size={14} /> Generate {agency.label} RFP
          </button>
        </div>
      )}

      {/* RFP modal */}
      {rfpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Generate {agency.label} Payable RFP</h2>
              <button onClick={() => setRfpOpen(false)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>
              {selRows.length} entr{selRows.length === 1 ? 'y' : 'ies'} · benefits <strong>{formatCurrency(selTotal)}</strong>
              {feesTotal > 0 && <> · fees <strong>{formatCurrency(feesTotal)}</strong></>}
              {' '}· total <strong>{formatCurrency(rfpTotal)}</strong>. Creates an RFP in Expenses and locks these rows until paid (or the RFP is deleted).
            </p>

            <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>RFP Number (optional)</label>
            <input value={rfpSeq} onChange={e => setRfpSeq(e.target.value)} placeholder="e.g. 000007" className="w-full px-3 py-2.5 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
            <p className="text-[11px] -mt-2 mb-3" style={{ color: 'var(--mid-gray)' }}>From your pre-printed form. Leave blank to auto-number. (Ignored when the selection spans both employees and consultants — those become separate RFPs.)</p>

            <RfpOtherFeesSection state={otherFees} branch={branch} />

            <button onClick={generate} disabled={creating} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 mt-1" style={{ background: 'var(--deep-teal)' }}>
              {creating ? <Loader2 size={15} className="inline animate-spin" /> : `Generate RFP · ${formatCurrency(rfpTotal)}`}
            </button>
          </div>
        </div>
      )}
      </>)}
    </div>
  )
}
