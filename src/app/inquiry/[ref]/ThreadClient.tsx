'use client'

// The enquirer's view of their own thread. The token arrives as ?t= and is the
// only thing authorising the read — a ref alone is sequential and guessable, so
// it must not be enough.

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import ChatThread, { ChatComposer } from '@/components/ChatThread'

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

  async function sendFile(file: File, caption: string) {
    const fd = new FormData()
    fd.append('token', token); fd.append('file', file); fd.append('caption', caption)
    setBusy(true)
    try {
      const res = await fetch(`/api/public/inquiry/${encodeURIComponent(refNo)}/upload`, { method: 'POST', body: fd })
      if (res.ok) await load()
      else {
        const d = await res.json().catch(() => ({}))
        alert(d.error || 'Could not send that file.')
      }
    } finally { setBusy(false) }
  }

  async function send() {
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

      <ChatThread
        messages={t.messages}
        /* The enquirer is reading, so THEIR messages sit on the right. */
        mineIsStaff={false}
        emptyNote="No messages yet."
      />

      <div style={{ marginTop: 16 }}>
        {t.status === 'CLOSED' ? (
          <p style={{ ...lead, textAlign: 'left' }}>
            This enquiry is closed. <a href="/inquiry" style={{ color: '#1a7b8a' }}>Send a new one</a> if you need anything else.
          </p>
        ) : (
          <ChatComposer
            value={reply}
            onChange={setReply}
            onSend={() => send()}
            onSendFile={sendFile}
            busy={busy}
            placeholder="Write a reply…"
          />
        )}
      </div>
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
