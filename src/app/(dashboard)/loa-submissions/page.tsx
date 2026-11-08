'use client'

// LOA Submission — front desk raise a Letter of Authorization, chase the
// document, and print it once it lands.
//
// Branch scoping is enforced in /api/loa, not here: a front-desk account is
// pinned to its own branch server-side and the API reports that back as
// branchLocked, which is the only reason this renders a fixed label instead of
// a dropdown. Hiding the control is a courtesy, never the control itself.

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  FileText, QrCode, Download, Settings, X, Trash2, Upload, Info, Copy, RefreshCw,
  Search, SearchX, AlertTriangle, UserCheck, UserX, Clock, Hourglass, Inbox, CheckCircle2,
  FileImage, Eye, IdCard, CalendarDays, StickyNote, Loader2, ChevronRight, ShieldCheck, Building2,
} from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'
import { CARD_STYLE, KpiCard, Skeleton, EmptyState } from '../patients/dashboard/ui'

interface Option { id: string; name: string; active: boolean; sortOrder: number }
interface BranchOption { value: string; label: string; shortCode: string }
interface Loa {
  id: string
  patientId: string | null
  patientName: string | null
  deckingSlotId: string | null
  hmoName: string
  branch: string
  services: string[]
  dateOfApproval: string | null
  fileUrl: string | null
  idFileUrl: string | null
  fileMime: string | null
  status: 'AWAITING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  notes: string | null
  createdAt: string
  patient: { id: string; firstName: string; lastName: string } | null
  deckingSlot: {
    id: string; dayOfWeek: string; startTime: string; endTime: string; department: string
    staff: { firstName: string; lastName: string } | null
  } | null
}

const STATUS_STYLE: Record<Loa['status'], { bg: string; fg: string; border: string; label: string }> = {
  AWAITING:  { bg: '#FDEAD6', fg: '#93460B', border: '#F6CFA8', label: 'Awaiting document' },
  SUBMITTED: { bg: '#E3EEFB', fg: '#14507F', border: '#BED6F2', label: 'Document received' },
  APPROVED:  { bg: '#DFF5E4', fg: '#166534', border: '#B6E5C2', label: 'Approved' },
  REJECTED:  { bg: '#FDE4E4', fg: '#991B1B', border: '#F5C2C2', label: 'Rejected' },
}
const STATUS_KEYS = Object.keys(STATUS_STYLE) as Loa['status'][]

// ── Presentation ─────────────────────────────────────────────────────────────
// Same control/button vocabulary as Partner Institutions and Patients, so the
// page reads as part of the same app.

const CONTROL = 'h-9 px-3 rounded-lg text-sm outline-none focus:border-[var(--teal)]'
const CONTROL_STYLE: CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)', fontFamily: 'var(--font-body)' }
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50'
const BTN_SECONDARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors hover:bg-gray-50 disabled:opacity-60'
const BTN_ICON = 'inline-flex items-center justify-center gap-1 h-8 px-2 rounded-lg text-xs font-semibold transition-colors hover:bg-gray-50 disabled:opacity-50 cursor-pointer'
const SECTION_LABEL = 'text-[10.5px] font-bold uppercase tracking-wider'
const SUBTLE_BG = '#F6F9F8'
const HMO_TONE = { bg: '#EFE8FB', fg: '#5B2A86', border: '#DDD0F3' }

function fmtDate(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "just now" / "5m ago" / "3d ago" — how long a letter has been sitting. */
function relTime(iso: string) {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24); if (d < 14) return `${d}d ago`
  const w = Math.round(d / 7); if (d < 60) return `${w}w ago`
  const mo = Math.round(d / 30); if (mo < 12) return `${mo}mo ago`
  return `${Math.round(d / 365)}y ago`
}

