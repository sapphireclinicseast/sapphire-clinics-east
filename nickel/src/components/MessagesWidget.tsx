'use client'

import { useEffect, useState } from 'react'
import Chat from '@/components/Chat'

interface Convo { bookingId: string; otherName: string; date: string; startTime: string; lastText: string; lastAt: string | null; unread: number }

const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''

// Floating messages launcher (bottom-right) for patients and providers. Shows an
// unread badge, a conversation list, and opens a thread inline. Renders nothing
// until the user has at least one conversation.
export default function MessagesWidget() {
  const [role, setRole] = useState<'PATIENT' | 'PROVIDER' | null>(null)
  const [convos, setConvos] = useState<Convo[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<Convo | null>(null)

  async function load() {
    try {
      const d = await fetch('/api/conversations').then((r) => r.json())
      setRole(d.role ?? null); setConvos(d.conversations ?? []); setUnread(d.unread ?? 0)
    } catch { /* ignore */ }
  }
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t) }, [])
  // Refresh the list shortly after opening a thread so its unread clears.
  useEffect(() => { if (active) { const t = setTimeout(load, 1500); return () => clearTimeout(t) } }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!role || convos.length === 0) return null

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 50 }}>
      {open && (
        <div className="mb-3 w-[340px] max-w-[calc(100vw-40px)] overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white shadow-[0_16px_44px_rgba(20,36,58,.22)]">
          <div className="flex items-center justify-between border-b border-[color:var(--line)] px-4 py-3">
            <b className="text-[color:var(--ink)]" style={{ fontFamily: 'var(--font-display)' }}>{active ? active.otherName : 'Messages'}</b>
            <div className="flex items-center gap-2">
              {active && <button onClick={() => setActive(null)} className="text-[12.5px] font-semibold text-[color:var(--steel)] hover:underline">Back</button>}
              <button onClick={() => { setOpen(false); setActive(null) }} className="flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--slate)] hover:bg-[color:var(--mist)]">✕</button>
            </div>
          </div>
          {active
            ? <div className="p-2"><Chat bookingId={active.bookingId} meRole={role} otherName={active.otherName} /></div>
            : (
              <div className="max-h-[60vh] overflow-y-auto">
                {convos.map((c) => (
                  <button key={c.bookingId} onClick={() => setActive(c)} className="flex w-full items-start gap-3 border-b border-[color:var(--line)] px-4 py-3 text-left last:border-0 hover:bg-[color:var(--mist)]">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--mist-2)] text-[12px] font-semibold text-[color:var(--steel)]">{c.otherName.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <b className="truncate text-[13.5px] text-[color:var(--ink)]">{c.otherName}</b>
                        <span className="shrink-0 text-[11px] text-[color:var(--muted)]">{fmt(c.lastAt)}</span>
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
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-label="Messages"
        className="relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_10px_30px_rgba(47,107,176,.4)]"
        style={{ background: 'var(--steel)' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 4H4a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 4 17h4l4 4 0-4h8a1.5 1.5 0 0 0 1.5-1.5v-10A1.5 1.5 0 0 0 20 4Z"/></svg>
        {unread > 0 && !open && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[color:var(--accent,#F0915A)] px-1 text-[11px] font-bold text-white" style={{ background: '#E4762F' }}>{unread}</span>}
      </button>
    </div>
  )
}
