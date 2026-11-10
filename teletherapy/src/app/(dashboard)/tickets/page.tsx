'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, Paperclip, ChevronDown, RotateCcw, Search, ExternalLink } from 'lucide-react'
import {
  Avatar, Banner, BTN_PRIMARY, BTN_SM, CARD_STYLE, CONTROL, CONTROL_STYLE, EmptyState, LABEL, LABEL_STYLE, PAGE, PageHeader,
  PillTabs, PRIMARY_STYLE, RowsSkeleton, SECONDARY_STYLE, StatusPill, SUBTLE_BG, TEXTAREA,
} from '@/components/hub/ui'

interface Ticket {
  id: string
  ticketNumber: string
  branch: string
  subject: string
  description: string
  status: string
  attachmentPath: string | null
  attachmentName: string | null
  raisedByName: string
  raisedByEmail: string | null
  resolution: string | null
  resolvedByName: string | null
  resolvedAt: string | null
  createdAt: string
}

const BRANCH_LABEL: Record<string, string> = { SBEA: 'East', SBGH: 'Greenhills', VERDANA_STORE: 'Verdana' }

/* Names arrive as typed, often ALL CAPS. Title-case them; \p{L} with the u
   flag keeps ñ / accented letters inside a word ("RIÑOZA" → "Riñoza"). */
function niceName(name: string): string {
  const n = (name || '').trim()
  if (!n || n !== n.toUpperCase()) return n
  return n.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
}
function initials(name: string): string {
  const parts = niceName(name).split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}
