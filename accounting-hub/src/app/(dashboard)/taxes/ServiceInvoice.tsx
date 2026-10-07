'use client'

/**
 * Payroll → Consultants → Service Invoice
 *
 * Tracks which consultants can issue a BIR Service Invoice (they have a
 * Certificate of Registration on file) and nudges them to actually do it.
 * Consultants with a COR sort to the top — they are expected to invoice every
 * month — and get "Send email reminder" / "Send SMS reminder" buttons that
 * carry the exact figures for their invoice (gross fees, EWT withheld, net,
 * and a description of services), computed from finalized payroll.
 *
 * The months selector (top-left) chooses WHICH cutoffs make up one invoice:
 * a consultant filing a single invoice for several months of service gets one
 * combined computation.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, FileText, Mail, MessageSquare, CheckCircle2, Upload, X, Eye, ChevronDown } from 'lucide-react'
import { ScanUpload } from '@/components/ScanUpload'
import { Bir2307Generator, Bir2307Settings } from './Bir2307'

// Payroll stores the legacy Sandbox branch codes (SBEA/SBGH); everything the
// clinics show outwardly is Aura Health branded — display the AHEA/AHGH codes
// (same ones on control numbers and PCVs) without touching the stored values.
const BRANCH_DISPLAY: Record<string, string> = { SBEA: 'AHEA', SBGH: 'AHGH', VERDANA: 'VER', AHI: 'AHI' }
const branchCode = (b: string) => BRANCH_DISPLAY[b] || b

interface Consultant {
  id: string
  name: string
  department: string
  branch: string
  email?: string | null
  phone?: string | null
  tinNumber?: string | null
  corUrl?: string | null
  corUploadedAt?: string | null
  no2303At?: string | null
  isActive?: boolean
}
interface Submission { consultantId: string; month: string; siUrl: string | null; uploadedAt: string }
interface Breakdown {
  consultant: string
  periods: string[]
  periodLabels: string
  gross: number
  ewt: number
  ewtRate: number
  net: number
  description: string
  coveredEntries: number
  email: string | null
  phone: string | null
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cutoffLabel = (cp: string) => {
  const [y, m, h] = cp.split('-')
  return `${MON[parseInt(m) - 1]} ${y} · ${h === '1' ? '1st' : '2nd'} half`
}

export default function ServiceInvoiceTab({ branch: branchProp, canWrite }: { branch?: string; canWrite: boolean }) {
  const now = new Date()
  // Mounted in the Taxes section with no parent branch selector — the tab
  // carries its own ('' = all branches). A parent-provided branch still wins.
  const [ownBranch, setOwnBranch] = useState('')
  const branch = branchProp ?? ownBranch
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [half, setHalf] = useState<0 | 1 | 2>(0) // 0 = whole month (both cutoffs)
  const filterCutoffs = useMemo(() => {
    const mm = String(month).padStart(2, '0')
    return half === 0 ? [`${year}-${mm}-1`, `${year}-${mm}-2`] : [`${year}-${mm}-${half}`]
  }, [year, month, half])

  // The cutoffs that make up ONE invoice. Defaults to the filter; the
  // "Months in this invoice" picker adds more when a consultant files a single
  // invoice covering several months.
  const [extraCutoffs, setExtraCutoffs] = useState<Set<string>>(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)
  const invoiceCutoffs = useMemo(
    () => [...new Set([...filterCutoffs, ...extraCutoffs])].sort(),
    [filterCutoffs, extraCutoffs])
  // Pickable history: the last 18 months of cutoffs up to the filter month.
  const pickable = useMemo(() => {
    const out: string[] = []
    let y = year, m = month
    for (let i = 0; i < 18; i++) {
      const mm = String(m).padStart(2, '0')
      out.push(`${y}-${mm}-2`, `${y}-${mm}-1`)
      m--; if (m === 0) { m = 12; y-- }
    }
    return out
  }, [year, month])

  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [view, setView] = useState<'track' | 'matrix' | 'gen2307' | 'settings2307'>('track')
  const [corTarget, setCorTarget] = useState<Consultant | null>(null)
  const [siTarget, setSiTarget] = useState<Consultant | null>(null)
  const [breakdowns, setBreakdowns] = useState<Record<string, Breakdown | 'loading' | { error: string }>>({})
  const [openRows, setOpenRows] = useState<Set<string>>(new Set())
  const [sendTarget, setSendTarget] = useState<{ c: Consultant; channel: 'EMAIL' | 'SMS' } | null>(null)
  const [sending, setSending] = useState(false)
  const [sentNote, setSentNote] = useState<Record<string, string>>({})

  // Months the current invoice selection covers ("YYYY-MM") — an SI upload
  // ticks every one of them, and the tracking rows show ✓/✗ per month.
  const invoiceMonths = useMemo(() => [...new Set(invoiceCutoffs.map(cp => cp.slice(0, 7)))].sort(), [invoiceCutoffs])
  // Compliance-matrix period (defaults: January of the filter year → filter month).
  const [mFrom, setMFrom] = useState(`${now.getFullYear()}-01`)
  const [mTo, setMTo] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [subs, setSubs] = useState<Record<string, Submission>>({})
  const subKey = (cid: string, month: string) => `${cid}|${month}`
  const loadSubs = useCallback(async (from: string, to: string) => {
    try {
      const r = await fetch(`/api/payroll/si-submissions?from=${from}&to=${to}`)
      const d = await r.json()
      if (r.ok) {
        setSubs(prev => {
          const n = { ...prev }
          for (const s of (d.submissions || []) as Submission[]) n[subKey(s.consultantId, s.month)] = s
          return n
        })
      }
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    if (invoiceMonths.length) loadSubs(invoiceMonths[0], invoiceMonths[invoiceMonths.length - 1])
  }, [invoiceMonths, loadSubs])
  useEffect(() => { if (view === 'matrix') loadSubs(mFrom, mTo) }, [view, mFrom, mTo, loadSubs])

  const recordSi = async (c: Consultant, siUrl: string | null, months: string[]) => {
    const r = await fetch('/api/payroll/si-submissions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consultantId: c.id, months, siUrl }),
    })
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error || 'Failed to record invoice'); return }
    const at = new Date().toISOString()
    setSubs(prev => {
      const n = { ...prev }
      for (const m of months) n[subKey(c.id, m)] = { consultantId: c.id, month: m, siUrl, uploadedAt: at }
      return n
    })
  }
  const unrecordSi = async (c: Consultant, month: string) => {
    if (!confirm(`Unmark ${c.name}'s service invoice for ${month}?`)) return
    const r = await fetch(`/api/payroll/si-submissions?consultantId=${c.id}&month=${month}`, { method: 'DELETE' })
    if (!r.ok) { alert('Failed'); return }
    setSubs(prev => { const n = { ...prev }; delete n[subKey(c.id, month)]; return n })
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (branch) params.set('branch', branch)
      const r = await fetch(`/api/payroll/consultants?${params}`)
      const d = await r.json()
      const rows: Consultant[] = Array.isArray(d) ? d : (d.consultants || d.data || [])
      setConsultants(rows.filter(c => c.isActive !== false))
    } catch { setConsultants([]) }
    setLoading(false)
  }, [branch])
  useEffect(() => { load() }, [load])

  // The computation shown (and sent) always reflects the current invoice cutoffs.
  useEffect(() => { setBreakdowns({}) }, [invoiceCutoffs])

  const fetchPreview = useCallback(async (c: Consultant) => {
    setBreakdowns(prev => ({ ...prev, [c.id]: 'loading' }))
    try {
      const r = await fetch('/api/payroll/si-reminder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultantId: c.id, cutoffPeriods: invoiceCutoffs, preview: true }),
      })
      const d = await r.json()
      setBreakdowns(prev => ({ ...prev, [c.id]: r.ok ? d.breakdown : { error: d.error || 'No data' } }))
    } catch {
      setBreakdowns(prev => ({ ...prev, [c.id]: { error: 'Failed to compute' } }))
    }
  }, [invoiceCutoffs])

  const toggleRow = (c: Consultant) => {
    setOpenRows(prev => {
      const n = new Set(prev)
      if (n.has(c.id)) n.delete(c.id)
      else { n.add(c.id); if (!breakdowns[c.id]) fetchPreview(c) }
      return n
    })
  }

  const saveCor = async (c: Consultant, url: string | null) => {
    const r = await fetch('/api/payroll/consultants/cor', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consultantId: c.id, corUrl: url }),
    })
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error || 'Failed to save COR'); return }
    const d = await r.json()
    setConsultants(prev => prev.map(x => x.id === c.id ? { ...x, corUrl: d.corUrl, corUploadedAt: d.corUploadedAt, no2303At: d.no2303At } : x))
    setCorTarget(prev => (prev && prev.id === c.id ? { ...prev, corUrl: d.corUrl, corUploadedAt: d.corUploadedAt, no2303At: d.no2303At } : prev))
  }

  // Not BIR-registered: no 2303 means no Service Invoice to chase — the mark
  // drops them into their own quiet group at the bottom. Undoable any time,
  // and uploading a COR clears it server-side (the COR IS the 2303).
  const setNo2303 = async (c: Consultant, flag: boolean) => {
    const r = await fetch('/api/payroll/consultants/cor', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consultantId: c.id, no2303: flag }),
    })
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error || 'Failed to update'); return }
    const d = await r.json()
    setConsultants(prev => prev.map(x => x.id === c.id ? { ...x, no2303At: d.no2303At } : x))
  }

  const send = async () => {
    if (!sendTarget) return
    setSending(true)
    try {
      const r = await fetch('/api/payroll/si-reminder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultantId: sendTarget.c.id, cutoffPeriods: invoiceCutoffs, channel: sendTarget.channel }),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.error || 'Failed to send reminder'); setSending(false); return }
      setSentNote(prev => ({ ...prev, [sendTarget.c.id]: `${sendTarget.channel === 'SMS' ? 'SMS' : 'Email'} sent to ${d.to}` }))
      setSendTarget(null)
    } catch { alert('Failed to send reminder') }
    setSending(false)
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle ? consultants.filter(c => c.name.toLowerCase().includes(needle) || c.department.toLowerCase().includes(needle)) : consultants
    // COR holders first — they are expected to invoice every month.
    return [...list].sort((a, b) =>
      Number(!!b.corUrl) - Number(!!a.corUrl) || a.name.localeCompare(b.name))
  }, [consultants, q])
  const withCor = filtered.filter(c => c.corUrl)
  const withoutCor = filtered.filter(c => !c.corUrl && !c.no2303At)
  const no2303 = filtered.filter(c => !c.corUrl && c.no2303At)

  const Row = ({ c }: { c: Consultant }) => {
    const b = breakdowns[c.id]
    const open = openRows.has(c.id)
    return (
      <div className="rounded-xl border" style={{ borderColor: c.corUrl ? 'var(--teal)' : 'var(--light-gray)' }}>
        <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <button onClick={() => toggleRow(c)} className="flex items-center gap-1.5 text-left flex-1 min-w-[220px]">
            <ChevronDown size={14} style={{ color: 'var(--mid-gray)', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{c.name}</span>
            <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{c.department} · {branchCode(c.branch)}</span>
            {c.corUrl && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: '#dcfce7', color: '#166534' }}
                title={`COR on file since ${String(c.corUploadedAt || '').slice(0, 10)} — expected to issue a Service Invoice monthly`}>
                COR on file
              </span>
            )}
          </button>
          {c.corUrl && invoiceMonths.map(m => {
            const s = subs[subKey(c.id, m)]
            return s ? (
              <button key={m} onClick={() => (s.siUrl ? window.open(s.siUrl, '_blank') : unrecordSi(c, m))}
                onContextMenu={e => { e.preventDefault(); unrecordSi(c, m) }}
                className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                style={{ background: '#dcfce7', color: '#166534' }}
                title={`Service invoice received for ${m}${s.siUrl ? ' — click to view the copy' : ''} (right-click to unmark)`}>
                ✓ {m}
              </button>
            ) : (
              <span key={m} className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: '#fee2e2', color: '#b91c1c' }}
                title={`No service invoice received for ${m} yet`}>
                ✗ {m}
              </span>
            )
          })}
          {sentNote[c.id] && <span className="text-[11px]" style={{ color: '#16a34a' }}>{sentNote[c.id]}</span>}
          {c.no2303At && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: '#f1f5f9', color: '#64748b' }}
              title={`Marked as not BIR-registered on ${String(c.no2303At).slice(0, 10)} — no 2303, so no Service Invoice to ask for. Upload a COR if they register later.`}>
              No 2303
            </span>
          )}
          {canWrite && !c.corUrl && !c.no2303At && (
            <>
              <button onClick={() => setCorTarget(c)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>
                <Upload size={12} /> For SI Submission
              </button>
              <button onClick={() => setNo2303(c, true)}
                title="They have no BIR 2303 (not registered) — stop asking them to submit a Service Invoice. Undoable."
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                No 2303
              </button>
            </>
          )}
          {canWrite && c.no2303At && (
            <>
              <button onClick={() => setNo2303(c, false)}
                title="Put them back in the No-COR-yet list (we ask for SI submission again)"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                Undo
              </button>
              <button onClick={() => setCorTarget(c)} title="They registered after all — upload their COR (clears the No-2303 mark)"
                className="px-2 py-1.5 rounded-lg text-xs border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                <Upload size={12} />
              </button>
            </>
          )}
          {c.corUrl && (
            <>
              <a href={c.corUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                <Eye size={12} /> COR
              </a>
              {canWrite && (
                <>
                  <button onClick={() => setCorTarget(c)} title="Replace or remove the COR"
                    className="px-2 py-1.5 rounded-lg text-xs border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                    <Upload size={12} />
                  </button>
                  <button onClick={() => { setSendTarget({ c, channel: 'EMAIL' }); if (!breakdowns[c.id] || 'error' in (breakdowns[c.id] as object)) fetchPreview(c) }}
                    disabled={!c.email} title={c.email ? `Email ${c.email}` : 'No email on file'}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-40"
                    style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                    <Mail size={12} /> Send email reminder
                  </button>
                  <button onClick={() => { setSendTarget({ c, channel: 'SMS' }); if (!breakdowns[c.id] || 'error' in (breakdowns[c.id] as object)) fetchPreview(c) }}
                    disabled={!c.phone} title={c.phone ? `SMS ${c.phone}` : 'No phone on file'}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-40"
                    style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                    <MessageSquare size={12} /> Send SMS reminder
                  </button>
                  <button onClick={() => setSiTarget(c)}
                    title={`Upload the received service invoice — marks ${invoiceMonths.join(', ')} as submitted`}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style={{ background: 'var(--deep-teal)' }}>
                    <Upload size={12} /> Upload SI
                  </button>
                </>
              )}
            </>
          )}
        </div>
        {open && (
          <div className="px-9 pb-3 text-xs" style={{ color: 'var(--charcoal)' }}>
            {b === 'loading' || !b ? <Loader2 size={14} className="animate-spin" style={{ color: 'var(--teal)' }} />
              : 'error' in b ? <span style={{ color: '#b91c1c' }}>{b.error}</span>
              : (
                <div className="rounded-lg px-3 py-2 inline-block" style={{ background: 'var(--off-white)' }}>
                  <div className="font-semibold mb-1" style={{ color: 'var(--deep-teal)' }}>Service Invoice computation — {b.periodLabels}</div>
                  <div className="grid grid-cols-[auto_auto] gap-x-6 gap-y-0.5 font-mono">
                    <span>Gross professional fees</span><span className="text-right">₱{peso(b.gross)}</span>
                    <span>Less: EWT ({b.ewtRate}%)</span><span className="text-right">₱{peso(b.ewt)}</span>
                    <span className="font-bold">Net amount</span><span className="text-right font-bold">₱{peso(b.net)}</span>
                  </div>
                  <div className="mt-1" style={{ color: 'var(--mid-gray)' }}>Description: {b.description}</div>
                </div>
              )}
          </div>
        )}
      </div>
    )
  }

  const sendB = sendTarget ? breakdowns[sendTarget.c.id] : null

  // ── Compliance matrix (per person × month, COR holders only) ──
  const matrixMonths = useMemo(() => {
    const out: string[] = []
    let [y, m] = mFrom.split('-').map(Number)
    const [ty, tm] = mTo.split('-').map(Number)
    let guard = 0
    while ((y < ty || (y === ty && m <= tm)) && guard++ < 36) {
      out.push(`${y}-${String(m).padStart(2, '0')}`)
      m++; if (m === 13) { m = 1; y++ }
    }
    return out
  }, [mFrom, mTo])
  const matrixRows = useMemo(() => withCor.map(c => {
    const done = matrixMonths.filter(m => subs[subKey(c.id, m)]).length
    return { c, done, pct: matrixMonths.length ? Math.round((done / matrixMonths.length) * 100) : 0 }
  }), [withCor, matrixMonths, subs]) // eslint-disable-line react-hooks/exhaustive-deps
  const fullyCompliant = matrixRows.filter(r => r.pct === 100).length

  return (
    <div className="space-y-4">
      {/* View toggle + branch (own selector when no parent provides one) */}
      {branchProp === undefined && (
        <div className="flex rounded-xl overflow-hidden border w-fit float-right" style={{ borderColor: 'var(--light-gray)' }}>
          {[['', 'All Branches'], ['SBEA', 'East'], ['SBGH', 'Greenhills']].map(([v, label]) => (
            <button key={v} onClick={() => setOwnBranch(v)} className="px-3 py-2 text-xs font-semibold"
              style={ownBranch === v ? { background: 'var(--deep-teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="flex rounded-xl overflow-hidden border w-fit" style={{ borderColor: 'var(--light-gray)' }}>
        <button onClick={() => setView('track')} className="px-4 py-2 text-xs font-semibold"
          style={view === 'track' ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
          Tracking & Reminders
        </button>
        <button onClick={() => setView('matrix')} className="px-4 py-2 text-xs font-semibold"
          style={view === 'matrix' ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
          Compliance by Person
        </button>
        <button onClick={() => setView('gen2307')} className="px-4 py-2 text-xs font-semibold"
          style={view === 'gen2307' ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
          2307 Generator
        </button>
        <button onClick={() => setView('settings2307')} className="px-4 py-2 text-xs font-semibold"
          style={view === 'settings2307' ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
          2307 Settings
        </button>
      </div>

      {view === 'gen2307' ? (
        <Bir2307Generator branch={branch} canWrite={canWrite} />
      ) : view === 'settings2307' ? (
        <Bir2307Settings canWrite={canWrite} />
      ) : view === 'matrix' ? (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Period</span>
            <input type="month" value={mFrom} onChange={e => setMFrom(e.target.value)} className="px-3 py-2 rounded-xl border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
            <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
            <input type="month" value={mTo} onChange={e => setMTo(e.target.value)} className="px-3 py-2 rounded-xl border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search consultant…"
              className="px-3 py-2 rounded-xl border text-xs flex-1 min-w-[160px]" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          <div className="flex gap-3 flex-wrap">
            {[
              { n: matrixRows.length, label: 'Tagged SI submitters', color: 'var(--charcoal)' },
              { n: fullyCompliant, label: 'Fully compliant', color: '#16a34a' },
              { n: matrixRows.length - fullyCompliant, label: 'Needs follow-up', color: '#dc2626' },
              { n: `${matrixRows.length ? Math.round(matrixRows.reduce((s, r) => s + r.pct, 0) / matrixRows.length) : 0}%`, label: 'Avg compliance', color: 'var(--deep-teal)' },
            ].map(card => (
              <div key={card.label} className="rounded-2xl border px-5 py-3 min-w-[150px]" style={{ borderColor: 'var(--light-gray)' }}>
                <div className="text-2xl font-bold" style={{ color: card.color }}>{card.n}</div>
                <div className="text-xs" style={{ color: 'var(--mid-gray)' }}>{card.label}</div>
              </div>
            ))}
          </div>
          {loading ? (
            <div className="py-12 text-center"><Loader2 size={18} className="animate-spin mx-auto" style={{ color: 'var(--teal)' }} /></div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--light-gray)' }}>
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr style={{ background: 'var(--charcoal)' }}>
                    <th className="px-4 py-2.5 text-left text-white sticky left-0" style={{ background: 'var(--charcoal)', minWidth: 190 }}>Name</th>
                    <th className="px-3 py-2.5 text-left text-white">Dept</th>
                    {matrixMonths.map(m => (
                      <th key={m} className="px-2 py-2.5 text-center text-white whitespace-nowrap">{MON[parseInt(m.slice(5)) - 1]} ’{m.slice(2, 4)}</th>
                    ))}
                    <th className="px-3 py-2.5 text-right text-white">% Done</th>
                  </tr>
                </thead>
                <tbody>
                  {matrixRows.map(({ c, done, pct }) => (
                    <tr key={c.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-4 py-2 font-semibold sticky left-0 bg-white" style={{ color: 'var(--charcoal)' }}>{c.name}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{c.department}</td>
                      {matrixMonths.map(m => {
                        const s = subs[subKey(c.id, m)]
                        return (
                          <td key={m} className="px-2 py-2 text-center" style={{ background: s ? '#f0fdf4' : '#fef2f2' }}>
                            {s ? (
                              s.siUrl
                                ? <a href={s.siUrl} target="_blank" rel="noopener noreferrer" title={`Submitted — view the invoice copy (${String(s.uploadedAt).slice(0, 10)})`} style={{ color: '#16a34a', fontWeight: 700 }}>✓</a>
                                : <span title={`Marked submitted ${String(s.uploadedAt).slice(0, 10)} (no copy uploaded)`} style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>
                            ) : (
                              <span title="No service invoice received" style={{ color: '#dc2626', fontWeight: 700 }}>✗</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-right font-mono" style={{ color: pct === 100 ? '#16a34a' : pct > 0 ? '#b45309' : '#dc2626' }}>
                        {pct}% <span style={{ color: 'var(--mid-gray)' }}>({done}/{matrixMonths.length})</span>
                      </td>
                    </tr>
                  ))}
                  {matrixRows.length === 0 && (
                    <tr><td colSpan={3 + matrixMonths.length} className="px-4 py-8 text-center" style={{ color: 'var(--mid-gray)' }}>
                      No consultants tagged for SI submission yet — upload a COR in Tracking &amp; Reminders first.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
            Only consultants with a COR on file are tracked here. ✓ links to the uploaded invoice copy; mark months from the Tracking view&apos;s “Upload SI”.
          </p>
        </>
      ) : (
      <>
      {/* Controls: invoice-months picker (top-left), then the cutoff filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <button onClick={() => setPickerOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border"
            style={{ borderColor: invoiceCutoffs.length > filterCutoffs.length ? 'var(--teal)' : 'var(--light-gray)', color: invoiceCutoffs.length > filterCutoffs.length ? 'var(--teal)' : 'var(--charcoal)' }}
            title="Pick every cutoff/month this ONE invoice should cover — for consultants who invoice several months of service at once">
            <FileText size={13} /> Months in this invoice: {invoiceCutoffs.length}
          </button>
          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-[59]" onClick={() => setPickerOpen(false)} />
              <div className="absolute z-[60] mt-1 p-2 rounded-xl bg-white shadow-lg border overflow-y-auto" style={{ borderColor: 'var(--light-gray)', maxHeight: 320, minWidth: 230 }}>
                <p className="px-1 pb-1 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                  The filtered cutoff{filterCutoffs.length > 1 ? 's are' : ' is'} always included; tick more to combine them into one invoice.
                </p>
                {pickable.map(cp => {
                  const fixed = filterCutoffs.includes(cp)
                  const on = fixed || extraCutoffs.has(cp)
                  return (
                    <label key={cp} className="flex items-center gap-2 px-1 py-1 text-xs cursor-pointer" style={{ color: fixed ? 'var(--mid-gray)' : 'var(--charcoal)' }}>
                      <input type="checkbox" checked={on} disabled={fixed}
                        onChange={() => setExtraCutoffs(prev => { const n = new Set(prev); n.has(cp) ? n.delete(cp) : n.add(cp); return n })}
                        className="accent-current" />
                      {cutoffLabel(cp)}{fixed ? ' (filter)' : ''}
                    </label>
                  )
                })}
                <button type="button" onClick={() => { setExtraCutoffs(new Set()); setPickerOpen(false) }}
                  className="mt-1 w-full py-1 rounded-lg text-xs font-medium" style={{ background: 'var(--light-gray)' }}>Reset to filter only</button>
              </div>
            </>
          )}
        </div>
        <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border text-xs bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          {[0, 1, 2].map(i => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border text-xs bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={half} onChange={e => setHalf(parseInt(e.target.value) as 0 | 1 | 2)} className="px-3 py-2 rounded-xl border text-xs bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          <option value={0}>Whole month (both cutoffs)</option>
          <option value={1}>1st half</option>
          <option value={2}>2nd half</option>
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search consultant…"
          className="px-3 py-2 rounded-xl border text-xs flex-1 min-w-[160px]" style={{ borderColor: 'var(--light-gray)' }} />
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 size={18} className="animate-spin mx-auto" style={{ color: 'var(--teal)' }} /></div>
      ) : (
        <>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--deep-teal)' }}>
              COR on file — expected to issue a Service Invoice monthly ({withCor.length})
            </p>
            <div className="space-y-2">
              {withCor.map(c => <Row key={c.id} c={c} />)}
              {withCor.length === 0 && <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No consultant has a COR uploaded yet.</p>}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--mid-gray)' }}>
              No COR yet ({withoutCor.length})
            </p>
            <div className="space-y-2">{withoutCor.map(c => <Row key={c.id} c={c} />)}</div>
          </div>
          {no2303.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: '#94a3b8' }}>
                No 2303 — not BIR-registered, don&apos;t ask for a Service Invoice ({no2303.length})
              </p>
              <div className="space-y-2 opacity-75">{no2303.map(c => <Row key={c.id} c={c} />)}</div>
            </div>
          )}
        </>
      )}
      </>
      )}

      {/* COR upload dialog — file picker or QR scan-with-phone */}
      {corTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>For SI Submission — {corTarget.name}</h2>
              <button onClick={() => setCorTarget(null)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>
              Upload this consultant&apos;s <strong>BIR Certificate of Registration (Form 2303)</strong> — pick a file, or use the
              QR code to take a photo with a phone. Once it&apos;s on file they move to the top of the list and the
              monthly Service Invoice reminders unlock.
            </p>
            {corTarget.corUrl && (
              <div className="flex items-center gap-2 mb-3 text-xs">
                <CheckCircle2 size={14} style={{ color: '#16a34a' }} />
                <a href={corTarget.corUrl} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--teal)' }}>Current COR</a>
                <span style={{ color: 'var(--mid-gray)' }}>uploaded {String(corTarget.corUploadedAt || '').slice(0, 10)}</span>
                <button onClick={() => saveCor(corTarget, null)} className="ml-auto text-[11px] underline" style={{ color: '#b91c1c' }}>Remove</button>
              </div>
            )}
            <ScanUpload section="consultant-cor" prefix={`COR-${corTarget.name.replace(/[^a-zA-Z0-9]/g, '-')}`}
              accept="image/*,.pdf" label={corTarget.corUrl ? 'Replace COR' : 'Upload COR'}
              onUploaded={url => saveCor(corTarget, url)} />
            <button onClick={() => setCorTarget(null)} className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Done</button>
          </div>
        </div>
      )}

      {/* Service-invoice upload — marks the selected months as submitted */}
      {siTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Upload Service Invoice — {siTarget.name}</h2>
              <button onClick={() => setSiTarget(null)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>
              Upload a copy of the consultant&apos;s <strong>BIR Service Invoice</strong> — pick a file, or use the QR code to take a
              photo with a phone. This marks <strong>{invoiceMonths.join(', ')}</strong> as submitted
              {invoiceMonths.length > 1 ? ' (one invoice covering all selected months)' : ''}.
              Use the &quot;Months in this invoice&quot; picker to change which months it covers.
            </p>
            <ScanUpload section="consultant-si" prefix={`SI-${siTarget.name.replace(/[^a-zA-Z0-9]/g, '-')}-${invoiceMonths[0] || ''}`}
              accept="image/*,.pdf" label="Upload invoice"
              onUploaded={async url => { await recordSi(siTarget, url, invoiceMonths); setSiTarget(null) }} />
            <button onClick={async () => { await recordSi(siTarget, null, invoiceMonths); setSiTarget(null) }}
              className="mt-3 w-full py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}
              title="Tick the months without keeping a copy on file">
              Mark as submitted without a copy
            </button>
            <button onClick={() => setSiTarget(null)} className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Send confirmation — shows the exact breakdown that goes out */}
      {sendTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>
                {sendTarget.channel === 'SMS' ? 'SMS' : 'Email'} reminder — {sendTarget.c.name}
              </h2>
              <button onClick={() => setSendTarget(null)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>
              To: <strong>{sendTarget.channel === 'SMS' ? sendTarget.c.phone : sendTarget.c.email}</strong> · asks them to issue a Service Invoice with this computation:
            </p>
            {(!sendB || sendB === 'loading') ? (
              <div className="py-6 text-center"><Loader2 size={16} className="animate-spin mx-auto" style={{ color: 'var(--teal)' }} /></div>
            ) : 'error' in sendB ? (
              <p className="text-sm mb-3" style={{ color: '#b91c1c' }}>{sendB.error}</p>
            ) : (
              <div className="rounded-xl px-4 py-3 mb-4 text-sm" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>
                <div className="font-semibold mb-1" style={{ color: 'var(--deep-teal)' }}>{sendB.periodLabels}</div>
                <div className="grid grid-cols-[1fr_auto] gap-y-0.5 font-mono text-xs">
                  <span>Gross professional fees</span><span>₱{peso(sendB.gross)}</span>
                  <span>Less: EWT ({sendB.ewtRate}%)</span><span>₱{peso(sendB.ewt)}</span>
                  <span className="font-bold">Net amount</span><span className="font-bold">₱{peso(sendB.net)}</span>
                </div>
                <div className="mt-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>Description: {sendB.description}</div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setSendTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
              <button onClick={send} disabled={sending || !sendB || sendB === 'loading' || 'error' in sendB}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                {sending ? <Loader2 size={14} className="inline animate-spin" /> : `Send ${sendTarget.channel === 'SMS' ? 'SMS' : 'email'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
