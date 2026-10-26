'use client'

// Public enquiry: branch, then who you are, then the conversation.
//
// The identity step used to be asked IN the chat — "what's your email or mobile
// number?" — and the answer was sorted by whether it contained an "@". That is
// how you end up storing "my email is maria@x.com" as an email address, or a
// mobile number in the email column, and the contact details are the thing the
// whole feature leans on: they are what links a returning enquirer to the
// conversation they already have. A guess is not good enough for that.
//
// So they are real fields now, validated, before the chat opens. The question
// itself stays a chat, because that is the part that is actually a conversation.

import { useEffect, useState } from 'react'
import { Loader2, Check, Copy, ArrowLeft } from 'lucide-react'
import ChatThread, { ChatComposer, type ChatMessage } from '@/components/ChatThread'

const ANSWERABLE = ['SBEA', 'SBGH']

interface Branch {
  shortCode: string; name: string; brandName?: string | null
  address?: string | null; phone?: string | null
}

type Step = 'branch' | 'details' | 'chat' | 'sending' | 'done'

/** Deliberately loose. The job is to catch a typo or a phone number typed into
 *  the email box, not to adjudicate the RFC — rejecting a valid address is a
 *  worse failure here than accepting an odd one. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
/** PH mobiles are 11 digits (09xx) or 12 with the country code (639xx). */
const digitsOf = (s: string) => s.replace(/[^0-9]/g, '')

