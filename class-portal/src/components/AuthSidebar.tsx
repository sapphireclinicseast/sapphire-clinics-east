'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getAuth, clearAuth, type AuthSession } from '@/lib/session'

// A single nav item — icon + label + href, optionally gated by role
// or by main-admin-only visibility. The `mainAdminOnly` flag is a
// tighter gate than `roles: ['ADMIN']` — role=ADMIN includes branch
// admin, but only the single main-admin email should ever see the
// Handbook link.
type NavItem = {
  href: string
  label: string
  icon: 'home' | 'classes' | 'calendar' | 'pay' | 'handbook'
  roles?: Array<'ADMIN' | 'BRANCH_ADMIN' | 'FRONTDESK' | 'TEACHER' | 'STUDENT'>
  mainAdminOnly?: boolean
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
  }
}

// The HR-hub-style persistent left sidebar for signed-in users.
// Hidden entirely for public marketing pages (no auth) or when the
// visitor is on the sign-in flow itself. Collapses to a hamburger on
// mobile (viewport < md) — kicks a fixed-position overlay drawer.
export default function AuthSidebar() {
  const [auth, setAuthState] = useState<AuthSession | null>(null)
  const [mounted, setMounted] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    setMounted(true)
    setAuthState(getAuth())
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

  const role = auth.role
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
      icon: 'home' },
    { href: '/classes',        label: 'Classes',      icon: 'classes',   roles: ['ADMIN', 'BRANCH_ADMIN', 'TEACHER', 'STUDENT'] },
    { href: '/calendar',       label: 'Calendar',     icon: 'calendar' },
    { href: '/pay',            label: 'Pay tuition',  icon: 'pay',       roles: ['STUDENT'] },
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
  const isMainAdmin = role === 'ADMIN'
  const visible = items.filter(i => {
    if (i.mainAdminOnly) return isMainAdmin
    return !i.roles || i.roles.includes(role)
  })

  const displayName = auth.email?.split('@')[0] ?? 'account'
  const roleLabel =
    role === 'ADMIN' ? 'Main admin'
    : role === 'BRANCH_ADMIN' ? `Branch admin${auth.branch ? ` · ${auth.branch === 'EAST' ? 'East' : 'Greenhills'}` : ''}`
    : role === 'FRONTDESK' ? `Front desk${auth.branch ? ` · ${auth.branch === 'EAST' ? 'East' : 'Greenhills'}` : ''}`
    : role === 'TEACHER' ? 'Teacher'
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
