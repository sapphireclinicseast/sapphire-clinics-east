'use client'

// The enquirer's view of their own thread. The token arrives as ?t= and is the
// only thing authorising the read — a ref alone is sequential and guessable, so
// it must not be enough.

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'

interface Msg { fromStaff: boolean; author: string; body: string; createdAt: string }
interface Thread { ref: string; branch: string; name: string; subject: string | null; status: string; messages: Msg[] }

const BRANCH_LABEL: Record<string, string> = {
  SBEA: 'Aura Health Rehab – East',
  SBGH: 'Aura Health Rehab – Greenhills',
}

export default function ThreadClient({ refNo }: { refNo: string }) {
  const token = useSearchParams().get('t') ?? ''
  const [thread, setThread] = useState<Thread | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/public/inquiry/${encodeURIComponent(refNo)}?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
    if (!res.ok) { setState('denied'); return }
    setThread(await res.json()); setState('ok')
  }, [refNo, token])

  useEffect(() => { load() }, [load])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!reply.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/public/inquiry/${encodeURIComponent(refNo)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, message: reply }),
      })
      if (res.ok) { setReply(''); await load() }
    } finally { setBusy(false) }
  }

  if (state === 'loading') return <Shell><Centered><Loader2 size={22} className="animate-spin" /></Centered></Shell>

  if (state === 'denied') return (
    <Shell>
      <h1 style={h1}>We couldn&rsquo;t open that enquiry</h1>
      <p style={lead}>
        The link may be incomplete or out of date. Use the full link you were given
        when you sent the enquiry, or <a href="/inquiry" style={{ color: '#1a7b8a' }}>send a new one</a>.
      </p>
    </Shell>
  )

  const t = thread!
  return (
    <Shell>
      <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a9499', margin: 0 }}>
        Reference
      </p>
      <h1 style={{ ...h1, textAlign: 'left', marginTop: 2 }}>{t.ref}</h1>
      <p style={{ ...lead, textAlign: 'left', marginBottom: 4 }}>
        {BRANCH_LABEL[t.branch] ?? t.branch}{t.subject ? ` · ${t.subject}` : ''}
      </p>
      <span style={{
        display: 'inline-block', fontSize: 11, fontWeight: 700, borderRadius: 999,
        padding: '3px 10px', marginBottom: 18,
        background: t.status === 'CLOSED' ? '#F3F4F6' : t.status === 'ANSWERED' ? '#ECFDF5' : '#FEF9C3',
        color:      t.status === 'CLOSED' ? '#6B7280' : t.status === 'ANSWERED' ? '#047857' : '#A16207',
      }}>
        {t.status === 'ANSWERED' ? 'Replied' : t.status === 'CLOSED' ? 'Closed' : 'Awaiting reply'}
      </span>

      <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
        {t.messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.fromStaff ? 'flex-start' : 'flex-end',
            background: m.fromStaff ? '#F0F9FA' : '#FAFAF8',
            border: `1px solid ${m.fromStaff ? '#cfe3e6' : '#ECECE6'}`,
            borderRadius: 12, padding: '10px 13px',
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: m.fromStaff ? '#1a7b8a' : '#8a9499', margin: '0 0 3px' }}>
              {m.author}
            </p>
            <p style={{ fontSize: 13.5, color: '#2b3a3f', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{m.body}</p>
            <p style={{ fontSize: 10.5, color: '#9aa5a9', margin: '5px 0 0' }}>
              {new Date(m.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
        ))}
      </div>

      {t.status === 'CLOSED' ? (
        <p style={{ ...lead, textAlign: 'left' }}>
          This enquiry is closed. <a href="/inquiry" style={{ color: '#1a7b8a' }}>Send a new one</a> if you need anything else.
        </p>
      ) : (
        <form onSubmit={send}>
          <textarea value={reply} onChange={e => setReply(e.target.value)} rows={4} placeholder="Write a reply…"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb',
                     fontSize: 14, color: '#24505a', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
          <button type="submit" disabled={busy || !reply.trim()}
            style={{ marginTop: 10, background: '#1a7b8a', color: '#fff', border: 0, borderRadius: 10,
                     padding: '11px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                     opacity: busy || !reply.trim() ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Send size={14} /> {busy ? 'Sending…' : 'Send reply'}
          </button>
        </form>
      )}
    </Shell>
  )
}

const h1: React.CSSProperties = { fontSize: 24, fontWeight: 800, color: '#24505a', margin: '0 0 6px', textAlign: 'center' }
const lead: React.CSSProperties = { fontSize: 13.5, color: '#5b6b70', lineHeight: 1.6, margin: 0, textAlign: 'center' }
function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 24, color: '#1a7b8a' }}>{children}</div>
}
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', background: '#EDF3D9', padding: '32px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', background: '#fff', borderRadius: 16,
                    padding: '28px 24px 32px', boxShadow: '0 6px 28px rgba(36,80,90,0.08)' }}>
        {children}
      </div>
    </main>
  )
}
