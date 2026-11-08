'use client'

// Enquiries, laid out the way a messaging app is: conversations down the left,
// the open conversation filling the right.
//
// The first version was a filter bar over a table with a detail panel beside
// it. It held the same information and read like a records screen, which is not
// what answering messages feels like.
//
// Branch scoping is NOT done here. /api/inquiries pins a branch-scoped account
// to its own branch whatever this sends, and reports back which branch it
// pinned — the filter below is a convenience for accounts that can see both.
//
// Presentation follows the other Clinic Tools pages (LOA Submission, Partner
// Institutions, Queueing): eyebrow header, KPI cards, white rounded cards on
// --light-gray rules. The bubbles and the attachment viewer come from the shared
// ChatThread, which the enquirer's own page also uses — so they are left alone
// here and the two ends keep looking like one product.

import { useState, useEffect, useCallback, useRef, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Loader2, Search, Inbox, X, RefreshCw, ArrowLeft, Info, AlertTriangle,
  Building2, MessageSquare, Hourglass, Sparkles, Mail,
} from 'lucide-react'
import ChatThread, { ChatComposer } from '@/components/ChatThread'
import InquiryContactPanel, { type PanelPatient, type PanelHistory } from '@/components/InquiryContactPanel'
import { CARD_STYLE, KpiCard, Skeleton, EmptyState } from '../patients/dashboard/ui'

interface Row {
  id: string; ref: string; branch: string; name: string; email: string | null; phone: string | null
  subject: string | null; status: string; readAt: string | null; lastMessageAt: string; createdAt: string
  preview: { body: string; fromStaff: boolean } | null
  _count: { messages: number }
}
interface Msg { id: string; fromStaff: boolean; authorName: string | null; body: string; createdAt: string
  fileUrl?: string | null; fileName?: string | null; fileMime?: string | null; fileSize?: number | null }
type Thread = { inquiry: Row; messages: Msg[]; patient: PanelPatient | null; history?: PanelHistory[] }

const BRANCH_LABEL: Record<string, string> = { SBEA: 'East', SBGH: 'Greenhills' }
const FILTERS = [
  { key: 'OPEN', label: 'Unanswered' },
  { key: 'ALL', label: 'All' },
  { key: 'ANSWERED', label: 'Replied' },
  { key: 'CLOSED', label: 'Closed' },
]

// ── Presentation ─────────────────────────────────────────────────────────────
// Same control/button vocabulary as LOA Submission and Queueing.

const CONTROL = 'h-9 px-3 rounded-lg text-sm outline-none focus:border-[var(--teal)]'
const CONTROL_STYLE: CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)', fontFamily: 'var(--font-body)' }
const BTN_SECONDARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors hover:bg-gray-50 disabled:opacity-60'
const BTN_ICON = 'inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors hover:bg-gray-50'
const SECTION_LABEL = 'text-[10.5px] font-bold uppercase tracking-wider'
const SUBTLE_BG = '#F6F9F8'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

// Same three tones the contact panel uses for its status pill, so the list,
// the thread header and the panel never disagree about what a colour means.
const STATUS_STYLE: Record<string, { bg: string; fg: string; border: string; label: string }> = {
  OPEN:     { bg: '#FEF9C3', fg: '#A16207', border: '#FDE68A', label: 'Awaiting reply' },
  ANSWERED: { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0', label: 'Replied' },
  CLOSED:   { bg: '#F3F4F6', fg: '#6B7280', border: '#E5E7EB', label: 'Closed' },
}

function StatusBadge({ status, compact = false }: { status: string; compact?: boolean }) {
  const st = STATUS_STYLE[status] ?? STATUS_STYLE.CLOSED
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${compact ? 'px-1.5 py-px text-[10px] leading-4' : 'px-2 py-0.5 text-[11px] leading-4'}`}
      style={{ background: st.bg, color: st.fg, border: `1px solid ${st.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.fg }} />
      {st.label}
    </span>
  )
}

function RefChip({ value }: { value: string }) {
  return (
    <span className="inline-block px-1.5 py-px rounded text-[10.5px] font-semibold leading-4 whitespace-nowrap"
      style={{ background: SUBTLE_BG, color: 'var(--mid-gray)', border: '1px solid var(--light-gray)', fontFamily: MONO }}>
      {value}
    </span>
  )
}

function Avatar({ name, size, active }: { name: string; size: number; active?: boolean }) {
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0 font-bold"
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.32),
        background: active ? 'var(--teal)' : '#E3EEEC', color: active ? '#fff' : 'var(--teal)',
      }}>
      {initials(name)}
    </div>
  )
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}

