'use client'

// Docked enquiry chat, bottom-right of the Hub.
//
// The inbox page and the notification bell both require going somewhere. This
// sits on whatever page the desk is already on, which is the point: enquiries
// were being missed because nothing put them in front of anyone.
//
// Branch scoping is NOT done here — /api/inquiries pins a branch-scoped account
// to its own branch regardless of what this asks for. This only renders what it
// is given.

import { useState, useEffect, useCallback, useRef } from 'react'
import { MessageCircle, X, ChevronLeft } from 'lucide-react'
import ChatThread, { ChatComposer } from '@/components/ChatThread'

interface Row {
  id: string; ref: string; branch: string; name: string
  subject: string | null; status: string; readAt: string | null; lastMessageAt: string
}
interface Msg { id: string; fromStaff: boolean; authorName: string | null; body: string; createdAt: string
  fileUrl?: string | null; fileName?: string | null; fileMime?: string | null; fileSize?: number | null }

const BRANCH_LABEL: Record<string, string> = { SBEA: 'East', SBGH: 'Greenhills' }
// Ten seconds, not twenty. At twenty a patient's reply could sit unseen for
// most of a minute while the desk stared straight at the thread, which reads
// as the page being broken rather than slow.
const POLL_MS = 10000

export default function InquiryDock() {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [unread, setUnread] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const [thread, setThread] = useState<{ inquiry: Row; messages: Msg[] } | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const selRef = useRef<string | null>(null)
  selRef.current = sel

  const loadList = useCallback(async () => {
    try {
      const res = await fetch('/api/inquiries?status=ALL', { cache: 'no-store' })
      // 401/403 is the normal answer for an account that has no business here
      // (investor, logged out). Stay hidden rather than showing a broken dock.
      if (!res.ok) { setReady(false); return }
      const d = await res.json()
      setRows(d.inquiries ?? [])
      setUnread(d.unread ?? 0)
      setReady(true)
    } catch { /* offline — keep whatever we had */ }
  }, [])

  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/inquiries/${id}`, { cache: 'no-store' })
    if (res.ok) { setThread(await res.json()); loadList() }
  }, [loadList])

  useEffect(() => { loadList() }, [loadList])

  // Poll so a reply lands without a refresh.
  //
  // The visibility check is what the comment here used to claim and the code
  // did not do: this polled every twenty seconds in every background tab, all
  // day, for desks that were not looking at it. A hidden tab now costs nothing
  // and catches up the instant it comes forward — which is also what stops a
  // reply appearing to arrive late when someone switches back to the hub.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      loadList()
      if (selRef.current) loadThread(selRef.current)
    }
    const t = setInterval(tick, POLL_MS)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [loadList, loadThread])

  async function sendFile(file: File, caption: string) {
    if (!sel) return
    const fd = new FormData()
    fd.append('file', file); fd.append('caption', caption)
    setBusy(true)
    try {
      const res = await fetch(`/api/inquiries/${sel}/upload`, { method: 'POST', body: fd })
      if (res.ok) await loadThread(sel)
      else {
        const d = await res.json().catch(() => ({}))
        alert(d.error || 'Could not send that file.')
      }
    } finally { setBusy(false) }
  }

  async function send() {
    if (!sel || !reply.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/inquiries/${sel}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply }),
      })
      if (res.ok) { setReply(''); await loadThread(sel) }
    } finally { setBusy(false) }
  }

  if (!ready) return null

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 60 }}>
      {open && (
        <div style={{
          width: 360, maxWidth: 'calc(100vw - 40px)', height: 500, maxHeight: 'calc(100vh - 120px)',
          background: '#fff', borderRadius: 14, boxShadow: '0 12px 40px rgba(16,36,41,0.22)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', marginBottom: 12,
          border: '1px solid rgba(0,0,0,0.06)',
        }}>
          <div style={{
            background: '#1a7b8a', color: '#fff', padding: '11px 13px',
            display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0,
          }}>
            {sel && (
              <button onClick={() => { setSel(null); setThread(null) }} aria-label="Back to conversations"
                style={{ background: 'transparent', border: 0, color: '#fff', cursor: 'pointer', padding: 0, display: 'flex' }}>
                <ChevronLeft size={18} />
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {thread ? thread.inquiry.name : 'Enquiries'}
              </p>
              <p style={{ margin: 0, fontSize: 11, opacity: 0.85 }}>
                {thread
                  ? `${thread.inquiry.ref} · ${BRANCH_LABEL[thread.inquiry.branch] ?? thread.inquiry.branch}`
                  : unread > 0 ? `${unread} waiting` : 'All caught up'}
              </p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close enquiries"
              style={{ background: 'transparent', border: 0, color: '#fff', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <X size={17} />
            </button>
          </div>

          {!sel ? (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {rows.length === 0 ? (
                <p style={{ fontSize: 13, color: '#9aa5a9', textAlign: 'center', padding: '28px 16px' }}>
                  No enquiries yet.
                </p>
              ) : rows.map(r => (
                <button key={r.id} onClick={() => { setSel(r.id); loadThread(r.id) }} style={{
                  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                  padding: '11px 13px', border: 0, borderBottom: '1px solid #F1F2F4',
                  background: !r.readAt ? '#FFFDF5' : '#fff',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {!r.readAt && <span style={{ width: 7, height: 7, borderRadius: 99, background: '#DC2626', flexShrink: 0 }} />}
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#24505a', flex: 1, minWidth: 0,
                                   whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.name}
                    </span>
                    <span style={{ fontSize: 10, color: '#8a9499', flexShrink: 0 }}>
                      {BRANCH_LABEL[r.branch] ?? r.branch}
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#8a9499',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.ref} · {r.subject || 'No subject'}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
                {thread && (
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
                )}
              </div>
              {thread?.inquiry.status === 'CLOSED' ? (
                <p style={{ fontSize: 11.5, color: '#8a9499', padding: '10px 13px', margin: 0, borderTop: '1px solid #F1F2F4' }}>
                  Closed — reopen it from the Enquiries page to reply.
                </p>
              ) : (
                <div style={{ padding: '9px 11px 11px', borderTop: '1px solid #F1F2F4', flexShrink: 0 }}>
                  <ChatComposer value={reply} onChange={setReply} onSend={send} onSendFile={sendFile} busy={busy} placeholder="Reply…" />
                </div>
              )}
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        aria-label={unread > 0 ? `Enquiries, ${unread} waiting` : 'Enquiries'}
        style={{
          position: 'relative', width: 54, height: 54, borderRadius: 999, border: 0,
          background: '#1a7b8a', color: '#fff', cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(26,123,138,0.42)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto',
        }}
      >
        {open ? <X size={22} /> : <MessageCircle size={23} />}
        {!open && unread > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, minWidth: 21, height: 21, borderRadius: 999,
            background: '#DC2626', color: '#fff', fontSize: 11, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
            border: '2px solid #fff',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  )
}
