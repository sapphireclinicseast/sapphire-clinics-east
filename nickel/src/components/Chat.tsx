'use client'

import { useEffect, useRef, useState } from 'react'
import OpenAttachment from '@/components/OpenAttachment'

interface Msg { id: string; senderRole: 'PATIENT' | 'PROVIDER'; text: string | null; attachment: string | null; attachmentName: string | null; attachmentType: string | null; createdAt: string }

function readFile(file: File, maxImg = 1400): Promise<{ data: string; name: string; type: string }> {
  return new Promise((resolve, reject) => {
    if (file.type.startsWith('image/')) {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxImg / Math.max(img.width, img.height))
        const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
        const ctx = c.getContext('2d'); if (!ctx) return reject(new Error('no canvas'))
        ctx.drawImage(img, 0, 0, c.width, c.height)
        resolve({ data: c.toDataURL('image/jpeg', 0.82), name: file.name, type: 'image/jpeg' })
      }
      img.onerror = reject
      const r = new FileReader(); r.onload = () => (img.src = String(r.result)); r.onerror = reject; r.readAsDataURL(file)
    } else {
      const r = new FileReader(); r.onload = () => resolve({ data: String(r.result), name: file.name, type: file.type || 'application/octet-stream' }); r.onerror = reject; r.readAsDataURL(file)
    }
  })
}
const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function Chat({ bookingId, meRole, otherName }: { bookingId: string; meRole: 'PATIENT' | 'PROVIDER'; otherName: string }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [pending, setPending] = useState<{ data: string; name: string; type: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  async function load() {
    try {
      const d = await fetch(`/api/messages?bookingId=${bookingId}`).then((r) => r.json())
      if (Array.isArray(d.messages)) setMessages(d.messages)
    } catch { /* ignore transient */ }
  }
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [bookingId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  async function pick(file: File | undefined) {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setErr('File must be under 10 MB.'); return }
    setErr(null)
    try { setPending(await readFile(file)) } catch { setErr('Could not read that file.') }
  }

  async function send() {
    if (!text.trim() && !pending) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, text, attachment: pending?.data, attachmentName: pending?.name, attachmentType: pending?.type }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not send')
      setText(''); setPending(null); await load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send') } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white">
      <div className="flex items-center justify-between border-b border-[color:var(--line)] px-4 py-3">
        <div><b className="text-[color:var(--ink)]">{otherName}</b><div className="text-[11px] text-[color:var(--muted)]">Messages stay inside Nickel — no phone numbers exchanged.</div></div>
      </div>
      <div className="flex max-h-[420px] min-h-[280px] flex-col gap-2.5 overflow-y-auto bg-[color:var(--mist)] p-4">
        {messages.length === 0 && <p className="my-auto text-center text-[13px] text-[color:var(--muted)]">No messages yet. Say hello</p>}
        {messages.map((m) => {
          const mine = m.senderRole === meRole
          return (
            <div key={m.id} className={`max-w-[80%] ${mine ? 'self-end' : 'self-start'}`}>
              <div className={`rounded-2xl px-3 py-2 text-[13.5px] ${mine ? 'bg-[color:var(--steel)] text-white' : 'border border-[color:var(--line)] bg-white text-[color:var(--ink)]'}`} style={mine ? { borderRadius: '14px 14px 4px 14px' } : { borderRadius: '14px 14px 14px 4px' }}>
                {m.attachment && (m.attachmentType?.startsWith('image/')
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <OpenAttachment src={m.attachment} className="block"><img src={m.attachment} alt={m.attachmentName ?? 'photo'} className="mb-1 max-h-56 rounded-lg" /></OpenAttachment>
                  : <a href={m.attachment} target="_blank" rel="noopener noreferrer" download={m.attachmentName ?? 'file'} className={`mb-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${mine ? 'bg-white/15' : 'bg-[color:var(--mist)]'}`}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 9.5 12 18.5a4.5 4.5 0 0 1-6.4-6.4l8.5-8.5a3 3 0 0 1 4.3 4.3l-8.5 8.5a1.5 1.5 0 0 1-2.1-2.1l7.8-7.8"/></svg>{m.attachmentName ?? 'file'}</a>)}
                {m.text && <div className="whitespace-pre-wrap">{m.text}</div>}
              </div>
              <div className={`mt-0.5 text-[10.5px] text-[color:var(--muted)] ${mine ? 'text-right' : ''}`}>{fmtTime(m.createdAt)}</div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      {pending && (
        <div className="flex items-center gap-2 border-t border-[color:var(--line)] bg-[color:var(--mist)] px-4 py-2 text-[12.5px]">
          <span className="inline-flex items-center gap-1.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--steel)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 9.5 12 18.5a4.5 4.5 0 0 1-6.4-6.4l8.5-8.5a3 3 0 0 1 4.3 4.3l-8.5 8.5a1.5 1.5 0 0 1-2.1-2.1l7.8-7.8"/></svg>{pending.name}</span>
          <button className="ml-auto text-[color:var(--muted)] hover:text-[color:var(--ink)]" onClick={() => setPending(null)}>Remove</button>
        </div>
      )}
      {err && <p className="px-4 pt-1 text-[12px] text-red-600">{err}</p>}
      <div className="flex items-center gap-2 border-t border-[color:var(--line)] px-3 py-2.5">
        <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[color:var(--line-2)] hover:bg-[color:var(--mist)]" title="Attach a photo or file">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--steel)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 9.5 12 18.5a4.5 4.5 0 0 1-6.4-6.4l8.5-8.5a3 3 0 0 1 4.3 4.3l-8.5 8.5a1.5 1.5 0 0 1-2.1-2.1l7.8-7.8"/></svg>
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        <input className="input !py-2" placeholder="Type a message…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <button className="btn-primary !px-4 !py-2" disabled={busy || (!text.trim() && !pending)} onClick={send}>{busy ? '…' : 'Send'}</button>
      </div>
    </div>
  )
}
