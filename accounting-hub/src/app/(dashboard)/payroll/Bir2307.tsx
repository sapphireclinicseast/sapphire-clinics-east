'use client'

/**
 * Payroll → Service Invoice → BIR 2307 Generator + Settings.
 *
 * Migrated from the HR hub's "Service Invoice Monitor". Differences from the
 * HR version, per the owner's spec:
 *  - Payee address comes from the Consultant List's "BIR Address" field (and
 *    TIN from the consultant record) instead of free typing;
 *  - the income table pre-fills per month from FINALIZED payroll entries in
 *    the chosen period (editable — every figure can be overridden);
 *  - payor info and the signatory (name + title, printed with the e-signature
 *    on the certificate) are per-branch settings, editable in 2307 Settings.
 */

import { useState, useEffect, useCallback } from 'react'
import { Loader2, FileText, Eye, Download, Plus, X, RotateCcw, Save } from 'lucide-react'
import { generateBir2307Pdf, type Bir2307Row } from '@/lib/bir2307-pdf'

interface Consultant { id: string; name: string; branch: string; tinNumber?: string | null; birAddress?: string | null; isActive?: boolean }
interface BranchSettings { payorName: string; payorTin: string; payorAddress: string; payorZip: string; signatoryName: string; signatoryTitle: string }

const BRANCHES = [
  { value: 'SBEA', label: 'East Branch' },
  { value: 'SBGH', label: 'Greenhills Branch' },
  { value: 'VERDANA', label: 'Verdana Store' },
]
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (ym: string) => { const [y, m] = ym.split('-'); return `${MON[parseInt(m) - 1]} ${y}` }
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const inputCls = 'w-full px-3 py-2 rounded-xl border text-sm outline-none focus:border-[var(--teal)]'
const inputStyle = { borderColor: 'var(--light-gray)' }
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wide mb-1'
const labelStyle = { color: 'var(--mid-gray)' }

interface IncomeRow extends Bir2307Row { id: number }
let rowSeq = 0
const newRow = (): IncomeRow => ({ id: ++rowSeq, desc: 'Professional Fees', atc: 'WI010', m1: 0, m2: 0, m3: 0, total: 0, tax: 0 })
const recalc = (r: IncomeRow): IncomeRow => {
  const total = (r.m1 || 0) + (r.m2 || 0) + (r.m3 || 0)
  return { ...r, total: Math.round(total * 100) / 100, tax: Math.round(total * 0.05 * 100) / 100 }
}

