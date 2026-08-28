'use client'

import { signOut } from 'next-auth/react'
import { LogOut, Bell, User, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import type { Session } from 'next-auth'

interface TopBarProps {
  user: Session['user']
  onMenuClick?: () => void
}

export default function TopBar({ user, onMenuClick }: TopBarProps) {
  return (
    <header
      className="flex items-center justify-between px-4 md:px-6 py-3 flex-shrink-0 bg-white"
      style={{ borderBottom: '1px solid var(--border)', height: '60px' }}
    >
      {/* Hamburger — mobile only */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenuClick}
        className="md:hidden text-[var(--muted-foreground)]"
      >
        <Menu size={20} />
      </Button>
      <div className="hidden md:block" />

      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <Button
          variant="ghost"
          size="icon"
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          title="Notifications"
        >
          <Bell size={18} />
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* User menu */}
        <div className="flex items-center gap-2.5">
          <Avatar>
            <AvatarFallback>
              {user?.name?.[0]?.toUpperCase() ?? <User size={14} />}
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:block">
            <p
              className="text-sm font-semibold leading-tight"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
            >
              {user?.name}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {(user as { role?: string })?.role ?? 'Staff'}
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-[var(--muted-foreground)] hover:text-red-600 hover:bg-red-50 gap-1.5"
          title="Sign out"
        >
          <LogOut size={14} />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  )
}
