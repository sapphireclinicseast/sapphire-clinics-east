'use client'

/**
 * Taxes → Service Invoice (SI & 2307)
 *
 * Tracks the BIR Service Invoices consultants with a Certificate of
 * Registration (COR) owe us. Each person is listed once, with their last
 * invoice and what is not yet invoiced. "Upload SI" asks which cutoffs the
 * invoice covers (half a month, a month or several months) and shows the
 * figures from finalized payroll for that range; the reminders work the same
 * way. All figures load in one call (si-tracking), so no row waits on its own
 * fetch.
 */

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { Loader2, Mail, MessageSquare, CheckCircle2, Upload, X, Eye, ChevronDown, Trash2 } from 'lucide-react'
import { ScanUpload } from '@/components/ScanUpload'
import { Bir2307Generator, Bir2307Settings } from './Bir2307'
import { SiInvoiceDialog } from './SiInvoiceDialog'
import { isHrCorUrl } from '@/lib/payroll/hr-cor'
import {
  cutoffOf, cutoffsOfKey, describeCutoffs, isCovered, monthCoverage, recentCutoffs, type CutoffPay,
} from '@/lib/payroll/si-coverage'

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
  taxDeduction?: string
}
interface Submission { consultantId: string; month: string; siUrl: string | null; uploadedAt: string }
interface Tracking { from: string; payroll: Record<string, Record<string, CutoffPay>>; submissions: Submission[] }
/** One received invoice: the rows saved together (same copy, same time). */
interface Invoice { keys: string[]; cutoffs: string[]; siUrl: string | null; uploadedAt: string }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const shortDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}
/** How far back "Not yet invoiced" looks, in cutoffs (12 months). */
const OUTSTANDING_WINDOW = 24