export function Bir2307Generator({ branch, canWrite }: { branch: string; canWrite: boolean }) {
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [settings, setSettings] = useState<Record<string, BranchSettings>>({})
  const [consultantId, setConsultantId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [payee, setPayee] = useState({ name: '', tin: '', address: '', zip: '' })
  const [payorBranch, setPayorBranch] = useState(BRANCHES.some(b => b.value === branch) ? branch : 'SBEA')
  const [payor, setPayor] = useState({ name: '', tin: '', address: '', zip: '' })
  const [rows, setRows] = useState<IncomeRow[]>([newRow()])
  const [monthCols, setMonthCols] = useState<string[]>([])
  const [autoNote, setAutoNote] = useState('')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{ url: string; filename: string } | null>(null)

  useEffect(() => {
    fetch('/api/payroll/consultants').then(r => r.ok ? r.json() : [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => {
        const list: Consultant[] = Array.isArray(d) ? d : (d.consultants || [])
        setConsultants(list.filter(c => c.isActive !== false).sort((a, b) => a.name.localeCompare(b.name)))
      }).catch(() => setConsultants([]))
    fetch('/api/payroll/bir-2307?mode=settings').then(r => r.ok ? r.json() : { settings: {} })
      .then(d => setSettings(d.settings || {})).catch(() => setSettings({}))
  }, [])

  // Payor auto-fill when the branch (or loaded settings) change.
  useEffect(() => {
    const s = settings[payorBranch]
    if (s) setPayor({ name: s.payorName || '', tin: s.payorTin || '', address: s.payorAddress || '', zip: s.payorZip || '' })
  }, [payorBranch, settings])

  // Payee auto-fill from the consultant record (BIR Address per Consultant List).
  const onConsultant = (id: string) => {
    setConsultantId(id)
    const c = consultants.find(x => x.id === id)
    setPayee({ name: c?.name || '', tin: c?.tinNumber || '', address: c?.birAddress || '', zip: '' })
    if (c && BRANCHES.some(b => b.value === c.branch)) setPayorBranch(c.branch)
    setResult(null)
  }

  // Auto-compute the income table from finalized payroll for the period.
  const loadAmounts = useCallback(async () => {
    if (!consultantId || !from || !to) return
    try {
      const r = await fetch(`/api/payroll/bir-2307?mode=amounts&consultantId=${consultantId}&from=${from}&to=${to}`)
      if (!r.ok) return
      const d = await r.json()
      const months: { month: string; gross: number; entries: number }[] = d.months || []
      setMonthCols(months.map(m => m.month))
      const covered = months.reduce((s, m) => s + m.entries, 0)
      setRows(prev => {
        const first = prev[0] || newRow()
        const filled = recalc({ ...first, m1: months[0]?.gross || 0, m2: months[1]?.gross || 0, m3: months[2]?.gross || 0 })
        return [filled, ...prev.slice(1)]
      })
      setAutoNote(covered
        ? `Auto-filled from ${covered} finalized payroll entr${covered === 1 ? 'y' : 'ies'} — edit any figure to override.`
        : 'No finalized payroll found in this period — enter the amounts manually (or finalize payroll first).')
    } catch { /* keep manual figures */ }
  }, [consultantId, from, to])
  useEffect(() => { loadAmounts() }, [loadAmounts])

  const setRowField = (id: number, patch: Partial<IncomeRow>) =>
    setRows(prev => prev.map(r => r.id === id ? recalc({ ...r, ...patch }) : r))

  const totals = rows.reduce((a, r) => ({ m1: a.m1 + r.m1, m2: a.m2 + r.m2, m3: a.m3 + r.m3, total: a.total + r.total, tax: a.tax + r.tax }),
    { m1: 0, m2: 0, m3: 0, total: 0, tax: 0 })

  const generate = async () => {
    if (!payee.name) { alert('Select a consultant first.'); return }
    setGenerating(true)
    setResult(null)
    try {
      const s = settings[payorBranch]
      const bytes = await generateBir2307Pdf({
        payee, payor, fromDate: from, toDate: to,
        rows: rows.map(({ desc, atc, m1, m2, m3, total, tax }) => ({ desc, atc, m1, m2, m3, total, tax })),
        signatory: { name: s?.signatoryName || 'HANNAH JARA', title: s?.signatoryTitle || '(CEO AND PRESIDENT)' },
      })
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
      const safeName = payee.name.replace(/[^a-zA-Z0-9]/g, '_')
      const filename = `BIR2307_${safeName}_${from ? from.replace(/-/g, '') : 'undated'}.pdf`
      setResult({ url: URL.createObjectURL(blob), filename })
    } catch (e) {
      alert(`PDF generation failed: ${e instanceof Error ? e.message : ''}`)
    }
    setGenerating(false)
  }

  const clearForm = () => {
    setConsultantId(''); setFrom(''); setTo('')
    setPayee({ name: '', tin: '', address: '', zip: '' })
    setRows([newRow()]); setMonthCols([]); setAutoNote(''); setResult(null)
  }

  const colLabel = (i: number) => monthCols[i] ? `${['1st', '2nd', '3rd'][i]} Month (${monthLabel(monthCols[i])})` : `${['1st', '2nd', '3rd'][i]} Month`

  return (
    <div className="rounded-2xl border bg-white p-5 space-y-5" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex items-center gap-2">
        <FileText size={18} style={{ color: 'var(--teal)' }} />
        <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>BIR Form 2307 Generator</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className={labelCls} style={labelStyle}>Consultant *</label>
          <select value={consultantId} onChange={e => onConsultant(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">— Select Consultant —</option>
            {consultants.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Period From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} style={inputStyle} />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Period To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} style={inputStyle} />
        </div>
      </div>

      <div>
        <p className="text-xs font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Part I — Payee Information (Consultant)</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls} style={labelStyle}>TIN</label>
            <input value={payee.tin} onChange={e => setPayee(p => ({ ...p, tin: e.target.value }))} className={inputCls} style={inputStyle} placeholder="000-000-000" />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Name</label>
            <input value={payee.name} readOnly className={inputCls} style={{ ...inputStyle, background: 'var(--off-white)' }} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Registered Address (from Consultant List · BIR Address)</label>
            <input value={payee.address} onChange={e => setPayee(p => ({ ...p, address: e.target.value }))} className={inputCls} style={inputStyle}
              placeholder="Set the BIR Address in the Consultant List to auto-fill" />
          </div>
          <div className="max-w-[120px]">
            <label className={labelCls} style={labelStyle}>Zip Code</label>
            <input value={payee.zip} onChange={e => setPayee(p => ({ ...p, zip: e.target.value }))} className={inputCls} style={inputStyle} placeholder="ZIP" />
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Part II — Payor Information (Company)</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls} style={labelStyle}>Branch *</label>
            <select value={payorBranch} onChange={e => setPayorBranch(e.target.value)} className={inputCls} style={inputStyle}>
              {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>TIN</label>
            <input value={payor.tin} readOnly className={inputCls} style={{ ...inputStyle, background: 'var(--off-white)' }} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Payor&apos;s Name</label>
            <input value={payor.name} readOnly className={inputCls} style={{ ...inputStyle, background: 'var(--off-white)' }} />
          </div>
          <div className="max-w-[120px]">
            <label className={labelCls} style={labelStyle}>Zip Code</label>
            <input value={payor.zip} readOnly className={inputCls} style={{ ...inputStyle, background: 'var(--off-white)' }} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls} style={labelStyle}>Registered Address</label>
            <input value={payor.address} readOnly className={inputCls} style={{ ...inputStyle, background: 'var(--off-white)' }} />
          </div>
        </div>
        <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>Payor fields come from 2307 Settings for the chosen branch.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold" style={{ color: 'var(--charcoal)' }}>Part III — Income Payments</p>
          {autoNote && <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{autoNote}</p>}
        </div>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-xs" style={{ minWidth: 760 }}>
            <thead>
              <tr style={{ background: 'var(--off-white)' }}>
                {['Income Payment Description', 'ATC', colLabel(0), colLabel(1), colLabel(2), 'Total', 'Tax Withheld (5%)', ''].map((h, i) => (
                  <th key={i} className="px-2 py-2 text-left font-semibold whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-2 py-1.5" style={{ minWidth: 200 }}>
                    <input value={r.desc} onChange={e => setRowField(r.id, { desc: e.target.value })} className="w-full px-2 py-1 rounded-lg border text-xs" style={inputStyle} />
                  </td>
                  <td className="px-2 py-1.5" style={{ width: 80 }}>
                    <input value={r.atc} onChange={e => setRowField(r.id, { atc: e.target.value })} className="w-full px-2 py-1 rounded-lg border text-xs" style={inputStyle} />
                  </td>
                  {(['m1', 'm2', 'm3'] as const).map(k => (
                    <td key={k} className="px-2 py-1.5" style={{ width: 110 }}>
                      <input type="number" step="0.01" min="0" value={r[k] || ''} placeholder="0"
                        onChange={e => setRowField(r.id, { [k]: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1 rounded-lg border text-xs text-right" style={inputStyle} />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{peso(r.total)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{peso(r.tax)}</td>
                  <td className="px-2 py-1.5">
                    {rows.length > 1 && (
                      <button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="p-1 rounded-lg" style={{ color: '#b91c1c' }} title="Remove row">
                        <X size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="border-t font-bold" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <td className="px-2 py-2">TOTAL</td><td />
                <td className="px-2 py-2 text-right">{peso(totals.m1)}</td>
                <td className="px-2 py-2 text-right">{peso(totals.m2)}</td>
                <td className="px-2 py-2 text-right">{peso(totals.m3)}</td>
                <td className="px-2 py-2 text-right">{peso(totals.total)}</td>
                <td className="px-2 py-2 text-right">{peso(totals.tax)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button onClick={() => setRows(prev => [...prev, newRow()])} className="flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            <Plus size={13} /> Add Row
          </button>
          <button onClick={loadAmounts} className="flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }} title="Re-fill the first row's months from finalized payroll">
            <RotateCcw size={13} /> Reset to payroll amounts
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={generate} disabled={!canWrite || generating || !consultantId}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
          {generating ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Generate BIR 2307 PDF
        </button>
        <button onClick={clearForm} className="px-4 py-2.5 rounded-xl border text-sm font-semibold" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
          Clear Form
        </button>
        {result && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <span className="text-xs font-semibold" style={{ color: '#16a34a' }}>Generated</span>
            <a href={result.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--teal)' }}>
              <Eye size={13} /> View
            </a>
            <a href={result.url} download={result.filename} className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--teal)' }}>
              <Download size={13} /> Download
            </a>
          </div>
        )}
      </div>
      <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
        The certificate prints the payor signatory (name, title and e-signature) from 2307 Settings, and the consultant&apos;s printed name on the payee line.
      </p>
    </div>
  )
}

export function Bir2307Settings({ canWrite }: { canWrite: boolean }) {
  const [settings, setSettings] = useState<Record<string, BranchSettings>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState('')

  useEffect(() => {
    fetch('/api/payroll/bir-2307?mode=settings').then(r => r.ok ? r.json() : { settings: {} })
      .then(d => { setSettings(d.settings || {}); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const setField = (branch: string, k: keyof BranchSettings, v: string) =>
    setSettings(prev => ({ ...prev, [branch]: { ...prev[branch], [k]: v } }))

  const saveAll = async () => {
    setSaving(true)
    try {
      for (const b of BRANCHES) {
        const s = settings[b.value]
        if (!s) continue
        const r = await fetch('/api/payroll/bir-2307', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branch: b.value, ...s }),
        })
        if (!r.ok) { alert((await r.json()).error || `Failed to save ${b.label}`); setSaving(false); return }
      }
      setSavedAt(new Date().toLocaleTimeString('en-PH'))
    } catch { alert('Failed to save settings') }
    setSaving(false)
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={18} style={{ color: 'var(--teal)' }} /></div>

  return (
    <div className="rounded-2xl border bg-white p-5 space-y-4" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>2307 Payor Settings</h3>
        {canWrite && (
          <button onClick={saveAll} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Settings
          </button>
        )}
      </div>
      <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
        Company information and certificate signatory per branch — these auto-fill the generator and print on the BIR 2307.
        {savedAt && <span style={{ color: '#16a34a' }}> Saved {savedAt}.</span>}
      </p>
      {BRANCHES.map(b => {
        const s = settings[b.value] || { payorName: '', payorTin: '', payorAddress: '', payorZip: '', signatoryName: '', signatoryTitle: '' }
        return (
          <div key={b.value} className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <p className="text-xs font-bold" style={{ color: 'var(--charcoal)' }}>{b.label}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls} style={labelStyle}>Company / Registered Name</label>
                <input value={s.payorName} onChange={e => setField(b.value, 'payorName', e.target.value)} disabled={!canWrite} className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>TIN</label>
                <input value={s.payorTin} onChange={e => setField(b.value, 'payorTin', e.target.value)} disabled={!canWrite} className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Registered Address</label>
                <input value={s.payorAddress} onChange={e => setField(b.value, 'payorAddress', e.target.value)} disabled={!canWrite} className={inputCls} style={inputStyle} />
              </div>
              <div className="max-w-[140px]">
                <label className={labelCls} style={labelStyle}>Zip Code</label>
                <input value={s.payorZip} onChange={e => setField(b.value, 'payorZip', e.target.value)} disabled={!canWrite} className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Signatory Name</label>
                <input value={s.signatoryName} onChange={e => setField(b.value, 'signatoryName', e.target.value)} disabled={!canWrite} className={inputCls} style={inputStyle} placeholder="HANNAH JARA" />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Signatory Title</label>
                <input value={s.signatoryTitle} onChange={e => setField(b.value, 'signatoryTitle', e.target.value)} disabled={!canWrite} className={inputCls} style={inputStyle} placeholder="(CEO AND PRESIDENT)" />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
