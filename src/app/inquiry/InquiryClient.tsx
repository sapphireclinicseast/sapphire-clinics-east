'use client'

// Public enquiry, as a chat rather than a form.
//
// The form version asked for five fields before a word of the question. This
// asks one thing at a time in the window the answer appears in, which is how
// people already expect to message a business — and it is the habit they were
// using on Meta, which is what this replaces.
//
// Nothing is lodged until a branch is chosen AND a question is typed: a
// half-filled form should not reach a front desk as an enquiry with no
// question in it.

import { useEffect, useState, useRef } from 'react'
import { Loader2, Check, Copy } from 'lucide-react'
import ChatThread, { ChatComposer, type ChatMessage } from '@/components/ChatThread'

const ANSWERABLE = ['SBEA', 'SBGH']

interface Branch {
  shortCode: string; name: string; brandName?: string | null
  address?: string | null; phone?: string | null
}

/** What the desk still needs, asked one at a time. */
type Step = 'branch' | 'name' | 'contact' | 'question' | 'sending' | 'done'

export default function InquiryClient() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [branch, setBranch] = useState<Branch | null>(null)
  const [step, setStep] = useState<Step>('branch')
  const [draft, setDraft] = useState('')
  const [log, setLog] = useState<ChatMessage[]>([])
  const [answers, setAnswers] = useState({ name: '', contact: '', question: '' })
  const [result, setResult] = useState<{ ref: string; token: string } | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const loadFailed = useRef(false)

  useEffect(() => {
    fetch('/api/public/branches')
      .then(r => r.json())
      .then(d => setBranches((d.branches ?? []).filter((b: Branch) => ANSWERABLE.includes(b.shortCode))))
      .catch(() => { loadFailed.current = true; setError('Could not load branches. Please refresh.') })
  }, [])

  const say = (body: string, fromStaff = true, author?: string) =>
    setLog(l => [...l, { fromStaff, author: author ?? (branch?.brandName || 'Aura Health Rehab'), body, createdAt: new Date() }])

  function chooseBranch(b: Branch) {
    setBranch(b)
    const who = b.brandName || b.name
    setLog([
      { fromStaff: true, author: who, body: `Hi! You're messaging ${who}. 👋`, createdAt: new Date() },
      { fromStaff: true, author: who, body: "Before we start — what's your name?", createdAt: new Date() },
    ])
    setStep('name')
  }

  async function onSend() {
    const text = draft.trim()
    if (!text || !branch) return
    const who = branch.brandName || branch.name
    setDraft('')
    setLog(l => [...l, { fromStaff: false, author: 'You', body: text, createdAt: new Date() }])

    if (step === 'name') {
      setAnswers(a => ({ ...a, name: text }))
      setTimeout(() => {
        say(`Thanks, ${text.split(' ')[0]}. What's the best email address or mobile number to reach you on?`, true, who)
        setStep('contact')
      }, 350)
      return
    }

    if (step === 'contact') {
      setAnswers(a => ({ ...a, contact: text }))
      setTimeout(() => {
        say('Got it. How can we help?', true, who)
        setStep('question')
      }, 350)
      return
    }

    if (step === 'question') {
      setStep('sending')
      const looksLikeEmail = answers.contact.includes('@')
      try {
        const res = await fetch('/api/public/inquiry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branch: branch.shortCode,
            name: answers.name,
            email: looksLikeEmail ? answers.contact : '',
            phone: looksLikeEmail ? '' : answers.contact,
            message: text,
          }),
        })
        const d = await res.json()
        if (!res.ok) {
          setError(d.error || 'Something went wrong.')
          // Back to the question so what they wrote is not lost behind an error.
          setStep('question')
          return
        }
        setResult({ ref: d.ref, token: d.token })
        setTimeout(() => {
          say(`Thanks! Your enquiry is in — reference ${d.ref}. We'll reply right here.`, true, who)
          setStep('done')
        }, 350)
      } catch {
        setError('Could not reach the clinic. Please try again.')
        setStep('question')
      }
    }
  }

  const threadUrl = result && typeof window !== 'undefined'
    ? `${window.location.origin}/inquiry/${result.ref}?t=${result.token}` : ''

  const placeholder =
    step === 'name' ? 'Type your name…'
    : step === 'contact' ? 'Email or mobile number…'
    : step === 'question' ? 'Type your question…'
    : ''

  return (
    <main style={{ minHeight: '100vh', background: '#EDF3D9', padding: '24px 16px', display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: '100%', maxWidth: 480, background: '#fff', borderRadius: 16,
        boxShadow: '0 6px 28px rgba(36,80,90,0.10)', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', maxHeight: 'calc(100vh - 48px)',
      }}>
        {/* Header — the person you're talking to, like any chat */}
        <div style={{ background: '#1a7b8a', color: '#fff', padding: '14px 18px', flexShrink: 0 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>
            {branch ? (branch.brandName || branch.name) : 'Aura Health Rehab'}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12, opacity: 0.85 }}>
            {branch ? 'Typically replies within clinic hours' : 'Choose a branch to start'}
          </p>
        </div>

        {/* Branch picker — the one thing asked before the conversation starts,
            because an enquiry has to belong to a branch to reach anyone. */}
        {step === 'branch' ? (
          <div style={{ padding: 18, overflowY: 'auto' }}>
            <p style={{ fontSize: 13.5, color: '#5b6b70', margin: '0 0 14px', lineHeight: 1.6 }}>
              Which branch would you like to message?
            </p>
            {branches.length === 0 && !error && (
              <p style={{ fontSize: 13, color: '#9aa5a9' }}>Loading branches…</p>
            )}
            {branches.map(b => (
              <button key={b.shortCode} onClick={() => chooseBranch(b)} style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: '13px 15px', borderRadius: 12, marginBottom: 10,
                border: '1.5px solid #e5e7eb', background: '#fff',
              }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#24505a', display: 'block' }}>
                  {b.brandName || b.name}
                </span>
                {b.address && (
                  <span style={{ fontSize: 12, color: '#8a9499', display: 'block', marginTop: 2 }}>{b.address}</span>
                )}
              </button>
            ))}
            {error && <p style={{ color: '#B91C1C', fontSize: 13, marginTop: 8 }}>{error}</p>}
          </div>
        ) : (
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
                <ChatComposer
                  value={draft}
                  onChange={setDraft}
                  onSend={onSend}
                  busy={step === 'sending'}
                  disabled={step === 'sending'}
                  placeholder={placeholder}
                />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
