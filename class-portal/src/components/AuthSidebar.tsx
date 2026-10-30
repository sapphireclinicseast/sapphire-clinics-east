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
      icon: 'home', isDashboard: true },
    // During impersonation we drop the main dashboard entry (admins
    // exit via "Return to admin"). Surface the student's profile as a
    // dedicated entry so the admin can click into the view-as user's
    // profile + documents, which is what they're usually here for.
    ...(impersonating && (role === 'STUDENT' || role === 'TEACHER')
      ? [{ href: '/profile', label: 'Profile', icon: 'home' as const }]
      : []),
    { href: '/classes',        label: 'Classes',      icon: 'classes',   roles: ['ADMIN', 'BRANCH_ADMIN', 'TEACHER', 'STUDENT'] },
    { href: '/calendar',       label: 'Calendar',     icon: 'calendar' },
    { href: '/meetings',       label: 'Meetings',     icon: 'meetings',  roles: ['ADMIN', 'BRANCH_ADMIN', 'TEACHER', 'STUDENT'] },
    { href: '/pay',            label: 'Pay tuition',  icon: 'pay',       roles: ['STUDENT'] },
    // Student-side Grades + Notifications were top tabs on /profile. They
    // now live as sidebar entries so the student can jump straight to
    // them, matching what parents actually want to click. Admin + branch
    // admin also get these so they can navigate the same way while
    // impersonating a student.
    { href: '/grades',         label: 'Grades',         icon: 'grades',    roles: ['STUDENT'] },
    { href: '/notifications',  label: 'Notifications',  icon: 'bell',      roles: ['STUDENT'] },
    // Templates + Notifications are admin-only tools (lesson/activity
    // templates and the staff announcement composer). Hoisted out of
    // the Admin Dashboard tabs so admins reach them in one click.
    { href: '/admin/templates',     label: 'Templates',     icon: 'templates', roles: ['ADMIN', 'BRANCH_ADMIN'] },
    { href: '/admin/notifications', label: 'Notifications', icon: 'megaphone', roles: ['ADMIN', 'BRANCH_ADMIN'] },
    { href: '/admin/handbook',               label: 'Class Portal Handbook', icon: 'handbook', mainAdminOnly: true },
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

  const linkCls = (active: boolean) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] transition-colors ${
      active
        ? 'bg-[color:var(--sage-tint)] text-[color:var(--deep-teal)] font-semibold'
        : 'text-[color:var(--narra)] hover:bg-[color:var(--paper-2)]'
    }`

  const sidebarInner = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <a href="/" className="flex items-center gap-2 px-3 py-3 mb-2 group">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/aura-academy-mark.png" alt="Aura Academy" className="h-9 w-auto object-contain shrink-0" />
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[color:var(--deep-teal)] font-semibold text-[13px] tracking-tight truncate" style={{ fontFamily: 'var(--font-display)' }}>Aura Academy</span>
          <span className="text-[9.5px] text-[color:var(--mid-gray)] uppercase tracking-[0.14em]" style={{ fontFamily: 'var(--font-display)' }}>Class Portal</span>
        </div>
      </a>

      {/* Primary nav */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5" style={{ fontFamily: 'var(--font-display)' }}>
        {visible.map(item => (
          <a
            key={item.href}
            href={item.href}
            className={linkCls(isActive(item.href))}
            onClick={() => setMobileOpen(false)}
          >
            {/* Icon inherits currentColor from the parent link — mid-gray
                when inactive, deep-teal when active, keeps it monochrome. */}
            <span className="flex items-center justify-center w-5 h-5 shrink-0 opacity-80">
              <NavIcon name={item.icon} />
            </span>
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      {/* Bell icon — unread count + dropdown panel. Shown to every
          signed-in user. Rendered OUTSIDE <nav> because the nav's
          `overflow-y-auto` clips the absolute-positioned dropdown
          panel; the panel wouldn't render far enough right to be
          visible. The hardcoded-password frontdesk account has no
          userId; the API returns an empty inbox for it, so the bell
          stays quiet rather than erroring. */}
      <div className="px-2 pt-1 pb-1" style={{ fontFamily: 'var(--font-display)' }}>
        <BellIcon />
      </div>

      {/* User chip + sign out */}
      <div className="mt-2 mx-2 mb-2 rounded-xl border p-3" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
        <div className="text-[11.5px] text-[color:var(--mid-gray)] uppercase tracking-[0.1em]" style={{ fontFamily: 'var(--font-display)' }}>Signed in</div>
        <div className="text-[13px] font-semibold text-[color:var(--narra)] truncate" title={auth.email ?? ''}>{displayName}</div>
        <div className="text-[11px] text-[color:var(--mid-gray)] mb-2 truncate">{roleLabel}</div>
        <button
          onClick={handleSignOut}
          className="w-full text-[12.5px] px-2 py-1.5 rounded-md text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] font-semibold transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile hamburger — floats in the top-left when the drawer is closed */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 h-9 w-9 rounded-lg bg-white border shadow-sm flex items-center justify-center"
        style={{ borderColor: 'var(--paper-3)' }}
        aria-label="Open navigation"
      >
        <span aria-hidden className="text-[18px]">☰</span>
      </button>

      {/* Desktop: persistent sidebar. Height fills viewport, sticky so
          long content on the right scrolls independently. */}
      <aside
        className="hidden md:flex flex-col fixed top-0 left-0 h-screen w-[240px] border-r"
        style={{ borderColor: 'var(--paper-3)', background: '#fff' }}
      >
        {sidebarInner}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="absolute top-0 left-0 h-full w-[260px] border-r shadow-xl"
            style={{ borderColor: 'var(--paper-3)', background: '#fff' }}
          >
            {sidebarInner}
          </aside>
        </div>
      )}
    </>
  )
}
