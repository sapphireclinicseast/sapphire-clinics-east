'use client'

// Floating chatbot for the patient portal. Quick-reply FAQ + Claude fallback.
// The marketing app exposes /api/public/chat to answer free-form questions.

import { useEffect, useRef, useState } from 'react'

interface Msg {
  role: 'bot' | 'user'
  text: string
  isTyping?: boolean
}

// Fallback copy — used until /chat-config loads, or if it's unreachable. The
// live values are admin-editable in the Aurora admin console.
const DEFAULT_QUICK_REPLIES: { label: string; q: string }[] = [
  { label: 'How do I book?', q: 'How do I book an appointment?' },
  { label: 'What are your services?', q: 'What services do you offer?' },
  { label: 'Downpayment', q: 'How much is the downpayment?' },
  { label: 'Clinic hours', q: 'What are your clinic hours?' },
  { label: 'Teletherapy', q: 'Do you offer teletherapy?' },
  { label: 'Cancellation', q: 'What is your cancellation policy?' },
]

const DEFAULT_INTRO =
  "Hi! I'm Aurora, the Sapphire Clinics East assistant. Ask me anything about booking, services, or our clinics — or tap one of the quick questions below."

export default function Chatbot() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'bot', text: DEFAULT_INTRO }])
  const [quickReplies, setQuickReplies] = useState(DEFAULT_QUICK_REPLIES)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [unread, setUnread] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, open])

  // Pull the admin-editable intro + quick replies. Falls back to defaults on
  // failure so the widget always works.
  useEffect(() => {
    let cancelled = false
    fetch('/api/booking-proxy/chat-config')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (Array.isArray(d?.quickReplies) && d.quickReplies.length) {
          setQuickReplies(d.quickReplies)
        }
        if (typeof d?.intro === 'string' && d.intro.trim()) {
          // Only replace the greeting if the user hasn't started chatting yet.
          setMsgs((m) => (m.length === 1 ? [{ role: 'bot', text: d.intro }] : m))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function ask(q: string) {
    if (!q.trim() || busy) return
    const question = q.trim()
    setMsgs((m) => [...m, { role: 'user', text: question }, { role: 'bot', text: '', isTyping: true }])
    setInput('')
    setBusy(true)
    try {
      const res = await fetch('/api/booking-proxy/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const data = await res.json()
      const answer = (data?.answer as string) || "Sorry, I'm having trouble responding right now. Please try again, or call the clinic directly."
      setMsgs((m) => {
        const copy = m.slice(0, -1)
        return [...copy, { role: 'bot', text: answer }]
      })
      if (!open) setUnread(true)
    } catch {
      setMsgs((m) => {
        const copy = m.slice(0, -1)
        return [...copy, { role: 'bot', text: "Sorry, I couldn't reach the server. Please try again later." }]
      })
    } finally {
      setBusy(false)
    }
  }

  function toggle() {
    setOpen((v) => !v)
    if (!open) setUnread(false)
  }

  return (
    <>
      {/* Launcher */}
      <button
        onClick={toggle}
        aria-label={open ? 'Close chat' : 'Open chat'}
        className="fixed bottom-5 right-5 z-[60] w-14 h-14 rounded-full shadow-[0_8px_32px_rgba(46,94,90,0.3)] hover:shadow-[0_12px_40px_rgba(46,94,90,0.45)] transition-all hover:scale-105 flex items-center justify-center text-white text-2xl"
        style={{
          background: 'linear-gradient(135deg, var(--teal), var(--deep-teal))',
        }}
      >
        {open ? '×' : '💬'}
        {!open && unread && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[color:var(--gold)] border-2 border-white"></span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-[60] w-[min(92vw,380px)] h-[min(80vh,560px)] bg-white rounded-3xl shadow-[0_24px_60px_rgba(46,94,90,0.25)] border border-[color:var(--light-gray)] flex flex-col overflow-hidden animate-gate">
          {/* Header */}
          <div className="hero-gradient px-5 py-4 flex items-center gap-3 relative">
            <div className="relative z-10 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl">
              💬
            </div>
            <div className="relative z-10 flex-1 min-w-0">
              <div className="font-semibold text-white leading-tight" style={{ fontFamily: 'var(--font-display)' }}>Aurora · SCEI Assistant</div>
              <div className="text-[11px] text-white/80 flex items-center gap-1.5" style={{ fontFamily: 'var(--font-display)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Usually replies in seconds
              </div>
            </div>
            <button onClick={toggle} className="relative z-10 text-white/80 hover:text-white text-xl" aria-label="Close">×</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[color:var(--off-white)]">
            {msgs.map((m, i) => (
              <MsgBubble key={i} m={m} />
            ))}
            <div ref={endRef} />
          </div>

          {/* Quick replies */}
          {msgs.length <= 2 && (
            <div className="px-3 pb-2 pt-1 border-t border-[color:var(--light-gray)] bg-white">
              <div className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--mid-gray)] px-1 mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>
                Common questions
              </div>
              <div className="flex flex-wrap gap-1.5">
                {quickReplies.map((q) => (
                  <button
                    key={q.label}
                    onClick={() => ask(q.q)}
                    disabled={busy}
                    className="text-[11.5px] px-2.5 py-1.5 rounded-full bg-[color:var(--pale-teal)] text-[color:var(--deep-teal)] hover:bg-[color:var(--bright-teal)] hover:text-white transition-colors disabled:opacity-50"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); ask(input) }}
            className="p-3 border-t border-[color:var(--light-gray)] bg-white flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question…"
              className="flex-1 px-3 py-2 rounded-xl border border-[color:var(--light-gray)] text-sm focus:outline-none focus:border-[color:var(--teal)] focus:ring-2 focus:ring-[color:var(--teal)]/20"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="shrink-0 w-10 h-10 rounded-xl text-white flex items-center justify-center disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, var(--teal), var(--deep-teal))' }}
              aria-label="Send"
            >
              →
            </button>
          </form>
        </div>
      )}
    </>
  )
}

function MsgBubble({ m }: { m: Msg }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end animate-fade-up">
        <div
          className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-md text-sm text-white"
          style={{ background: 'linear-gradient(135deg, var(--teal), var(--deep-teal))' }}
        >
          {m.text}
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-end gap-2 animate-fade-up">
      <div className="w-7 h-7 rounded-full bg-[color:var(--pale-teal)] flex items-center justify-center text-sm shrink-0">💬</div>
      <div className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-bl-md text-sm bg-white border border-[color:var(--light-gray)] text-[color:var(--charcoal)] whitespace-pre-wrap">
        {m.isTyping ? <TypingDots /> : m.text}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--mid-gray)] animate-bounce" style={{ animationDelay: '0ms' }}></span>
      <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--mid-gray)] animate-bounce" style={{ animationDelay: '150ms' }}></span>
      <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--mid-gray)] animate-bounce" style={{ animationDelay: '300ms' }}></span>
    </span>
  )
}
