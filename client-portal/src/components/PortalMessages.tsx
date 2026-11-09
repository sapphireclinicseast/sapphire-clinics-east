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
import { createPortal } from 'react-dom'
import {
  listMyInquiries, getMyInquiry, replyToInquiry, startInquiry,
  uploadInquiryFile, inquiryFileUrl,
  type PortalInquiry, type PortalInquiryMessage,
} from '@/lib/api'
import { StatusPill, Icon, TEXTAREA, SUBTLE_BG, FOCUS, DANGER } from '@/components/hub/ui'

// Round launcher; same look as the Concerns launcher one slot below.
const LAUNCHER = `fixed right-5 z-40 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-[0_8px_24px_rgba(23,50,58,0.28)] hover:shadow-[0_12px_32px_rgba(23,50,58,0.38)] hover:-translate-y-0.5 transition-all ${FOCUS}`

function PaperclipIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-shrink-0">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}
function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

const BRANCH_LABEL: Record<string, string> = {
  SBEA: 'Aura Health Rehab – East',
  SBGH: 'Aura Health Rehab – Greenhills',
}

// Mirrors the hub's allow-list — the upload is rejected there anyway, but a
// file picker that offers types the server refuses is a trap.
const ACCEPT = ['image/*', 'video/*', 'audio/*', '.pdf', '.doc', '.docx'].join(',')
const MAX_BYTES = 25 * 1024 * 1024

