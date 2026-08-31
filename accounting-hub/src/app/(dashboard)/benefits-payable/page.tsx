'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Shield, Loader2, X, BadgeDollarSign, Plus, Trash2 } from 'lucide-react'
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
  // Combined view: one RFP covering several agencies at once. A single bank transfer
  // often settles PHIC and HDMF together (sometimes with EWT), and three separate RFPs
  // can never be matched against one bank line.
  const [combined, setCombined] = useState(false)
  const [combinedKeys, setCombinedKeys] = useState<Set<string>>(new Set(['PHIC', 'HDMF']))
  const activeAgencies = useMemo(
    () => combined ? AGENCIES.filter(a => combinedKeys.has(a.key)) : AGENCIES.filter(a => a.key === agencyKey),
    [combined, combinedKeys, agencyKey],
  )
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

  // Govcon catch-up modal (contributions for a month with no payroll)
  const [catchupOpen, setCatchupOpen] = useState(false)

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
  // Changing which agencies are in scope changes what each row totals and whether it's
  // claimable, so a selection made under the old scope can't carry over.
  useEffect(() => { setSelected(new Set()) }, [branch, agencyKey, combined, combinedKeys, fType, fYear, fMonth, fCutoff, hideRemitted])

  // In combined mode every figure is the sum across the ticked agencies, and a row is
  // claimable only when ALL of them are still free — matching the server, which locks
  // each covered agency and refuses a row where any one of them is already spoken for.
  const ee = (r: Row) => activeAgencies.reduce((s, a) => s + (r[a.eeField] as number), 0)
  const er = (r: Row) => activeAgencies.reduce((s, a) => s + (r[a.erField] as number), 0)
  const rfpOf = (r: Row) => activeAgencies.map(a => r[a.rfpField] as string | null).find(Boolean) ?? null
  const scopeLabel = combined
    ? (activeAgencies.length === AGENCIES.length ? 'All agencies' : activeAgencies.map(a => a.key).join(' + '))
    : agency.label

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
  }), [rows, agencyKey, combined, combinedKeys, fType, fYear, fMonth, fCutoff, hideRemitted])

  const selectable = shown.filter(r => !rfpOf(r) && !r.benefitsRemitted)
  const selRows = shown.filter(r => selected.has(r.id))
  const selTotal = selRows.reduce((s, r) => s + ee(r) + er(r), 0)

  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = (on: boolean) => setSelected(on ? new Set(selectable.map(r => r.id)) : new Set())

  const feesTotal = otherFees.feesTotal
  const rfpTotal = selTotal + feesTotal

  const openRfp = async () => {
    if (selRows.length === 0 || activeAgencies.length === 0) return
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
          source: 'benefit',
          // Server locks every agency listed, so a combined RFP can't be double-claimed.
          benefitTypes: activeAgencies.map(a => a.benefitType),
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
        <button onClick={() => setCatchupOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>
          <Plus size={14} /> Record Govcon catch-up
        </button>
      </div>
      <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>SSS, PhilHealth and Pag-IBIG contributions from locked payroll (employees & consultants). Tick lines and generate an RFP per agency — it appears under Expenses → RFP.</p>

      {/* Branch */}
      <div className="flex rounded-xl overflow-hidden border w-fit" style={{ borderColor: 'var(--light-gray)' }}>
        {BRANCHES.map(b => <button key={b.value} onClick={() => setBranch(b.value)} className="px-4 py-2 text-xs font-semibold" style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>{b.label}</button>)}
      </div>

      {/* Agency subtabs */}
      <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        {AGENCIES.map(a => (
          <button key={a.key} onClick={() => { setAgencyKey(a.key); setCombined(false); setShowAvailments(false) }} className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={{ borderColor: !showAvailments && !combined && agencyKey === a.key ? 'var(--teal)' : 'transparent', color: !showAvailments && !combined && agencyKey === a.key ? 'var(--teal)' : 'var(--mid-gray)' }}>{a.label}</button>
        ))}
        <button onClick={() => { setCombined(true); setShowAvailments(false) }} className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
          style={{ borderColor: !showAvailments && combined ? 'var(--teal)' : 'transparent', color: !showAvailments && combined ? 'var(--teal)' : 'var(--mid-gray)' }}>
          Combined RFP
        </button>
        <button onClick={() => setShowAvailments(true)} className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
          style={{ borderColor: showAvailments ? 'var(--teal)' : 'transparent', color: showAvailments ? 'var(--teal)' : 'var(--mid-gray)' }}>
          Benefit Availments
        </button>
      </div>

      {showAvailments && <Availments branch={branch} />}
      {!showAvailments && (<>

      {/* Combined-RFP agency picker */}
      {combined && (
        <div className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--teal)', background: 'var(--off-white)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Agencies in this RFP</p>
          <div className="flex items-center gap-4 flex-wrap">
            {AGENCIES.map(a => (
              <label key={a.key} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--charcoal)' }}>
                <input type="checkbox" checked={combinedKeys.has(a.key)} onChange={e => setCombinedKeys(prev => {
                  const n = new Set(prev)
                  e.target.checked ? n.add(a.key) : n.delete(a.key)
                  return n
                })} />
                {a.label}
              </label>
            ))}
          </div>
          <p className="text-[11px] mt-2" style={{ color: 'var(--mid-gray)' }}>
            Produces <strong>one</strong> RFP covering the ticked agencies, so it matches a single bank transfer. Amounts below are the combined EE + ER across them. A line is only selectable when none of the ticked agencies is already in another RFP.
          </p>
          {activeAgencies.length === 0 && <p className="text-[11px] mt-1 text-red-600">Tick at least one agency.</p>}
        </div>
      )}

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
              <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>{scopeLabel} EE</th>
              <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>{scopeLabel} ER</th>
              <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Total</th>
              <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}><Loader2 size={18} className="inline animate-spin" /></td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}>
                No {scopeLabel} contributions in locked payroll for this filter.
                <div className="mt-1 text-[11px]">Contributions appear once payroll is <strong>locked</strong> and the {scopeLabel} deduction falls on the selected cutoff.</div>
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
                  <td className="px-3 py-2.5 font-mono whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{r.cutoffPeriod.endsWith('-GOVCON')
                    ? <>{r.cutoffPeriod.slice(0, 7)} <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold font-sans" style={{ background: '#fef3c7', color: '#92400e' }}>Catch-up</span></>
                    : r.cutoffPeriod}</td>
                  <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{formatCurrency(ee(r))}</td>
                  <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{formatCurrency(er(r))}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(ee(r) + er(r))}</td>
                  <td className="px-3 py-2.5">
                    {r.benefitsRemitted ? <span className="text-[11px] font-medium" style={{ color: '#166534' }}>Remitted</span>
                      : rfpOf(r) ? <span className="text-[11px] font-medium" style={{ color: '#c44b00' }}>In RFP</span>
                      : <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Pending</span>}
                    {r.cutoffPeriod.endsWith('-GOVCON') && !locked && r.type === 'employee' && (
                      <button title="Delete this catch-up (reverses its journal entry and staff loan)" onClick={async () => {
                        if (!confirm(`Delete the Govcon catch-up for ${r.name} (${r.cutoffPeriod.slice(0, 7)})? Its journal entry and staff loan are reversed.`)) return
                        const res = await fetch(`/api/payroll/govcon-catchup?id=${r.id}`, { method: 'DELETE' })
                        if (!res.ok) { alert((await res.json().catch(() => ({}))).error || 'Failed to delete') } else load()
                      }} className="ml-2 p-0.5 rounded hover:bg-red-50 align-middle"><Trash2 size={12} className="text-red-400" /></button>
                    )}
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
            <BadgeDollarSign size={14} /> Generate {scopeLabel} RFP
          </button>
        </div>
      )}

      {/* RFP modal */}
      {rfpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Generate {scopeLabel} Payable RFP</h2>
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
      {catchupOpen && <GovconCatchupModal defaultBranch={branch} onClose={() => setCatchupOpen(false)} onSaved={() => { setCatchupOpen(false); load() }} />}
    </div>
  )
}

