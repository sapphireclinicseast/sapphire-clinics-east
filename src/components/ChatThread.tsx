'use client'

// Messenger-style chat, shared by the enquirer's page and the staff inbox so
// the two cannot drift into looking like different products.
//
// "Mine" is whoever is reading: the enquirer sees their own messages on the
// right, the front desk sees the clinic's replies on the right. Same component,
// opposite sides — which is why the caller passes `mineIsStaff` rather than the
// component deciding.

import { useEffect, useRef } from 'react'

export interface ChatMessage {
  id?: string
  fromStaff: boolean
  author: string
  body: string
  createdAt: string | Date
}

function dayLabel(d: Date): string {
  const today = new Date()
  const y = new Date(today); y.setDate(y.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, y)) return 'Yesterday'
  return d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
}

const time = (d: Date) => d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

/** Two initials, for the little avatar beside the other side's messages. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export default function ChatThread({
  messages,
  mineIsStaff,
  accent = '#1a7b8a',
  maxHeight,
  emptyNote,
}: {
  messages: ChatMessage[]
  /** true in the staff inbox: clinic replies are "mine". */
  mineIsStaff: boolean
  accent?: string
  maxHeight?: number
  emptyNote?: string
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Land on the newest message, like any chat. `block: 'nearest'` keeps the
  // scroll inside this pane instead of yanking the whole page down to it.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length])

  if (!messages.length) {
    return <p style={{ fontSize: 13, color: '#9aa5a9', textAlign: 'center', padding: '20px 0' }}>{emptyNote ?? 'No messages yet.'}</p>
  }

  return (
    <div
      ref={scrollRef}
      style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        overflowY: maxHeight ? 'auto' : undefined,
        maxHeight, padding: '4px 2px',
      }}
    >
      {messages.map((m, i) => {
        const d = new Date(m.createdAt)
        const prev = i > 0 ? messages[i - 1] : null
        const next = i < messages.length - 1 ? messages[i + 1] : null
        const mine = m.fromStaff === mineIsStaff

        const newDay = !prev || new Date(prev.createdAt).toDateString() !== d.toDateString()
        // A run is consecutive messages from the same side on the same day —
        // Messenger shows one name and one tail per run, not per message.
        const startsRun = newDay || !prev || prev.fromStaff !== m.fromStaff
        const endsRun =
          !next ||
          next.fromStaff !== m.fromStaff ||
          new Date(next.createdAt).toDateString() !== d.toDateString()

        const radius = mine
          ? `16px 16px ${endsRun ? '4px' : '16px'} 16px`
          : `16px 16px 16px ${endsRun ? '4px' : '16px'}`

        return (
          <div key={m.id ?? i}>
            {newDay && (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 10px' }}>
                <span style={{ fontSize: 11, color: '#9aa5a9', background: 'rgba(0,0,0,0.035)', padding: '3px 10px', borderRadius: 999 }}>
                  {dayLabel(d)}
                </span>
              </div>
            )}

            {startsRun && !mine && (
              <p style={{ fontSize: 11, fontWeight: 700, color: '#8a9499', margin: '8px 0 3px 38px' }}>
                {m.author}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 6, marginTop: startsRun ? 0 : 2 }}>
              {!mine && (
                // Spacer keeps a run's bubbles on one line even though only the
                // last of the run shows an avatar.
                <div style={{ width: 26, flexShrink: 0 }}>
                  {endsRun && (
                    <div style={{
                      width: 26, height: 26, borderRadius: 999, background: accent, color: '#fff',
                      fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {initials(m.author)}
                    </div>
                  )}
                </div>
              )}

              <div
                title={`${dayLabel(d)} at ${time(d)}`}
                style={{
                  maxWidth: '74%',
                  background: mine ? accent : '#F1F2F4',
                  color: mine ? '#fff' : '#1f2937',
                  borderRadius: radius,
                  padding: '8px 13px',
                  fontSize: 14,
                  lineHeight: 1.45,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {m.body}
              </div>
            </div>

            {endsRun && (
              <p style={{
                fontSize: 10.5, color: '#9aa5a9', margin: '3px 0 2px',
                textAlign: mine ? 'right' : 'left', paddingLeft: mine ? 0 : 38,
              }}>
                {time(d)}
              </p>
            )}
          </div>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}

/**
 * Composer bar. Enter sends, Shift+Enter makes a new line — the convention
 * every chat uses, and the one people will try first.
 */
export function ChatComposer({
  value, onChange, onSend, busy, placeholder, accent = '#1a7b8a', disabled,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  busy?: boolean
  placeholder?: string
  accent?: string
  disabled?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Grow with the text, up to a point, then scroll — a fixed box either wastes
  // space on one-liners or hides the end of a long reply.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [value])

  const canSend = !busy && !disabled && value.trim().length > 0

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 8,
      background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 22,
      padding: '6px 6px 6px 14px',
    }}>
      <textarea
        ref={ref}
        value={value}
        rows={1}
        disabled={disabled}
        placeholder={placeholder ?? 'Write a message…'}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (canSend) onSend()
          }
        }}
        style={{
          flex: 1, border: 0, outline: 'none', resize: 'none', background: 'transparent',
          fontSize: 14, lineHeight: 1.45, color: '#1f2937', fontFamily: 'inherit',
          padding: '7px 0', maxHeight: 140,
        }}
      />
      <button
        type="button"
        onClick={() => canSend && onSend()}
        disabled={!canSend}
        aria-label="Send message"
        style={{
          flexShrink: 0, width: 34, height: 34, borderRadius: 999, border: 0,
          background: canSend ? accent : '#E5E7EB',
          color: canSend ? '#fff' : '#9CA3AF',
          cursor: canSend ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
        </svg>
      </button>
    </div>
  )
}
