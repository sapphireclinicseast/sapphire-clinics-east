'use client'

// "Messages" for the signed-in portal — the same conversation front desk has
// open in the hub, not a separate channel.
//
// This matters more than it looks: a patient who asks a follow-up here lands in
// the thread they already have, so the desk sees one continuous history instead
// of a fresh enquiry each time. The hub links an enquiry to a patient record,
// which is what makes that possible.
//
// Deliberately NOT importing the hub's ChatThread: the portal is a separate app
// with its own build, so the bubbles are reimplemented here. They are simple
// enough that keeping them in step is cheaper than the plumbing to share them.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listMyInquiries, getMyInquiry, replyToInquiry, startInquiry,
  type PortalInquiry, type PortalInquiryMessage,
} from '@/lib/api'

const BRANCH_LABEL: Record<string, string> = {
  SBEA: 'Aura Health Rehab – East',
  SBGH: 'Aura Health Rehab – Greenhills',
}

function when(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function Bubble({ m }: { m: PortalInquiryMessage }) {
  const mine = !m.fromStaff
  const isImage = m.fileMime?.startsWith('image/')
  const isVideo = m.fileMime?.startsWith('video/')
  const isAudio = m.fileMime?.startsWith('audio/')
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} mb-1.5`}>
      <div
        className="max-w-[78%] rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words"
        style={{
          background: mine ? 'var(--teal, #1a7b8a)' : '#F1F2F4',
          color: mine ? '#fff' : '#1f2937',
          padding: m.fileUrl && !m.body ? 4 : '8px 13px',
        }}
      >
        {m.fileUrl && (
          <div style={{ marginBottom: m.body ? 7 : 0 }}>
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <a href={m.fileUrl} target="_blank" rel="noreferrer">
                <img src={m.fileUrl} alt={m.fileName ?? 'Attachment'}
                  className="block rounded-xl max-h-60 w-auto" />
              </a>
            ) : isVideo ? (
              <video src={m.fileUrl} controls preload="metadata" className="block rounded-xl max-h-60" />
            ) : isAudio ? (
              <audio src={m.fileUrl} controls preload="metadata" className="block w-56 max-w-full" />
            ) : (
              <a href={m.fileUrl} target="_blank" rel="noreferrer" download={m.fileName ?? undefined}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold no-underline"
                style={{ background: mine ? 'rgba(255,255,255,0.18)' : '#fff', color: mine ? '#fff' : '#1f2937' }}>
                📎 {m.fileName ?? 'Attachment'}
              </a>
            )}
          </div>
        )}
        {m.body}
      </div>
    </div>
  )
}

export default function PortalMessages({ token }: { token: string }) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<PortalInquiry[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [thread, setThread] = useState<{ ref: string; branch: string; status: string; messages: PortalInquiryMessage[] } | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const loadList = useCallback(async () => {
    try { setList((await listMyInquiries(token)).inquiries ?? []) } catch { /* signed out elsewhere */ }
  }, [token])

  const loadThread = useCallback(async (id: string) => {
    try { setThread(await getMyInquiry(token, id)) } catch { setError('Could not open that conversation.') }
  }, [token])

  useEffect(() => { if (open) loadList() }, [open, loadList])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [thread?.messages.length])

  // Poll only while open — a closed widget has no business polling all day.
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => { loadList(); if (sel) loadThread(sel) }, 20000)
    return () => clearInterval(t)
  }, [open, sel, loadList, loadThread])

  const unread = list.filter(i => i.status === 'ANSWERED').length

  async function send() {
    const text = draft.trim()
    if (!text) return
    setBusy(true); setError('')
    try {
      if (sel) {
        await replyToInquiry(token, sel, text)
        setDraft(''); await loadThread(sel); await loadList()
      } else {
        const r = await startInquiry(token, text)
        setDraft(''); await loadList(); setSel(r.id); await loadThread(r.id)
      }
    } catch {
      setError('Could not send that. Please try again.')
    } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-44 right-5 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full text-white font-semibold shadow-[0_10px_30px_rgba(27,63,56,0.28)] hover:opacity-95 transition-opacity"
        style={{ background: 'linear-gradient(135deg, var(--teal), var(--deep-teal))', fontFamily: 'var(--font-display)' }}
        aria-label="Messages with the clinic"
      >
        💬 Messages
        {unread > 0 && (
          <span className="ml-1 rounded-full bg-white text-[11px] font-bold px-1.5 py-0.5" style={{ color: 'var(--deep-teal)' }}>
            {unread}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[360px] max-w-[calc(100vw-2.5rem)] h-[480px] max-h-[calc(100vh-6rem)] rounded-2xl bg-white shadow-[0_18px_48px_rgba(16,36,41,0.26)] flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 text-white flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, var(--teal), var(--deep-teal))' }}>
        {sel && (
          <button onClick={() => { setSel(null); setThread(null) }} aria-label="Back" className="text-white/90">←</button>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ fontFamily: 'var(--font-display)' }}>
            {thread ? BRANCH_LABEL[thread.branch] ?? thread.branch : 'Messages'}
          </p>
          <p className="text-[11px] opacity-85 truncate">
            {thread ? thread.ref : 'Your conversations with the clinic'}
          </p>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close messages" className="text-white/90">✕</button>
      </div>

      {!sel ? (
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <p className="text-sm text-center px-5 py-8" style={{ color: '#8a9499' }}>
              No messages yet. Type below to ask the clinic anything.
            </p>
          ) : list.map(i => (
            <button key={i.id} onClick={() => { setSel(i.id); loadThread(i.id) }}
              className="block w-full text-left px-4 py-3 border-b" style={{ borderColor: '#F1F2F4' }}>
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold flex-1 truncate" style={{ color: 'var(--deep-teal)' }}>
                  {BRANCH_LABEL[i.branch] ?? i.branch}
                </span>
                <span className="text-[10px]" style={{ color: '#9aa5a9' }}>{when(i.lastMessageAt)}</span>
              </div>
              <p className="text-xs mt-0.5 truncate" style={{ color: '#6b7280' }}>
                {i.preview ? `${i.preview.fromStaff ? 'Clinic: ' : 'You: '}${i.preview.body}` : i.subject ?? i.ref}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: '#b3bcc0' }}>
                {i.ref}{i.status === 'CLOSED' ? ' · closed' : i.status === 'ANSWERED' ? ' · replied' : ''}
              </p>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {thread?.messages.map((m, idx) => <Bubble key={idx} m={m} />)}
          <div ref={endRef} />
        </div>
      )}

      {(!sel || thread?.status !== 'CLOSED') && (
        <div className="px-3 py-2.5 border-t flex-shrink-0" style={{ borderColor: '#F1F2F4' }}>
          {error && <p className="text-[11px] mb-1.5" style={{ color: '#B91C1C' }}>{error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy) send() } }}
              rows={1}
              placeholder={sel ? 'Write a reply…' : 'Ask the clinic a question…'}
              className="flex-1 resize-none rounded-2xl px-3 py-2 text-sm outline-none"
              style={{ border: '1.5px solid #e5e7eb', maxHeight: 110 }}
            />
            <button onClick={send} disabled={busy || !draft.trim()}
              className="flex-shrink-0 w-9 h-9 rounded-full text-white font-bold disabled:opacity-40"
              style={{ background: 'var(--teal, #1a7b8a)' }} aria-label="Send">
              ➤
            </button>
          </div>
        </div>
      )}
      {sel && thread?.status === 'CLOSED' && (
        <p className="px-4 py-3 text-[11px] border-t flex-shrink-0" style={{ color: '#8a9499', borderColor: '#F1F2F4' }}>
          This conversation is closed. Go back and start a new message if you need anything else.
        </p>
      )}
    </div>
  )
}
