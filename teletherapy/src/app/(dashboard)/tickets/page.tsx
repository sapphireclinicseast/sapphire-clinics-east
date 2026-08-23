'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { LifeBuoy, Loader2, CheckCircle2, Clock, Paperclip, ChevronDown } from 'lucide-react'

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
    <div className="max-w-4xl mx-auto">
      <div className="hero-gradient rounded-2xl px-8 py-8 mb-6 animate-fade-up">
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/20 shrink-0">
            <LifeBuoy className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Tickets</h1>
            <p className="text-white/70 text-sm mt-1">Concerns raised by staff about the portal. {openCount} open.</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-5 border-b border-[var(--light-gray)]">
        {(['OPEN', 'RESOLVED', 'ALL'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 text-[12.5px] font-semibold transition-colors ${filter === f ? 'text-[var(--deep-teal)] border-b-2 border-[var(--deep-teal)]' : 'text-[var(--mid-gray)] hover:text-[var(--charcoal)]'}`}
            style={{ fontFamily: 'var(--font-display)' }}>
            {f === 'OPEN' ? 'Open' : f === 'RESOLVED' ? 'Resolved' : 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 justify-center py-16 text-[var(--mid-gray)]"><Loader2 className="animate-spin" size={18} /> Loading tickets…</div>
      ) : shown.length === 0 ? (
        <div className="card-static text-center py-14 text-[13px] text-[var(--mid-gray)]">No {filter === 'ALL' ? '' : filter.toLowerCase()} tickets.</div>
      ) : (
        <div className="space-y-3">
          {shown.map((t) => {
            const open = expanded === t.id
            return (
              <div key={t.id} className="card-static !p-0 overflow-hidden">
                <button onClick={() => setExpanded(open ? null : t.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--off-white)]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-bold text-[var(--deep-teal)]" style={{ fontFamily: 'var(--font-display)' }}>{t.ticketNumber}</span>
                      {t.status === 'RESOLVED'
                        ? <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[var(--moss)] bg-[var(--sage-tint)] px-2 py-0.5 rounded-full"><CheckCircle2 size={11} /> Resolved</span>
                        : <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#9a6a1f] bg-[#fdf1d6] px-2 py-0.5 rounded-full"><Clock size={11} /> Open</span>}
                      {t.attachmentPath && <Paperclip size={12} className="text-[var(--mid-gray)]" />}
                    </div>
                    <p className="text-[13.5px] font-semibold text-[var(--charcoal)] truncate mt-0.5">{t.subject}</p>
                    <p className="text-[11.5px] text-[var(--mid-gray)]">{t.raisedByName} · {BRANCH_LABEL[t.branch] ?? t.branch} · {new Date(t.createdAt).toLocaleString()}</p>
                  </div>
                  <ChevronDown size={18} className={`text-[var(--mid-gray)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                  <div className="px-4 pb-4 border-t border-[var(--light-gray)] pt-3">
                    <p className="text-[13px] text-[var(--charcoal)] whitespace-pre-wrap mb-3">{t.description}</p>
                    {t.attachmentPath && (
                      <a href={`/api/tickets/${t.id}/attachment`} target="_blank" rel="noreferrer" className="block mb-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/tickets/${t.id}/attachment`} alt={t.attachmentName ?? 'attachment'} className="max-h-72 rounded-lg border border-[var(--light-gray)] bg-[var(--off-white)]" />
                      </a>
                    )}

                    {t.status === 'RESOLVED' ? (
                      <div className="rounded-lg bg-[var(--off-white)] border border-[var(--light-gray)] p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--moss)] mb-1">Resolution{t.resolvedByName ? ` · ${t.resolvedByName}` : ''}{t.resolvedAt ? ` · ${new Date(t.resolvedAt).toLocaleDateString()}` : ''}</p>
                        <p className="text-[13px] text-[var(--charcoal)] whitespace-pre-wrap">{t.resolution}</p>
                        <button onClick={() => resolve(t.id, true)} disabled={saving === t.id} className="mt-2 text-[12px] font-semibold text-[var(--mid-gray)] hover:underline">Reopen</button>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--charcoal)] mb-1">Resolution</label>
                        <textarea value={draft[t.id] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [t.id]: e.target.value }))} rows={3} placeholder="How was this addressed? The staff member will see this." className="input text-[13px] resize-none mb-2" />
                        <button onClick={() => resolve(t.id)} disabled={saving === t.id || !(draft[t.id] ?? '').trim()} className="btn-primary !py-2 !px-4 !text-[12.5px] !rounded-lg">
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
