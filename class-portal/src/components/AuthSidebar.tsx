'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getAuth, clearAuth, type AuthSession } from '@/lib/session'
import { getImpersonationMeta } from '@/lib/backend'
import BellIcon from './BellIcon'

type Role = 'ADMIN' | 'BRANCH_ADMIN' | 'FRONTDESK' | 'TEACHER' | 'STUDENT'
function isRole(x: string | undefined | null): x is Role {
  return x === 'ADMIN' || x === 'BRANCH_ADMIN' || x === 'FRONTDESK' || x === 'TEACHER' || x === 'STUDENT'
}

// A single nav item — icon + label + href, optionally gated by role
// or by main-admin-only visibility. The `mainAdminOnly` flag is a
// tighter gate than `roles: ['ADMIN']` — role=ADMIN includes branch
// admin, but only the single main-admin email should ever see the
// Handbook link.
type NavItem = {
  href: string
  label: string
  icon: 'home' | 'classes' | 'calendar' | 'pay' | 'handbook' | 'meetings' | 'templates' | 'megaphone' | 'grades' | 'bell'
  roles?: Array<'ADMIN' | 'BRANCH_ADMIN' | 'FRONTDESK' | 'TEACHER' | 'STUDENT'>
  mainAdminOnly?: boolean
  /** The role's home / landing entry. Suppressed while impersonating so
   *  the sidebar doesn't carry a redundant link next to the Profile
   *  entry that mirrors the student view. */
  isDashboard?: boolean
  /** Sidebar section heading. Display only; items keep their order. */
  group?: 'Overview' | 'School' | 'Student' | 'Admin tools'
}

// Monochrome 20×20 line icons rendered inline as SVG so they inherit
// currentColor from the surrounding text (deep-teal when active, narra
// when not). Stroke-based Feather-style icons — clean and understated,
// matches the HR-hub design vocabulary.
function NavIcon({ name }: { name: NavItem['icon'] }) {
  const common = {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.75,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z" />
        </svg>
      )
    case 'classes':
      // Open book — two facing pages with a spine.
      return (
        <svg {...common}>
          <path d="M4 6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" />
          <path d="M20 6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18" />
          <path d="M8 3v4M16 3v4" />
        </svg>
      )
    case 'pay':
      // Wallet.
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 10h18" />
          <path d="M16 15h2" />
        </svg>
      )
    case 'handbook':
      // Open book with a ribbon bookmark — matches Feather's "book-open".
      return (
        <svg {...common}>
          <path d="M2 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z" />
          <path d="M22 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z" />
        </svg>
      )
    case 'meetings':
      // Video camera — Feather's "video" glyph.
      return (
        <svg {...common}>
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      )
    case 'templates':
      // Document grid — stacked lines like a template layout.
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 7h8M8 11h8M8 15h5" />
        </svg>
      )
    case 'megaphone':
      // Megaphone — matches "post an announcement" semantics.
      return (
        <svg {...common}>
          <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
          <path d="M14 7a5 5 0 0 1 0 10" />
        </svg>
      )
    case 'grades':
      // Mortar-board.
      return (
        <svg {...common}>
          <path d="M2 9l10-4 10 4-10 4z" />
          <path d="M6 11v4c0 1 2.5 3 6 3s6-2 6-3v-4" />
        </svg>
      )
    case 'bell':
      // Bell glyph — the student-side announcements inbox.
      return (
        <svg {...common}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      )
  }
}