function humanSize(bytes?: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function when(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

interface Viewable { url: string; name: string; mime: string | null }

/** Full-screen viewer, so opening an attachment keeps you in the conversation
 *  instead of throwing you into a new tab and losing the thread behind it. */
function Lightbox({ item, onClose }: { item: Viewable; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const isPdf = item.mime === 'application/pdf'
  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-label={item.name} onClick={onClose}
      className="fixed inset-0 z-[100] flex flex-col p-3.5"
      style={{ background: 'rgba(12,20,24,0.9)' }}
    >
      <div className="flex items-center gap-3.5 pb-3 text-white flex-shrink-0">
        <span className="flex-1 min-w-0 truncate text-[13px] font-semibold">{item.name}</span>
        <a href={item.url} download={item.name} onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 inline-flex items-center gap-1 text-[12.5px] font-bold text-white no-underline">
          <Icon name="download" size={14} /> Download
        </a>
        <button type="button" onClick={onClose} aria-label="Close"
          className={`flex-shrink-0 w-8 h-8 rounded-full text-white flex items-center justify-center ${FOCUS}`}
          style={{ background: 'rgba(255,255,255,0.14)' }}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <div onClick={(e) => e.stopPropagation()} className="flex-1 min-h-0 flex items-center justify-center">
        {isPdf ? (
          <iframe src={item.url} title={item.name} className="w-full h-full rounded-lg border-0 bg-white" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={item.name} className="max-w-full max-h-full object-contain rounded-lg" />
        )}
      </div>
    </div>,
    document.body,
  )
}

function Bubble({ m, inquiryId, onOpen }: {
  m: PortalInquiryMessage
  inquiryId: string
  onOpen: (v: Viewable) => void
}) {
  const mine = !m.fromStaff
  // Through the proxy: the raw path is hub-relative and renders as a broken
  // image on this host.
  const url = inquiryFileUrl(inquiryId, m.fileUrl)
  const isImage = m.fileMime?.startsWith('image/')
  const isVideo = m.fileMime?.startsWith('video/')
  const isAudio = m.fileMime?.startsWith('audio/')
  const name = m.fileName ?? 'Attachment'
  const canView = !!url && (isImage || m.fileMime === 'application/pdf')

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} mb-1.5`}>
      <div
        className="max-w-[78%] rounded-xl text-sm leading-relaxed whitespace-pre-wrap break-words"
        style={{
          background: mine ? 'var(--deep-teal)' : SUBTLE_BG,
          border: mine ? '1px solid transparent' : '1px solid var(--light-gray)',
          color: mine ? '#fff' : 'var(--charcoal)',
          padding: url && !m.body ? 4 : '8px 13px',
        }}
      >
        {url && (
          <div style={{ marginBottom: m.body ? 7 : 0 }}>
            {isImage ? (
              <button type="button" onClick={() => onOpen({ url, name, mime: m.fileMime ?? null })}
                aria-label={`Open ${name}`} className="block w-full p-0 border-0 bg-transparent cursor-zoom-in">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={name} className="block rounded-xl max-h-60 w-auto" />
              </button>
            ) : isVideo ? (
              <video src={url} controls preload="metadata" className="block rounded-xl max-h-60" />
            ) : isAudio ? (
              <audio src={url} controls preload="metadata" className="block w-56 max-w-full" />
            ) : canView ? (
              <button type="button" onClick={() => onOpen({ url, name, mime: m.fileMime ?? null })}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-left"
                style={{ background: mine ? 'rgba(255,255,255,0.18)' : '#fff', color: mine ? '#fff' : 'var(--charcoal)' }}>
                <PaperclipIcon size={14} /> <span className="flex-1 min-w-0 truncate">{name}</span>
              </button>
            ) : (
              // A Word document cannot be rendered by the browser, so a
              // download is the only honest action for it.
              <a href={url} download={name}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold no-underline"
                style={{ background: mine ? 'rgba(255,255,255,0.18)' : '#fff', color: mine ? '#fff' : 'var(--charcoal)' }}>
                <PaperclipIcon size={14} /> <span className="flex-1 min-w-0 truncate">{name}</span>
              </a>
            )}
          </div>
        )}
        {m.body}
      </div>
    </div>
  )
}

// Monochrome chat-bubble icon (inherits the button's white via currentColor).
function ChatIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

export default function PortalMessages({ token }: { token: string }) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<PortalInquiry[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [thread, setThread] = useState<{ ref: string; branch: string; status: string; messages: PortalInquiryMessage[] } | null>(null)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState<Viewable | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setMounted(true) }, [])

  const loadList = useCallback(async () => {
    try { setList((await listMyInquiries(token)).inquiries ?? []) } catch { /* signed out elsewhere */ }
  }, [token])

  const loadThread = useCallback(async (id: string) => {
    try { setThread(await getMyInquiry(token, id)) } catch { setError('Could not open that conversation.') }
  }, [token])

  useEffect(() => { if (open) loadList() }, [open, loadList])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [thread?.messages.length])

  // Poll only while open — a closed widget has no business polling all day.
  // Refetch on focus too, so coming back to the tab is immediate rather than
  // up to a poll stale.
  useEffect(() => {
    if (!open) return
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      loadList()
      if (sel) loadThread(sel)
    }
    const t = setInterval(tick, 15000)
    window.addEventListener('focus', tick)
    return () => { clearInterval(t); window.removeEventListener('focus', tick) }
  }, [open, sel, loadList, loadThread])

  const unread = list.filter(i => i.status === 'ANSWERED').length
  const canSend = !busy && (draft.trim().length > 0 || !!pending)

  function choose(f: File | undefined) {
    if (!f) return
    if (f.size > MAX_BYTES) {
      setError(`That file is too large. The limit is ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`)
      return
    }
    setError('')
    setPending(f)
  }

  async function send() {
    if (!canSend) return
    setBusy(true); setError('')
    try {
      // A file needs a conversation to live on, so an attachment sent as the
      // very first message starts the thread with its caption, then uploads.
      let id = sel
      if (!id) {
        const r = await startInquiry(token, draft.trim() || (pending ? pending.name : ''))
        id = r.id
      } else if (draft.trim() && !pending) {
        await replyToInquiry(token, id, draft.trim())
      }
      if (pending && id) {
        await uploadInquiryFile(token, id, pending, sel ? draft.trim() : '')
      }
      setDraft(''); setPending(null)
      await loadList()
      if (id) { setSel(id); await loadThread(id) }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that. Please try again.')
    } finally { setBusy(false) }
  }

  // Rendered into <body>. The dashboard section that mounts this finishes its
  // entry animation on `transform: translateY(0)`, and a transformed ancestor
  // becomes the containing block for `position: fixed` — which pinned this
  // widget to the bottom of that section instead of the bottom of the screen.
  if (!mounted) return null

  if (!open) {
    return createPortal(
      <button
        onClick={() => setOpen(true)}
        className={`${LAUNCHER} bottom-24`}
        style={{ background: 'var(--deep-teal)' }}
        aria-label="Messages with the clinic"
        title="Messages"
      >
        <ChatIcon size={24} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full text-[11px] font-bold px-1.5 flex items-center justify-center tabular-nums" style={{ background: DANGER, color: '#fff', border: '2px solid #fff' }}>
            <span className="sr-only">Unread replies: </span>{unread}
          </span>
        )}
      </button>,
      document.body,
    )
  }

  return createPortal(
    <>
    <div role="dialog" aria-label="Messages"
      className="fixed bottom-5 right-5 z-50 w-[360px] max-w-[calc(100vw-2.5rem)] h-[480px] max-h-[calc(100vh-6rem)] rounded-xl bg-white shadow-2xl flex flex-col overflow-hidden"
      style={{ border: '1px solid var(--light-gray)' }}>
      <div className="flex items-center gap-2 px-3.5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--light-gray)' }}>
        {sel && (
          <button onClick={() => { setSel(null); setThread(null) }} aria-label="Back"
            className={`w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-[color:var(--paper)] ${FOCUS}`} style={{ color: 'var(--mid-gray)' }}>
            <Icon name="arrowLeft" size={16} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[15px] leading-tight truncate" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            {thread ? BRANCH_LABEL[thread.branch] ?? thread.branch : 'Messages'}
          </p>
          <p className="text-[11px] truncate" style={{ color: 'var(--mid-gray)' }}>
            {thread ? thread.ref : 'Your conversations with the clinic'}
          </p>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close messages"
          className={`w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-[color:var(--paper)] ${FOCUS}`} style={{ color: 'var(--mid-gray)' }}>
          <Icon name="x" size={16} />
        </button>
      </div>

      {!sel ? (
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <div className="text-center px-5 py-10">
              <span className="inline-flex" style={{ color: 'var(--light-gray)' }}><ChatIcon size={24} /></span>
              <p className="text-sm mt-2" style={{ color: 'var(--mid-gray)' }}>
                No messages yet. Type below to ask the clinic anything.
              </p>
            </div>
          ) : list.map(i => (
            <button key={i.id} onClick={() => { setSel(i.id); loadThread(i.id) }}
              className="block w-full text-left px-4 py-3 transition-colors hover:bg-[#F8FAF2] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--teal)]"
              style={{ borderBottom: '1px solid var(--light-gray)' }}>
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold flex-1 truncate" style={{ color: 'var(--charcoal)' }}>
                  {BRANCH_LABEL[i.branch] ?? i.branch}
                </span>
                <span className="text-[10.5px] tabular-nums" style={{ color: 'var(--mid-gray)' }}>{when(i.lastMessageAt)}</span>
              </div>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--mid-gray)' }}>
                {i.preview ? `${i.preview.fromStaff ? 'Clinic: ' : 'You: '}${i.preview.body}` : i.subject ?? i.ref}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10.5px]" style={{ color: 'var(--mid-gray)' }}>{i.ref}</span>
                {i.status === 'CLOSED' && <StatusPill tone="neutral">Closed</StatusPill>}
                {i.status === 'ANSWERED' && <StatusPill tone="success">Replied</StatusPill>}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {thread?.messages.map((m, idx) => (
            <Bubble key={idx} m={m} inquiryId={sel} onOpen={setViewing} />
          ))}
          <div ref={endRef} />
        </div>
      )}

      {(!sel || thread?.status !== 'CLOSED') && (
        <div className="px-3 py-2.5 flex-shrink-0" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
          {error && <p role="alert" className="flex items-start gap-1.5 text-[11.5px] mb-1.5" style={{ color: DANGER }}><Icon name="alert" size={13} className="mt-px" />{error}</p>}
          {pending && (
            <div className="flex items-center gap-2 mb-1.5 rounded-lg px-2.5 py-1.5 bg-white" style={{ border: '1px solid var(--light-gray)' }}>
              <span className="flex-1 min-w-0 inline-flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--charcoal)' }}><PaperclipIcon size={13} /><span className="truncate">{pending.name}</span></span>
              <span className="text-[11px] flex-shrink-0 tabular-nums" style={{ color: 'var(--mid-gray)' }}>{humanSize(pending.size)}</span>
              <button type="button" onClick={() => setPending(null)} aria-label="Remove attachment"
                className={`flex-shrink-0 w-6 h-6 inline-flex items-center justify-center rounded ${FOCUS}`} style={{ color: 'var(--mid-gray)' }}><Icon name="x" size={12} /></button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden"
              onChange={(e) => { choose(e.target.files?.[0]); e.target.value = '' }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
              aria-label="Attach a file"
              className={`flex-shrink-0 w-9 h-9 rounded-lg inline-flex items-center justify-center hover:bg-white disabled:opacity-40 ${FOCUS}`}
              style={{ color: 'var(--mid-gray)' }}>
              <PaperclipIcon />
            </button>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canSend) send() } }}
              rows={1}
              placeholder={pending ? 'Add a caption (optional)…' : sel ? 'Write a reply…' : 'Ask the clinic a question…'}
              className={`${TEXTAREA} flex-1 resize-none`}
              style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)', maxHeight: 110 }}
            />
            <button onClick={send} disabled={!canSend}
              className={`flex-shrink-0 w-9 h-9 rounded-lg text-white inline-flex items-center justify-center hover:opacity-90 disabled:opacity-40 ${FOCUS}`}
              style={{ background: 'var(--deep-teal)' }} aria-label="Send">
              <SendIcon />
            </button>
          </div>
        </div>
      )}
      {sel && thread?.status === 'CLOSED' && (
        <p className="px-4 py-3 text-[11px] flex-shrink-0" style={{ color: 'var(--mid-gray)', borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
          This conversation is closed. Go back and start a new message if you need anything else.
        </p>
      )}
    </div>
    {viewing && <Lightbox item={viewing} onClose={() => setViewing(null)} />}
    </>,
    document.body,
  )
}
