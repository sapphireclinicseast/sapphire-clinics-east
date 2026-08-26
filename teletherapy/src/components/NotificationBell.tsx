'use client'

// Top-right notification bell. Polls /api/notifications, shows a red unread
// count, and (Facebook-style) clears the count + greys items once the panel is
// opened. Clicking an item routes straight to its subsection.

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Inbox, MessageSquare, Heart, GraduationCap, FileText, X } from 'lucide-react'

interface Notif {
  key: string
  type: string
  title: string
  body?: string
  createdAt: string
  href: string
  unread: boolean
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return ''
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const dd = Math.floor(h / 24)
  if (dd < 7) return `${dd}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const ICON: Record<string, typeof Bell> = {
  ticket: MessageSquare,
  upload: Inbox,
  love: Heart,
  training: GraduationCap,
  supervision: FileText,
}

export default function NotificationBell() {
  const router = useRouter()
  const [items, setItems] = useState<Notif[]>([])
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setItems(data.items ?? [])
      setCount(data.unreadCount ?? 0)
    } catch { /* transient — next poll retries */ }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 60000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && count > 0) {
      const keys = items.map((i) => i.key)
      setCount(0) // clear the red badge immediately (items keep their highlight this session)
      try {
        await fetch('/api/notifications/seen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys }),
        })
      } catch { /* best-effort */ }
    }
  }

  const go = (n: Notif) => {
    setOpen(false)
    // Pseudo-href "concerns:<tab>" opens the floating Concerns widget instead
    // of navigating (staff view their ticket replies there).
    if (n.href.startsWith('concerns:')) {
      window.dispatchEvent(new CustomEvent('scei:open-concerns', { detail: n.href.slice('concerns:'.length) }))
      return
    }
    router.push(n.href)
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        className="relative p-2 rounded-full text-[var(--charcoal)] hover:bg-black/5 transition-colors"
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-24px)] max-h-[70vh] rounded-2xl border border-[var(--light-gray)] bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--light-gray)] bg-[var(--off-white)]">
            <span className="text-sm font-bold text-[var(--deep-teal)]">Notifications</span>
            <button onClick={() => setOpen(false)} className="text-[var(--mid-gray)] hover:text-[var(--charcoal)]"><X size={16} /></button>
          </div>

          <div className="overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-[var(--mid-gray)]">
                <Bell size={22} className="mx-auto mb-2 opacity-40" />
                You&apos;re all caught up.
              </div>
            ) : (
              items.map((n) => {
                const Icon = ICON[n.type] ?? Bell
                return (
                  <button
                    key={n.key}
                    onClick={() => go(n)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-[var(--light-gray)] hover:bg-[var(--off-white)] transition-colors ${n.unread ? 'bg-[var(--sage-tint)]' : ''}`}
                  >
                    <span className={`mt-0.5 shrink-0 ${n.unread ? 'text-[var(--deep-teal)]' : 'text-[var(--mid-gray)]'}`}><Icon size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13px] leading-snug ${n.unread ? 'font-semibold text-[var(--charcoal)]' : 'text-[var(--mid-gray)]'}`}>{n.title}</span>
                      {n.body && <span className="block text-[11px] text-[var(--mid-gray)] truncate">{n.body}</span>}
                      <span className="block text-[10px] text-[var(--mid-gray)] mt-0.5">{timeAgo(n.createdAt)}</span>
                    </span>
                    {n.unread && <span className="mt-1.5 w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
