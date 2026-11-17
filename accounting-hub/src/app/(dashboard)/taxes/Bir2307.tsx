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
import { Loader2, FileText, Eye, Download, Plus, X, RotateCcw, Save, CheckCircle2, Building2 } from 'lucide-react'
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
/** "East", "Greenhills", "Verdana" — for notes and file names. */
const branchShort = (v: string) => (BRANCHES.find(b => b.value === v)?.label || v).replace(/ (Branch|Store)$/, '')
type BranchPaid = Record<string, { gross: number; tax: number; entries: number }>
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

/** HR Hub section card: light header (badge, title, optional right-hand slot) over a white body. */
function SectionCard({ badge, title, aside, children }: { badge: ReactNode; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex items-center gap-2.5 flex-wrap px-4 py-2.5 border-b" style={{ background: 'var(--hr-head)', borderColor: 'var(--hr-line)' }}>
        {badge}
        <h3 className="text-[13px] font-bold" style={{ color: 'var(--charcoal)' }}>{title}</h3>
        {aside && <div className="ml-auto flex items-center gap-1.5 flex-wrap">{aside}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}
const badgeCls = 'inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold'
const badgeStyle = { background: 'var(--pale-teal)', color: 'var(--deep-teal)' }

const PILL = {
  green: { background: '#dcfce7', color: '#166534' },
  amber: { background: '#fef3c7', color: '#92400e' },
  red: { background: '#fee2e2', color: '#b91c1c' },
  blue: { background: '#eff6ff', color: '#1d4ed8' },
  grey: { background: 'var(--off-white)', color: 'var(--mid-gray)' },
}
const pill = (tone: keyof typeof PILL, text: string, icon?: ReactNode) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={PILL[tone]}>{icon}{text}</span>
)

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
  // Branches the consultant was paid at in the period. Each branch is its own
  // payor (own TIN branch code), so an interbranch consultant gets one 2307
  // per branch, each with that branch's payroll only.
  const [paidAt, setPaidAt] = useState<BranchPaid>({})
  // Picked by hand: never switch the branch for them.
  const [branchTouched, setBranchTouched] = useState(false)
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
    setBranchTouched(false)
    setPaidAt({})
    setResult(null)
  }

  // Auto-compute the income table from finalized payroll for the period.
  const loadAmounts = useCallback(async () => {
    if (!consultantId || !from || !to) return
    try {
      const r = await fetch(`/api/payroll/bir-2307?mode=amounts&consultantId=${consultantId}&from=${from}&to=${to}&branch=${payorBranch}`)
      if (!r.ok) return
      const d = await r.json()
      const all: BranchPaid = d.branches || {}
      const paid = BRANCHES.map(b => b.value).filter(b => all[b] && (all[b].gross || all[b].tax))
      setPaidAt(Object.fromEntries(paid.map(b => [b, all[b]])))
      // Paid at one branch only, and not the one showing (e.g. an East
      // consultant who works only at Greenhills): that branch is the payor.
      if (!branchTouched && paid.length === 1 && paid[0] !== payorBranch) { setPayorBranch(paid[0]); return }
      const months: { month: string; gross: number; entries: number }[] = d.months || []
      setMonthCols(months.map(m => m.month))
      const covered = months.reduce((s, m) => s + m.entries, 0)
      setRows(prev => {
        const first = prev[0] || newRow()
        const filled = recalc({ ...first, m1: months[0]?.gross || 0, m2: months[1]?.gross || 0, m3: months[2]?.gross || 0 })
        return [filled, ...prev.slice(1)]
      })
      const only = paid.length > 1 ? ` ${branchShort(payorBranch)}` : ''
      // ₱0 lines at a branch that paid nothing (e.g. a closed East cutoff for
      // someone working only at Greenhills) are not "auto-filled" figures.
      const nothingHere = paid.length > 0 && !paid.includes(payorBranch)
      setAutoNote(covered && !nothingHere
        ? `Auto-filled from ${covered} finalized${only} payroll entr${covered === 1 ? 'y' : 'ies'} — edit any figure to override.`
        : paid.length
          ? `No ${branchShort(payorBranch)} payroll in this period — enter the amounts manually or switch branch.`
          : 'No finalized payroll found in this period — enter the amounts manually (or finalize payroll first).')
    } catch { /* keep manual figures */ }
  }, [consultantId, from, to, payorBranch, branchTouched])
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
      const branchTag = Object.keys(paidAt).length > 1 ? `_${branchShort(payorBranch)}` : ''
      const filename = `BIR2307_${safeName}_${from ? from.replace(/-/g, '') : 'undated'}${branchTag}.pdf`
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
    setPaidAt({}); setBranchTouched(false)
  }
  const pickBranch = (b: string) => { setPayorBranch(b); setBranchTouched(true); setResult(null) }
  const paidBranches = Object.keys(paidAt)
  const interbranch = paidBranches.length > 1
  const otherPaid = paidBranches.filter(b => b !== payorBranch)

  const colLabel = (i: number) => monthCols[i] ? `${['1st', '2nd', '3rd'][i]} month · ${monthLabel(monthCols[i])}` : `${['1st', '2nd', '3rd'][i]} month`
  const consultantName = consultants.find(c => c.id === consultantId)?.name || ''
  const periodText = from && to ? `${shortDay(from)} – ${shortDay(to)}` : from ? `From ${shortDay(from)}` : to ? `To ${shortDay(to)}` : ''

  // 2307 Generator in the HR Hub look (Hannah 11/16: "make the 2307 Generator
  // view look like this too"): summary cards, numbered section cards with light
  // headers, read-only payor details as text, one action bar.
  const section = (n: number, title: string, body: ReactNode, aside?: ReactNode) => (
    <SectionCard badge={<span className={badgeCls} style={badgeStyle}>{n}</span>} title={title} aside={aside}>{body}</SectionCard>
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
        <StatCard label="Total income" value={`₱${peso(totals.total)}`} sub={rows.length > 1 ? `${rows.length} income rows` : interbranch ? `${branchShort(payorBranch)} payroll only` : 'Professional fees'}
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
                <select value={payorBranch} onChange={e => pickBranch(e.target.value)} className={inputCls} style={inputStyle}>
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
        ), interbranch ? pill('blue', `Paid at ${paidBranches.map(branchShort).join(' + ')} · one 2307 each`, <Building2 size={11} />) : undefined)}
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
          {otherPaid.length > 0 && (
            <div className="mt-3 flex items-center gap-2 flex-wrap rounded-lg px-3 py-2 text-xs" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
              <Building2 size={14} className="shrink-0" />
              <span className="flex-1 min-w-[240px]">
                {consultantName || 'This consultant'} was {paidAt[payorBranch] ? 'also ' : ''}paid at {otherPaid.map(b => `${branchShort(b)} (₱${peso(paidAt[b].gross)})`).join(' and ')} in this period.
                {' '}Each branch issues its own 2307 under its own TIN, so this one {paidAt[payorBranch] ? `covers ${branchShort(payorBranch)} payroll only` : `is for ${branchShort(payorBranch)}, which paid nothing`}.
              </span>
              {otherPaid.map(b => (
                <button key={b} onClick={() => pickBranch(b)} className={hrBtn.ghost} style={{ borderColor: '#bfdbfe', color: '#1d4ed8', background: '#fff' }}>
                  Make the {branchShort(b)} 2307
                </button>
              ))}
            </div>
          )}
        </>
      ), autoNote ? (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={autoNote.startsWith('Auto-filled') ? PILL.green : PILL.amber}>
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

const EMPTY_SETTINGS: BranchSettings = { payorName: '', payorTin: '', payorAddress: '', payorZip: '', signatoryName: '', signatoryTitle: '' }
/** What each field is called when it is blank ("Missing TIN, zip"). */
const REQUIRED: [keyof BranchSettings, string][] = [
  ['payorName', 'name'], ['payorTin', 'TIN'], ['payorAddress', 'address'], ['payorZip', 'zip'],
  ['signatoryName', 'signatory'], ['signatoryTitle', 'title'],
]
const missingOf = (s?: BranchSettings) => REQUIRED.filter(([k]) => !(s?.[k] || '').trim()).map(([, l]) => l)
const sameSettings = (a?: BranchSettings, b?: BranchSettings) =>
  (Object.keys(EMPTY_SETTINGS) as (keyof BranchSettings)[]).every(k => (a?.[k] || '') === (b?.[k] || ''))

// 2307 Settings in the HR Hub look (Hannah 11/17: "make the 2307 Settings view
// look like this too"): summary cards, a toolbar with Save, and one section
// card per branch with its status pills. Saving is unchanged (every branch).
export function Bir2307Settings({ canWrite }: { canWrite: boolean }) {
  const [settings, setSettings] = useState<Record<string, BranchSettings>>({})
  /** What the server last held, to show which branches have unsaved edits. */
  const [baseline, setBaseline] = useState<Record<string, BranchSettings>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState('')
  const sig = useSignatureStatus()

  useEffect(() => {
    fetch('/api/payroll/bir-2307?mode=settings').then(r => r.ok ? r.json() : { settings: {} })
      .then(d => { setSettings(d.settings || {}); setBaseline(d.settings || {}); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const setField = (branch: string, k: keyof BranchSettings, v: string) =>
    setSettings(prev => ({ ...prev, [branch]: { ...prev[branch], [k]: v } }))

  const saveAll = async () => {
    setSaving(true)
    const sent = settings
    try {
      for (const b of BRANCHES) {
        const s = sent[b.value]
        if (!s) continue
        const r = await fetch('/api/payroll/bir-2307', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branch: b.value, ...s }),
        })
        if (!r.ok) { alert((await r.json()).error || `Failed to save ${b.label}`); setSaving(false); return }
        setBaseline(prev => ({ ...prev, [b.value]: s }))
      }
      setSavedAt(new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }))
    } catch { alert('Failed to save settings') }
    setSaving(false)
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={18} style={{ color: 'var(--teal)' }} /></div>

  const sOf = (b: string) => settings[b] || EMPTY_SETTINGS
  const incomplete = BRANCHES.filter(b => missingOf(sOf(b.value)).length)
  const dirty = BRANCHES.filter(b => !sameSettings(settings[b.value], baseline[b.value]))
  const sigSource = (b: string) => sig.signatures[b]?.source || 'none'
  const uploaded = BRANCHES.filter(b => sigSource(b.value) === 'uploaded').length
  const fromHr = BRANCHES.filter(b => sigSource(b.value) === 'default').length
  const noSig = BRANCHES.filter(b => sigSource(b.value) === 'none')
  const signatories = [...new Set(BRANCHES.map(b => sOf(b.value).signatoryName.trim()).filter(Boolean))]
  const short = (bs: typeof BRANCHES) => bs.map(b => b.label.replace(/ (Branch|Store)$/, '')).join(', ')

  const field = (b: string, k: keyof BranchSettings, label: string, opts: { wide?: boolean; placeholder?: string } = {}) => {
    const changed = (sOf(b)[k] || '') !== (baseline[b]?.[k] || '')
    return (
      <div className={opts.wide ? 'sm:col-span-2' : ''}>
        <label className={labelCls} style={labelStyle}>
          {label}{changed && <span className="ml-1.5 normal-case tracking-normal" style={{ color: '#b45309' }}>· edited</span>}
        </label>
        <input value={sOf(b)[k] || ''} onChange={e => setField(b, k, e.target.value)} disabled={!canWrite} placeholder={opts.placeholder}
          className={inputCls} style={{ borderColor: changed ? '#f59e0b' : 'var(--light-gray)' }} />
      </div>
    )
  }
  const groupHead = (title: string, sub: string) => (
    <div>
      <p className="text-[12px] font-bold" style={{ color: 'var(--charcoal)' }}>{title}</p>
      <p className="text-[11px]" style={{ color: 'var(--hr-faint)' }}>{sub}</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Payor details" value={`${BRANCHES.length - incomplete.length} of ${BRANCHES.length} complete`}
          sub={incomplete.length ? `Missing in ${short(incomplete)}` : 'Name, TIN, address, zip, signatory'}
          tone={incomplete.length ? 'amber' : 'green'} compact />
        <StatCard label="Signatory" value={signatories.length === 1 ? signatories[0] : signatories.length ? `${signatories.length} names` : '—'}
          sub={signatories.length === 1 ? (sOf(BRANCHES[0].value).signatoryTitle || 'No title') : signatories.length ? 'Differs by branch' : 'Not set'}
          tone={signatories.length ? 'blue' : 'zero'} compact />
        <StatCard label="E-signatures" value={sig.loaded ? `${BRANCHES.length - noSig.length} of ${BRANCHES.length}` : '—'}
          sub={!sig.loaded ? 'Checking…' : noSig.length ? `None for ${short(noSig)}` : [uploaded && `${uploaded} uploaded`, fromHr && `${fromHr} from the HR hub`].filter(Boolean).join(' · ')}
          tone={!sig.loaded ? 'zero' : noSig.length ? 'red' : 'green'} compact />
        <StatCard label="Unsaved changes" value={dirty.length ? `${dirty.length} branch${dirty.length === 1 ? '' : 'es'}` : 'None'}
          sub={dirty.length ? short(dirty) : savedAt ? `Saved at ${savedAt}` : 'Matches what prints'}
          tone={dirty.length ? 'amber' : savedAt ? 'green' : 'zero'} compact />
      </div>

      <div className="rounded-lg border bg-white px-4 py-3 flex items-center gap-3 flex-wrap" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold" style={{ color: 'var(--charcoal)' }}>2307 payor settings</p>
          <p className="text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>
            Company details and the certificate signatory per branch. They fill the 2307 Generator and print on every BIR 2307.
          </p>
        </div>
        {canWrite ? (
          <button onClick={saveAll} disabled={saving} className={hrBtn.primary} style={{ background: 'var(--teal)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save settings
          </button>
        ) : pill('grey', 'View only')}
      </div>

      {BRANCHES.map(b => {
        const s = sOf(b.value)
        const missing = missingOf(s)
        const src = sigSource(b.value)
        return (
          <SectionCard key={b.value} title={b.label}
            badge={<span className={badgeCls} style={badgeStyle}><Building2 size={12} /></span>}
            aside={<>
              {dirty.some(d => d.value === b.value) && pill('amber', 'Unsaved')}
              {missing.length ? pill('amber', `Missing ${missing.join(', ')}`) : pill('green', 'Complete', <CheckCircle2 size={12} />)}
              {sig.loaded && (src === 'uploaded' ? pill('green', 'E-signature uploaded')
                : src === 'default' ? pill('blue', 'E-signature from the HR hub') : pill('red', 'No e-signature'))}
            </>}>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-5">
              <div className="space-y-3">
                {groupHead('Company', 'Prints in Part II — Payor and fills the generator')}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
                  {field(b.value, 'payorName', 'Registered name', { wide: true })}
                  {field(b.value, 'payorTin', 'TIN', { placeholder: '000-000-000-00000' })}
                  {field(b.value, 'payorZip', 'Zip code')}
                  {field(b.value, 'payorAddress', 'Registered address', { wide: true })}
                </div>
              </div>
              <div className="space-y-3">
                {groupHead('Signatory', 'Printed under the signature line')}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {field(b.value, 'signatoryName', 'Name', { placeholder: 'HANNAH JARA' })}
                  {field(b.value, 'signatoryTitle', 'Title', { placeholder: '(CEO AND PRESIDENT)' })}
                  <div className="sm:col-span-2">
                    <SignaturePanel branch={b.value} info={s} status={sig.signatures[b.value]} canManage={sig.canManage}
                      settings={settings} onChanged={sig.refresh} />
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>
        )
      })}
    </div>
  )
}