// ── Govcon catch-up modal ─────────────────────────────────────────────────────
// Records SSS/PHIC/HDMF for a month with NO payroll (unpaid month, maternity):
// the person had no payslip, so no payable was ever recognized — yet the
// remittance must still go out (and match). Creates a contributions-only row
// this page can remit like any other, posting either
//   DEDUCT  (hulugan): EE share → 1160 Due from Employees + a GOVCON staff loan
//                      repaid by deductions on the coming payrolls
//   COMPANY (maternity/shouldered): EE share booked as contribution expense
interface CatchupEmployee { id: string; firstName: string; lastName: string }
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function GovconCatchupModal({ defaultBranch, onClose, onSaved }: { defaultBranch: string; onClose: () => void; onSaved: () => void }) {
  const now = new Date()
  const [f, setF] = useState({
    branch: defaultBranch, employeeId: '', month: String(now.getMonth() === 0 ? 12 : now.getMonth()), year: String(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()),
    entryDate: now.toISOString().slice(0, 10), mode: 'DEDUCT' as 'DEDUCT' | 'COMPANY', perCutoff: '', notes: '',
    sssEE: '', sssER: '', philEE: '', philER: '', pagEE: '', pagER: '',
  })
  const [employees, setEmployees] = useState<CatchupEmployee[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))
  const n = (v: string) => Number(v) || 0
  useEffect(() => {
    fetch(`/api/payroll/employees?branch=${f.branch}&includeInactive=true`).then(r => r.ok ? r.json() : []).then(j => setEmployees(Array.isArray(j) ? j : [])).catch(() => setEmployees([]))
  }, [f.branch])
  const eeTotal = n(f.sssEE) + n(f.philEE) + n(f.pagEE)
  const erTotal = n(f.sssER) + n(f.philER) + n(f.pagER)
  const total = eeTotal + erTotal
  const save = async () => {
    setErr('')
    if (!f.employeeId) { setErr('Pick the employee.'); return }
    if (!(total > 0)) { setErr('Enter at least one contribution amount.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/payroll/govcon-catchup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        employeeId: f.employeeId, branch: f.branch, month: Number(f.month), year: Number(f.year), entryDate: f.entryDate,
        mode: f.mode, perCutoff: n(f.perCutoff), notes: f.notes,
        sssEE: n(f.sssEE), sssER: n(f.sssER), philEE: n(f.philEE), philER: n(f.philER), pagEE: n(f.pagEE), pagER: n(f.pagER),
      }) })
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || 'Failed to record catch-up'); return }
      onSaved()
    } finally { setBusy(false) }
  }
  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'
  const lbl = 'block text-[11px] font-semibold mb-1'
  const bc = { borderColor: 'var(--light-gray)' }
  const mg = { color: 'var(--mid-gray)' }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-5 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Record Govcon Catch-up</h2>
          <button onClick={onClose}><X size={18} style={mg} /></button>
        </div>
        <p className="text-xs mb-3" style={mg}>For a month with <strong>no payroll</strong> (unpaid month, maternity leave): recognizes the SSS/PHIC/HDMF payable so it can be remitted and tagged here like any payroll row.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2"><label className={lbl} style={mg}>Employee</label>
            <select value={f.employeeId} onChange={e => set('employeeId', e.target.value)} className={inp} style={bc}><option value="">— Select —</option>{[...employees].sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)).map(e => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>)}</select>
          </div>
          <div><label className={lbl} style={mg}>Branch</label>
            <select value={f.branch} onChange={e => setF(p => ({ ...p, branch: e.target.value, employeeId: '' }))} className={inp} style={bc}>{BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}</select>
          </div>
          <div><label className={lbl} style={mg}>Record date</label><input type="date" value={f.entryDate} onChange={e => set('entryDate', e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Contribution month</label>
            <select value={f.month} onChange={e => set('month', e.target.value)} className={inp} style={bc}>{MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          </div>
          <div><label className={lbl} style={mg}>Year</label><input value={f.year} onChange={e => set('year', e.target.value)} inputMode="numeric" className={inp + ' font-mono'} style={bc} /></div>
        </div>

        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <div className="grid grid-cols-3 gap-3">
            {([['SSS', 'sssEE', 'sssER'], ['PhilHealth', 'philEE', 'philER'], ['Pag-IBIG', 'pagEE', 'pagER']] as const).map(([label, eeK, erK]) => (
              <div key={label}>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>{label}</p>
                <label className={lbl} style={mg}>EE share</label><input value={f[eeK]} onChange={e => set(eeK, e.target.value)} inputMode="decimal" placeholder="0.00" className={inp + ' font-mono mb-2'} style={bc} />
                <label className={lbl} style={mg}>ER share</label><input value={f[erK]} onChange={e => set(erK, e.target.value)} inputMode="decimal" placeholder="0.00" className={inp + ' font-mono'} style={bc} />
              </div>
            ))}
          </div>
          <p className="text-[11px] mt-2 font-mono" style={{ color: '#334155' }}>EE {formatCurrency(eeTotal)} + ER {formatCurrency(erTotal)} = <strong>{formatCurrency(total)}</strong> payable</p>
        </div>

        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Who shoulders the employee share?</p>
          <label className="flex items-start gap-2 text-xs mb-2" style={{ color: 'var(--charcoal)' }}>
            <input type="radio" name="gcmode" checked={f.mode === 'DEDUCT'} onChange={() => set('mode', 'DEDUCT')} className="mt-0.5" />
            <span><strong>Deduct from coming payrolls (hulugan)</strong> — the EE share goes to 1160 Due from Employees and opens a GOVCON staff loan; payroll suggests the deduction every cutoff until repaid.</span>
          </label>
          {f.mode === 'DEDUCT' && (
            <div className="ml-6 mb-2 w-48"><label className={lbl} style={mg}>Deduction per cutoff <span className="font-normal text-gray-400">(hulog)</span></label><input value={f.perCutoff} onChange={e => set('perCutoff', e.target.value)} inputMode="decimal" placeholder="0.00" className={inp + ' font-mono'} style={bc} /></div>
          )}
          <label className="flex items-start gap-2 text-xs" style={{ color: 'var(--charcoal)' }}>
            <input type="radio" name="gcmode" checked={f.mode === 'COMPANY'} onChange={() => set('mode', 'COMPANY')} className="mt-0.5" />
            <span><strong>Company-shouldered</strong> — e.g. maternity leave (benefit is contribution-inclusive): the EE share is booked as contribution expense, nothing is deducted from the employee.</span>
          </label>
        </div>

        <div className="mt-3"><label className={lbl} style={mg}>Notes</label><input value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. Maternity leave June–Aug; per HDMF loan requirement" className={inp} style={bc} /></div>

        {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 mt-3" style={{ background: 'var(--deep-teal)' }}>
          {busy ? <Loader2 size={15} className="inline animate-spin" /> : `Record ${MONTH_NAMES[Number(f.month) - 1]} ${f.year} catch-up · ${formatCurrency(total)}`}
        </button>
      </div>
    </div>
  )
}