export default function InquiryClient() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [branch, setBranch] = useState<Branch | null>(null)
  const [step, setStep] = useState<Step>('branch')
  const [details, setDetails] = useState({ name: '', email: '', phone: '' })
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState('')
  const [log, setLog] = useState<ChatMessage[]>([])
  const [result, setResult] = useState<{ ref: string; token: string } | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  // "Messaged us before?" — offered, never required. The default is simply to
  // keep typing; this is for someone who has lost their link and wants the old
  // conversation back.
  const [resumeState, setResumeState] = useState<'idle' | 'sending' | 'sent'>('idle')

  useEffect(() => {
    fetch('/api/public/branches')
      .then(r => r.json())
      .then(d => setBranches((d.branches ?? []).filter((b: Branch) => ANSWERABLE.includes(b.shortCode))))
      .catch(() => setError('Could not load branches. Please refresh.'))
  }, [])

  function chooseBranch(b: Branch) {
    setBranch(b)
    setStep('details')
  }

  function submitDetails(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!details.name.trim()) errs.name = 'Please tell us your name.'
    const email = details.email.trim()
    const phone = details.phone.trim()
    if (email && !EMAIL_RE.test(email)) errs.email = 'That does not look like an email address.'
    if (phone && digitsOf(phone).length < 10) errs.phone = 'That does not look like a mobile number.'
    // One of the two, because a reply has to be able to reach them — and
    // because this is what ties a later message to this same conversation.
    if (!email && !phone) errs.email = 'Please give an email address or a mobile number.'
    setFieldErr(errs)
    if (Object.keys(errs).length) return

    const who = branch!.brandName || branch!.name
    setLog([
      { fromStaff: true, author: who, body: `Hi ${details.name.trim().split(' ')[0]}! You're messaging ${who}. 👋`, createdAt: new Date() },
      { fromStaff: true, author: who, body: 'How can we help?', createdAt: new Date() },
    ])
    setStep('chat')
  }

  async function onSend() {
    const text = draft.trim()
    if (!text || !branch) return
    const who = branch.brandName || branch.name
    setDraft('')
    setLog(l => [...l, { fromStaff: false, author: 'You', body: text, createdAt: new Date() }])
    setStep('sending')
    setError('')
    try {
      const res = await fetch('/api/public/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch: branch.shortCode,
          name: details.name.trim(),
          email: details.email.trim(),
          phone: details.phone.trim(),
          message: text,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Something went wrong.'); setStep('chat'); return }
      setResult({ ref: d.ref, token: d.token })
      setTimeout(() => {
        setLog(l => [...l, {
          fromStaff: true, author: who,
          body: `Thanks! Your enquiry is in — reference ${d.ref}. We'll reply right here.`,
          createdAt: new Date(),
        }])
        setStep('done')
      }, 350)
    } catch {
      setError('Could not reach the clinic. Please try again.')
      setStep('chat')
    }
  }

  async function emailMyLink() {
    if (!branch || !details.email.trim()) return
    setResumeState('sending')
    try {
      await fetch('/api/public/inquiry/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: branch.shortCode, email: details.email.trim() }),
      })
    } catch { /* the message below is neutral either way */ }
    setResumeState('sent')
  }

  const threadUrl = result && typeof window !== 'undefined'
    ? `${window.location.origin}/inquiry/${result.ref}?t=${result.token}` : ''

  return (
    <main style={{ minHeight: '100vh', background: '#EDF3D9', padding: '24px 16px', display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: '100%', maxWidth: 480, background: '#fff', borderRadius: 16,
        boxShadow: '0 6px 28px rgba(36,80,90,0.10)', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', maxHeight: 'calc(100vh - 48px)',
      }}>
        <div style={{ background: '#1a7b8a', color: '#fff', padding: '14px 18px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          {step === 'details' && (
            <button onClick={() => { setBranch(null); setStep('branch') }} aria-label="Back to branches"
              style={{ background: 'transparent', border: 0, color: '#fff', cursor: 'pointer', display: 'flex', padding: 0 }}>
              <ArrowLeft size={17} />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>
              {branch ? (branch.brandName || branch.name) : 'Aura Health Rehab'}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, opacity: 0.85 }}>
              {step === 'branch' ? 'Choose a branch to start'
                : step === 'details' ? 'A few details so we can reply'
                : 'Typically replies within clinic hours'}
            </p>
          </div>
        </div>

        {step === 'branch' && (
          <div style={{ padding: 18, overflowY: 'auto' }}>
            <p style={{ fontSize: 13.5, color: '#5b6b70', margin: '0 0 14px', lineHeight: 1.6 }}>
              Which branch would you like to message?
            </p>
            {branches.length === 0 && !error && <p style={{ fontSize: 13, color: '#9aa5a9' }}>Loading branches…</p>}
            {branches.map(b => (
              <button key={b.shortCode} onClick={() => chooseBranch(b)} style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: '13px 15px', borderRadius: 12, marginBottom: 10,
                border: '1.5px solid #e5e7eb', background: '#fff',
              }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#24505a', display: 'block' }}>
                  {b.brandName || b.name}
                </span>
                {b.address && <span style={{ fontSize: 12, color: '#8a9499', display: 'block', marginTop: 2 }}>{b.address}</span>}
              </button>
            ))}
            {error && <p style={{ color: '#B91C1C', fontSize: 13, marginTop: 8 }}>{error}</p>}
          </div>
        )}

        {step === 'details' && (
          <form onSubmit={submitDetails} style={{ padding: 18, overflowY: 'auto' }}>
            <p style={{ fontSize: 13, color: '#5b6b70', margin: '0 0 16px', lineHeight: 1.6 }}>
              We use these to reply, and to keep your messages together if you
              come back later.
            </p>

            <Field label="Your name" required value={details.name} error={fieldErr.name}
              onChange={v => setDetails(d => ({ ...d, name: v }))} />
            <Field label="Email address" type="email" value={details.email} error={fieldErr.email}
              placeholder="you@example.com" autoComplete="email"
              onChange={v => setDetails(d => ({ ...d, email: v }))} />
            <Field label="Mobile number" type="tel" optional value={details.phone} error={fieldErr.phone}
              placeholder="09XX XXX XXXX" autoComplete="tel"
              onChange={v => setDetails(d => ({ ...d, phone: v }))} />
            <p style={{ fontSize: 11.5, color: '#8a9499', margin: '-4px 0 16px', lineHeight: 1.5 }}>
              Either one is enough — both is better, so we can still reach you if
              one changes.
            </p>

            <button type="submit" style={{
              width: '100%', background: '#1a7b8a', color: '#fff', border: 0, borderRadius: 10,
              padding: '12px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
              Start messaging
            </button>
          </form>
        )}

        {(step === 'chat' || step === 'sending' || step === 'done') && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', background: '#fff' }}>
              <ChatThread messages={log} mineIsStaff={false} />
              {step === 'sending' && (
                <p style={{ fontSize: 12, color: '#9aa5a9', display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <Loader2 size={13} className="animate-spin" /> Sending…
                </p>
              )}
              {error && <p style={{ color: '#B91C1C', fontSize: 12.5, marginTop: 8 }}>{error}</p>}

              {step === 'done' && result && (
                <div style={{ marginTop: 14, padding: 13, background: '#F6FAFA', border: '1px solid #cfe3e6', borderRadius: 12 }}>
                  <p style={{ margin: '0 0 7px', fontSize: 12, color: '#24505a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Check size={14} /> Keep this link to see our reply
                  </p>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input readOnly value={threadUrl} style={{
                      flex: 1, border: '1px solid #cfe3e6', borderRadius: 8, padding: '6px 8px',
                      fontSize: 11, color: '#24505a', background: '#fff', minWidth: 0,
                    }} />
                    <button type="button" onClick={() => { navigator.clipboard?.writeText(threadUrl); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
                      style={{ background: '#1a7b8a', color: '#fff', border: 0, borderRadius: 8, padding: '7px 10px',
                               fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <Copy size={12} /> {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <a href={threadUrl} style={{
                    display: 'block', textAlign: 'center', marginTop: 9, background: '#fff',
                    border: '1.5px solid #1a7b8a', color: '#1a7b8a', borderRadius: 8,
                    padding: '8px 10px', fontSize: 12.5, fontWeight: 700, textDecoration: 'none',
                  }}>
                    Open my conversation
                  </a>
                </div>
              )}
            </div>

            {step !== 'done' && (
              <div style={{ padding: '10px 14px 14px', borderTop: '1px solid #F1F2F4', flexShrink: 0 }}>
                {/* Deliberately NOT a question the page answers: we never say on
                    screen whether that address has written before, because that
                    would let anyone confirm who is in contact with the clinic.
                    The email is what proves who they are. */}
                {details.email.trim() && (
                  resumeState === 'sent' ? (
                    <p style={{ margin: '0 0 9px', fontSize: 11.5, color: '#047857', lineHeight: 1.5 }}>
                      If we found a conversation for that address, we&rsquo;ve emailed you a link to it.
                      You can carry on typing here in the meantime.
                    </p>
                  ) : (
                    <p style={{ margin: '0 0 9px', fontSize: 11.5, color: '#8a9499', lineHeight: 1.5 }}>
                      Messaged us before?{' '}
                      <button type="button" onClick={emailMyLink} disabled={resumeState === 'sending'}
                        style={{
                          border: 0, background: 'transparent', padding: 0, cursor: 'pointer',
                          color: '#1a7b8a', fontWeight: 700, fontSize: 11.5, textDecoration: 'underline',
                        }}>
                        {resumeState === 'sending' ? 'Sending…' : 'Email me a link to that conversation'}
                      </button>
                      {' '}— or just keep typing below.
                    </p>
                  )
                )}
                <ChatComposer value={draft} onChange={setDraft} onSend={onSend}
                  busy={step === 'sending'} disabled={step === 'sending'}
                  placeholder="Type your question…" />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function Field({
  label, value, onChange, type = 'text', placeholder, required, optional, error, autoComplete,
}: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; required?: boolean; optional?: boolean
  error?: string; autoComplete?: string
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.07em', color: '#8a9499', marginBottom: 6,
      }}>
        {label}{required && ' *'}
        {/* Spelled out rather than left to the absence of an asterisk: a blank
            field reads as "not filled in yet" far more readily than as "you may
            skip this", and this one was being read as demanded. Lower-cased
            against the label's uppercase so it reads as an aside. */}
        {optional && (
          <span style={{ textTransform: 'none', fontWeight: 600, letterSpacing: 0, color: '#a3acb1' }}>
            {' '}(optional)
          </span>
        )}
      </label>
      <input
        type={type} value={value} placeholder={placeholder} autoComplete={autoComplete}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 10,
          border: `1.5px solid ${error ? '#DC2626' : '#e5e7eb'}`,
          fontSize: 14, color: '#24505a', outline: 'none', background: '#fff',
        }}
      />
      {error && <p style={{ margin: '5px 0 0', fontSize: 11.5, color: '#B91C1C' }}>{error}</p>}
    </div>
  )
}