// The HR-hub-style persistent left sidebar for signed-in users.
// Hidden entirely for public marketing pages (no auth) or when the
// visitor is on the sign-in flow itself. Collapses to a hamburger on
// mobile (viewport < md) — kicks a fixed-position overlay drawer.
export default function AuthSidebar() {
  const [auth, setAuthState] = useState<AuthSession | null>(null)
  const [impersonatedRole, setImpersonatedRole] = useState<Role | null>(null)
  const [mounted, setMounted] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    setMounted(true)
    setAuthState(getAuth())
    const imp = getImpersonationMeta()
    setImpersonatedRole(imp && isRole(imp.targetRole) ? imp.targetRole : null)
    setMobileOpen(false)
  }, [pathname])

  // Shift the page content right of the fixed sidebar (md+ only) by
  // toggling a CSS class on <body>. Also hides the top HeaderNav via
  // .with-auth-sidebar in globals.css so authenticated views get the
  // sidebar layout without stacking a redundant header.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const hasAuth = !!getAuth()
    document.body.classList.toggle('with-auth-sidebar', hasAuth)
    return () => { document.body.classList.remove('with-auth-sidebar') }
  }, [pathname, auth])

  useEffect(() => {
    // React to sign-in / sign-out in other tabs.
    function onStorage(e: StorageEvent) {
      if (e.key === 'scei_class_auth_v1') setAuthState(getAuth())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function handleSignOut() {
    clearAuth()
    setAuthState(null)
    router.push('/')
  }

  // Don't render the sidebar shell during SSR or before we know auth
  // state — prevents a flash of the sidebar for signed-out visitors.
  if (!mounted || !auth) return null

  // When the admin has "View as"-impersonated someone, mirror that user's
  // sidebar instead of the admin's own — the red banner at the top of
  // the viewport provides the "Return to admin" exit, so we don't need
  // a dashboard entry here. The dashboard entry is suppressed below in
  // that case rather than pointing somewhere ambiguous.
  const role: Role = impersonatedRole ?? auth.role
  const impersonating = impersonatedRole !== null
  const dashboardHref =
    role === 'ADMIN' || role === 'BRANCH_ADMIN' ? '/admin'
    : role === 'FRONTDESK' ? '/frontdesk'
    : '/profile'

  const items: NavItem[] = [
    { href: dashboardHref, label:
        role === 'ADMIN' ? 'Admin dashboard'
        : role === 'BRANCH_ADMIN' ? 'Branch admin'
        : role === 'FRONTDESK' ? 'Front desk'
        : role === 'TEACHER' ? 'Teacher hub'
        : 'My profile',
      icon: 'home', isDashboard: true, group: 'Overview' },
    // During impersonation we drop the main dashboard entry (admins
    // exit via "Return to admin"). Surface the student's profile as a
    // dedicated entry so the admin can click into the view-as user's
    // profile + documents, which is what they're usually here for.
    ...(impersonating && (role === 'STUDENT' || role === 'TEACHER')
      ? [{ href: '/profile', label: 'Profile', icon: 'home' as const, group: 'Overview' as const }]
      : []),
    { href: '/classes',        label: 'Classes',      icon: 'classes',   roles: ['ADMIN', 'BRANCH_ADMIN', 'TEACHER', 'STUDENT'], group: 'School' },
    { href: '/calendar',       label: 'Calendar',     icon: 'calendar', group: 'School' },
    { href: '/meetings',       label: 'Meetings',     icon: 'meetings',  roles: ['ADMIN', 'BRANCH_ADMIN', 'TEACHER', 'STUDENT'], group: 'School' },
    { href: '/pay',            label: 'Pay tuition',  icon: 'pay',       roles: ['STUDENT'], group: 'Student' },
    // Student-side Grades + Notifications were top tabs on /profile. They
    // now live as sidebar entries so the student can jump straight to
    // them, matching what parents actually want to click. Admin + branch
    // admin also get these so they can navigate the same way while
    // impersonating a student.
    { href: '/grades',         label: 'Grades',         icon: 'grades',    roles: ['STUDENT'], group: 'Student' },
    { href: '/notifications',  label: 'Notifications',  icon: 'bell',      roles: ['STUDENT'], group: 'Student' },
    // Templates + Notifications are admin-only tools (lesson/activity
    // templates and the staff announcement composer). Hoisted out of
    // the Admin Dashboard tabs so admins reach them in one click.
    { href: '/admin/templates',     label: 'Templates',     icon: 'templates', roles: ['ADMIN', 'BRANCH_ADMIN'], group: 'Admin tools' },
    { href: '/admin/notifications', label: 'Notifications', icon: 'megaphone', roles: ['ADMIN', 'BRANCH_ADMIN'], group: 'Admin tools' },
    { href: '/admin/handbook',               label: 'Class Portal Handbook', icon: 'handbook', mainAdminOnly: true, group: 'Admin tools' },
    // Staff Portal Handbook (docs for staff.sapphireclinicseast.org) was
    // shown here but belongs on the staff portal itself, not the class
    // portal. Link removed 2026-08-22; the /admin/staff-portal-handbook
    // route still resolves so the 668-line source isn't lost while it
    // gets ported into the teletherapy app.
  ]

  // 'ADMIN' is the single main-admin auth role — branch admins are
  // BRANCH_ADMIN, and ADMIN can't be assigned to created users — so a
  // role check alone identifies the main admin. This stays correct across
  // the staff-email transition, unlike an exact-email pin (which silently
  // hid these links once the admin's synced email drifted from the hardcode).
  // While impersonating, `role` is the TARGET role so main-admin-only
  // items (Handbook) are hidden the same way they'd be for the student
  // or teacher the admin is viewing as.
  const isMainAdmin = role === 'ADMIN'
  const visible = items.filter(i => {
    if (i.mainAdminOnly) return isMainAdmin
    if (!i.roles) return true
    if (!i.roles.includes(role)) return false
    return true
  })
    // When impersonating, drop the dashboard entry entirely. Admins
    // exit back to their real dashboard through the red "Return to
    // admin" button at the top of the viewport; a sidebar entry would
    // either send them to a page their real role can't actually use
    // or shadow the dedicated Profile entry we add below (both end
    // up with the same /profile href for a student impersonation).
    .filter(i => !(impersonating && i.isDashboard))

  const displayName = auth.email?.split('@')[0] ?? 'account'
  // The signed-in chip at the bottom always shows the REAL auth role —
  // not the impersonated role — so the admin can see their own identity
  // even while viewing-as. The red banner at the top of the page handles
  // the "you're viewing as X" messaging.
  const realRole = auth.role
  const roleLabel =
    realRole === 'ADMIN' ? 'Main admin'
    : realRole === 'BRANCH_ADMIN' ? `Branch admin${auth.branch ? ` · ${auth.branch === 'EAST' ? 'East' : 'Greenhills'}` : ''}`
    : realRole === 'FRONTDESK' ? `Front desk${auth.branch ? ` · ${auth.branch === 'EAST' ? 'East' : 'Greenhills'}` : ''}`
    : realRole === 'TEACHER' ? 'Teacher'
    : 'Student'

  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Only the most specific match lights up, so /admin/templates highlights
  // Templates without also highlighting the Admin dashboard entry.
  const activeHref = visible
    .map(i => i.href)
    .filter(isActive)
    .sort((a, b) => b.length - a.length)[0] ?? ''

  // Consecutive items that share a group render under one heading. Items
  // keep the order (and the role filtering) defined above.
  const groups: Array<{ label: string; items: NavItem[] }> = []
  for (const item of visible) {
    const label = item.group ?? 'Overview'
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }

  const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--scei-mint)]'
  const linkCls = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors ${focusRing} ${
      active
        ? 'bg-[rgba(138,167,106,0.22)] text-white'
        : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
    }`

  const brandBlock = (
    <span className="flex items-center gap-2.5 min-w-0">
      <span className="h-9 w-9 rounded-lg bg-white flex items-center justify-center shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/aura-academy-mark-192.png" alt="" className="h-8 w-8 object-contain" />
      </span>
      <span className="flex flex-col leading-tight min-w-0">
        <span className="text-white font-bold text-[13px] tracking-wide truncate" style={{ fontFamily: 'var(--font-display)' }}>Aura Academy</span>
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.2em]" style={{ fontFamily: 'var(--font-display)', color: 'var(--scei-mint)' }}>Class Portal</span>
      </span>
    </span>
  )

  const sidebarInner = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <a href="/" aria-label="Aura Academy for Learning — home" className={`flex-1 min-w-0 rounded-lg ${focusRing}`}>
          {brandBlock}
        </a>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className={`md:hidden h-8 w-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.06] ${focusRing}`}
          aria-label="Close navigation"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Primary nav */}
      <nav aria-label="Class Portal" className="flex-1 overflow-y-auto px-3 py-4 space-y-5" style={{ fontFamily: 'var(--font-body)' }}>
        {groups.map(g => (
          <div key={g.label}>
            <p className="px-3 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/45" style={{ fontFamily: 'var(--font-display)' }}>
              {g.label}
            </p>
            <ul className="space-y-0.5">
              {g.items.map(item => {
                const active = item.href === activeHref
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className={linkCls(active)}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setMobileOpen(false)}
                    >
                      {/* Icon inherits currentColor from the link. */}
                      <span className="flex items-center justify-center w-5 h-5 shrink-0" style={active ? { color: 'var(--scei-mint)' } : undefined}>
                        <NavIcon name={item.icon} />
                      </span>
                      <span className="min-w-0 truncate">{item.label}</span>
                      {active && (
                        <svg className="ml-auto shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: 'var(--scei-mint)' }}>
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      )}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bell icon — unread count + dropdown panel. Shown to every
          signed-in user. Rendered OUTSIDE <nav> because the nav's
          `overflow-y-auto` clips the absolute-positioned dropdown
          panel; the panel wouldn't render far enough right to be
          visible. The hardcoded-password frontdesk account has no
          userId; the API returns an empty inbox for it, so the bell
          stays quiet rather than erroring. */}
      <div className="px-3 pt-2 pb-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <BellIcon />
      </div>

      {/* User chip + sign out */}
      <div className="mx-3 mt-1 mb-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span aria-hidden className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0" style={{ background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font-display)' }}>
            {displayName[0]?.toUpperCase() ?? '?'}
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-white truncate" title={auth.email ?? ''}>{displayName}</div>
            <div className="text-[11px] text-white/55 truncate">{roleLabel}</div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className={`mt-2.5 w-full inline-flex items-center justify-center gap-1.5 text-[12.5px] px-2 py-1.5 rounded-lg font-semibold text-white/75 hover:text-white hover:bg-white/[0.08] transition-colors ${focusRing}`}
          style={{ border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile top bar — hamburger + brand. Below md the sidebar is a
          drawer, so this bar is the signed-in header. It stays in the
          page flow while the impersonation banner is showing so the two
          sticky bars don't stack on top of each other. */}
      <div
        className={`md:hidden ${impersonating ? '' : 'sticky top-0'} z-40 h-14 px-3 flex items-center gap-3 bg-white`}
        style={{ borderBottom: '1px solid var(--light-gray)' }}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-[color:var(--paper)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--teal)]"
          style={{ border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}
          aria-label="Open navigation"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        <span className="flex items-center gap-2 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/aura-academy-mark-192.png" alt="" className="h-7 w-7 object-contain shrink-0" />
          <span className="flex flex-col leading-tight min-w-0">
            <span className="text-[13px] font-bold truncate" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Aura Academy</span>
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em]" style={{ fontFamily: 'var(--font-display)', color: 'var(--teal)' }}>Class Portal</span>
          </span>
        </span>
      </div>

      {/* Desktop: persistent sidebar. Height fills viewport, fixed so
          long content on the right scrolls independently. */}
      <aside
        className="hidden md:flex flex-col fixed top-0 left-0 h-screen w-[240px] z-30"
        style={{ background: 'var(--near-black)' }}
      >
        {sidebarInner}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="absolute top-0 left-0 h-full w-[264px] max-w-[85vw] shadow-xl"
            style={{ background: 'var(--near-black)' }}
          >
            {sidebarInner}
          </aside>
        </div>
      )}
    </>
  )
}
