'use client'

/**
 * View-only manual reader. Renders server-rasterized PAGE IMAGES (never
 * the source PDF) with a book page-turn animation. Download / print /
 * drag-save are all suppressed: there is no PDF in the DOM, the context
 * menu is disabled, images are non-draggable and non-selectable.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, MessageSquare, Send, Loader2, Sparkles } from 'lucide-react'

interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  pages?: number[]
  error?: boolean
}

export interface ManualMeta {
  id: string
  name: string
  version: string
  pageCount: number
  sizeBytes: number
  departments: string[]
}

export default function ManualViewer({
  manual,
  onClose,
}: {
  manual: ManualMeta
  onClose: () => void
}) {
  const total = Math.max(1, manual.pageCount)
  const [index, setIndex] = useState(0) // 0-based current page
  const [dir, setDir] = useState<'next' | 'prev'>('next')
  const [loaded, setLoaded] = useState(false)

  // Chatbot state
  const [chatOpen, setChatOpen] = useState(false)
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const msgEndRef = useRef<HTMLDivElement>(null)

  const go = useCallback(
    (d: 'next' | 'prev') => {
      setIndex((prev) => {
        const nx = d === 'next' ? prev + 1 : prev - 1
        if (nx < 0 || nx >= total) return prev
        setDir(d)
        setLoaded(false)
        return nx
      })
    },
    [total],
  )

  const goToPage = useCallback(
    (p: number) => {
      if (p < 1 || p > total) return
      setIndex((prev) => {
        if (p - 1 === prev) return prev
        setDir(p - 1 > prev ? 'next' : 'prev')
        setLoaded(false)
        return p - 1
      })
    },
    [total],
  )

  async function ask(e?: React.FormEvent) {
    e?.preventDefault()
    const q = input.trim()
    if (!q || sending) return
    setMsgs((m) => [...m, { role: 'user', text: q }])
    setInput('')
    setSending(true)
    try {
      const res = await fetch(`/api/manuals/${manual.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = (await res.json()) as { answer?: string; pages?: number[]; error?: string }
      if (!res.ok) {
        setMsgs((m) => [...m, { role: 'assistant', text: data.error || 'Sorry, something went wrong.', error: true }])
      } else {
        setMsgs((m) => [...m, { role: 'assistant', text: data.answer || '', pages: data.pages }])
      }
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', text: 'Network error — please try again.', error: true }])
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, sending])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack arrows/Escape while typing in the chat box.
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowRight') go('next')
      else if (e.key === 'ArrowLeft') go('prev')
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  const pageNum = index + 1
  const src = `/api/manuals/${manual.id}/page/${pageNum}`
  const preloadNext = index + 1 < total ? `/api/manuals/${manual.id}/page/${pageNum + 1}` : null
  const preloadPrev = index - 1 >= 0 ? `/api/manuals/${manual.id}/page/${pageNum - 1}` : null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm"
      onContextMenu={(e) => e.preventDefault()}
      style={{ userSelect: 'none' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 text-white/90 border-b border-white/10">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[14px] truncate">{manual.name}</p>
          <p className="text-[11px] text-white/50">
            {manual.version ? `Version ${manual.version} · ` : ''}
            {manual.departments.join(', ')} · View-only
          </p>
        </div>
        <button
          onClick={() => setChatOpen((v) => !v)}
          className={
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ' +
            (chatOpen ? 'bg-white/20 text-white' : 'bg-white/10 text-white/80 hover:bg-white/15')
          }
          aria-label="Ask about this manual"
        >
          <Sparkles size={14} /> Ask
        </button>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      {/* Book stage */}
      <div
        className="flex-1 flex items-center justify-center gap-2 sm:gap-4 px-2 sm:px-6 py-4 overflow-hidden"
        style={{ perspective: '2200px' }}
      >
        <button
          onClick={() => go('prev')}
          disabled={index === 0}
          className="shrink-0 p-2 sm:p-3 rounded-full text-white/80 bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed transition"
          aria-label="Previous page"
        >
          <ChevronLeft size={22} />
        </button>

        <div className="relative h-full flex items-center justify-center" style={{ maxWidth: '760px', width: '100%' }}>
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-8 w-8 rounded-full border-2 border-white/30 border-t-white/80 animate-spin" />
            </div>
          )}
          {/* key=index remounts the sheet so the flip animation replays each turn */}
          <img
            key={index}
            src={src}
            alt={`Page ${pageNum}`}
            draggable={false}
            onLoad={() => setLoaded(true)}
            className={dir === 'next' ? 'manual-sheet flip-next' : 'manual-sheet flip-prev'}
            style={{
              maxHeight: '100%',
              maxWidth: '100%',
              objectFit: 'contain',
              WebkitUserDrag: 'none',
              pointerEvents: 'none',
              opacity: loaded ? 1 : 0,
            } as React.CSSProperties}
          />
        </div>

        <button
          onClick={() => go('next')}
          disabled={index >= total - 1}
          className="shrink-0 p-2 sm:p-3 rounded-full text-white/80 bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed transition"
          aria-label="Next page"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 text-center text-white/70 text-[12px] border-t border-white/10">
        Page {pageNum} of {total}
      </div>

      {/* Hidden preloads for instant neighboring turns */}
      {preloadNext && <img src={preloadNext} alt="" aria-hidden className="hidden" />}
      {preloadPrev && <img src={preloadPrev} alt="" aria-hidden className="hidden" />}

      {/* Chat drawer */}
      {chatOpen && (
        <div className="absolute inset-y-0 right-0 w-full sm:w-[400px] bg-white flex flex-col shadow-[-8px_0_30px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--light-gray)]">
            <MessageSquare size={16} className="text-[var(--teal)]" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[var(--charcoal)]">Ask about this manual</p>
              <p className="text-[10px] text-[var(--charcoal)]/50">Answers come only from this manual</p>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              className="p-1.5 rounded-lg text-[var(--charcoal)]/50 hover:bg-[var(--light-gray)]/50"
              aria-label="Close chat"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {msgs.length === 0 && (
              <div className="text-[12px] text-[var(--charcoal)]/50 bg-[var(--light-gray)]/30 rounded-xl p-3">
                Ask a question about <span className="font-semibold">{manual.name}</span> — e.g. &ldquo;What are the
                documentation deadlines?&rdquo;. The assistant answers only from the manual and cites page numbers.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ' +
                    (m.role === 'user'
                      ? 'bg-[var(--teal)] text-white rounded-br-sm'
                      : m.error
                        ? 'bg-red-50 text-red-700 border border-red-100 rounded-bl-sm'
                        : 'bg-[var(--light-gray)]/50 text-[var(--charcoal)] rounded-bl-sm')
                  }
                >
                  {m.text}
                  {m.role === 'assistant' && m.pages && m.pages.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.pages.map((p) => (
                        <button
                          key={p}
                          onClick={() => goToPage(p)}
                          className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--teal)]/10 text-[var(--teal)] hover:bg-[var(--teal)]/20 transition-colors"
                        >
                          Go to p. {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm px-3.5 py-2.5 bg-[var(--light-gray)]/50 text-[var(--charcoal)]/60 text-[13px] inline-flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Reading the manual…
                </div>
              </div>
            )}
            <div ref={msgEndRef} />
          </div>

          <form onSubmit={ask} className="border-t border-[var(--light-gray)] p-3 flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  ask()
                }
              }}
              rows={1}
              placeholder="Ask a question…"
              className="flex-1 resize-none rounded-xl border border-[var(--light-gray)] px-3 py-2 text-[13px] text-[var(--charcoal)] focus:outline-none focus:border-[var(--teal)] max-h-28"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition"
              style={{ background: 'linear-gradient(135deg, var(--teal), var(--bright-teal))' }}
              aria-label="Send"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      )}

      <style>{`
        .manual-sheet {
          background: #fff;
          border-radius: 2px;
          box-shadow: 0 18px 50px rgba(0,0,0,.55);
        }
        @keyframes manualFlipNext {
          0%   { transform: rotateY(-105deg); opacity: .15; }
          100% { transform: rotateY(0deg);    opacity: 1; }
        }
        @keyframes manualFlipPrev {
          0%   { transform: rotateY(105deg);  opacity: .15; }
          100% { transform: rotateY(0deg);    opacity: 1; }
        }
        .flip-next { transform-origin: left center;  animation: manualFlipNext .5s cubic-bezier(.2,.7,.3,1); }
        .flip-prev { transform-origin: right center; animation: manualFlipPrev .5s cubic-bezier(.2,.7,.3,1); }
        @media (prefers-reduced-motion: reduce) {
          .flip-next, .flip-prev { animation: none; }
        }
      `}</style>
    </div>
  )
}
