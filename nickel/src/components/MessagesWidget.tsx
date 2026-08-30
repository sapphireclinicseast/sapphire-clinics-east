'use client'

import { useCallback, useEffect, useState } from 'react'
import Chat from '@/components/Chat'

interface Convo { bookingId: string; otherName: string; date: string; startTime: string; lastText: string; lastAt: string | null; unread: number }
interface Alert { id: string; type: string; title: string; body: string | null; bookingId: string | null; read: boolean; createdAt: string }

const fmtDay = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''
const fmtWhen = (iso: string) => {
  const d = new Date(iso); const now = Date.now(); const diff = now - d.getTime()
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

// Alert glyph by type (monochrome, per brand).
function AlertIcon({ type }: { type: string }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (type === 'BOOKING_CONFIRMED' || type === 'PROPOSAL_ACCEPTED' || type === 'OFFER_ACCEPTED') return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>
  if (type === 'BOOKING_CANCELLED' || type === 'PROPOSAL_DECLINED') return <svg {...common}><path d="M18 6 6 18M6 6l12 12" /></svg>
  if (type === 'RESCHEDULE_PROPOSED') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  if (type === 'REQUEST_OFFER') return <svg {...common}><path d="M3 11l19-9-9 19-2-8-8-2Z" /></svg>
  return <svg {...common}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-6 6c0 2.5 1.2 3.8 2 5h8c.8-1.2 2-2.5 2-5a6 6 0 0 0-6-6Z" /></svg>
}

// Floating launcher (bottom-right) for patients and providers: unread badge over
// two tabs — Messages (chat threads) and Alerts (booking events: confirmations,
// reschedules, cancellations). Renders nothing until there's something to show.
export default function MessagesWidget() {
  const [role, setRole] = useState<'PATIENT' | 'PROVIDER' | 'DOCTOR' | null>(null)
  const [convos, setConvos] = useState<Convo[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [msgUnread, setMsgUnread] = useState(0)
  const [alertUnread, setAlertUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'messages' | 'alerts'>('alerts')
  const [active, setActive] = useState<Convo | null>(null)

  const load = useCallback(async () => {
    try {
      const [c, n] = await Promise.all([
        fetch('/api/conversations').then((r) => r.json()),
        fetch('/api/notifications').then((r) => r.json()),
      ])
      const r = c.role ?? n.role ?? null
      setRole(r); setConvos(c.conversations ?? []); setMsgUnread(c.unread ?? 0)
      setAlerts(n.notifications ?? []); setAlertUnread(n.unread ?? 0)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t) }, [load])
  useEffect(() => { if (active) { const t = setTimeout(load, 1500); return () => clearTimeout(t) } }, [active, load])

  // Opening the Alerts tab marks alerts read.
  useEffect(() => {
    if (open && tab === 'alerts' && alertUnread > 0) {
      fetch('/api/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
        .then(() => { setAlertUnread(0); setAlerts((a) => a.map((x) => ({ ...x, read: true }))) })
        .catch(() => {})
    }
  }, [open, tab, alertUnread])

  const total = msgUnread + alertUnread
  if (!role || (convos.length === 0 && alerts.length === 0)) return null

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 50 }}>
      {open && (
        <div className="mb-3 w-[340px] max-w-[calc(100vw-40px)] overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white shadow-[0_16px_44px_rgba(20,36,58,.22)]">
          {active ? (
            <>
              <div className="flex items-center justify-between border-b border-[color:var(--line)] px-4 py-3">
                <b className="text-[color:var(--ink)]" style={{ fontFamily: 'var(--font-display)' }}>{active.otherName}</b>
                <div className="flex items-center gap-2">
                  <button onClick={() => setActive(null)} className="text-[12.5px] font-semibold text-[color:var(--steel)] hover:underline">Back</button>
                  <button onClick={() => { setOpen(false); setActive(null) }} className="flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--slate)] hover:bg-[color:var(--mist)]">✕</button>
                </div>
              </div>
              <div className="p-2"><Chat bookingId={active.bookingId} meRole={role === 'PROVIDER' ? 'PROVIDER' : 'PATIENT'} otherName={active.otherName} /></div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-[color:var(--line)] px-4 pt-3">
                <div className="flex gap-1">
                  <button onClick={() => setTab('alerts')} className={`relative -mb-px border-b-2 px-2 pb-2 text-[13px] font-semibold ${tab === 'alerts' ? 'border-[color:var(--steel)] text-[color:var(--ink)]' : 'border-transparent text-[color:var(--slate)]'}`}>
                    Alerts{alertUnread > 0 && <span className="ml-1 rounded-full bg-[color:var(--steel)] px-1.5 text-[10px] font-bold text-white">{alertUnread}</span>}
                  </button>
                  <button onClick={() => setTab('messages')} className={`relative -mb-px border-b-2 px-2 pb-2 text-[13px] font-semibold ${tab === 'messages' ? 'border-[color:var(--steel)] text-[color:var(--ink)]' : 'border-transparent text-[color:var(--slate)]'}`}>
                    Messages{msgUnread > 0 && <span className="ml-1 rounded-full bg-[color:var(--steel)] px-1.5 text-[10px] font-bold text-white">{msgUnread}</span>}
                  </button>
                </div>
                <button onClick={() => setOpen(false)} className="mb-1 flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--slate)] hover:bg-[color:var(--mist)]">✕</button>
              </div>

              {tab === 'alerts' ? (
                <div className="max-h-[60vh] overflow-y-auto">
                  {alerts.length === 0
                    ? <p className="px-4 py-8 text-center text-[13px] text-[color:var(--muted)]">No alerts yet.</p>
                    : alerts.map((a) => (
                      <button key={a.id}
                        onClick={() => { window.location.href = role === 'DOCTOR' ? '/doctor' : role === 'PATIENT' ? (a.type === 'REQUEST_OFFER' ? '/requests' : '/bookings') : '/provider' }}
                        className={`flex w-full items-start gap-3 border-b border-[color:var(--line)] px-4 py-3 text-left last:border-0 hover:bg-[color:var(--mist)] ${a.read ? '' : 'bg-[color:var(--mist-2)]'}`}>
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--mist-2)] text-[color:var(--steel)]"><AlertIcon type={a.type} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <b className="truncate text-[13px] text-[color:var(--ink)]">{a.title}</b>
                            <span className="shrink-0 text-[11px] text-[color:var(--muted)]">{fmtWhen(a.createdAt)}</span>
                          </span>
                          {a.body && <span className="mt-0.5 block text-[12.5px] leading-snug text-[color:var(--slate)]">{a.body}</span>}
                        </span>
                        {!a.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[color:var(--steel)]" />}
                      </button>
                    ))}
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto">
                  {convos.length === 0
                    ? <p className="px-4 py-8 text-center text-[13px] text-[color:var(--muted)]">No conversations yet.</p>
                    : convos.map((c) => (
                      <button key={c.bookingId} onClick={() => setActive(c)} className="flex w-full items-start gap-3 border-b border-[color:var(--line)] px-4 py-3 text-left last:border-0 hover:bg-[color:var(--mist)]">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--mist-2)] text-[12px] font-semibold text-[color:var(--steel)]">{c.otherName.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <b className="truncate text-[13.5px] text-[color:var(--ink)]">{c.otherName}</b>
                            <span className="shrink-0 text-[11px] text-[color:var(--muted)]">{fmtDay(c.lastAt)}</span>
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-2">
                            <span className="truncate text-[12.5px] text-[color:var(--slate)]">{c.lastText || 'Visit ' + c.date}</span>
                            {c.unread > 0 && <span className="shrink-0 rounded-full bg-[color:var(--steel)] px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}
                          </span>
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-label="Notifications"
        className="relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_10px_30px_rgba(47,107,176,.4)]"
        style={{ background: 'var(--steel)' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        {total > 0 && !open && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-bold text-white" style={{ background: '#E4762F' }}>{total}</span>}
      </button>
    </div>
  )
}
