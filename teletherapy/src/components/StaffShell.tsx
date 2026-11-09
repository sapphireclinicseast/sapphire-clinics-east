'use client'

// The signed-in Staff Portal frame: dark grouped sidebar + slim white top bar,
// matching the Operations Hub's DashboardShell / Sidebar / TopBar. Lifted out
// of app/(dashboard)/layout.tsx so the layout stays a thin provider wrapper.
//
// Which links show is unchanged from the old layout: the account's access
// preset (allowedSections) plus the Internship / Mentorship HR-tag gates, and
// Tickets + Admin Panel for role=ADMIN only.

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
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
  UserCog,
  Sparkles,
  BookMarked,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { allowedSections } from '@/lib/section-access'
import { branchLabel } from '@/lib/branch-label'
import BranchSwitcher from '@/components/BranchSwitcher'
import ConcernsWidget from '@/components/ConcernsWidget'
import NotificationBell from '@/components/NotificationBell'

type NavItem = { href: string; label: string; icon: LucideIcon }
type NavGroup = { label: string; hrefs: string[] }

// Sidebar groups, Ops Hub style. Every href lives in exactly one group; a
// group with nothing the account may open is not rendered.
const GROUPS: NavGroup[] = [
  { label: 'Overview', hrefs: ['/'] },
  { label: 'Clinical', hrefs: ['/clinic-schedule', '/patients'] },
  { label: 'Recognition', hrefs: ['/patients-love', '/peers-love'] },
  { label: 'Programs', hrefs: ['/intern-supervision', '/mentorship'] },
  { label: 'Resources', hrefs: ['/seminars', '/templates', '/manuals', '/directory', '/handbook'] },
  { label: 'My account', hrefs: ['/wellness-check', '/payroll', '/loans-perks', '/settings'] },
  { label: 'Admin', hrefs: ['/tickets', '/admin'] },
]

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8aa99d]'

