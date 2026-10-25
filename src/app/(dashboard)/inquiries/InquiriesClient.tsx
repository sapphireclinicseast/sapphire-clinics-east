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

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, Search, Inbox } from 'lucide-react'
import ChatThread, { ChatComposer } from '@/components/ChatThread'
import InquiryContactPanel, { type PanelPatient, type PanelHistory } from '@/components/InquiryContactPanel'

interface Row {
  id: string; ref: string; branch: string; name: string; email: string | null; phone: string | null
  subject: string | null; status: string; readAt: string | null; lastMessageAt: string; createdAt: string
  preview: { body: string; fromStaff: boolean } | null
  _count: { messages: number }
}
interface Msg { id: string; fromStaff: boolean; authorName: string | null; body: string; createdAt: string
  fileUrl?: string | null; fileName?: string | null; fileMime?: string | null; fileSize?: number | null }

const BRANCH_LABEL: Record<string, string> = { SBEA: 'East', SBGH: 'Greenhills' }
const FILTERS = [
  { key: 'OPEN', label: 'Unanswered' },
  { key: 'ALL', label: 'All' },
  { key: 'ANSWERED', label: 'Replied' },
  { key: 'CLOSED', label: 'Closed' },
]

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}

function whenLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
  }
  const y = new Date(now); y.setDate(y.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
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
  const [thread, setThread] = useState<{ inquiry: Row; messages: Msg[]; patient: PanelPatient | null; history?: PanelHistory[] } | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  const searchParams = useSearchParams()
  const deepLinked = useRef(false)
  const openIdRef = useRef<string | null>(null)
  openIdRef.current = openId

  const load = useCallback(async () => {
    const p = new URLSearchParams({ branch, status, q })
    const res = await fetch(`/api/inquiries?${p}`, { cache: 'no-store' })
    if (res.ok) {
      const d = await res.json()
      setRows(d.inquiries ?? []); setUnread(d.unread ?? 0); setScoped(d.scopedToBranch ?? null)
    }
    setLoading(false)
  }, [branch, status, q])

  const openThread = useCallback(async (id: string) => {
    setOpenId(id); setThread(null)
    const res = await fetch(`/api/inquiries/${id}`, { cache: 'no-store' })
    if (res.ok) { setThread(await res.json()); load() }
  }, [load])

  useEffect(() => { load() }, [load])

  // Poll so a reply arrives without a refresh, the way a messaging app does.
  useEffect(() => {
    const t = setInterval(() => {
      load()
      if (openIdRef.current) {
        fetch(`/api/inquiries/${openIdRef.current}`, { cache: 'no-store' })
          .then(r => r.ok ? r.json() : null).then(d => d && setThread(d)).catch(() => {})
      }
    }, 20000)
    return () => clearInterval(t)
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

  return (
    <div style={{
      display: 'flex', height: 'calc(100vh - 64px)', background: '#fff',
      borderTop: '1px solid var(--light-gray)',
    }}>
      {/* ── Conversations ─────────────────────────────────────────────── */}
      <aside style={{
        width: 330, flexShrink: 0, borderRight: '1px solid var(--light-gray)',
        display: 'flex', flexDirection: 'column', background: '#fff',
      }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--light-gray)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
              Enquiries
            </h1>
            {unread > 0 && (
              <span style={{ background: '#DC2626', color: '#fff', fontSize: 11, fontWeight: 800,
                             borderRadius: 999, padding: '1px 7px' }}>{unread}</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#F1F2F4',
                        borderRadius: 999, padding: '7px 12px', marginBottom: 9 }}>
            <Search size={14} style={{ color: '#8a9499', flexShrink: 0 }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search messages"
              style={{ border: 0, background: 'transparent', outline: 'none', fontSize: 13, width: '100%', color: 'var(--charcoal)' }} />
          </div>

          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setStatus(f.key)} style={{
                border: 0, cursor: 'pointer', borderRadius: 999, padding: '4px 10px',
                fontSize: 11.5, fontWeight: 700,
                background: status === f.key ? 'var(--pale-teal)' : '#F1F2F4',
                color: status === f.key ? 'var(--teal)' : '#6b7280',
              }}>{f.label}</button>
            ))}
            {!scoped && (
              <select value={branch} onChange={e => setBranch(e.target.value)} style={{
                border: 0, borderRadius: 999, padding: '4px 8px', fontSize: 11.5, fontWeight: 700,
                background: branch === 'ALL' ? '#F1F2F4' : 'var(--pale-teal)',
                color: branch === 'ALL' ? '#6b7280' : 'var(--teal)', cursor: 'pointer',
              }}>
                <option value="ALL">Both branches</option>
                <option value="SBEA">East</option>
                <option value="SBGH">Greenhills</option>
              </select>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
              <Loader2 size={19} className="animate-spin" style={{ color: 'var(--teal)' }} />
            </div>
          ) : rows.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9aa5a9', textAlign: 'center', padding: '28px 18px' }}>
              No conversations here.
            </p>
          ) : rows.map(r => {
            const active = openId === r.id
            return (
              <button key={r.id} onClick={() => openThread(r.id)} style={{
                display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                border: 0, cursor: 'pointer', padding: '10px 13px',
                background: active ? 'var(--pale-teal)' : 'transparent',
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 999, flexShrink: 0,
                  background: active ? 'var(--teal)' : '#E3E8EA',
                  color: active ? '#fff' : '#5b6b70',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 800,
                }}>{initials(r.name)}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{
                      flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--charcoal)',
                      fontWeight: r.readAt ? 600 : 800,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{r.name}</span>
                    <span style={{ fontSize: 10.5, color: '#9aa5a9', flexShrink: 0 }}>{whenLabel(r.lastMessageAt)}</span>
                  </div>
                  <p style={{
                    margin: '1px 0 0', fontSize: 12, color: r.readAt ? '#8a9499' : 'var(--charcoal)',
                    fontWeight: r.readAt ? 400 : 600,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {r.preview ? `${r.preview.fromStaff ? 'You: ' : ''}${r.preview.body}` : r.subject || 'No messages'}
                  </p>
                  <p style={{ margin: '1px 0 0', fontSize: 10.5, color: '#b3bcc0' }}>
                    {r.ref} · {BRANCH_LABEL[r.branch] ?? r.branch}
                  </p>
                </div>

                {!r.readAt && (
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: '#1a7b8a', flexShrink: 0 }} />
                )}
              </button>
            )
          })}
        </div>
      </aside>

      {/* ── Open conversation + contact panel ─────────────────────────── */}
      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#fff' }}>
        {!openId ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', color: '#9aa5a9', gap: 10, padding: 24, textAlign: 'center' }}>
            <Inbox size={34} style={{ opacity: 0.45 }} />
            <p style={{ margin: 0, fontSize: 14 }}>Select a conversation to read and reply.</p>
            <p style={{ margin: 0, fontSize: 12 }}>
              Enquiries arrive from <strong>operations.sapphireclinicseast.org/inquiry</strong>
              {scoped ? ` · ${BRANCH_LABEL[scoped] ?? scoped} only` : ' · every branch'}
            </p>
          </div>
        ) : !thread ? (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Loader2 size={21} className="animate-spin" style={{ color: 'var(--teal)' }} />
          </div>
        ) : (
          <>
            <header style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '11px 16px',
              borderBottom: '1px solid var(--light-gray)', flexShrink: 0,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 999, background: 'var(--teal)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, flexShrink: 0,
              }}>{initials(thread.inquiry.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: 'var(--charcoal)' }}>
                  {thread.inquiry.name}
                </p>
                <p style={{ margin: 0, fontSize: 11.5, color: '#8a9499', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {thread.inquiry.ref} · {BRANCH_LABEL[thread.inquiry.branch] ?? thread.inquiry.branch}
                </p>
              </div>
            </header>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
              <ChatThread
                mineIsStaff
                messages={thread.messages.map(m => ({
                  id: m.id,
                  fromStaff: m.fromStaff,
                  author: m.fromStaff ? (m.authorName || 'Front Desk') : thread.inquiry.name,
                  body: m.body,
                  createdAt: m.createdAt,
                  fileUrl: m.fileUrl, fileName: m.fileName,
                  fileMime: m.fileMime, fileSize: m.fileSize,
                }))}
              />
            </div>

            <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--light-gray)', flexShrink: 0 }}>
              {thread.inquiry.status === 'CLOSED' ? (
                <p style={{ margin: 0, fontSize: 12.5, color: '#8a9499' }}>
                  This conversation is closed — reopen it to reply. The enquirer cannot add to it either.
                </p>
              ) : (
                <ChatComposer value={reply} onChange={setReply} onSend={send} onSendFile={sendFile} busy={busy}
                  placeholder="Write a reply — the enquirer sees this on their link." />
              )}
            </div>
          </>
        )}
      </section>

      {thread && (
        <InquiryContactPanel
          inquiry={thread.inquiry}
          patient={thread.patient}
          history={thread.history ?? []}
          onOpenOther={(id) => { setStatus('ALL'); openThread(id) }}
          onToggleClosed={() => setStatusOf(thread.inquiry.id, thread.inquiry.status === 'CLOSED' ? 'OPEN' : 'CLOSED')}
        />
      )}
    </div>
  )
}
