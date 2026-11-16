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

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { Loader2, FileText, Eye, Download, Plus, X, RotateCcw, Save, CheckCircle2 } from 'lucide-react'
import { StatCard, hrBtn } from '@/components/ui/hr-look'
import { generateBir2307Pdf, type Bir2307Row } from '@/lib/bir2307-pdf'
import { SignaturePanel, SignatureStrip, useSignatureStatus } from './Bir2307Signature'

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
/** "2026-10-01" → "Oct 1, 2026". */
const shortDay = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return y && m && d ? `${MON[m - 1]} ${d}, ${y}` : ymd }

// HR Hub fields: 36px, 8px radius, white, green focus ring.
const inputCls = 'w-full h-9 px-3 rounded-lg border text-[13px] bg-white outline-none focus:border-[var(--teal)] disabled:bg-[var(--off-white)]'
const inputStyle = { borderColor: 'var(--light-gray)' }
const labelCls = 'block text-[11px] font-semibold uppercase tracking-[.4px] mb-1'
/** A compact field inside the income table. */
const cellCls = 'w-full h-8 px-2 rounded-md border text-xs bg-white outline-none focus:border-[var(--teal)]'
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
  const [stampSignature, setStampSignature] = useState(true)
  const sig = useSignatureStatus()

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
        signatureBranch: payorBranch,
        ...(stampSignature ? {} : { signaturePng: null }),
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

  const colLabel = (i: number) => monthCols[i] ? `${['1st', '2nd', '3rd'][i]} month · ${monthLabel(monthCols[i])}` : `${['1st', '2nd', '3rd'][i]} month`
  const consultantName = consultants.find(c => c.id === consultantId)?.name || ''
  const periodText = from && to ? `${shortDay(from)} – ${shortDay(to)}` : from ? `From ${shortDay(from)}` : to ? `To ${shortDay(to)}` : ''

  // 2307 Generator in the HR Hub look (Hannah 11/16: "make the 2307 Generator
  // view look like this too"): summary cards, numbered section cards with light
  // headers, read-only payor details as text, one action bar.
  const section = (n: number, title: string, body: ReactNode, aside?: ReactNode) => (
    <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex items-center gap-2.5 flex-wrap px-4 py-2.5 border-b" style={{ background: 'var(--hr-head)', borderColor: 'var(--hr-line)' }}>
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{n}</span>
        <h3 className="text-[13px] font-bold" style={{ color: 'var(--charcoal)' }}>{title}</h3>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      <div className="p-4">{body}</div>
    </div>
  )
  const readField = (label: string, value: string, wide = false) => (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <p className={labelCls} style={labelStyle}>{label}</p>
      <p className="text-[13px] min-h-[20px]" style={{ color: value ? 'var(--charcoal)' : 'var(--hr-faint)' }}>{value || '—'}</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Consultant" value={consultantName || '—'} sub={consultantName ? (payee.tin ? `TIN ${payee.tin}` : 'No TIN on file') : 'Pick one below'}
          tone={consultantName ? 'blue' : 'zero'} compact />
        <StatCard label="Period" value={periodText || '—'} sub={monthCols.length ? `${monthCols.length} month${monthCols.length === 1 ? '' : 's'} of payroll` : 'From – to dates'}
          tone={periodText ? 'blue' : 'zero'} compact />
        <StatCard label="Total income" value={`₱${peso(totals.total)}`} sub={rows.length > 1 ? `${rows.length} income rows` : 'Professional fees'}
          tone={totals.total ? 'green' : 'zero'} compact />
        <StatCard label="Tax withheld (5%)" value={`₱${peso(totals.tax)}`} sub="ATC WI010 · 5% EWT"
          tone={totals.tax ? 'amber' : 'zero'} compact />
      </div>

      {section(1, 'Consultant and period', (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls} style={labelStyle}>Consultant *</label>
            <select value={consultantId} onChange={e => onConsultant(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">— Select consultant —</option>
              {consultants.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Period from</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Period to</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} style={inputStyle} />
          </div>
        </div>
      ))}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {section(2, 'Part I — Payee (consultant)', (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={labelStyle}>TIN</label>
              <input value={payee.tin} onChange={e => setPayee(p => ({ ...p, tin: e.target.value }))} className={inputCls} style={inputStyle} placeholder="000-000-000" />
            </div>
            {readField('Name', payee.name)}
            <div className="sm:col-span-2 grid grid-cols-[1fr_110px] gap-3">
              <div>
                <label className={labelCls} style={labelStyle}>Registered address</label>
                <input value={payee.address} onChange={e => setPayee(p => ({ ...p, address: e.target.value }))} className={inputCls} style={inputStyle}
                  placeholder="Set the BIR Address in the Consultant List to auto-fill" />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Zip code</label>
                <input value={payee.zip} onChange={e => setPayee(p => ({ ...p, zip: e.target.value }))} className={inputCls} style={inputStyle} placeholder="ZIP" />
              </div>
            </div>
            <p className="sm:col-span-2 text-[11px]" style={{ color: 'var(--hr-faint)' }}>TIN and address come from the Consultant List (BIR Address); edit here for this certificate only.</p>
          </div>
        ))}

        {section(3, 'Part II — Payor (company)', (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls} style={labelStyle}>Branch *</label>
                <select value={payorBranch} onChange={e => setPayorBranch(e.target.value)} className={inputCls} style={inputStyle}>
                  {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>
              {readField('TIN', payor.tin)}
              {readField("Payor's name", payor.name)}
              {readField('Zip code', payor.zip)}
              {readField('Registered address', payor.address, true)}
            </div>
            <p className="text-[11px]" style={{ color: 'var(--hr-faint)' }}>From 2307 Settings for the chosen branch.</p>
            <SignatureStrip branch={payorBranch} info={settings[payorBranch]} status={sig.signatures[payorBranch]}
              canManage={sig.canManage} settings={settings} stamp={stampSignature} onStamp={setStampSignature} onChanged={sig.refresh} />
          </div>
        ))}
      </div>

      {section(4, 'Part III — Income payments', (
        <>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs" style={{ minWidth: 760 }}>
              <thead>
                <tr style={{ background: 'var(--hr-head)' }}>
                  {['Income payment description', 'ATC', colLabel(0), colLabel(1), colLabel(2), 'Total', 'Tax withheld (5%)', ''].map((h, i) => (
                    <th key={i} className={`px-2.5 py-2 text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap ${i >= 2 && i <= 6 ? 'text-right' : 'text-left'}`}
                      style={{ color: 'var(--mid-gray)', borderBottom: '1px solid var(--hr-line)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--hr-line)' }}>
                    <td className="px-2.5 py-1.5" style={{ minWidth: 200 }}>
                      <input value={r.desc} onChange={e => setRowField(r.id, { desc: e.target.value })} className={cellCls} style={inputStyle} />
                    </td>
                    <td className="px-2.5 py-1.5" style={{ width: 84 }}>
                      <input value={r.atc} onChange={e => setRowField(r.id, { atc: e.target.value })} className={cellCls} style={inputStyle} />
                    </td>
                    {(['m1', 'm2', 'm3'] as const).map(k => (
                      <td key={k} className="px-2.5 py-1.5" style={{ width: 130 }}>
                        <input type="number" step="0.01" min="0" value={r[k] || ''} placeholder="0"
                          onChange={e => setRowField(r.id, { [k]: parseFloat(e.target.value) || 0 })}
                          className={`${cellCls} text-right tabular-nums`} style={inputStyle} />
                      </td>
                    ))}
                    <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{peso(r.total)}</td>
                    <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums whitespace-nowrap" style={{ color: '#b45309' }}>{peso(r.tax)}</td>
                    <td className="px-2 py-1.5 text-center">
                      {rows.length > 1 && (
                        <button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="p-1 rounded-md hover:bg-[#fef2f2]" style={{ color: '#b91c1c' }} title="Remove row">
                          <X size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold" style={{ borderTop: '1px solid var(--light-gray)', background: 'var(--hr-head)' }}>
                  <td className="px-2.5 py-2 text-[11px] uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Total</td><td />
                  <td className="px-2.5 py-2 text-right tabular-nums">{peso(totals.m1)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{peso(totals.m2)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{peso(totals.m3)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{peso(totals.total)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums" style={{ color: '#b45309' }}>{peso(totals.tax)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button onClick={() => setRows(prev => [...prev, newRow()])} className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
              <Plus size={13} /> Add row
            </button>
            <button onClick={loadAmounts} className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} title="Re-fill the first row's months from finalized payroll">
              <RotateCcw size={13} /> Reset to payroll amounts
            </button>
          </div>
        </>
      ), autoNote ? (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
          style={autoNote.startsWith('Auto-filled') ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>
          {autoNote}
        </span>
      ) : undefined)}

      {/* Action bar */}
      <div className="rounded-lg border bg-white px-4 py-3 flex items-center gap-2 flex-wrap" style={{ borderColor: 'var(--light-gray)' }}>
        <button onClick={generate} disabled={!canWrite || generating || !consultantId} className={hrBtn.primary} style={{ background: 'var(--teal)' }}>
          {generating ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Generate BIR 2307 PDF
        </button>
        <button onClick={clearForm} className={hrBtn.outline} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
          Clear form
        </button>
        {result && (
          <span className="inline-flex items-center gap-3 h-9 px-3 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: '#166534' }}><CheckCircle2 size={14} /> Generated</span>
            <a href={result.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: 'var(--teal)' }}>
              <Eye size={13} /> View
            </a>
            <a href={result.url} download={result.filename} className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: 'var(--teal)' }}>
              <Download size={13} /> Download
            </a>
          </span>
        )}
        <p className="basis-full text-[11px] mt-1" style={{ color: 'var(--hr-faint)' }}>
          The certificate prints the payor signatory (name and title from 2307 Settings, with the branch&apos;s e-signature unless you untick it), and the consultant&apos;s printed name on the payee line.
        </p>
      </div>
    </div>
  )
}

export function Bir2307Settings({ canWrite }: { canWrite: boolean }) {
  const [settings, setSettings] = useState<Record<string, BranchSettings>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState('')
  const sig = useSignatureStatus()

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
              <SignaturePanel branch={b.value} info={s} status={sig.signatures[b.value]} canManage={sig.canManage}
                settings={settings} onChanged={sig.refresh} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