function StatusBadge({ status }: { status: Loa['status'] }) {
  const st = STATUS_STYLE[status]
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4 whitespace-nowrap"
      style={{ background: st.bg, color: st.fg, border: `1px solid ${st.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.fg }} />
      {st.label}
    </span>
  )
}

function HmoChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-full text-[11px] font-bold leading-4 truncate"
      style={{ background: HMO_TONE.bg, color: HMO_TONE.fg, border: `1px solid ${HMO_TONE.border}` }} title={name}>
      <ShieldCheck size={11} className="flex-shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  )
}

/** Linked = the row points at a Patient CRM record; otherwise only a typed name. */
function MatchChip({ linked }: { linked: boolean }) {
  return linked ? (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold whitespace-nowrap" style={{ color: '#1F5F55' }}
      title="Linked to a Patient CRM record">
      <UserCheck size={11} /> In CRM
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold whitespace-nowrap" style={{ color: '#93460B' }}
      title="Not linked to a Patient CRM record — name only">
      <UserX size={11} /> Not linked
    </span>
  )
}

function ServiceChips({ items, max }: { items: string[]; max?: number }) {
  if (!items.length) return <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>No services listed</span>
  const visible = max ? items.slice(0, max) : items
  const hidden = items.length - visible.length
  return (
    <div className="flex flex-wrap gap-1 min-w-0">
      {visible.map(s => (
        <span key={s} className="inline-block max-w-full truncate px-1.5 py-0.5 rounded-md text-[11px] font-semibold leading-4"
          style={{ background: '#E6F1EE', color: '#1F5F55' }} title={s}>{s}</span>
      ))}
      {hidden > 0 && (
        <span className="inline-block px-1.5 py-0.5 rounded-md text-[11px] font-semibold leading-4"
          style={{ background: '#fff', color: 'var(--mid-gray)', border: '1px dashed var(--light-gray)' }}
          title={items.slice(visible.length).join(', ')}>+{hidden} more</span>
      )}
    </div>
  )
}

/** Small tile saying what kind of file is on record (PDF vs photo). */
function FileTile({ mime }: { mime: string | null }) {
  const isPdf = mime === 'application/pdf'
  return (
    <span className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center"
      style={{ background: isPdf ? '#FDECEC' : '#E3EEFB', color: isPdf ? '#B42318' : '#14507F', border: '1px solid var(--light-gray)' }}
      title={isPdf ? 'PDF document' : 'Photo / image'}>
      {isPdf ? <FileText size={15} /> : <FileImage size={15} />}
    </span>
  )
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

export default function LoaSubmissionsPage() {
  const [rows, setRows] = useState<Loa[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [branchLocked, setBranchLocked] = useState(false)
  const [lockedBranch, setLockedBranch] = useState<string | null>(null)

  const [hmos, setHmos] = useState<Option[]>([])
  const [services, setServices] = useState<Option[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])

  const [fBranch, setFBranch] = useState('')
  const [fHmo, setFHmo] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [q, setQ] = useState('')

  const [showInvite, setShowInvite] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [qr, setQr] = useState<{ id: string; url: string; data: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // Kept as an id so the panel shows the fresh row after every reload.
  const [openId, setOpenId] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (fBranch) p.set('branch', fBranch)
    if (fHmo) p.set('hmo', fHmo)
    if (fStatus) p.set('status', fStatus)
    if (q.trim()) p.set('q', q.trim())
    try {
      const r = await fetch(`/api/loa?${p}`)
      const d = await r.json()
      setRows(d.submissions ?? [])
      setBranchLocked(!!d.branchLocked)
      setLockedBranch(d.branch ?? null)
      setLoadError(r.ok ? '' : (d.error ?? 'Could not load LOA submissions'))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load LOA submissions')
    } finally { setLoading(false); setHasLoaded(true) }
  }, [fBranch, fHmo, fStatus, q])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/loa/settings').then(r => r.json()).then(d => {
      setHmos(d.hmos ?? []); setServices(d.services ?? []); setBranches(d.branches ?? [])
    }).catch(() => {})
  }, [])

  function nameOf(l: Loa) {
    return l.patient ? `${l.patient.lastName}, ${l.patient.firstName}` : (l.patientName || '—')
  }

  async function makeQr(id: string) {
    setBusy(id)
    try {
      const r = await fetch(`/api/loa/${id}/token`, { method: 'POST' })
      const d = await r.json()
      if (r.ok) setQr({ id, url: d.uploadUrl, data: d.qrDataUrl, expiresAt: d.expiresAt })
      else alert(d.error ?? 'Could not create a link')
    } finally { setBusy(null) }
  }

  async function uploadFor(id: string, file: File) {
    setBusy(id)
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await fetch(`/api/loa/${id}/file`, { method: 'POST', body: form })
      if (!r.ok) alert((await r.json()).error ?? 'Upload failed')
      else await load()
    } finally { setBusy(null) }
  }

  async function setStatus(id: string, status: Loa['status']) {
    setBusy(id)
    try {
      await fetch(`/api/loa/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await load()
    } finally { setBusy(null) }
  }

  async function remove(id: string) {
    if (!confirm('Delete this LOA record? The uploaded document goes with it.')) return
    setBusy(id)
    try { await fetch(`/api/loa/${id}`, { method: 'DELETE' }); await load() }
    finally { setBusy(null) }
  }

  // Headline counts from the rows already in hand — no extra request. They
  // follow the current filters, because the API filters server-side.
  const stats = useMemo(() => {
    const by: Record<Loa['status'], number> = { AWAITING: 0, SUBMITTED: 0, APPROVED: 0, REJECTED: 0 }
    let unlinked = 0
    const hmoCount = new Map<string, number>()
    for (const l of rows) {
      by[l.status]++
      if (!l.patientId) unlinked++
      hmoCount.set(l.hmoName, (hmoCount.get(l.hmoName) ?? 0) + 1)
    }
    const topHmos = [...hmoCount.entries()].sort((a, b) => b[1] - a[1])
    return { total: rows.length, by, unlinked, topHmos }
  }, [rows])

  const activeFilters = [fBranch && !branchLocked, fHmo, fStatus, q.trim()].filter(Boolean).length
  function clearFilters() { setFBranch(''); setFHmo(''); setFStatus(''); setQ('') }

  const opened = openId ? rows.find(r => r.id === openId) ?? null : null

  useEffect(() => {
    if (!openId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId])

  const initialLoad = loading && !hasLoaded

  return (
    <div className="max-w-[1200px] mx-auto space-y-5 min-w-0">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>Clinic Tools</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            LOA Submission
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Letters of Authorization for HMO sessions — share the form link or QR, or upload the document yourself.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={load} disabled={loading} className={BTN_SECONDARY} style={CONTROL_STYLE} title="Reload the list">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--teal)' }} /> Refresh
          </button>
          <button onClick={() => setShowSettings(true)} className={BTN_SECONDARY} style={CONTROL_STYLE}>
            <Settings size={14} style={{ color: 'var(--teal)' }} /> Settings
          </button>
          <button onClick={() => setShowInvite(true)} className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>
            <QrCode size={15} /> LOA form link
          </button>
        </div>
      </div>

      {/* The form asks patients to find themselves in the CRM, so a patient who
          has never been registered cannot submit. Front desk have to know that,
          and the place they will look is this screen. */}
      <div className="flex items-start gap-2.5 rounded-xl px-4 py-2.5" style={{ background: '#FFF7E6', border: '1px solid #F3D9A5' }}>
        <Info size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#8A5A00' }} />
        <p className="text-[13px] leading-relaxed m-0" style={{ color: '#8A5A00' }}>
          <strong>Register the patient first.</strong> The LOA form asks patients to
          find their own name, and it searches the Patient CRM — so anyone who has
          not been added there yet cannot submit. If a patient says their name is
          not found, create their record in <strong>Patient CRM</strong>, then send
          them the link again.
        </p>
      </div>

      {/* ── KPIs ── */}
      {!loadError && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {initialLoad ? (
            Array.from({ length: 4 }).map((_, n) => (
              <div key={n} className="rounded-xl px-4 py-3.5" style={CARD_STYLE}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-14 mt-2" />
                <Skeleton className="h-3 w-24 mt-2" />
              </div>
            ))
          ) : (
            <>
              <KpiCard label={activeFilters ? 'LOAs in view' : 'LOAs'} icon={<Inbox size={16} />} value={stats.total}
                sub={stats.unlinked > 0 ? `${stats.unlinked} not linked to a CRM patient` : stats.total ? 'All linked to a CRM patient' : 'Nothing filed yet'} />
              <KpiCard label="Awaiting document" icon={<Hourglass size={16} />} accent={STATUS_STYLE.AWAITING.fg}
                value={stats.by.AWAITING} sub="Chase the patient or HMO" />
              <KpiCard label="To review" icon={<FileText size={16} />} accent={STATUS_STYLE.SUBMITTED.fg}
                value={stats.by.SUBMITTED} sub="Document received" />
              <KpiCard label="Approved" icon={<CheckCircle2 size={16} />} accent={STATUS_STYLE.APPROVED.fg}
                value={stats.by.APPROVED} sub={stats.by.REJECTED > 0 ? `${stats.by.REJECTED} rejected` : 'None rejected'} />
            </>
          )}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="rounded-xl px-4 py-3 space-y-2.5" style={CARD_STYLE}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
            <input placeholder="Search patient…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search patient"
              className={`${CONTROL} w-full pl-8 ${q ? 'pr-8' : ''}`} style={CONTROL_STYLE} />
            {q && (
              <button type="button" onClick={() => setQ('')} aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100" style={{ color: 'var(--mid-gray)' }}>
                <X size={13} />
              </button>
            )}
          </div>
          {branchLocked ? (
            <span className={`${CONTROL} inline-flex items-center gap-1.5`} style={{ ...CONTROL_STYLE, background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
              <Building2 size={13} /> Branch: <strong style={{ color: 'var(--charcoal)' }}>{branchLabel(lockedBranch)}</strong>
            </span>
          ) : (
            <select value={fBranch} onChange={e => setFBranch(e.target.value)} aria-label="Branch" className={CONTROL} style={CONTROL_STYLE}>
              <option value="">All branches</option>
              {branches.map(b => <option key={b.shortCode} value={b.shortCode}>{b.label}</option>)}
            </select>
          )}
          <select value={fHmo} onChange={e => setFHmo(e.target.value)} aria-label="HMO" className={CONTROL} style={CONTROL_STYLE}
                  title="HMO providers come from the HMO digital wallets in Accounting Hub → Point of Sale">
            <option value="">All HMOs</option>
            {hmos.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
          </select>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} aria-label="Status" className={CONTROL} style={CONTROL_STYLE}>
            <option value="">Any status</option>
            {STATUS_KEYS.map(s => (
              <option key={s} value={s}>{STATUS_STYLE[s].label}</option>
            ))}
          </select>
          {activeFilters > 0 && (
            <button type="button" onClick={clearFilters} className={`${BTN_SECONDARY} text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
              <X size={12} /> Clear
              <span className="ml-0.5 px-1.5 rounded-full text-[10.5px] tabular-nums" style={{ background: 'var(--teal)', color: '#fff' }}>{activeFilters}</span>
            </button>
          )}
        </div>
        {/* HMO mix of what's on screen — a read of the list, not a filter. */}
        {!initialLoad && stats.topHmos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={SECTION_LABEL} style={{ color: 'var(--mid-gray)' }}>By HMO</span>
            {stats.topHmos.slice(0, 8).map(([name, n]) => (
              <span key={name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4"
                style={{ background: SUBTLE_BG, color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}>
                {name} <span className="tabular-nums" style={{ color: HMO_TONE.fg }}>{n}</span>
              </span>
            ))}
            {stats.topHmos.length > 8 && (
              <span className="text-[11px] font-semibold" style={{ color: 'var(--mid-gray)' }}>+{stats.topHmos.length - 8} more</span>
            )}
          </div>
        )}
      </div>

      {/* ── List ── */}
      {loadError ? (
        <div role="alert" className="rounded-xl text-center px-6 py-10" style={{ background: '#fff', border: '1px solid #FECACA' }}>
          <AlertTriangle size={20} className="mx-auto mb-2" style={{ color: '#DC2626' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Couldn&rsquo;t load LOA submissions</p>
          <p className="text-xs mt-1 max-w-md mx-auto" style={{ color: '#991B1B' }}>{loadError}</p>
          <button onClick={load} disabled={loading} className={`${BTN_SECONDARY} mt-4 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Try again
          </button>
        </div>
      ) : (
        <section className="rounded-xl overflow-hidden min-w-0" style={CARD_STYLE}>
          <header className="px-5 py-3 flex flex-wrap items-center justify-between gap-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
            <h2 className="text-[14px] font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {initialLoad ? 'Submissions' : `${rows.length} submission${rows.length === 1 ? '' : 's'}`}
              {loading && !initialLoad && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--mid-gray)' }} />}
            </h2>
            <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Newest first · click a row for details</span>
          </header>

          {initialLoad ? (
            <div aria-hidden>
              {Array.from({ length: 6 }).map((_, n) => (
                <div key={n} className="flex items-center gap-5 px-5 py-4" style={{ borderTop: n ? '1px solid var(--light-gray)' : undefined }}>
                  <div className="w-48"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-20 mt-2" /></div>
                  <div className="flex-1"><Skeleton className="h-5 w-24" /><Skeleton className="h-4 w-40 mt-2" /></div>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-32 rounded-full" />
                  <Skeleton className="h-8 w-28" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center">
              {activeFilters > 0
                ? <SearchX size={26} className="mt-10 -mb-8" style={{ color: 'var(--light-gray)' }} />
                : <FileText size={26} className="mt-10 -mb-8" style={{ color: 'var(--light-gray)' }} />}
              <EmptyState
                title={activeFilters > 0 ? 'No LOA submissions match these filters' : 'No LOA submissions yet.'}
                hint={activeFilters > 0
                  ? 'Try a different name, HMO or status, or clear the filters.'
                  : 'Share the form link or QR with patients — or start one from an HMO slot on the Decking board.'} />
              {activeFilters > 0 && (
                <button type="button" onClick={clearFilters}
                  className={`${BTN_SECONDARY} -mt-6 mb-8 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: SUBTLE_BG }}>
                    {['Patient', 'HMO & services', ...(branchLocked ? [] : ['Branch']), 'Submitted', 'Status', 'Document', ''].map((h, i) => (
                      <th key={`${h}-${i}`} className={`px-4 py-2 text-left whitespace-nowrap ${SECTION_LABEL}`}
                        style={{ color: 'var(--mid-gray)', borderBottom: '1px solid var(--light-gray)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(l => {
                    const st = STATUS_STYLE[l.status]
                    const isBusy = busy === l.id
                    return (
                      <tr key={l.id} onClick={() => setOpenId(l.id)}
                        className="cursor-pointer align-top transition-colors hover:bg-[#F8FAF9]"
                        style={{ borderTop: '1px solid var(--light-gray)', opacity: isBusy ? 0.6 : 1 }}>
                        <td className="px-4 py-3 min-w-[180px]">
                          <button type="button" onClick={e => { stop(e); setOpenId(l.id) }}
                            className="text-left text-[13.5px] font-bold leading-snug hover:underline" style={{ color: 'var(--charcoal)' }}>
                            {nameOf(l)}
                          </button>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <MatchChip linked={!!l.patientId} />
                            {l.deckingSlot && (
                              <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                                {l.deckingSlot.department} · {l.deckingSlot.dayOfWeek} {l.deckingSlot.startTime}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 min-w-[200px] max-w-[280px]">
                          <HmoChip name={l.hmoName} />
                          <div className="mt-1.5"><ServiceChips items={l.services} max={2} /></div>
                        </td>
                        {!branchLocked && (
                          <td className="px-4 py-3 text-[13px] whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{branchLabel(l.branch)}</td>
                        )}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-[13px] tabular-nums" style={{ color: 'var(--charcoal)' }}>{fmtDate(l.createdAt)}</p>
                          <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                            <Clock size={10} /> {relTime(l.createdAt)}
                          </p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" onClick={stop}>
                          <select
                            value={l.status}
                            onChange={e => setStatus(l.id, e.target.value as Loa['status'])}
                            disabled={isBusy}
                            aria-label="Status"
                            className="h-7 pl-2 pr-1 rounded-full text-[11.5px] font-bold cursor-pointer outline-none disabled:opacity-60"
                            style={{ background: st.bg, color: st.fg, border: `1px solid ${st.border}` }}
                          >
                            {STATUS_KEYS.map(s => (
                              <option key={s} value={s}>{STATUS_STYLE[s].label}</option>
                            ))}
                          </select>
                          <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>
                            {l.dateOfApproval ? <>Approved {new Date(l.dateOfApproval).toLocaleDateString('en-CA')}</> : 'No approval date'}
                          </p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" onClick={stop}>
                          {l.fileUrl ? (
                            <div className="flex items-center gap-1.5">
                              <FileTile mime={l.fileMime} />
                              <a href={`/api/loa/${l.id}/file`} className={BTN_ICON} style={{ ...CONTROL_STYLE, color: '#14507F' }} title="Download to print">
                                <Download size={13} /> Print
                              </a>
                              <a href={`/api/loa/${l.id}/file?view=1`} target="_blank" rel="noreferrer" className={BTN_ICON} style={CONTROL_STYLE} title="Open in a new tab">
                                <Eye size={13} /> View
                              </a>
                              {/* The ID is what the counter signature gets checked
                                  against, so it belongs next to the letter rather
                                  than somewhere it has to be hunted for. Letters
                                  filed before the ID was asked for have none. */}
                              {l.idFileUrl && (
                                <a href={`/api/loa/${l.id}/file?doc=id&view=1`} target="_blank" rel="noreferrer"
                                   title="Valid ID — check the signature against the one signed at the counter"
                                   className={BTN_ICON} style={{ ...CONTROL_STYLE, color: '#5B2A86' }}>
                                  <IdCard size={13} /> ID
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
                              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ border: '1px dashed var(--light-gray)' }}>
                                <Hourglass size={13} />
                              </span>
                              Not yet
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" onClick={stop}>
                          <RowActions id={l.id} busy={isBusy} onQr={makeQr} onUpload={uploadFor} onDelete={remove} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {opened && (
        <LoaDetail
          loa={opened} name={nameOf(opened)} busy={busy === opened.id} branchLocked={branchLocked}
          onClose={() => setOpenId(null)}
          onStatus={setStatus} onQr={makeQr} onUpload={uploadFor} onDelete={remove}
        />
      )}
      {qr && <QrModal qr={qr} onClose={() => setQr(null)} />}
      {showInvite && <FormLinkModal onClose={() => setShowInvite(false)} />}
      {showSettings && (
        <SettingsModal
          hmos={hmos} services={services}
          onClose={() => setShowSettings(false)}
          onChanged={() => fetch('/api/loa/settings').then(r => r.json()).then(d => {
            setHmos(d.hmos ?? []); setServices(d.services ?? [])
          })}
        />
      )}
    </div>
  )
}

// ─── Row actions ────────────────────────────────────────────────────────────

function RowActions({ id, busy, onQr, onUpload, onDelete, labels = false }: {
  id: string; busy: boolean; labels?: boolean
  onQr: (id: string) => void; onUpload: (id: string, f: File) => void; onDelete: (id: string) => void
}) {
  return (
    <div className={`flex items-center gap-1.5 ${labels ? 'flex-wrap' : 'justify-end'}`}>
      <button onClick={() => onQr(id)} disabled={busy} title="Send link / show QR" className={BTN_ICON} style={CONTROL_STYLE}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <QrCode size={13} />} QR{labels && ' / upload link'}
      </button>
      <label title="Upload the document yourself" className={BTN_ICON} style={CONTROL_STYLE}>
        <Upload size={13} />{labels && ' Upload document'}
        <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(id, f) }} />
      </label>
      <button onClick={() => onDelete(id)} disabled={busy} title="Delete" className={BTN_ICON} style={{ ...CONTROL_STYLE, color: '#991B1B' }}>
        <Trash2 size={13} />{labels && ' Delete'}
      </button>
    </div>
  )
}

// ─── Detail side panel ──────────────────────────────────────────────────────

function DetailSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="px-5 py-4" style={{ borderTop: '1px solid var(--light-gray)' }}>
      <h4 className={`flex items-center gap-1.5 mb-2.5 ${SECTION_LABEL}`} style={{ color: 'var(--mid-gray)' }}>
        <span style={{ color: 'var(--teal)' }}>{icon}</span>{title}
      </h4>
      {children}
    </section>
  )
}

function LoaDetail({ loa: l, name, busy, branchLocked, onClose, onStatus, onQr, onUpload, onDelete }: {
  loa: Loa; name: string; busy: boolean; branchLocked: boolean; onClose: () => void
  onStatus: (id: string, s: Loa['status']) => void
  onQr: (id: string) => void; onUpload: (id: string, f: File) => void; onDelete: (id: string) => void
}) {
  const st = STATUS_STYLE[l.status]
  const isImage = !!l.fileMime && l.fileMime.startsWith('image/')
  const dt = 'text-[12.5px]'
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="loa-detail-title"
        className="bg-white h-full w-full max-w-[460px] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <p className={SECTION_LABEL} style={{ color: 'var(--teal)' }}>Letter of Authorization</p>
            <h3 id="loa-detail-title" className="text-lg font-bold leading-snug mt-0.5" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {name}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <StatusBadge status={l.status} />
              <HmoChip name={l.hmoName} />
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" autoFocus
            className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center hover:bg-gray-100" style={{ color: 'var(--mid-gray)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto min-h-0 flex-1">
          {/* Status */}
          <DetailSection icon={<CheckCircle2 size={12} />} title="Review">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--charcoal)' }}>Status</label>
            <select
              value={l.status}
              onChange={e => onStatus(l.id, e.target.value as Loa['status'])}
              disabled={busy}
              className={`${CONTROL} w-full font-semibold cursor-pointer disabled:opacity-60`}
              style={{ ...CONTROL_STYLE, background: st.bg, color: st.fg, border: `1px solid ${st.border}` }}
            >
              {STATUS_KEYS.map(s => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
            </select>
            {busy && (
              <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--mid-gray)' }}>
                <Loader2 size={11} className="animate-spin" /> Saving…
              </p>
            )}
          </DetailSection>

          {/* Document */}
          <DetailSection icon={<FileText size={12} />} title="Documents">
            {l.fileUrl ? (
              <div className="space-y-2.5">
                {isImage ? (
                  <a href={`/api/loa/${l.id}/file?view=1`} target="_blank" rel="noreferrer"
                    className="block rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)', background: SUBTLE_BG }}
                    title="Open the letter in a new tab">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/loa/${l.id}/file?view=1`} alt="LOA document preview" loading="lazy"
                      className="w-full max-h-[260px] object-contain" />
                  </a>
                ) : (
                  <div className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                    <FileTile mime={l.fileMime} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold" style={{ color: 'var(--charcoal)' }}>LOA document</p>
                      <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{l.fileMime === 'application/pdf' ? 'PDF' : 'File'} on record</p>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <a href={`/api/loa/${l.id}/file`} className={BTN_ICON} style={{ ...CONTROL_STYLE, color: '#14507F' }}>
                    <Download size={13} /> Print
                  </a>
                  <a href={`/api/loa/${l.id}/file?view=1`} target="_blank" rel="noreferrer" className={BTN_ICON} style={CONTROL_STYLE}>
                    <Eye size={13} /> View
                  </a>
                  {l.idFileUrl && (
                    <a href={`/api/loa/${l.id}/file?doc=id&view=1`} target="_blank" rel="noreferrer"
                       title="Valid ID — check the signature against the one signed at the counter"
                       className={BTN_ICON} style={{ ...CONTROL_STYLE, color: '#5B2A86' }}>
                      <IdCard size={13} /> Valid ID
                    </a>
                  )}
                </div>
                {!l.idFileUrl && (
                  <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>No valid ID on file for this letter.</p>
                )}
              </div>
            ) : (
              <div className="rounded-lg px-3 py-3 text-center" style={{ border: '1px dashed var(--light-gray)' }}>
                <Hourglass size={16} className="mx-auto mb-1" style={{ color: STATUS_STYLE.AWAITING.fg }} />
                <p className="text-[13px] font-semibold" style={{ color: 'var(--charcoal)' }}>No document yet</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>Send the patient a QR link, or upload it yourself below.</p>
              </div>
            )}
          </DetailSection>

          {/* Authorization */}
          <DetailSection icon={<ShieldCheck size={12} />} title="Authorization">
            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5">
              <dt className={dt} style={{ color: 'var(--mid-gray)' }}>HMO</dt>
              <dd className={dt} style={{ color: 'var(--charcoal)' }}>{l.hmoName}</dd>
              <dt className={dt} style={{ color: 'var(--mid-gray)' }}>Approved</dt>
              <dd className={dt} style={{ color: 'var(--charcoal)' }}>
                {l.dateOfApproval ? new Date(l.dateOfApproval).toLocaleDateString('en-CA') : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
              </dd>
              {!branchLocked && (<>
                <dt className={dt} style={{ color: 'var(--mid-gray)' }}>Branch</dt>
                <dd className={dt} style={{ color: 'var(--charcoal)' }}>{branchLabel(l.branch)}</dd>
              </>)}
              <dt className={dt} style={{ color: 'var(--mid-gray)' }}>Submitted</dt>
              <dd className={dt} style={{ color: 'var(--charcoal)' }}>
                {fmtDate(l.createdAt)} <span style={{ color: 'var(--mid-gray)' }}>· {relTime(l.createdAt)}</span>
              </dd>
            </dl>
            <p className="text-xs font-semibold mt-3 mb-1.5" style={{ color: 'var(--charcoal)' }}>Services</p>
            <ServiceChips items={l.services} />
          </DetailSection>

          {/* Patient */}
          <DetailSection icon={<UserCheck size={12} />} title="Patient">
            <div className="rounded-lg px-3 py-2.5" style={{ background: l.patientId ? '#F1F7F5' : '#FFF7E6', border: `1px solid ${l.patientId ? '#CBE3DC' : '#F3D9A5'}` }}>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--charcoal)' }}>{name}</p>
              <p className="text-[11.5px] mt-0.5" style={{ color: l.patientId ? '#1F5F55' : '#8A5A00' }}>
                {l.patientId ? 'Linked to a Patient CRM record' : 'Not linked to a Patient CRM record — name only'}
              </p>
            </div>
          </DetailSection>

          {/* Decking slot */}
          {l.deckingSlot && (
            <DetailSection icon={<CalendarDays size={12} />} title="Decking slot">
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5">
                <dt className={dt} style={{ color: 'var(--mid-gray)' }}>Department</dt>
                <dd className={dt} style={{ color: 'var(--charcoal)' }}>{l.deckingSlot.department}</dd>
                <dt className={dt} style={{ color: 'var(--mid-gray)' }}>When</dt>
                <dd className={dt} style={{ color: 'var(--charcoal)' }}>{l.deckingSlot.dayOfWeek} {l.deckingSlot.startTime}–{l.deckingSlot.endTime}</dd>
                {l.deckingSlot.staff && (<>
                  <dt className={dt} style={{ color: 'var(--mid-gray)' }}>Therapist</dt>
                  <dd className={dt} style={{ color: 'var(--charcoal)' }}>{l.deckingSlot.staff.firstName} {l.deckingSlot.staff.lastName}</dd>
                </>)}
              </dl>
            </DetailSection>
          )}

          {/* Notes */}
          {l.notes && (
            <DetailSection icon={<StickyNote size={12} />} title="Notes">
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--charcoal)' }}>{l.notes}</p>
            </DetailSection>
          )}
        </div>

        {/* Footer — the same three actions as the row */}
        <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-2" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
          <RowActions id={l.id} busy={busy} onQr={onQr} onUpload={onUpload} onDelete={onDelete} labels />
          <button onClick={onClose} className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>
            Close <ChevronRight size={14} />
          </button>
        </div>
      </aside>
    </div>
  )
}

// ─── Modals ─────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, maxWidth = 520 }: { title: string; onClose: () => void; children: ReactNode; maxWidth?: number }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true"
        className="bg-white rounded-xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        style={{ maxWidth }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{title}</h2>
          <button onClick={onClose} aria-label="Close"
            className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center hover:bg-gray-100" style={{ color: 'var(--mid-gray)' }}>
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto min-h-0 px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

function QrModal({ qr, onClose }: { qr: { url: string; data: string; expiresAt: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <Modal title="Patient uploads their LOA" onClose={onClose} maxWidth={400}>
      <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'var(--mid-gray)' }}>
        Have them scan this, or send the link. It works once and expires{' '}
        <strong style={{ color: 'var(--charcoal)' }}>
          {new Date(qr.expiresAt).toLocaleString('en-PH', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}
        </strong>.
      </p>
      <div className="rounded-xl p-3 mx-auto w-fit" style={{ border: '1px solid var(--light-gray)', background: '#fff' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr.data} alt="LOA upload QR code" style={{ width: 240, height: 240, display: 'block' }} />
      </div>
      <input readOnly value={qr.url} onFocus={e => e.currentTarget.select()}
        className={`${CONTROL} w-full mt-4 text-xs`} style={{ ...CONTROL_STYLE, background: SUBTLE_BG }} />
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => { navigator.clipboard?.writeText(qr.url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
          className={`${BTN_PRIMARY} flex-1`} style={{ background: 'var(--teal)' }}
        >
          <Copy size={14} /> {copied ? 'Copied!' : 'Copy link'}
        </button>
        <button onClick={onClose} className={`${BTN_SECONDARY} flex-1`} style={CONTROL_STYLE}>Close</button>
      </div>
    </Modal>
  )
}

function FormLinkModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ url: string; qrDataUrl: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetch('/api/loa/form-link').then(r => r.json()).then(setData).catch(() => { setFailed(true) })
  }, [])

  return (
    <Modal title="LOA form" onClose={onClose} maxWidth={420}>
      <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'var(--mid-gray)' }}>
        This is the same link every time — print the QR for the counter, or send
        the link to any patient. They find their own name, fill in the form and
        upload the letter.
      </p>

      {data ? (
        <>
          <div className="rounded-xl p-3 mx-auto w-fit" style={{ border: '1px solid var(--light-gray)', background: '#fff' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.qrDataUrl} alt="LOA form QR code" style={{ width: 230, height: 230, display: 'block' }} />
          </div>
          <input readOnly value={data.url} onFocus={e => e.currentTarget.select()}
            className={`${CONTROL} w-full mt-4 text-xs text-center`} style={{ ...CONTROL_STYLE, background: SUBTLE_BG }} />
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => { navigator.clipboard?.writeText(data.url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
              className={`${BTN_PRIMARY} flex-1`} style={{ background: 'var(--teal)' }}
            >
              <Copy size={14} /> {copied ? 'Copied!' : 'Copy link'}
            </button>
            <a
              href={data.qrDataUrl} download="LOA-form-QR.png"
              className={`${BTN_SECONDARY} flex-1`} style={CONTROL_STYLE}
            >
              <Download size={14} style={{ color: 'var(--teal)' }} /> Save QR
            </a>
          </div>
        </>
      ) : failed ? (
        <p role="alert" className="text-[13px] text-center py-8 flex items-center justify-center gap-1.5" style={{ color: '#991B1B' }}>
          <AlertTriangle size={14} /> Couldn&rsquo;t load the form link. Close and try again.
        </p>
      ) : (
        <div className="flex flex-col items-center" aria-hidden>
          <Skeleton style={{ width: 230, height: 230 }} />
          <Skeleton className="h-9 w-full mt-4" />
        </div>
      )}
    </Modal>
  )
}

function SettingsModal({
  hmos, services, onClose, onChanged,
}: { hmos: Option[]; services: Option[]; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<'hmo' | 'service'>('hmo')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const list = tab === 'hmo' ? hmos : services

  async function syncHmos() {
    setBusy(true); setSyncMsg(null)
    try {
      const r = await fetch('/api/loa/settings/sync-hmos', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) { setSyncMsg({ ok: false, text: d.error ?? 'Sync failed' }); return }
      const bits = [
        d.added.length   ? `${d.added.length} added`       : null,
        d.restored.length? `${d.restored.length} restored` : null,
        d.retired.length ? `${d.retired.length} retired`   : null,
      ].filter(Boolean)
      setSyncMsg({
        ok: true,
        text: bits.length
          ? `Synced — ${bits.join(', ')}. ${d.unchanged} already matched.`
          : `Already up to date — all ${d.unchanged} providers match the wallets.`,
      })
      onChanged()
    } finally { setBusy(false) }
  }

  async function post(body: Record<string, unknown>) {
    setBusy(true)
    try {
      const r = await fetch('/api/loa/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: tab, ...body }),
      })
      if (!r.ok) alert((await r.json()).error ?? 'Could not save')
      else onChanged()
    } finally { setBusy(false) }
  }

  return (
    <Modal title="LOA form settings" onClose={onClose}>
      <p className="text-[12.5px] mb-4" style={{ color: 'var(--mid-gray)' }}>
        Branches are not listed here — they come from HR Hub, so a new clinic appears on its own.
      </p>

      <div className="inline-flex p-1 rounded-lg mb-4" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }} role="tablist">
        {(['hmo', 'service'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} role="tab" aria-selected={tab === t}
            className="h-8 px-3.5 rounded-md text-xs font-semibold transition-colors"
            style={tab === t
              ? { background: '#fff', color: 'var(--charcoal)', boxShadow: '0 1px 2px rgba(15,23,42,0.08)' }
              : { background: 'transparent', color: 'var(--mid-gray)' }}>
            {t === 'hmo' ? 'HMO names' : 'Services'}
            <span className="ml-1.5 tabular-nums" style={{ opacity: 0.6 }}>{(t === 'hmo' ? hmos : services).length}</span>
          </button>
        ))}
      </div>

      {tab === 'hmo' ? (
        <div className="rounded-lg px-3.5 py-3 mb-4" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
          <p className="text-[12.5px] leading-relaxed mb-2.5" style={{ color: 'var(--charcoal)' }}>
            This list mirrors the <strong>HMO digital wallets</strong> in the Accounting Hub
            (Point of Sale → Digital Wallet → HMO). Add a provider there and it appears
            here — it syncs on a schedule, or press the button to pull it now.
          </p>
          <button
            disabled={busy}
            onClick={syncHmos}
            className={`${BTN_PRIMARY} w-full`} style={{ background: 'var(--teal)' }}
          >
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> {busy ? 'Syncing…' : 'Sync from Accounting Hub'}
          </button>
          {syncMsg && (
            <p className="text-[12px] mt-2.5 mb-0 leading-relaxed" style={{ color: syncMsg.ok ? '#166534' : '#991B1B' }}>
              {syncMsg.text}
            </p>
          )}
        </div>
      ) : (
        <div className="flex gap-2 mb-4">
          <input
            value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Add a service…"
            className={`${CONTROL} flex-1 min-w-0`} style={CONTROL_STYLE}
          />
          <button
            disabled={busy || !newName.trim()}
            onClick={async () => { await post({ name: newName }); setNewName('') }}
            className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}
          >
            Add
          </button>
        </div>
      )}

      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
        {list.length === 0 && <p className="px-3 py-3 text-[13px]" style={{ color: 'var(--mid-gray)' }}>Nothing here yet.</p>}
        {list.map((o, n) => (
          <div key={o.id} className="flex items-center justify-between gap-2 px-3 py-2"
            style={{ borderTop: n ? '1px solid var(--light-gray)' : undefined }}>
            <span className="text-[13px] min-w-0 truncate" style={{ color: o.active ? 'var(--charcoal)' : '#B0B8BC', textDecoration: o.active ? 'none' : 'line-through' }}>
              {o.name}
            </span>
            {/* Retire rather than delete: letters already filed name this
                value, and removing it would blank their record. The HMO sync
                retires the same way when a wallet disappears. */}
            <button
              disabled={busy}
              onClick={() => post({ id: o.id, active: !o.active })}
              className="h-7 px-2.5 rounded-md text-[11.5px] font-semibold flex-shrink-0 transition-colors hover:bg-gray-50 disabled:opacity-50"
              style={{ border: '1px solid var(--light-gray)', background: '#fff', color: o.active ? '#991B1B' : '#166534' }}
            >
              {o.active ? 'Retire' : 'Restore'}
            </button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
