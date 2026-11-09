'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, Paperclip, ChevronDown, RotateCcw } from 'lucide-react'
import {
  BTN_PRIMARY, BTN_SM, CARD_STYLE, CONTROL_STYLE, EmptyState, LABEL, LABEL_STYLE, PAGE, PageHeader, PillTabs,
  PRIMARY_STYLE, RowsSkeleton, SECONDARY_STYLE, StatusPill, SUBTLE_BG, TEXTAREA,
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

export default function TicketsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [filter, setFilter] = useState<'OPEN' | 'RESOLVED' | 'ALL'>('OPEN')

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
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reopen ? { status: 'OPEN' } : { resolution: draft[id] ?? '' }),
      })
      if (res.ok) { await load() }
    } catch { /* ignore */ }
    setSaving(null)
  }

  if (status === 'loading' || session?.user?.role !== 'ADMIN') return null

  const shown = tickets.filter((t) => filter === 'ALL' ? true : t.status === filter)
  const openCount = tickets.filter((t) => t.status === 'OPEN').length

  return (
    <div className={PAGE}>
      <PageHeader
        eyebrow="Admin"
        title="Tickets"
        description={<>Concerns raised by staff about the portal. <strong style={{ color: 'var(--charcoal)' }}>{openCount} open.</strong></>}
      />

      <PillTabs
        label="Filter tickets"
        value={filter}
        onChange={(id) => setFilter(id as 'OPEN' | 'RESOLVED' | 'ALL')}
        tabs={[
          { id: 'OPEN', label: 'Open', count: loading ? undefined : openCount },
          { id: 'RESOLVED', label: 'Resolved' },
          { id: 'ALL', label: 'All' },
        ]}
      />

      {loading ? (
        <div className="rounded-xl" style={CARD_STYLE}><RowsSkeleton rows={4} label="Loading tickets" /></div>
      ) : shown.length === 0 ? (
        <section className="rounded-xl" style={CARD_STYLE}>
          <EmptyState icon="check" title={`No ${filter === 'ALL' ? '' : filter.toLowerCase() + ' '}tickets`} hint={filter === 'OPEN' ? 'Nothing waiting on you right now.' : undefined} />
        </section>
      ) : (
        <div className="space-y-2.5">
          {shown.map((t) => {
            const open = expanded === t.id
            return (
              <div key={t.id} className="rounded-xl overflow-hidden" style={CARD_STYLE}>
                <button onClick={() => setExpanded(open ? null : t.id)} aria-expanded={open}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F8FAF2] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--teal)]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>{t.ticketNumber}</span>
                      {t.status === 'RESOLVED'
                        ? <StatusPill tone="success">Resolved</StatusPill>
                        : <StatusPill tone="warn">Open</StatusPill>}
                      {t.attachmentPath && <Paperclip size={12} style={{ color: 'var(--mid-gray)' }} aria-label="Has attachment" />}
                    </div>
                    <p className="text-[14px] font-semibold truncate mt-1" style={{ color: 'var(--charcoal)' }}>{t.subject}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{t.raisedByName} · {BRANCH_LABEL[t.branch] ?? t.branch} · {new Date(t.createdAt).toLocaleString()}</p>
                  </div>
                  <ChevronDown size={18} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--mid-gray)' }} />
                </button>

                {open && (
                  <div className="px-4 pb-4 pt-3 space-y-3" style={{ borderTop: '1px solid var(--light-gray)' }}>
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ color: 'var(--charcoal)' }}>{t.description}</p>
                    {t.attachmentPath && (
                      <a href={`/api/tickets/${t.id}/attachment`} target="_blank" rel="noreferrer" className="block w-fit max-w-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/tickets/${t.id}/attachment`} alt={t.attachmentName ?? 'attachment'} className="max-h-72 max-w-full rounded-lg" style={{ border: '1px solid var(--light-gray)', background: SUBTLE_BG }} />
                      </a>
                    )}

                    {t.status === 'RESOLVED' ? (
                      <div className="rounded-lg p-3" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                        <p className={LABEL} style={{ ...LABEL_STYLE, color: 'var(--deep-teal)' }}>Resolution{t.resolvedByName ? ` · ${t.resolvedByName}` : ''}{t.resolvedAt ? ` · ${new Date(t.resolvedAt).toLocaleDateString()}` : ''}</p>
                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ color: 'var(--charcoal)' }}>{t.resolution}</p>
                        <button onClick={() => resolve(t.id, true)} disabled={saving === t.id} className={`${BTN_SM} mt-2.5`} style={SECONDARY_STYLE}>
                          <RotateCcw size={12} aria-hidden /> Reopen
                        </button>
                      </div>
                    ) : (
                      <div>
                        <label htmlFor={`res-${t.id}`} className={LABEL} style={LABEL_STYLE}>Resolution</label>
                        <textarea id={`res-${t.id}`} value={draft[t.id] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [t.id]: e.target.value }))} rows={3} placeholder="How was this addressed? The staff member will see this." className={`${TEXTAREA} resize-none mb-2.5`} style={CONTROL_STYLE} />
                        <button onClick={() => resolve(t.id)} disabled={saving === t.id || !(draft[t.id] ?? '').trim()} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
                          {saving === t.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Mark resolved
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
