'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function TicketForm() {
  const router = useRouter()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/provider/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, message }) })
      if (!r.ok) throw new Error((await r.json()).error ?? 'Could not send')
      setSubject(''); setMessage(''); router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send') } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{err}</div>}
      <input className="input" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
      <textarea className="input" rows={3} placeholder="Describe your concern…" value={message} onChange={(e) => setMessage(e.target.value)} required />
      <button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Submit ticket'}</button>
    </form>
  )
}