export default function StaffShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  // The Internship and Mentorship sections are role-gated beyond the preset:
  //   • Internship — only tagged internship supervisors (HR Staff Profiles)
  //     and INTERN accounts (plus admins).
  //   • Mentorship — only tagged Clinical Mentors and their mentees (plus
  //     admins). Everyone else never sees these nav items.
  const acct = session?.user?.accountType
  const canInternship = isAdmin || !!session?.user?.isInternshipSupervisor || acct === 'INTERN'
  const canMentorship = isAdmin || !!session?.user?.isClinicalMentor || !!session?.user?.isMentee
  const sectionGate = (href: string) =>
    href === '/intern-supervision' ? canInternship
    : href === '/mentorship' ? canMentorship
    : true

  const allNavItems: NavItem[] = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/clinic-schedule', label: 'Clinic Schedule', icon: CalendarDays },
    { href: '/patients', label: 'Patients', icon: Users },
    { href: '/patients-love', label: 'What Patients Love', icon: Heart },
    { href: '/peers-love', label: 'What Peers Love', icon: HeartHandshake },
    { href: '/seminars', label: 'Seminars & Trainings', icon: GraduationCap },
    { href: '/templates', label: 'Templates & Forms', icon: FileText },
    { href: '/manuals', label: 'Manuals', icon: BookOpen },
    { href: '/directory', label: 'Directory', icon: Contact },
    { href: '/wellness-check', label: 'Wellness Check', icon: HeartPulse },
    { href: '/payroll', label: 'Payroll', icon: Wallet },
    { href: '/loans-perks', label: 'Loans & Perks', icon: HandCoins },
    { href: '/intern-supervision', label: 'Internship', icon: UserCog },
    { href: '/mentorship', label: 'Mentorship', icon: Sparkles },
    { href: '/handbook', label: 'Handbook', icon: BookMarked },
    { href: '/settings', label: 'Settings', icon: Settings },
  ]

  const navItems: NavItem[] = [
    ...allNavItems.filter((item) => allowed.includes(item.href) && sectionGate(item.href)),
    ...(isAdmin
      ? [
          { href: '/tickets', label: 'Tickets', icon: LifeBuoy },
          { href: '/admin', label: 'Admin Panel', icon: Shield },
        ]
      : []),
  ]
  const byHref = new Map(navItems.map((i) => [i.href, i]))
  const groups = GROUPS
    .map((g) => ({ label: g.label, items: g.hrefs.map((h) => byHref.get(h)).filter((i): i is NavItem => !!i) }))
    .filter((g) => g.items.length > 0)

  // Match exact path, or descendant routes — but NOT lookalike prefixes
  // (e.g. /patients-love must NOT match /patients).
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')

  return (
    // h-screen + overflow-hidden pins the layout to exactly the viewport
    // height so the document body never scrolls. All vertical scrolling
    // happens inside <main>, which keeps the sidebar (and Sign Out) visible.
    <div className="h-screen overflow-hidden flex" style={{ background: 'var(--off-white)' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — off-canvas below lg, always visible on lg+ */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-[248px] flex-shrink-0 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        // Shared SCEI sidebar: the Class Portal's dark teal with mint accents.
        style={{ background: '#17323A' }}
        aria-label="Staff Portal navigation"
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 h-[60px] flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="w-9 h-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/scei-mark.png" alt="" className="w-7 h-7 object-contain" />
          </span>
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-white" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.05em' }}>
              SCEI
            </div>
            <div className="uppercase" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.6rem', letterSpacing: '0.2em', color: '#CBDAB5' }}>
              Staff Portal
            </div>
          </div>
          <button
            type="button"
            className={`lg:hidden p-1 rounded-lg text-white/50 hover:text-white ${FOCUS}`}
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav — scrolls internally on short viewports so the user card and
            Sign Out never get pushed below the fold. */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.18)_transparent]">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-2 mb-1.5 text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body)' }}>
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        title={item.label}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${FOCUS} ${
                          active ? 'text-white' : 'text-white/75 hover:text-white hover:bg-white/[0.06]'
                        }`}
                        style={active ? { background: 'rgba(125,162,146,0.22)', fontFamily: 'var(--font-body)' } : { fontFamily: 'var(--font-body)' }}
                      >
                        <Icon size={16} className="flex-shrink-0" style={active ? { color: '#CBDAB5' } : undefined} />
                        <span className="min-w-0 truncate">{item.label}</span>
                        {active && <ChevronRight size={12} className="ml-auto flex-shrink-0" style={{ color: '#CBDAB5' }} />}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* User card */}
        <div className="mx-3 mb-3 mt-1 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            {status === 'loading' ? (
              <>
                <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="h-3 w-24 rounded bg-white/10 animate-pulse" />
                  <div className="h-2 w-16 rounded bg-white/10 animate-pulse" />
                </div>
              </>
            ) : (
              <>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold shrink-0" style={{ background: 'var(--moss)', fontFamily: 'var(--font-display)' }}>
                  {initials || <User size={15} />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-white truncate" title={userEmail}>{fullName || userEmail || 'Account'}</p>
                  <p className="text-[11px] text-white/55 truncate">{metaLine || ' '}</p>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className={`mt-2.5 w-full inline-flex items-center justify-center gap-1.5 text-[12.5px] px-2 py-1.5 rounded-lg font-semibold text-white/75 hover:text-white hover:bg-white/[0.08] transition-colors ${FOCUS}`}
            style={{ border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar: menu + brand on small screens; bell and branch toggle on
            the right for everyone. */}
        <header
          className="flex items-center justify-between gap-3 px-4 md:px-6 h-[60px] flex-shrink-0 bg-white"
          style={{ borderBottom: '1px solid var(--light-gray)' }}
        >
          <div className="flex items-center gap-2.5 lg:hidden min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className={`h-9 w-9 rounded-lg flex items-center justify-center hover:bg-[var(--off-white)] ${FOCUS}`}
              style={{ border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <span className="hidden sm:flex flex-col leading-tight min-w-0">
              <span className="text-[13px] font-bold truncate" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>SCEI</span>
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em]" style={{ fontFamily: 'var(--font-display)', color: 'var(--deep-teal)' }}>Staff Portal</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <NotificationBell />
            <BranchSwitcher />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-y-auto overflow-x-hidden min-w-0">
          {children}
        </main>
      </div>

      {/* Floating "Concerns?" widget for staff to raise portal tickets.
          Hidden for the main admin, who manages tickets in the Tickets section. */}
      {!isAdmin && <ConcernsWidget />}
    </div>
  )
}