/** "Just now", "12m ago", then clock time today, "Yesterday", then a date. */
function whenLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (mins >= 0 && mins < 1) return 'Just now'
  if (mins >= 0 && mins < 60) return `${mins}m ago`
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
  }
  const y = new Date(now); y.setDate(y.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function Pane({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={`flex flex-col min-w-0 min-h-0 ${className}`} style={style}>{children}</div>
}

export default function InquiriesClient() {
  const [rows, setRows] = useState<Row[]>([])
  const [unread, setUnread] = useState(0)
  const [scoped, setScoped] = useState<string | null>(null)
  const [branch, setBranch] = useState('ALL')
  const [status, setStatus] = useState('OPEN')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [thread, setThread] = useState<Thread | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  // Display-only state. None of it reaches the API.
  const [loadError, setLoadError] = useState('')
  const [threadError, setThreadError] = useState('')
  const [listOnMobile, setListOnMobile] = useState(false)   // narrow screens: list ↔ thread
  const [showDetails, setShowDetails] = useState(false)     // < xl: contact panel as a slide-over

  const searchParams = useSearchParams()
  const deepLinked = useRef(false)
  const openIdRef = useRef<string | null>(null)
  openIdRef.current = openId

  // openThread() clears the thread before refetching it, which used to blank
  // the conversation to a spinner after every reply. Keep showing the last copy
  // of the SAME conversation until the fresh one lands — purely what is drawn.
  const lastThreadRef = useRef<Thread | null>(null)
  if (thread) lastThreadRef.current = thread
  const shown: Thread | null = thread
    ?? (lastThreadRef.current && lastThreadRef.current.inquiry.id === openId ? lastThreadRef.current : null)
  const refreshingThread = !thread && !!shown && !threadError

  const load = useCallback(async () => {
    const p = new URLSearchParams({ branch, status, q })
    try {
      const res = await fetch(`/api/inquiries?${p}`, { cache: 'no-store' })
      if (res.ok) {
        const d = await res.json()
        setRows(d.inquiries ?? []); setUnread(d.unread ?? 0); setScoped(d.scopedToBranch ?? null)
        setLoadError('')
      } else {
        const d = await res.json().catch(() => ({}))
        setLoadError(d.error || `The server answered ${res.status}.`)
      }
    } catch {
      setLoadError('Could not reach the server. Check the connection.')
    }
    setLoading(false)
  }, [branch, status, q])

  const openThread = useCallback(async (id: string) => {
    setOpenId(id); setThread(null); setThreadError('')
    const res = await fetch(`/api/inquiries/${id}`, { cache: 'no-store' })
    if (res.ok) { setThread(await res.json()); load() }
    else {
      const d = await res.json().catch(() => ({}))
      setThreadError(d.error || `The server answered ${res.status}.`)
    }
  }, [load])

  useEffect(() => { load() }, [load])

  // Poll so a reply arrives without a refresh, the way a messaging app does.
  //
  // Every ten seconds rather than twenty, and only while someone is actually
  // looking: a reply that takes most of a minute to appear while the desk has
  // the thread open on screen reads as the page being broken, and a background
  // tab polling all day serves nobody. Coming back to the tab refetches at
  // once, so switching windows never costs a cycle's wait.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      load()
      if (openIdRef.current) {
        fetch(`/api/inquiries/${openIdRef.current}`, { cache: 'no-store' })
          .then(r => r.ok ? r.json() : null).then(d => d && setThread(d)).catch(() => {})
      }
    }
    const t = setInterval(tick, 10000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [load])

  // Deep link from the notification bell: /inquiries?open=<id>. Widen the
  // filter first — a reply on an ANSWERED thread is unread but hidden under
  // the default, so otherwise the bell lands you on a list without the row.
  useEffect(() => {
    if (deepLinked.current) return
    const id = searchParams.get('open')
    if (!id) return
    deepLinked.current = true
    setStatus('ALL')
    openThread(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  async function sendFile(file: File, caption: string) {
    if (!openId) return
    const fd = new FormData()
    fd.append('file', file); fd.append('caption', caption)
    setBusy(true)
    try {
      const res = await fetch(`/api/inquiries/${openId}/upload`, { method: 'POST', body: fd })
      if (res.ok) await openThread(openId)
      else {
        const d = await res.json().catch(() => ({}))
        alert(d.error || 'Could not send that file.')
      }
    } finally { setBusy(false) }
  }

  async function send() {
    if (!openId || !reply.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/inquiries/${openId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply }),
      })
      if (res.ok) { setReply(''); await openThread(openId) }
    } finally { setBusy(false) }
  }

  async function setStatusOf(id: string, next: string) {
    await fetch(`/api/inquiries/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    await openThread(id)
  }

  // ── Figures from the list already on screen ────────────────────────────────
  const today = new Date().toDateString()
  const stats = {
    awaiting: rows.filter(r => r.status === 'OPEN').length,
    answered: rows.filter(r => r.status === 'ANSWERED').length,
    closed: rows.filter(r => r.status === 'CLOSED').length,
    newToday: rows.filter(r => new Date(r.createdAt).toDateString() === today).length,
  }
  const filterLabel = FILTERS.find(f => f.key === status)?.label ?? status
  const narrowed = status !== 'ALL' || !!q.trim() || branch !== 'ALL'
  const threadOnMobile = !!openId && !listOnMobile

  return (
    <div className="max-w-[1440px] mx-auto flex flex-col gap-4 min-w-0 lg:h-[calc(100vh-108px)]">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 flex-shrink-0">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>Clinic Tools</p>
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Enquiries
            {unread > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold leading-4 tabular-nums"
                style={{ background: '#DC2626', color: '#fff' }} title={`${unread} unread`}>
                {unread} new
              </span>
            )}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Messages from the public enquiry desk — reply here and the enquirer sees it on their link.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {scoped ? (
            <span className={`${CONTROL} inline-flex items-center gap-1.5 text-xs font-semibold`}
              title="Your account is scoped to this branch"
              style={{ ...CONTROL_STYLE, background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
              <Building2 size={13} style={{ color: 'var(--teal)' }} />
              {BRANCH_LABEL[scoped] ?? scoped}
            </span>
          ) : (
            <select value={branch} onChange={e => setBranch(e.target.value)} aria-label="Branch"
              className={CONTROL} style={CONTROL_STYLE}>
              <option value="ALL">Both branches</option>
              <option value="SBEA">East</option>
              <option value="SBGH">Greenhills</option>
            </select>
          )}
          <button onClick={() => load()} className={BTN_SECONDARY} style={CONTROL_STYLE} title="Reload the list">
            <RefreshCw size={14} style={{ color: 'var(--teal)' }} /> Refresh
          </button>
        </div>
      </div>

      {/* ── KPIs ── (from the list already loaded; Unread is the API's own count) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
        {loading ? (
          Array.from({ length: 4 }).map((_, n) => (
            <div key={n} className="rounded-xl px-4 py-3.5" style={CARD_STYLE}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-12 mt-2" />
              <Skeleton className="h-3 w-24 mt-2" />
            </div>
          ))
        ) : (
          <>
            <KpiCard label="Unread" icon={<Mail size={16} />} accent={unread > 0 ? '#DC2626' : 'var(--teal)'}
              value={unread} sub={scoped ? `${BRANCH_LABEL[scoped] ?? scoped} · not yet opened by you` : 'Not yet opened by you'} />
            <KpiCard label="Awaiting reply" icon={<Hourglass size={16} />} accent={STATUS_STYLE.OPEN.fg}
              value={stats.awaiting} sub={narrowed ? 'In this view' : 'Unanswered conversations'} />
            <KpiCard label="New today" icon={<Sparkles size={16} />}
              value={stats.newToday} sub={narrowed ? 'Started today · in this view' : 'Started today'} />
            <KpiCard label={narrowed ? 'In this view' : 'Conversations'} icon={<MessageSquare size={16} />}
              value={rows.length} sub={`${stats.answered} replied · ${stats.closed} closed`} />
          </>
        )}
      </div>

      {/* ── Inbox ── */}
      <section className="relative rounded-xl overflow-hidden flex min-w-0 flex-1 min-h-[520px] h-[calc(100dvh-92px)] lg:h-auto"
        style={CARD_STYLE}>

        {/* Conversations */}
        <Pane className={`w-full lg:w-[300px] xl:w-[320px] flex-shrink-0 lg:border-r ${threadOnMobile ? 'hidden lg:flex' : 'flex'}`}
          style={{ borderColor: 'var(--light-gray)' }}>
          <div className="px-3.5 pt-3.5 pb-3 space-y-2.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--light-gray)' }}>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, ref, email, phone…"
                aria-label="Search enquiries"
                className={`${CONTROL} w-full pl-8 ${q ? 'pr-8' : ''}`} style={{ ...CONTROL_STYLE, background: SUBTLE_BG }} />
              {q && (
                <button type="button" onClick={() => setQ('')} aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100" style={{ color: 'var(--mid-gray)' }}>
                  <X size={13} />
                </button>
              )}
            </div>
            <div role="tablist" aria-label="Status" className="grid grid-cols-4 gap-0.5 p-0.5 rounded-lg" style={{ background: '#EEF3F1' }}>
              {FILTERS.map(f => {
                const active = status === f.key
                return (
                  <button key={f.key} type="button" role="tab" aria-selected={active} onClick={() => setStatus(f.key)}
                    className={`rounded-md py-1.5 text-[11.5px] font-semibold whitespace-nowrap transition-colors ${active ? '' : 'hover:bg-black/[0.04]'}`}
                    style={active
                      ? { background: '#fff', color: 'var(--teal)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
                      : { background: 'transparent', color: 'var(--mid-gray)' }}>
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 px-3.5 py-2 flex-shrink-0" style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}>
            <span className={SECTION_LABEL} style={{ color: 'var(--mid-gray)' }}>
              {loading ? 'Loading…' : `${rows.length} ${filterLabel === 'All' ? 'conversation' : filterLabel.toLowerCase()}${rows.length === 1 || filterLabel !== 'All' ? '' : 's'}`}
            </span>
            <span className="text-[10.5px]" style={{ color: 'var(--mid-gray)' }}>Newest first</span>
          </div>

          {loadError && rows.length > 0 && (
            <div role="alert" className="flex items-center gap-2 px-3.5 py-2 text-[11.5px] flex-shrink-0"
              style={{ background: '#FEF2F2', color: '#991B1B', borderBottom: '1px solid #FECACA' }}>
              <AlertTriangle size={13} className="flex-shrink-0" />
              <span className="flex-1 min-w-0 truncate">Couldn&rsquo;t refresh — {loadError}</span>
              <button type="button" onClick={() => load()} className="font-semibold underline flex-shrink-0">Retry</button>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div aria-hidden>
                {Array.from({ length: 7 }).map((_, n) => (
                  <div key={n} className="flex items-start gap-3 px-3.5 py-3" style={{ borderTop: n ? '1px solid var(--light-gray)' : undefined }}>
                    <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-3"><Skeleton className="h-3.5 w-28" /><Skeleton className="h-3 w-10" /></div>
                      <Skeleton className="h-3 w-full mt-2" />
                      <div className="flex gap-2 mt-2"><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-16 rounded-full" /></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : loadError && rows.length === 0 ? (
              <div role="alert" className="text-center px-6 py-10">
                <AlertTriangle size={20} className="mx-auto mb-2" style={{ color: '#DC2626' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Couldn&rsquo;t load enquiries</p>
                <p className="text-xs mt-1 max-w-xs mx-auto" style={{ color: '#991B1B' }}>{loadError}</p>
                <button onClick={() => load()} className={`${BTN_SECONDARY} mt-4 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
                  <RefreshCw size={12} /> Try again
                </button>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center">
                <Inbox size={26} className="mt-10 -mb-8" style={{ color: 'var(--light-gray)' }} />
                <EmptyState
                  title={q.trim() ? 'No enquiries match that search' : status === 'OPEN' ? 'Nothing waiting for a reply' : 'No conversations here'}
                  hint={q.trim()
                    ? 'Try a name, reference number, email or phone.'
                    : status === 'OPEN' ? 'Every enquiry in view has been answered. New ones appear here on their own.' : 'Try another status or branch.'} />
                {(q || status !== 'ALL') && (
                  <button type="button" onClick={() => { setQ(''); setStatus('ALL') }}
                    className={`${BTN_SECONDARY} -mt-6 mb-8 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
                    Show all conversations
                  </button>
                )}
              </div>
            ) : rows.map((r, i) => {
              const active = openId === r.id
              const isUnread = !r.readAt
              return (
                <button key={r.id} type="button"
                  onClick={() => { setListOnMobile(false); openThread(r.id) }}
                  aria-current={active ? 'true' : undefined}
                  className={`relative flex items-start gap-3 w-full text-left px-3.5 py-3 transition-colors ${active ? '' : 'hover:bg-[#F6F9F8]'}`}
                  style={{
                    borderTop: i ? '1px solid var(--light-gray)' : undefined,
                    background: active ? 'var(--pale-teal)' : undefined,
                  }}>
                  {active && <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: 'var(--teal)' }} />}
                  <div className="relative flex-shrink-0">
                    <Avatar name={r.name} size={40} active={active} />
                    {isUnread && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full"
                        style={{ background: '#1a7b8a', border: '2px solid #fff' }} aria-label="Unread" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="flex-1 min-w-0 truncate text-[13.5px]"
                        style={{ color: 'var(--charcoal)', fontWeight: isUnread ? 800 : 600 }}>{r.name}</span>
                      <span className="text-[10.5px] flex-shrink-0 tabular-nums"
                        style={{ color: isUnread ? 'var(--teal)' : 'var(--mid-gray)', fontWeight: isUnread ? 700 : 400 }}>
                        {whenLabel(r.lastMessageAt)}
                      </span>
                    </div>
                    {r.subject && (
                      <p className="m-0 mt-0.5 text-[12px] truncate" style={{ color: 'var(--charcoal)', fontWeight: isUnread ? 700 : 600 }}>
                        {r.subject}
                      </p>
                    )}
                    <p className="m-0 mt-0.5 text-[12px] truncate"
                      style={{ color: isUnread ? 'var(--charcoal)' : 'var(--mid-gray)', fontWeight: isUnread ? 600 : 400 }}>
                      {r.preview
                        ? <>{r.preview.fromStaff && <span style={{ color: 'var(--teal)', fontWeight: 600 }}>You: </span>}{r.preview.body || 'Attachment'}</>
                        : r.subject ? '' : 'No messages'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <RefChip value={r.ref} />
                      <StatusBadge status={r.status} compact />
                      {!scoped && (
                        <span className="text-[10.5px]" style={{ color: 'var(--mid-gray)' }}>{BRANCH_LABEL[r.branch] ?? r.branch}</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </Pane>

        {/* Open conversation */}
        <Pane className={`flex-1 ${threadOnMobile ? 'flex' : 'hidden lg:flex'}`} style={{ background: '#fff' }}>
          {!openId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-6">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-1" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                <Inbox size={24} style={{ color: 'var(--teal)' }} />
              </div>
              <p className="text-sm font-semibold m-0" style={{ color: 'var(--charcoal)' }}>Select a conversation to read and reply</p>
              <p className="text-xs m-0 max-w-sm leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
                Enquiries arrive from <strong style={{ color: 'var(--charcoal)' }}>operations.sapphireclinicseast.org/inquiry</strong>
                {scoped ? ` · ${BRANCH_LABEL[scoped] ?? scoped} only` : ' · every branch'}
              </p>
            </div>
          ) : !shown ? (
            threadError ? (
              <div className="flex-1 flex flex-col">
                <div className="lg:hidden px-3 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--light-gray)' }}>
                  <button type="button" onClick={() => setListOnMobile(true)} className={BTN_ICON} style={CONTROL_STYLE}>
                    <ArrowLeft size={14} /> Conversations
                  </button>
                </div>
                <div role="alert" className="flex-1 flex flex-col items-center justify-center text-center px-6">
                  <AlertTriangle size={20} className="mb-2" style={{ color: '#DC2626' }} />
                  <p className="text-sm font-semibold m-0" style={{ color: 'var(--charcoal)' }}>Couldn&rsquo;t open this conversation</p>
                  <p className="text-xs mt-1 max-w-xs" style={{ color: '#991B1B' }}>{threadError}</p>
                  <button onClick={() => openThread(openId)} className={`${BTN_SECONDARY} mt-4 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
                    <RefreshCw size={12} /> Try again
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col" aria-hidden>
                <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-28 mt-2" /></div>
                </div>
                <div className="flex-1 px-5 py-6 space-y-4">
                  <Skeleton className="h-12 w-[55%] rounded-2xl" />
                  <Skeleton className="h-9 w-[40%] rounded-2xl ml-auto" />
                  <Skeleton className="h-16 w-[60%] rounded-2xl" />
                  <Skeleton className="h-9 w-[35%] rounded-2xl ml-auto" />
                </div>
                <div className="px-4 py-3" style={{ borderTop: '1px solid var(--light-gray)' }}>
                  <Skeleton className="h-11 w-full rounded-full" />
                </div>
              </div>
            )
          ) : (
            <>
              <header className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--light-gray)' }}>
                <button type="button" onClick={() => setListOnMobile(true)} aria-label="Back to conversations"
                  className="lg:hidden inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 flex-shrink-0"
                  style={{ color: 'var(--charcoal)' }}>
                  <ArrowLeft size={17} />
                </button>
                <Avatar name={shown.inquiry.name} size={40} active />
                <div className="flex-1 min-w-0">
                  <p className="m-0 text-[15px] font-bold truncate flex items-center gap-2"
                    style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                    <span className="truncate">{shown.inquiry.name}</span>
                    {refreshingThread && <Loader2 size={13} className="animate-spin flex-shrink-0" style={{ color: 'var(--mid-gray)' }} />}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <RefChip value={shown.inquiry.ref} />
                    <StatusBadge status={shown.inquiry.status} compact />
                    <span className="text-[11px] truncate" style={{ color: 'var(--mid-gray)' }}>
                      {BRANCH_LABEL[shown.inquiry.branch] ?? shown.inquiry.branch}
                      {shown.inquiry.subject ? ` · ${shown.inquiry.subject}` : ''}
                    </span>
                  </div>
                </div>
                <button type="button" onClick={() => setShowDetails(true)}
                  className={`${BTN_ICON} xl:hidden flex-shrink-0`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}
                  title="Contact details, patient record and status">
                  <Info size={14} /> Details
                </button>
              </header>

              {threadError && (
                <div role="alert" className="flex items-center gap-2 px-4 py-2 text-[11.5px] flex-shrink-0"
                  style={{ background: '#FEF2F2', color: '#991B1B', borderBottom: '1px solid #FECACA' }}>
                  <AlertTriangle size={13} className="flex-shrink-0" />
                  <span className="flex-1 min-w-0 truncate">Couldn&rsquo;t refresh this conversation — {threadError}</span>
                  <button type="button" onClick={() => openThread(shown.inquiry.id)} className="font-semibold underline flex-shrink-0">Retry</button>
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4">
                <ChatThread
                  mineIsStaff
                  messages={shown.messages.map(m => ({
                    id: m.id,
                    fromStaff: m.fromStaff,
                    author: m.fromStaff ? (m.authorName || 'Front Desk') : shown.inquiry.name,
                    body: m.body,
                    createdAt: m.createdAt,
                    fileUrl: m.fileUrl, fileName: m.fileName,
                    fileMime: m.fileMime, fileSize: m.fileSize,
                  }))}
                />
              </div>

              <div className="px-4 pt-2.5 pb-3.5 flex-shrink-0" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
                {shown.inquiry.status === 'CLOSED' ? (
                  <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed"
                    style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
                    <Info size={14} className="flex-shrink-0 mt-0.5" />
                    <span>This conversation is closed — reopen it to reply. The enquirer cannot add to it either.</span>
                  </div>
                ) : (
                  <>
                    <ChatComposer value={reply} onChange={setReply} onSend={send} onSendFile={sendFile} busy={busy}
                      placeholder="Write a reply — the enquirer sees this on their link." />
                    <p className="m-0 mt-1.5 px-1 text-[10.5px]" style={{ color: 'var(--mid-gray)' }}>
                      Enter to send · Shift+Enter for a new line · your replies appear on the right
                    </p>
                  </>
                )}
              </div>
            </>
          )}
        </Pane>

        {/* Contact panel: a third column on wide screens, a slide-over below that. */}
        {shown && (
          <>
            <div className="hidden xl:flex flex-shrink-0">
              <InquiryContactPanel
                inquiry={shown.inquiry}
                patient={shown.patient}
                history={shown.history ?? []}
                onOpenOther={(id) => { setStatus('ALL'); openThread(id) }}
                onToggleClosed={() => setStatusOf(shown.inquiry.id, shown.inquiry.status === 'CLOSED' ? 'OPEN' : 'CLOSED')}
              />
            </div>
            {showDetails && (
              <div className="xl:hidden absolute inset-0 z-10 flex justify-end" style={{ background: 'rgba(15,23,42,0.25)' }}
                onClick={() => setShowDetails(false)}>
                <div className="relative flex h-full max-w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                  <button type="button" onClick={() => setShowDetails(false)} aria-label="Close details"
                    className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-gray-100"
                    style={{ color: 'var(--mid-gray)' }}>
                    <X size={15} />
                  </button>
                  <InquiryContactPanel
                    inquiry={shown.inquiry}
                    patient={shown.patient}
                    history={shown.history ?? []}
                    onOpenOther={(id) => { setShowDetails(false); setStatus('ALL'); openThread(id) }}
                    onToggleClosed={() => setStatusOf(shown.inquiry.id, shown.inquiry.status === 'CLOSED' ? 'OPEN' : 'CLOSED')}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
