'use client'

// The sidebar's bell icon + unread badge + dropdown.
//
// Polls /notifications every 60 seconds while the tab is visible (we
// stop polling when document.hidden to spare the server). Clicking the
// bell toggles a floating panel with the 20 newest rows. Clicking a
// row marks it read, navigates to its href, and closes the panel.
// Everyone with a signed-in ClassPortalUser account sees it.

import { useEffect, useRef, useState } from 'react'
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead,
  type BellNotification, type NotificationKind,
} from '@/lib/session'

const KIND_META: Record<NotificationKind, { emoji: string; tone: string }> = {
  ANNOUNCEMENT:      { emoji: '📣', tone: 'text-[color:var(--deep-teal)]' },
  PAYMENT_DUE:       { emoji: '💰', tone: 'text-[color:var(--clay)]' },
  PAYMENT_RECEIVED:  { emoji: '✅', tone: 'text-[color:var(--sage)]' },
  PROMISSORY_NOTE:   { emoji: '📄', tone: 'text-[color:var(--mid-gray)]' },
  CLASS_LESSON:      { emoji: '📝', tone: 'text-[color:var(--deep-teal)]' },
  CLASS_ACTIVITY:    { emoji: '🎨', tone: 'text-[color:var(--deep-teal)]' },
  CLASS_ASSIGNMENT:  { emoji: '📋', tone: 'text-[color:var(--deep-teal)]' },
  CLASS_PROJECT:     { emoji: '🚀', tone: 'text-[color:var(--deep-teal)]' },
  CLASS_PHOTO:       { emoji: '📷', tone: 'text-[color:var(--deep-teal)]' },
  PENDING_PAYMENT:   { emoji: '💳', tone: 'text-[color:var(--clay)]' },
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = Math.max(0, now - d.getTime())
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

export default function BellIcon() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<BellNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  async function refresh() {
    const { notifications, unreadCount } = await fetchNotifications({ limit: 20 })
    setNotifications(notifications)
    setUnreadCount(unreadCount)
    setLoaded(true)
  }

  useEffect(() => {
    refresh()
    const id = window.setInterval(() => {
      if (!document.hidden) refresh()
    }, 60_000)
    return () => window.clearInterval(id)
  }, [])

  // Click outside to close.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function handleRowClick(n: BellNotification) {
    // Optimistic: strike the unread dot immediately, then PATCH in the
    // background. A failed PATCH leaves the UI slightly out of sync
    // until the next refresh, which is better than blocking the nav.
    if (!n.readAt) {
      setUnreadCount(c => Math.max(0, c - 1))
      setNotifications(rows => rows.map(r => r.id === n.id ? { ...r, readAt: new Date().toISOString() } : r))
      markNotificationRead(n.id).catch(() => {})
    }
    setOpen(false)
    if (n.href) window.location.assign(n.href)
  }

  async function handleMarkAllRead() {
    const now = new Date().toISOString()
    setUnreadCount(0)
    setNotifications(rows => rows.map(r => r.readAt ? r : { ...r, readAt: now }))
    await markAllNotificationsRead()
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13.5px] text-[color:var(--narra)] hover:bg-[color:var(--paper-2)] transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` — ${unreadCount} unread` : ''}`}
      >
        <span className="relative flex items-center justify-center w-5 h-5 shrink-0 opacity-80">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-[4px] rounded-full bg-[color:var(--clay)] text-white text-[9.5px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        <span>Notifications</span>
      </button>

      {open && (
        <div
          className="absolute left-full top-0 ml-2 w-[340px] max-h-[70vh] overflow-hidden rounded-xl shadow-xl border bg-white z-50 flex flex-col"
          style={{ borderColor: 'var(--paper-3)' }}
          role="dialog"
          aria-label="Notifications"
        >
          <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--paper-3)' }}>
            <div className="text-[12.5px] font-semibold text-[color:var(--narra)]">
              Notifications{unreadCount > 0 ? ` · ${unreadCount} unread` : ''}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[11px] text-[color:var(--deep-teal)] hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {!loaded ? (
              <div className="p-4 text-[12px] text-[color:var(--mid-gray)]">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-[12px] text-[color:var(--mid-gray)]">You&apos;re all caught up.</div>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--paper-3)' }}>
                {notifications.map(n => {
                  const meta = KIND_META[n.kind] ?? { emoji: '🔔', tone: 'text-[color:var(--mid-gray)]' }
                  const isUnread = !n.readAt
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleRowClick(n)}
                        className={`w-full text-left px-3 py-2.5 flex gap-2 hover:bg-[color:var(--paper-2)] ${isUnread ? 'bg-[color:var(--sage-tint)]/40' : ''}`}
                      >
                        <span className={`shrink-0 text-[16px] leading-tight ${meta.tone}`} aria-hidden>{meta.emoji}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-semibold text-[color:var(--narra)] truncate">{n.title}</span>
                          <span className="block text-[11.5px] text-[color:var(--mid-gray)] line-clamp-2">{n.body}</span>
                          <span className="block text-[10.5px] text-[color:var(--mid-gray)] mt-0.5">{formatRelative(n.createdAt)}</span>
                        </span>
                        {isUnread && <span className="shrink-0 w-[8px] h-[8px] rounded-full bg-[color:var(--clay)] mt-1.5" aria-hidden />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
