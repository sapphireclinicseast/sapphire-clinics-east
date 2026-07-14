'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import { LogOut, Bell, User, Menu, CalendarCheck, FileText } from 'lucide-react'
import Link from 'next/link'
import type { Session } from 'next-auth'

interface TopBarProps {
  user: Session['user']
  onMenuClick?: () => void
}

interface NotifCounts {
  bookings: number
  forms: number
}

const POLL_MS = 5 * 60 * 1000 // poll every 5 minutes

export default function TopBar({ user, onMenuClick }: TopBarProps) {
  const [counts, setCounts]       = useState<NotifCounts>({ bookings: 0, forms: 0 })
  const [open, setOpen]           = useState(false)
  const [dismissedAt, setDismissedAt] = useState<string | null>(null)
  const dropdownRef               = useRef<HTMLDivElement>(null)

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setCounts({ bookings: data.bookings ?? 0, forms: data.forms ?? 0 })
      setDismissedAt(data.dismissedAt ?? null)
    } catch {
      // silently ignore network errors — bell stays at current value
    }
  }, [])

  // Initial fetch + 5-minute poll + re-fetch on window focus
  useEffect(() => {
    fetchCounts()
    const interval = setInterval(fetchCounts, POLL_MS)
    window.addEventListener('focus', fetchCounts)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', fetchCounts)
    }
  }, [fetchCounts])

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  function dismiss() {
    // Optimistic: clear the badge immediately, fire-and-forget the server update
    setCounts({ bookings: 0, forms: 0 })
    setOpen(false)
    fetch('/api/notifications/dismiss', { method: 'POST' }).catch(() => {})
  }

  const total = counts.bookings + counts.forms

  return (
    <header
      className="flex items-center justify-between px-4 md:px-6 py-3 flex-shrink-0"
      style={{
        background: '#fff',
        borderBottom: '1px solid var(--light-gray)',
        height: '60px',
      }}
    >
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="md:hidden p-2 rounded-lg transition-colors hover:bg-gray-100"
        style={{ color: 'var(--mid-gray)' }}
      >
        <Menu size={20} />
      </button>
      <div className="hidden md:block" />

      <div className="flex items-center gap-3">

        {/* ── Notification bell ─────────────────────────────────────────────── */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="p-2 rounded-lg transition-colors hover:bg-gray-100"
            style={{ color: total > 0 ? 'var(--teal)' : 'var(--mid-gray)', position: 'relative' }}
            title="Notifications"
          >
            <Bell size={18} />
            {total > 0 && (
              <span
                style={{
                  position:       'absolute',
                  top:            2,
                  right:          2,
                  minWidth:       16,
                  height:         16,
                  borderRadius:   9999,
                  background:     '#DC2626',
                  color:          '#fff',
                  fontSize:       10,
                  fontWeight:     700,
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  padding:        '0 3px',
                  lineHeight:     1,
                }}
              >
                {total > 99 ? '99+' : total}
              </span>
            )}
          </button>

          {open && (
            <div
              style={{
                position:     'absolute',
                right:        0,
                top:          '100%',
                marginTop:    8,
                width:        288,
                background:   '#fff',
                border:       '1px solid var(--light-gray)',
                borderRadius: 12,
                boxShadow:    '0 8px 24px rgba(0,0,0,0.10)',
                zIndex:       50,
                overflow:     'hidden',
              }}
            >
              {/* Header */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--light-gray)' }}>
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--charcoal)', margin: 0 }}>
                  Notifications
                </p>
              </div>

              {total === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: 'var(--mid-gray)', margin: 0 }}>All caught up!</p>
                </div>
              ) : (
                <>
                  {counts.bookings > 0 && (
                    <Link
                      href="/decking"
                      onClick={dismiss}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: counts.forms > 0 ? '1px solid var(--light-gray)' : 'none', textDecoration: 'none' }}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <div style={{ width: 34, height: 34, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <CalendarCheck size={16} style={{ color: '#2563EB' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--charcoal)', margin: 0 }}>
                          {counts.bookings} new booking{counts.bookings !== 1 ? 's' : ''}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--mid-gray)', margin: '2px 0 0' }}>
                          New patient appointment requests
                        </p>
                      </div>
                    </Link>
                  )}

                  {counts.forms > 0 && (
                    <Link
                      href={dismissedAt ? `/registration-forms?newSince=${encodeURIComponent(dismissedAt)}` : '/registration-forms'}
                      onClick={dismiss}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', textDecoration: 'none' }}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <div style={{ width: 34, height: 34, borderRadius: 8, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <FileText size={16} style={{ color: '#16A34A' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--charcoal)', margin: 0 }}>
                          {counts.forms} new form entr{counts.forms !== 1 ? 'ies' : 'y'}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--mid-gray)', margin: '2px 0 0' }}>
                          New registration form submissions
                        </p>
                      </div>
                    </Link>
                  )}
                </>
              )}

              {total > 0 && (
                <div style={{ padding: '8px 16px', borderTop: '1px solid var(--light-gray)' }}>
                  <button
                    onClick={dismiss}
                    style={{ width: '100%', textAlign: 'center', fontSize: 12, fontWeight: 500, color: 'var(--mid-gray)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', borderRadius: 8 }}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    Mark all as read
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── User info ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
            style={{ background: 'var(--teal)' }}
          >
            {user?.name?.[0]?.toUpperCase() ?? <User size={14} />}
          </div>
          <div className="hidden sm:block">
            <p
              className="text-sm font-semibold leading-tight"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
            >
              {user?.name}
            </p>
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
              {(user as { role?: string })?.role ?? 'Staff'}
            </p>
          </div>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-red-50"
          style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-body)' }}
          title="Sign out"
        >
          <LogOut size={14} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  )
}
