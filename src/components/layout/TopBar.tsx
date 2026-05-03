'use client'

import { signOut } from 'next-auth/react'
import { LogOut, Bell, User, Menu } from 'lucide-react'
import type { Session } from 'next-auth'

interface TopBarProps {
  user: Session['user']
  onMenuClick?: () => void
}

export default function TopBar({ user, onMenuClick }: TopBarProps) {
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
        {/* Notification bell placeholder */}
        <button
          className="p-2 rounded-lg transition-colors hover:bg-gray-100"
          style={{ color: 'var(--mid-gray)' }}
          title="Notifications"
        >
          <Bell size={18} />
        </button>

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
