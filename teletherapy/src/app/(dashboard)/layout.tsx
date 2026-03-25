'use client'

import { useSession, signOut } from 'next-auth/react'
import { SessionProvider } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Video,
  LayoutDashboard,
  Shield,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isAdmin = session?.user?.role === 'ADMIN'

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    ...(isAdmin
      ? [{ href: '/admin', label: 'Admin Panel', icon: Shield }]
      : []),
  ]

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-40 w-[260px] flex flex-col transition-transform duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{
          background: 'linear-gradient(180deg, #0A1012 0%, #1C2B30 100%)',
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, var(--teal), var(--bright-teal))' }}>
            <Video className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[14px] text-white leading-tight tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              SCEI Teletherapy
            </p>
            <p className="text-[10px] text-white/40 mt-0.5">Sapphire Clinics East</p>
          </div>
          <button
            className="lg:hidden text-white/50 hover:text-white p-1"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Divider */}
        <div className="mx-5 h-px bg-white/8" />

        {/* Nav */}
        <nav className="flex-1 py-5 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200',
                  active
                    ? 'text-white shadow-[0_2px_8px_rgba(26,123,138,0.3)]'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                )}
                style={active ? { background: 'linear-gradient(135deg, var(--teal), var(--deep-teal))' } : {}}
              >
                <Icon size={18} />
                {item.label}
                {active && <ChevronRight size={14} className="ml-auto opacity-60" />}
              </Link>
            )
          })}
        </nav>

        {/* User card */}
        <div className="mx-3 mb-4 p-4 rounded-xl bg-white/5 border border-white/8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--teal)] to-[var(--bright-teal)] flex items-center justify-center text-white text-[12px] font-bold shrink-0">
              {session?.user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2) ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white/90 truncate">{session?.user?.name}</p>
              <p className="text-[11px] text-white/40">
                {session?.user?.department} &middot; {session?.user?.branch}
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-2 text-[12px] text-white/40 hover:text-white/70 transition-colors w-full"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3.5 bg-white border-b border-[var(--light-gray)]">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-[var(--charcoal)] hover:text-[var(--teal)] transition-colors"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <Video size={18} className="text-[var(--teal)]" />
            <h1 className="font-bold text-[15px] text-[var(--charcoal)]" style={{ fontFamily: 'var(--font-display)' }}>
              SCEI Teletherapy
            </h1>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-5 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionProvider>
      <DashboardContent>{children}</DashboardContent>
    </SessionProvider>
  )
}
