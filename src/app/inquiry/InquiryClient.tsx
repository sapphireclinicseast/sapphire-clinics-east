'use client'

// Public enquiry form. Branch list comes from /api/public/branches, which is
// the HR Branch Registry cache — so adding or renaming a branch in HR changes
// this page with nothing to deploy. Only branches with a front desk that can
// answer are offered; routing an enquiry to a branch nobody watches is the
// exact failure this page exists to end.

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, Copy } from 'lucide-react'

const ANSWERABLE = ['SBEA', 'SBGH']

interface Branch { shortCode: string; name: string; brandName?: string | null; address?: string | null; phone?: string | null }

export default function InquiryClient() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [form, setForm] = useState({ branch: '', name: '', email: '', phone: '', subject: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ ref: string; token: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/public/branches')
      .then(r => r.json())
      .then(d => setBranches((d.branches ?? []).filter((b: Branch) => ANSWERABLE.includes(b.shortCode))))
      .catch(() => setError('Could not load branches. Please refresh.'))
  }, [])

  const upd = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const res = await fetch('/api/public/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Something went wrong.'); return }
      setDone({ ref: d.ref, token: d.token })
    } catch {
      setError('Could not reach the clinic. Please check your connection and try again.')
    } finally { setBusy(false) }
  }

  const threadUrl = done ? `${typeof window !== 'undefined' ? window.location.origin : ''}/inquiry/${done.ref}?t=${done.token}` : ''

  if (done) {
    return (
      <Shell>
        <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
          <CheckCircle2 size={44} style={{ color: '#1a7b8a' }} />
        </div>
        <h1 style={h1}>Your enquiry is in</h1>
        <p style={lead}>Your reference number is</p>
        <p style={{ fontSize: 26, fontWeight: 800, color: '#1a7b8a', letterSpacing: '0.02em', margin: '4px 0 18px', textAlign: 'center' }}>
          {done.ref}
        </p>
        <p style={{ ...lead, marginBottom: 10 }}>
          Keep this link. It is the only way back to your conversation, and it is where
          the branch&rsquo;s reply will appear.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#F6FAFA',
                      border: '1px solid #cfe3e6', borderRadius: 10, padding: '10px 12px', marginBottom: 18 }}>
          <input readOnly value={threadUrl} style={{ flex: 1, border: 0, background: 'transparent', fontSize: 12, color: '#24505a' }} />
          <button type="button" onClick={() => { navigator.clipboard?.writeText(threadUrl); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
            style={{ ...btn, padding: '6px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Copy size={13} /> {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <a href={threadUrl} style={{ ...btn, display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          Open my enquiry
        </a>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1 style={h1}>Ask us a question</h1>
      <p style={lead}>
        Send a message to a branch and we&rsquo;ll reply here. You&rsquo;ll get a reference
        number and a private link to follow the conversation.
      </p>

      <form onSubmit={submit} style={{ marginTop: 18 }}>
        <Label>Which branch?</Label>
        <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
          {branches.length === 0 && <p style={{ fontSize: 13, color: '#8a9499' }}>Loading branches…</p>}
          {branches.map(b => (
            <label key={b.shortCode} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
              padding: '12px 14px', borderRadius: 10,
              border: `1.5px solid ${form.branch === b.shortCode ? '#1a7b8a' : '#e5e7eb'}`,
              background: form.branch === b.shortCode ? '#f0f9fa' : '#fff',
            }}>
              <input type="radio" name="branch" checked={form.branch === b.shortCode}
                onChange={() => upd('branch', b.shortCode)} style={{ marginTop: 3 }} />
              <span>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#24505a' }}>{b.brandName || b.name}</span>
                {b.address && <span style={{ display: 'block', fontSize: 12, color: '#8a9499' }}>{b.address}</span>}
              </span>
            </label>
          ))}
        </div>

        <Label>Your name *</Label>
        <Input value={form.name} onChange={v => upd('name', v)} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={v => upd('email', v)} /></div>
          <div><Label>Mobile no.</Label><Input value={form.phone} onChange={v => upd('phone', v)} /></div>
        </div>
        <p style={{ fontSize: 11.5, color: '#8a9499', margin: '-6px 0 12px' }}>
          Leave at least one so we can reach you if the link is lost.
        </p>

        <Label>Subject</Label>
        <Input value={form.subject} onChange={v => upd('subject', v)} placeholder="Optional — e.g. Booking an assessment" />

        <Label>Your message *</Label>
        <textarea value={form.message} onChange={e => upd('message', e.target.value)} rows={6}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />

        {error && (
          <p style={{ color: '#B91C1C', fontSize: 13, margin: '10px 0 0' }}>{error}</p>
        )}

        <button type="submit" disabled={busy} style={{ ...btn, width: '100%', marginTop: 18, opacity: busy ? 0.6 : 1 }}>
          {busy ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Loader2 size={15} className="animate-spin" /> Sending…</span> : 'Send enquiry'}
        </button>
      </form>
    </Shell>
  )
}

/* ── small presentational helpers ─────────────────────────────────────────── */
const h1: React.CSSProperties = { fontSize: 24, fontWeight: 800, color: '#24505a', margin: '0 0 6px', textAlign: 'center' }
const lead: React.CSSProperties = { fontSize: 13.5, color: '#5b6b70', lineHeight: 1.6, margin: 0, textAlign: 'center' }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb',
  fontSize: 14, color: '#24505a', outline: 'none', marginBottom: 14, background: '#fff',
}
const btn: React.CSSProperties = {
  background: '#1a7b8a', color: '#fff', border: 0, borderRadius: 10,
  padding: '12px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: '#8a9499', marginBottom: 6 }}>{children}</label>
}
function Input({ value, onChange, type = 'text', placeholder = '' }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return <input type={type} value={value} placeholder={placeholder}
    onChange={e => onChange(e.target.value)} style={inputStyle} />
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