export default function ServiceInvoiceTab({ branch: branchProp, canWrite }: { branch?: string; canWrite: boolean }) {
  const now = new Date()
  const nowCutoff = cutoffOf(now)
  // Mounted in the Taxes section with no parent branch selector — the tab
  // carries its own ('' = all branches). A parent-provided branch still wins.
  const [ownBranch, setOwnBranch] = useState('')
  const branch = branchProp ?? ownBranch

  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [view, setView] = useState<'track' | 'matrix' | 'cor' | 'gen2307' | 'settings2307'>('track')
  const [showNoCor, setShowNoCor] = useState(false)
  const [noTaxOnly, setNoTaxOnly] = useState(false)
  const [hrSync, setHrSync] = useState<{ reached: boolean; unmatched: string[] } | null>(null)
  const [corTarget, setCorTarget] = useState<Consultant | null>(null)
  const [dialog, setDialog] = useState<{ c: Consultant; mode: 'upload' | 'EMAIL' | 'SMS' } | null>(null)
  const [openRows, setOpenRows] = useState<Set<string>>(new Set())
  const [sentNote, setSentNote] = useState<Record<string, string>>({})

  // Compliance-matrix period (defaults: January of this year → this month).
  const [mFrom, setMFrom] = useState(`${now.getFullYear()}-01`)
  const [mTo, setMTo] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)

  // Payroll per cutoff + every recorded invoice, in one call.
  const [tracking, setTracking] = useState<Tracking | null>(null)
  const [trackError, setTrackError] = useState('')
  const loadTracking = useCallback(async (from?: string) => {
    setTrackError('')
    try {
      const r = await fetch(`/api/payroll/si-tracking${from ? `?from=${from}` : ''}`)
      const d = await r.json()
      if (!r.ok) { setTrackError(d.error || 'Could not load invoice figures'); return }
      setTracking(d)
    } catch { setTrackError('Could not load invoice figures') }
  }, [])
  useEffect(() => { loadTracking() }, [loadTracking])
  // The matrix may reach further back than the default window.
  useEffect(() => {
    if (view === 'matrix' && tracking && mFrom < tracking.from) loadTracking(mFrom)
  }, [view, mFrom, tracking, loadTracking])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // CORs are uploaded in the HR Hub; pull them in before listing anyone.
      const synced = await fetch('/api/payroll/consultants/cor/sync', { method: 'POST' }).then(x => (x.ok ? x.json() : null)).catch(() => null)
      setHrSync(synced)
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

  // ── Coverage per consultant ──
  const keysBy = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const s of tracking?.submissions || []) {
      if (!m.has(s.consultantId)) m.set(s.consultantId, new Set())
      m.get(s.consultantId)!.add(s.month)
    }
    return m
  }, [tracking])
  const invoicesBy = useMemo(() => {
    const m = new Map<string, Invoice[]>()
    const groups = new Map<string, Invoice & { cid: string }>()
    for (const s of tracking?.submissions || []) {
      // One uploaded copy is one invoice. Rows kept without a copy share the
      // time they were saved (older saves stamped each month separately).
      const g = s.siUrl ? `${s.consultantId}|${s.siUrl}` : `${s.consultantId}||${s.uploadedAt}`
      if (!groups.has(g)) groups.set(g, { cid: s.consultantId, keys: [], cutoffs: [], siUrl: s.siUrl, uploadedAt: s.uploadedAt })
      const inv = groups.get(g)!
      inv.keys.push(s.month)
      inv.cutoffs.push(...cutoffsOfKey(s.month))
      if (s.uploadedAt > inv.uploadedAt) inv.uploadedAt = s.uploadedAt
    }
    for (const inv of groups.values()) {
      inv.cutoffs.sort()
      if (!m.has(inv.cid)) m.set(inv.cid, [])
      m.get(inv.cid)!.push(inv)
    }
    // Latest period first.
    for (const list of m.values()) list.sort((a, b) => (b.cutoffs[b.cutoffs.length - 1] || '').localeCompare(a.cutoffs[a.cutoffs.length - 1] || ''))
    return m
  }, [tracking])
  const windowStart = useMemo(() => recentCutoffs(nowCutoff, OUTSTANDING_WINDOW).pop() || nowCutoff, [nowCutoff])
  /** Cutoffs with finalized pay in the last 12 months that no invoice covers, oldest first. */
  const outstandingOf = (cid: string) => {
    const pay = tracking?.payroll[cid] || {}
    const keys = keysBy.get(cid) || new Set<string>()
    return Object.keys(pay).filter(cp => cp >= windowStart && cp <= nowCutoff && !isCovered(cp, keys)).sort()
  }

  const removeInvoice = async (c: Consultant, inv: Invoice) => {
    if (!confirm(`Remove ${c.name}'s invoice for ${describeCutoffs(inv.cutoffs)}?`)) return
    const r = await fetch(`/api/payroll/si-submissions?consultantId=${c.id}&keys=${inv.keys.join(',')}`, { method: 'DELETE' })
    if (!r.ok) { alert('Failed to remove the invoice'); return }
    loadTracking(tracking?.from)
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
  // drops them into their own quiet group. Undoable any time, and uploading a
  // COR clears it server-side (the COR IS the 2303).
  const setNo2303 = async (c: Consultant, flag: boolean) => {
    const r = await fetch('/api/payroll/consultants/cor', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consultantId: c.id, no2303: flag }),
    })
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error || 'Failed to update'); return }
    const d = await r.json()
    setConsultants(prev => prev.map(x => x.id === c.id ? { ...x, no2303At: d.no2303At } : x))
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle ? consultants.filter(c => c.name.toLowerCase().includes(needle) || c.department.toLowerCase().includes(needle)) : consultants
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [consultants, q])
  const withCor = filtered.filter(c => c.corUrl)
  const withoutCor = filtered.filter(c => !c.corUrl && !c.no2303At)
  const no2303 = filtered.filter(c => !c.corUrl && c.no2303At)
  // COR sub-tab: on file or not, read from the upload itself so it can't go stale.
  const corRows = noTaxOnly ? filtered.filter(c => c.taxDeduction !== 'FIVE_PERCENT') : filtered
  const noTaxCount = filtered.filter(c => c.taxDeduction !== 'FIVE_PERCENT').length
  const owing = withCor.filter(c => outstandingOf(c.id).length > 0).length

  const toggleRow = (id: string) => setOpenRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

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
  const matrixRows = withCor.map(c => {
    const keys = keysBy.get(c.id) || new Set<string>()
    const done = matrixMonths.reduce((s, m) => { const v = monthCoverage(m, keys); return s + (v === 'full' ? 1 : v === 'none' ? 0 : 0.5) }, 0)
    return { c, keys, done, pct: matrixMonths.length ? Math.round((done / matrixMonths.length) * 100) : 0 }
  })
  const fullyCompliant = matrixRows.filter(r => r.pct === 100).length
  /** The copy covering a month, if one was uploaded. */
  const copyFor = (cid: string, month: string) => (invoicesBy.get(cid) || []).find(inv => inv.siUrl && inv.cutoffs.some(cp => cp.startsWith(month)))?.siUrl || null

  const tabBtn = (v: typeof view, label: string) => (
    <button onClick={() => setView(v)} className="px-4 py-2 text-xs font-semibold"
      style={view === v ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
      {label}
    </button>
  )
  const iconBtn = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-40 disabled:cursor-not-allowed'

  /** A COR holder's tracking row (plain render function, so rows never remount). */
  const trackRow = (c: Consultant) => {
    const invoices = invoicesBy.get(c.id) || []
    const last = invoices[0]
    const outstanding = outstandingOf(c.id)
    const pay = tracking?.payroll[c.id] || {}
    const owed = outstanding.reduce((s, cp) => s + (pay[cp]?.gross || 0), 0)
    const open = openRows.has(c.id)
    return (
      <Fragment key={c.id}>
        <tr className="border-t align-top hover:bg-[var(--off-white)]" style={{ borderColor: 'var(--light-gray)' }}>
          <td className="px-4 py-3">
            <button onClick={() => toggleRow(c.id)} className="flex items-center gap-1.5 text-left" title={open ? 'Hide invoices' : 'Show every invoice received'}>
              <ChevronDown size={14} className="shrink-0" style={{ color: 'var(--mid-gray)', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
              <span className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{c.name}</span>
            </button>
            <span className="block text-xs pl-5" style={{ color: 'var(--mid-gray)' }}>
              {c.department} · {branchCode(c.branch)} ·{' '}
              <a href={c.corUrl || '#'} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--teal)' }}>COR</a>
            </span>
          </td>
          <td className="px-4 py-3 text-xs">
            {last ? (
              <>
                <span className="block font-medium" style={{ color: 'var(--charcoal)' }}>{describeCutoffs(last.cutoffs)}</span>
                <span className="block" style={{ color: 'var(--mid-gray)' }}>
                  received {shortDate(last.uploadedAt)}
                  {last.siUrl && <> · <a href={last.siUrl} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--teal)' }}>view</a></>}
                </span>
              </>
            ) : <span style={{ color: 'var(--mid-gray)' }}>None recorded</span>}
          </td>
          <td className="px-4 py-3 text-xs">
            {!tracking ? <span style={{ color: 'var(--mid-gray)' }}>—</span>
              : outstanding.length ? (
                <>
                  <span className="block font-semibold" style={{ color: '#b45309' }}>₱{peso(owed)}</span>
                  <span className="block" style={{ color: 'var(--mid-gray)' }} title={outstanding.length > 2 ? describeCutoffs(outstanding) : undefined}>
                    {outstanding.length > 2 ? `${outstanding.length} cutoffs` : describeCutoffs(outstanding)}
                  </span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold" style={{ color: '#15803d' }}><CheckCircle2 size={13} /> Up to date</span>
              )}
            {sentNote[c.id] && <span className="block mt-1" style={{ color: '#15803d' }}>{sentNote[c.id]}</span>}
          </td>
          <td className="px-4 py-3 text-right whitespace-nowrap">
            {canWrite && (
              <div className="inline-flex items-center gap-1.5">
                <button onClick={() => setDialog({ c, mode: 'EMAIL' })} disabled={!c.email || !tracking}
                  title={c.email ? `Email a reminder to ${c.email}` : 'No email on file'} className={iconBtn}
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--deep-teal)' }}>
                  <Mail size={13} /> Email
                </button>
                <button onClick={() => setDialog({ c, mode: 'SMS' })} disabled={!c.phone || !tracking}
                  title={c.phone ? `Text a reminder to ${c.phone}` : 'No phone on file'} className={iconBtn}
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--deep-teal)' }}>
                  <MessageSquare size={13} /> SMS
                </button>
                <button onClick={() => setDialog({ c, mode: 'upload' })} disabled={!tracking}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                  style={{ background: 'var(--deep-teal)' }}>
                  <Upload size={13} /> Upload SI
                </button>
              </div>
            )}
          </td>
        </tr>
        {open && (
          <tr style={{ background: 'var(--off-white)' }}>
            <td colSpan={4} className="px-10 py-3">
              {invoices.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No service invoice recorded yet.</p>
              ) : (
                <table className="text-xs">
                  <tbody>
                    {invoices.map(inv => (
                      <tr key={`${inv.siUrl}|${inv.uploadedAt}`}>
                        <td className="pr-6 py-1 font-medium" style={{ color: 'var(--charcoal)' }}>{describeCutoffs(inv.cutoffs)}</td>
                        <td className="pr-6 py-1 font-mono text-right" style={{ color: 'var(--charcoal)' }}>
                          ₱{peso(inv.cutoffs.reduce((s, cp) => s + (pay[cp]?.gross || 0), 0))}
                        </td>
                        <td className="pr-6 py-1" style={{ color: 'var(--mid-gray)' }}>received {shortDate(inv.uploadedAt)}</td>
                        <td className="pr-4 py-1">
                          {inv.siUrl
                            ? <a href={inv.siUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline" style={{ color: 'var(--teal)' }}><Eye size={12} /> View copy</a>
                            : <span style={{ color: 'var(--mid-gray)' }}>no copy kept</span>}
                        </td>
                        <td className="py-1">
                          {canWrite && (
                            <button onClick={() => removeInvoice(c, inv)} className="inline-flex items-center gap-1" style={{ color: '#b91c1c' }} title="Remove this invoice (wrong upload)">
                              <Trash2 size={12} /> Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  /** A consultant without a COR: only the COR / No-2303 actions apply. */
  const noCorRow = (c: Consultant) => (
    <tr key={c.id} className="border-t" style={{ borderColor: 'var(--light-gray)', opacity: c.no2303At ? 0.7 : 1 }}>
      <td className="px-4 py-2.5">
        <span className="block font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{c.name}</span>
        <span className="block text-xs" style={{ color: 'var(--mid-gray)' }}>{c.department} · {branchCode(c.branch)}</span>
      </td>
      <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
        {c.no2303At
          ? <span title={`Marked ${String(c.no2303At).slice(0, 10)}`}>No 2303 — not BIR-registered, no invoice to ask for</span>
          : 'No COR on file'}
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {canWrite && (
          <div className="inline-flex items-center gap-1.5">
            {c.no2303At ? (
              <button onClick={() => setNo2303(c, false)} className={iconBtn} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}
                title="Ask for a Service Invoice again">Undo No 2303</button>
            ) : (
              <button onClick={() => setNo2303(c, true)} className={iconBtn} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}
                title="They have no BIR 2303 (not registered) — stop asking for a Service Invoice. Undoable.">No 2303</button>
            )}
            <button onClick={() => setCorTarget(c)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>
              <Upload size={13} /> Upload COR
            </button>
          </div>
        )}
      </td>
    </tr>
  )

  return (
    <div className="space-y-4">
      {/* Sub-views + branch (own selector when no parent provides one) */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap rounded-xl overflow-hidden border w-fit max-w-full" style={{ borderColor: 'var(--light-gray)' }}>
          {tabBtn('track', 'Tracking & Reminders')}
          {tabBtn('matrix', 'Compliance by Person')}
          {tabBtn('cor', 'COR')}
          {tabBtn('gen2307', '2307 Generator')}
          {tabBtn('settings2307', '2307 Settings')}
        </div>
        {branchProp === undefined && (
          <div className="flex rounded-xl overflow-hidden border w-fit" style={{ borderColor: 'var(--light-gray)' }}>
            {[['', 'All Branches'], ['SBEA', 'East'], ['SBGH', 'Greenhills']].map(([v, label]) => (
              <button key={v} onClick={() => setOwnBranch(v)} className="px-3 py-2 text-xs font-semibold"
                style={ownBranch === v ? { background: 'var(--deep-teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === 'gen2307' ? (
        <Bir2307Generator branch={branch} canWrite={canWrite} />
      ) : view === 'settings2307' ? (
        <Bir2307Settings canWrite={canWrite} />
      ) : view === 'cor' ? (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search consultant…"
              className="px-3 py-2 rounded-xl border text-xs flex-1 min-w-[160px]" style={{ borderColor: 'var(--light-gray)' }} />
            <button onClick={() => setNoTaxOnly(v => !v)} className="px-3 py-2 rounded-xl text-xs font-semibold border"
              style={noTaxOnly ? { background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' } : { background: '#fff', color: 'var(--charcoal)', borderColor: 'var(--light-gray)' }}>
              No 5% withholding ({noTaxCount})
            </button>
          </div>
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>CORs uploaded in the HR Hub under Staff Profiles → COR show here automatically.</p>
          {hrSync && !hrSync.reached && (
            <p className="text-xs" style={{ color: '#92400e' }}>Could not reach the HR Hub just now, so this list may be behind. Reopen this tab to try again.</p>
          )}
          {!!hrSync?.unmatched.length && (
            <p className="text-xs" style={{ color: '#92400e' }}>In the HR Hub with a COR, but no payroll consultant has this name: {hrSync.unmatched.join(', ')}.</p>
          )}
          {loading ? (
            <div className="py-12 text-center"><Loader2 size={18} className="animate-spin mx-auto" style={{ color: 'var(--teal)' }} /></div>
          ) : (
            ([
              { title: 'COR on file', rows: corRows.filter(c => c.corUrl), color: 'var(--deep-teal)' },
              { title: 'No COR', rows: corRows.filter(c => !c.corUrl), color: 'var(--mid-gray)' },
            ]).map(group => (
              <div key={group.title}>
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: group.color }}>{group.title} ({group.rows.length})</p>
                {group.rows.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{q.trim() || noTaxOnly ? 'No consultant matches.' : group.title === 'COR on file' ? 'No consultant has a COR uploaded yet.' : 'Every consultant has a COR on file.'}</p>
                ) : (
                  <div className="rounded-xl border overflow-x-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ color: 'var(--mid-gray)', borderBottom: '1px solid var(--light-gray)' }}>
                          {['Consultant', 'Department', 'Branch', '5% withholding', 'COR', ''].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map(c => (
                          <tr key={c.id} style={{ borderBottom: '1px solid var(--light-gray)' }}>
                            <td className="px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>{c.name}</td>
                            <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{c.department}</td>
                            <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{branchCode(c.branch)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {c.taxDeduction === 'FIVE_PERCENT'
                                ? <span style={{ color: 'var(--mid-gray)' }}>5%</span>
                                : <span className="font-semibold" style={{ color: '#92400e' }}>None</span>}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {c.corUrl ? (
                                <span className="inline-flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: '#dcfce7', color: '#166534' }}>On file</span>
                                  {isHrCorUrl(c.corUrl) && <span style={{ color: 'var(--mid-gray)' }}>HR Hub</span>}
                                  <span style={{ color: 'var(--mid-gray)' }}>{String(c.corUploadedAt || '').slice(0, 10)}</span>
                                  <a href={c.corUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--teal)' }}>
                                    <Eye size={12} /> View
                                  </a>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: '#fee2e2', color: '#b91c1c' }}>No COR</span>
                                  {c.no2303At && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: '#f1f5f9', color: '#64748b' }}
                                      title={`Marked as not BIR-registered on ${String(c.no2303At).slice(0, 10)}`}>
                                      No 2303
                                    </span>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {canWrite && !isHrCorUrl(c.corUrl) && (
                                <button onClick={() => setCorTarget(c)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                                  <Upload size={12} /> {c.corUrl ? 'Replace' : 'Upload COR'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </>
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
              { n: matrixRows.length, label: 'Consultants with COR', color: 'var(--charcoal)' },
              { n: fullyCompliant, label: 'Fully invoiced', color: '#16a34a' },
              { n: matrixRows.length - fullyCompliant, label: 'Needs follow-up', color: '#dc2626' },
              { n: `${matrixRows.length ? Math.round(matrixRows.reduce((s, r) => s + r.pct, 0) / matrixRows.length) : 0}%`, label: 'Avg compliance', color: 'var(--deep-teal)' },
            ].map(card => (
              <div key={card.label} className="rounded-2xl border px-5 py-3 min-w-[150px] bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                <div className="text-2xl font-bold" style={{ color: card.color }}>{card.n}</div>
                <div className="text-xs" style={{ color: 'var(--mid-gray)' }}>{card.label}</div>
              </div>
            ))}
          </div>
          {trackError && !tracking ? (
            <p className="text-xs" style={{ color: '#b91c1c' }}>
              {trackError}. <button className="underline" onClick={() => loadTracking()}>Try again</button>
            </p>
          ) : loading || !tracking ? (
            <div className="py-12 text-center"><Loader2 size={18} className="animate-spin mx-auto" style={{ color: 'var(--teal)' }} /></div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
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
                  {matrixRows.map(({ c, keys, done, pct }) => (
                    <tr key={c.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-4 py-2 font-semibold sticky left-0 bg-white" style={{ color: 'var(--charcoal)' }}>{c.name}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{c.department}</td>
                      {matrixMonths.map(m => {
                        const cov = monthCoverage(m, keys)
                        const copy = cov === 'none' ? null : copyFor(c.id, m)
                        const mark = cov === 'full' ? '✓' : cov === 'none' ? '✗' : '½'
                        const color = cov === 'full' ? '#16a34a' : cov === 'none' ? '#dc2626' : '#b45309'
                        const title = cov === 'full' ? 'Invoiced' : cov === 'first' ? '1st half invoiced, 2nd half not yet' : cov === 'second' ? '2nd half invoiced, 1st half not yet' : 'No service invoice received'
                        return (
                          <td key={m} className="px-2 py-2 text-center" style={{ background: cov === 'full' ? '#f0fdf4' : cov === 'none' ? '#fef2f2' : '#fffbeb' }}>
                            {copy
                              ? <a href={copy} target="_blank" rel="noopener noreferrer" title={`${title} — view the copy`} style={{ color, fontWeight: 700 }}>{mark}</a>
                              : <span title={title} style={{ color, fontWeight: 700 }}>{mark}</span>}
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
                      No consultant has a COR on file yet.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
            Only consultants with a COR on file are tracked. ✓ invoiced · ½ one cutoff of the month invoiced · ✗ none. Record invoices with “Upload SI” in Tracking &amp; Reminders.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search consultant…"
              className="px-3 py-2 rounded-xl border text-sm flex-1 min-w-[200px] max-w-md bg-white" style={{ borderColor: 'var(--light-gray)' }} />
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}>
              <input type="checkbox" checked={showNoCor} onChange={e => setShowNoCor(e.target.checked)} className="w-4 h-4" style={{ accentColor: 'var(--teal)' }} />
              Show consultants without COR
              {withoutCor.length + no2303.length > 0 && <span style={{ color: 'var(--mid-gray)' }}>({withoutCor.length + no2303.length})</span>}
            </label>
          </div>
          {trackError && (
            <p className="text-xs" style={{ color: '#b91c1c' }}>
              {trackError}. <button className="underline" onClick={() => loadTracking()}>Try again</button>
            </p>
          )}

          {loading ? (
            <div className="py-12 text-center"><Loader2 size={18} className="animate-spin mx-auto" style={{ color: 'var(--teal)' }} /></div>
          ) : (
            <>
              <div className="rounded-2xl border bg-white overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
                <div className="px-4 py-3 flex items-baseline justify-between gap-3 flex-wrap border-b" style={{ borderColor: 'var(--light-gray)' }}>
                  <p className="text-sm font-bold" style={{ color: 'var(--deep-teal)' }}>
                    COR on file ({withCor.length})
                    {tracking && withCor.length > 0 && <span className="ml-2 font-normal text-xs" style={{ color: owing ? '#b45309' : '#15803d' }}>{owing ? `${owing} with cutoffs not yet invoiced` : 'all up to date'}</span>}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Figures from finalized payroll · “not yet invoiced” looks back 12 months</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                      <th className="px-4 py-2 text-left font-semibold">Consultant</th>
                      <th className="px-4 py-2 text-left font-semibold">Last invoice</th>
                      <th className="px-4 py-2 text-left font-semibold">Not yet invoiced</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {withCor.map(trackRow)}
                    {withCor.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>
                        {q.trim() ? 'No consultant with a COR matches.' : 'No consultant has a COR on file yet. CORs uploaded in the HR Hub show here automatically.'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {showNoCor && (
                <div className="rounded-2xl border bg-white overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
                  <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
                    <p className="text-sm font-bold" style={{ color: 'var(--mid-gray)' }}>Without COR ({withoutCor.length + no2303.length})</p>
                    <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Upload their COR once they register; they then move to the list above.</p>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {[...withoutCor, ...no2303].map(noCorRow)}
                      {withoutCor.length + no2303.length === 0 && (
                        <tr><td className="px-4 py-6 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>Every consultant has a COR on file.</td></tr>
                      )}
                    </tbody>
                  </table>
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
              <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Upload COR — {corTarget.name}</h2>
              <button onClick={() => setCorTarget(null)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>
              Upload this consultant&apos;s <strong>BIR Certificate of Registration (Form 2303)</strong> — pick a file, or use the
              QR code to take a photo with a phone. Once it&apos;s on file they join the Service Invoice tracking list.
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

      {/* Upload an invoice / send a reminder for a chosen range of cutoffs */}
      {dialog && tracking && (
        <SiInvoiceDialog
          consultant={dialog.c}
          mode={dialog.mode}
          pay={tracking.payroll[dialog.c.id] || {}}
          covered={keysBy.get(dialog.c.id) || new Set<string>()}
          outstanding={outstandingOf(dialog.c.id)}
          nowCutoff={nowCutoff}
          onClose={() => setDialog(null)}
          onRecorded={() => { setDialog(null); loadTracking(tracking.from) }}
          onSent={note => { setSentNote(prev => ({ ...prev, [dialog.c.id]: note })); setDialog(null) }}
        />
      )}
    </div>
  )
}