function fmtWhen(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function fmtDay(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
/* How long an open ticket has been waiting: "under an hour", "5 hours", "3 days". */
function waited(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const h = Math.floor(ms / 3600000)
  if (h < 1) return 'under an hour'
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'}`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'}`
}

type Filter = 'OPEN' | 'RESOLVED' | 'ALL'

export default function TicketsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('OPEN')
  const [query, setQuery] = useState('')
  const [branch, setBranch] = useState('ALL')
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (session?.user?.role !== 'ADMIN') { router.replace('/'); return }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/tickets', { cache: 'no-store' })
      if (res.ok) setTickets((await res.json()).tickets ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function resolve(id: string, reopen = false) {
    setSaving(id)
    setSaveError(null)
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reopen ? { status: 'OPEN' } : { resolution: draft[id] ?? '' }),
      })
      if (res.ok) { await load() }
      else {
        const d = await res.json().catch(() => ({}))
        setSaveError(d.error ?? `Couldn't save (${res.status}). Try again.`)
      }
    } catch {
      setSaveError("Couldn't reach the server. Check your connection and try again.")
    }
    setSaving(null)
  }

  const branches = useMemo(() => [...new Set(tickets.map((t) => t.branch).filter(Boolean))].sort(), [tickets])
  const q = query.trim().toLowerCase()
  const matches = (t: Ticket) =>
    (branch === 'ALL' || t.branch === branch) &&
    (!q || [t.ticketNumber, t.subject, t.description, t.raisedByName, t.resolution].some((v) => (v ?? '').toLowerCase().includes(q)))
  const inScope = tickets.filter(matches)
  const counts = {
    OPEN: inScope.filter((t) => t.status === 'OPEN').length,
    RESOLVED: inScope.filter((t) => t.status === 'RESOLVED').length,
    ALL: inScope.length,
  }
  const openCount = tickets.filter((t) => t.status === 'OPEN').length

  if (status === 'loading' || session?.user?.role !== 'ADMIN') return null

  // Open: oldest first (longest waiting on top). Otherwise newest first.
  const shown = inScope
    .filter((t) => filter === 'ALL' ? true : t.status === filter)
    .sort((a, b) => filter === 'OPEN'
      ? a.createdAt.localeCompare(b.createdAt)
      : b.createdAt.localeCompare(a.createdAt))

  return (
    <div className={PAGE}>
      <PageHeader
        eyebrow="Admin"
        title="Tickets"
        description={<>Concerns raised by staff about the portal. <strong style={{ color: 'var(--charcoal)' }}>{openCount} open.</strong></>}
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <PillTabs
          label="Filter tickets"
          value={filter}
          onChange={(id) => setFilter(id as Filter)}
          tabs={[
            { id: 'OPEN', label: 'Open', count: loading ? undefined : counts.OPEN },
            { id: 'RESOLVED', label: 'Resolved', count: loading ? undefined : counts.RESOLVED },
            { id: 'ALL', label: 'All', count: loading ? undefined : counts.ALL },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2 ml-auto w-full sm:w-auto">
          <label className="relative flex-1 sm:flex-none">
            <span className="sr-only">Search tickets</span>
            <Search size={14} aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tickets…"
              className={`${CONTROL} pl-8 w-full sm:w-56`} style={CONTROL_STYLE} />
          </label>
          {branches.length > 1 && (
            <select aria-label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} className={CONTROL} style={CONTROL_STYLE}>
              <option value="ALL">All branches</option>
              {branches.map((b) => <option key={b} value={b}>{BRANCH_LABEL[b] ?? b}</option>)}
            </select>
          )}
        </div>
      </div>

      {saveError && <Banner tone="error">{saveError}</Banner>}

      {loading ? (
        <div className="rounded-xl" style={CARD_STYLE}><RowsSkeleton rows={4} label="Loading tickets" /></div>
      ) : shown.length === 0 ? (
        <section className="rounded-xl" style={CARD_STYLE}>
          <EmptyState
            icon={q || branch !== 'ALL' ? 'search' : 'check'}
            title={q || branch !== 'ALL' ? 'No tickets match' : `No ${filter === 'ALL' ? '' : filter.toLowerCase() + ' '}tickets`}
            hint={q || branch !== 'ALL' ? 'Try a different search or branch.' : filter === 'OPEN' ? 'Nothing waiting on you right now.' : undefined}
          />
        </section>
      ) : (
        <ul className="rounded-xl overflow-hidden" style={CARD_STYLE} aria-label="Tickets">
          {shown.map((t, i) => {
            const open = expanded === t.id
            const resolved = t.status === 'RESOLVED'
            const who = niceName(t.raisedByName)
            return (
              <li key={t.id} style={i ? { borderTop: '1px solid var(--light-gray)' } : undefined}>
                <button onClick={() => setExpanded(open ? null : t.id)} aria-expanded={open}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F8FAF2] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--teal)]"
                  style={open ? { background: '#F8FAF2' } : undefined}>
                  <Avatar text={initials(t.raisedByName)} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{t.subject}</p>
                      {t.attachmentPath && <Paperclip size={12} className="shrink-0" style={{ color: 'var(--mid-gray)' }} aria-label="Has attachment" />}
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--mid-gray)' }}>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{t.ticketNumber}</span> · {who} · {BRANCH_LABEL[t.branch] ?? t.branch} · {fmtWhen(t.createdAt)}
                    </p>
                  </div>
                  <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0 text-right">
                    {resolved
                      ? <StatusPill tone="success">Resolved</StatusPill>
                      : <StatusPill tone="warn">Open</StatusPill>}
                    <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                      {resolved ? (t.resolvedAt ? `on ${fmtDay(t.resolvedAt)}` : '') : `waiting ${waited(t.createdAt)}`}
                    </span>
                  </div>
                  <span className="sm:hidden shrink-0">{resolved ? <StatusPill tone="success">Resolved</StatusPill> : <StatusPill tone="warn">Open</StatusPill>}</span>
                  <ChevronDown size={18} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--mid-gray)' }} />
                </button>

                {open && (
                  <div className="px-4 pb-4 pt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" style={{ borderTop: '1px solid var(--light-gray)' }}>
                    <div className="space-y-3 min-w-0">
                      <p className={LABEL} style={LABEL_STYLE}>What {who.split(' ')[0] || 'they'} wrote</p>
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ color: 'var(--charcoal)' }}>{t.description}</p>
                      {t.attachmentPath && (
                        <a href={`/api/tickets/${t.id}/attachment`} target="_blank" rel="noreferrer"
                          className="group inline-flex flex-col gap-1.5 max-w-full rounded-lg p-2 transition-colors hover:bg-[#F8FAF2]"
                          style={{ border: '1px solid var(--light-gray)', background: '#fff' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/tickets/${t.id}/attachment`} alt={t.attachmentName ?? 'attachment'} className="max-h-60 max-w-full rounded-md object-contain" style={{ background: SUBTLE_BG }} />
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>
                            <Paperclip size={12} aria-hidden /> <span className="truncate">{t.attachmentName ?? 'Attachment'}</span>
                            <ExternalLink size={12} aria-hidden className="opacity-60 group-hover:opacity-100" />
                          </span>
                        </a>
                      )}
                    </div>

                    {resolved ? (
                      <div className="rounded-lg p-3 self-start" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                        <p className={LABEL} style={{ ...LABEL_STYLE, color: 'var(--deep-teal)' }}>Resolution{t.resolvedByName ? ` · ${niceName(t.resolvedByName)}` : ''}{t.resolvedAt ? ` · ${fmtDay(t.resolvedAt)}` : ''}</p>
                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ color: 'var(--charcoal)' }}>{t.resolution}</p>
                        <button onClick={() => resolve(t.id, true)} disabled={saving === t.id} className={`${BTN_SM} mt-2.5`} style={SECONDARY_STYLE}>
                          {saving === t.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} aria-hidden />} Reopen
                        </button>
                      </div>
                    ) : (
                      <div className="self-start">
                        <label htmlFor={`res-${t.id}`} className={LABEL} style={LABEL_STYLE}>Resolution</label>
                        <textarea id={`res-${t.id}`} value={draft[t.id] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [t.id]: e.target.value }))} rows={4} placeholder={`How was this addressed? ${who.split(' ')[0] || 'The staff member'} will see this.`} className={`${TEXTAREA} resize-none mb-2.5`} style={CONTROL_STYLE} />
                        <button onClick={() => resolve(t.id)} disabled={saving === t.id || !(draft[t.id] ?? '').trim()} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
                          {saving === t.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Mark resolved
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
