'use client'

import { useSession, signOut } from 'next-auth/react'
import { SessionProvider } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Video,
  LayoutDashboard,
  Shield,
  Users,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Settings,
  Heart,
  GraduationCap,
  CalendarDays,
  Wallet,
  FileText,
  HeartPulse,
  BookOpen,
  Contact,
  HeartHandshake,
  User,
  HandCoins,
  LifeBuoy,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { allowedSections } from '@/lib/section-access'
import { branchLabel } from '@/lib/branch-label'
import BranchSwitcher, { BranchProvider, useBranchSwitcher } from '@/components/BranchSwitcher'
import ConcernsWidget from '@/components/ConcernsWidget'

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Shared branch toggle: shown in the top bar for any multi-branch staff
  // (e.g. someone working at both East and Greenhills on one login).
  const { isMultiBranch } = useBranchSwitcher()

  // User-card display, with robust fallbacks so it never renders a bare "?".
  const fullName = session?.user?.name?.trim()
  const userEmail = session?.user?.email ?? undefined
  const initials = fullName
    ? fullName.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : (userEmail?.[0]?.toUpperCase() ?? '')
  const metaLine = [session?.user?.department, branchLabel(session?.user?.branch)].filter(Boolean).join(' · ')

  const isAdmin = session?.user?.role === 'ADMIN'

  // Which sections this account is allowed to see (by access preset).
  const allowed = allowedSections(session?.user?.role, session?.user?.accountType)

  const allNavItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/clinic-schedule', label: 'Clinic Schedule', icon: CalendarDays },
    { href: '/patients', label: 'Patients', icon: Users },
    { href: '/patients-love', label: 'What Patients Love About You', icon: Heart },
    { href: '/peers-love', label: 'What your Peers Love About You', icon: HeartHandshake },
    { href: '/seminars', label: 'Seminars & Trainings', icon: GraduationCap },
    { href: '/templates', label: 'Templates & Forms', icon: FileText },
    { href: '/manuals', label: 'Manuals', icon: BookOpen },
    { href: '/directory', label: 'Directory', icon: Contact },
    { href: '/wellness-check', label: 'Wellness Check', icon: HeartPulse },
    { href: '/payroll', label: 'Payroll', icon: Wallet },
    { href: '/loans-perks', label: 'Loans & Perks', icon: HandCoins },
    { href: '/settings', label: 'Settings', icon: Settings },
  ]

  const navItems = [
    ...allNavItems.filter((item) => allowed.includes(item.href)),
    ...(isAdmin
      ? [
          { href: '/tickets', label: 'Tickets', icon: LifeBuoy },
          { href: '/admin', label: 'Admin Panel', icon: Shield },
        ]
      : []),
  ]

  return (
    // h-screen + overflow-hidden pins the layout to exactly the
    // viewport height so the document body never scrolls. All
    // vertical scrolling happens inside <main> (overflow-y-auto
    // below), which keeps the sidebar visible at all times — the
    // user reported losing sight of the Sign Out button when long
    // patient lists pushed the body taller than the viewport.
    <div className="h-screen overflow-hidden flex">
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
          background: 'linear-gradient(180deg, #16323a 0%, #244952 100%)',
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
              SCEI Staff Portal
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

        {/* Nav — overflow-y-auto so on short viewports the nav
            scrolls internally instead of pushing the user card +
            Sign Out button below the fold. */}
        <nav className="flex-1 py-5 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            // Match exact path, or descendant routes — but NOT lookalike prefixes
            // (e.g. /patients-love must NOT match /patients)
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 relative',
                  active
                    ? 'text-white shadow-[0_2px_8px_rgba(46,94,90,0.3)]'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                )}
                style={active ? { background: 'linear-gradient(135deg, var(--teal), var(--deep-teal))', borderLeft: '3px solid #cf9d88' } : {}}
              >
                <Icon size={18} style={active ? { color: '#c69849' } : {}} />
                {item.label}
                {active && <ChevronRight size={14} className="ml-auto" style={{ color: '#c69849' }} />}
              </Link>
            )
          })}
        </nav>

        {/* User card */}
        <div className="mx-3 mb-4 p-4 rounded-xl bg-white/5 border border-white/8">
          <div className="flex items-center gap-3 mb-3">
            {status === 'loading' ? (
              <>
                <div className="w-9 h-9 rounded-full bg-white/10 animate-pulse shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="h-3 w-24 rounded bg-white/10 animate-pulse" />
                  <div className="h-2 w-16 rounded bg-white/10 animate-pulse" />
                </div>
              </>
            ) : (
              <>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-bold shrink-0" style={{ background: 'linear-gradient(135deg, #cf9d88, #c69849)' }}>
                  {initials || <User size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white/90 truncate">{fullName || userEmail || 'Account'}</p>
                  <p className="text-[11px] text-white/40 truncate">{metaLine || ' '}</p>
                </div>
              </>
            )}
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
        {/* Top bar: mobile menu/brand on the left (mobile only) + the branch
            toggle on the right. On desktop the bar is hidden unless there's a
            toggle to show (multi-branch staff), so single-branch users keep the
            clean header-less look. */}
        <header
          className={cn(
            'flex items-center justify-between gap-3 px-4 lg:px-8 py-3 bg-white border-b border-[var(--light-gray)]',
            !isMultiBranch && 'lg:hidden'
          )}
        >
          <div className="flex items-center gap-3 lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-[var(--charcoal)] hover:text-[var(--teal)] transition-colors"
            >
              <Menu size={22} />
            </button>
            <div className="flex items-center gap-2">
              <Video size={18} className="text-[var(--teal)]" />
              <h1 className="font-bold text-[15px] text-[var(--charcoal)]" style={{ fontFamily: 'var(--font-display)' }}>
                SCEI Staff Portal
              </h1>
            </div>
          </div>
          <BranchSwitcher />
        </header>

        {/* Page content */}
        <main className="flex-1 p-5 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Floating "Concerns?" widget for staff to raise portal tickets.
          Hidden for the main admin, who manages tickets in the Tickets section. */}
      {!isAdmin && <ConcernsWidget />}
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
      <BranchProvider>
        <DashboardContent>{children}</DashboardContent>
      </BranchProvider>
    </SessionProvider>
  )
}
