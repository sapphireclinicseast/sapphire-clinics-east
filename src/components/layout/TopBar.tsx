'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import { LogOut, Bell, User, Menu } from 'lucide-react'
import type { Session } from 'next-auth'

interface NotifItem {
  id: string
  type: 'REGISTRATION' | 'BOOKING' | 'FORM_RESPONSE'
  name: string
  branch: string
  status?: string
  formKey?: string
  createdAt: string
  href: string
}

const BRANCH_LABEL: Record<string, string> = { SBEA: 'East', SBGH: 'GH' }

function todayKey() {
  return `SCEI_NOTIF_SEEN_${new Date().toISOString().slice(0, 10)}`
}

function getSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(todayKey())
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function persistSeen(ids: Set<string>) {
  try {
    localStorage.setItem(todayKey(), JSON.stringify([...ids]))
  } catch {}
}

interface TopBarProps {
  user: Session['user']
  onMenuClick?: () => void
}

export default function TopBar({ user, onMenuClick }: TopBarProps) {
  const [items, setItems] = useState<NotifItem[]>([])
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const unseenCount = items.filter((i) => !seenIds.has(i.id)).length

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      setItems(data.items ?? [])
      setSeenIds(getSeenIds())
    } catch {}
  }, [])

  useEffect(() => {
    fetchNotifs()
    const id = setInterval(fetchNotifs, 60_000)
    return () => clearInterval(id)
  }, [fetchNotifs])

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function markOneSeen(id: string) {
    const next = new Set(seenIds)
    next.add(id)
    persistSeen(next)
    setSeenIds(next)
  }

  function markAllSeen() {
    const next = new Set(items.map((i) => i.id))
    persistSeen(next)
    setSeenIds(next)
  }

  function handleItemClick(item: NotifItem) {
    markOneSeen(item.id)
    setOpen(false)
    window.location.href = item.href
  }

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
        {/* Notification bell */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="relative p-2 rounded-lg transition-colors hover:bg-gray-100"
            style={{ color: open ? 'var(--teal)' : 'var(--mid-gray)' }}
            title="Notifications"
          >
            <Bell size={18} />
            {unseenCount > 0 && (
              <span
                className="absolute top-0.5 right-0.5 min-w-[16px] h-4 rounded-full text-white flex items-center justify-center font-bold px-0.5"
                style={{ fontSize: '10px', background: '#ef4444', lineHeight: 1 }}
              >
                {unseenCount > 9 ? '9+' : unseenCount}
              </span>
            )}
          </button>

          {open && (
            <div
              className="absolute right-0 top-11 bg-white rounded-xl shadow-lg border z-50 overflow-hidden"
              style={{ width: '320px', borderColor: 'var(--light-gray)' }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom: '1px solid var(--light-gray)' }}
              >
                <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                  Notifications
                </span>
                {unseenCount > 0 && (
                  <button
                    className="text-xs font-medium hover:underline"
                    style={{ color: 'var(--teal)' }}
                    onClick={markAllSeen}
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="overflow-y-auto divide-y divide-gray-100" style={{ maxHeight: '340px' }}>
                {items.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-center" style={{ color: 'var(--mid-gray)' }}>
                    All caught up!
                  </div>
                ) : (
                  items.map((item) => {
                    const isNew = !seenIds.has(item.id)
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        className="w-full text-left px-4 py-3 transition-colors hover:bg-gray-50 flex items-start gap-2.5"
                        style={{ background: isNew ? '#f0fdfa' : '#fff' }}
                      >
                        {/* New dot */}
                        <div className="flex-shrink-0 mt-1.5">
                          <span
                            className="block w-2 h-2 rounded-full"
                            style={{ background: isNew ? 'var(--teal)' : 'transparent', border: isNew ? 'none' : '1.5px solid #d1d5db' }}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="text-xs font-semibold truncate"
                              style={{ color: isNew ? 'var(--charcoal)' : '#6b7280' }}
                            >
                              {item.name}
                            </span>
                            {item.branch && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                                style={{ background: '#e5f6f8', color: 'var(--teal)' }}
                              >
                                {BRANCH_LABEL[item.branch] ?? item.branch}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: '#6b7280' }}>
                            {item.type === 'REGISTRATION'
                              ? 'New Patient added in Patient CRM'
                              : item.type === 'FORM_RESPONSE'
                              ? 'New form submission'
                              : item.status === 'PAID'
                              ? 'Online booking · Paid — add to deck'
                              : item.status === 'APPROVED'
                              ? 'Online booking · Approved, awaiting payment'
                              : 'Online booking · Needs confirmation'}
                          </div>
                          <div className="text-[10px] mt-0.5" style={{ color: '#9ca3af' }}>
                            {new Date(item.createdAt).toLocaleString('en-PH', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
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
