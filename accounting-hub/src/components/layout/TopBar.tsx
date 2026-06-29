'use client'

import { useState, useRef, useEffect } from 'react'
import { signOut } from 'next-auth/react'
import { Menu, LogOut, ChevronDown } from 'lucide-react'
import GlobalSearch from './GlobalSearch'

interface TopBarProps {
  user: {
    name?: string | null
    email?: string | null
    role?: string
  }
  onMenuClick: () => void
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  ACCOUNTANT: 'Accountant',
  VIEWER: 'Viewer',
  SBEA_ADMIN: 'AHEA Admin',
  SBGH_ADMIN: 'AHGH Admin',
  VERDANA_ADMIN: 'Verdana Admin',
  SBEA_FRONTDESK: 'AHEA Front Desk',
  SBGH_FRONTDESK: 'AHGH Front Desk',
}

export default function TopBar({ user, onMenuClick }: TopBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mouseup', handleClickOutside)
    return () => document.removeEventListener('mouseup', handleClickOutside)
  }, [])

  const initials = (user.name || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-4 lg:px-6 h-16 border-b"
      style={{ background: 'white', borderColor: 'var(--light-gray)' }}
    >
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
        style={{ color: 'var(--charcoal)' }}
      >
        <Menu size={22} />
      </button>

      <div className="flex-1 flex justify-center px-2 lg:px-4">
        <GlobalSearch />
      </div>

      {/* User menu */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
            style={{ background: 'var(--teal)' }}
          >
            {initials}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
              {user.name}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>
              {ROLE_LABELS[user.role || ''] || user.role}
            </p>
          </div>
          <ChevronDown size={14} style={{ color: 'var(--mid-gray)' }} />
        </button>

        {dropdownOpen && (
          <div
            className="absolute right-0 top-full mt-2 w-56 rounded-xl shadow-lg border py-1 z-50"
            style={{ background: 'white', borderColor: 'var(--light-gray)' }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
                {user.name}
              </p>
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                {user.email}
              </p>
            </div>
            <div className="py-1">
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors text-red-600"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
