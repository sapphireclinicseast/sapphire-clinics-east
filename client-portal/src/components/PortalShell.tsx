'use client'

// Signed-in app shell for the patient portal: a dark-teal left sidebar on
// desktop and a top bar + slide-in drawer on phones. Same build and type spec
// as the Class Portal's AuthSidebar, so every SCEI hub reads as one family.
//
// Unlike the Class Portal, the portal's sections are not separate routes: the
// dashboard on "/" switches between them in state. So the nav items here are
// buttons that call onSelect with a section key, and the only real links are
// "Book a session" and the brand (both plain hrefs, as before).
//
// While mounted it adds `with-portal-shell` to <body>, which (see
// app/portal-shell.css) hides the public top header and shifts <main> and the
// footer right of the sidebar. Unmounting (sign out) removes it again, so the
// signed-out landing keeps its original layout.
//
// Display only: nothing here fetches, saves or checks permissions.

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/hub/ui'

export interface ShellNavItem<K extends string> {
  key: K
  label: string
  icon: IconName | 'user' | 'home' | 'heart' | 'star' | 'phone'
  group: string
}

const MINT = '#CBDAB5'
const SIDEBAR_BG = '#17323A'
const ACTIVE_BG = 'rgba(125,162,146,0.22)'

// A few glyphs the shared kit doesn't carry. Same stroke style as its Icon.
function NavGlyph({ name }: { name: ShellNavItem<string>['icon'] }) {
  const common = {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.75,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (name) {
    case 'user':
      return <svg {...common}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
    case 'home':
      return <svg {...common}><path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z" /></svg>
    case 'heart':
      return <svg {...common}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>
    case 'star':
      return <svg {...common}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
    case 'phone':
      return <svg {...common}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
    default:
      return <Icon name={name} size={18} />
  }
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#CBDAB5]'
const itemCls = (active: boolean) =>
  `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors ${focusRing} ${
    active ? 'text-white' : 'text-white/75 hover:text-white hover:bg-white/[0.06]'
  }`

export default function PortalShell<K extends string>({
  items,
  active,
  onSelect,
  userName,
  userSub,
  avatarText,
  onSignOut,
}: {
  items: ShellNavItem<K>[]
  active: K
  onSelect: (key: K) => void
  userName: string
  userSub?: ReactNode
  avatarText: string
  onSignOut: () => void
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  // Swap the public header for this shell while a patient is signed in.
  useEffect(() => {
    document.body.classList.add('with-portal-shell')
    return () => { document.body.classList.remove('with-portal-shell') }
  }, [])

  // Esc closes the phone drawer.
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  // The dashboard only renders after the client-side session check, so this
  // never runs on the server; the guard just keeps createPortal honest.
  if (typeof document === 'undefined') return null

  // Consecutive items with the same group render under one heading.
  const groups: Array<{ label: string; items: ShellNavItem<K>[] }> = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last.label === item.group) last.items.push(item)
    else groups.push({ label: item.group, items: [item] })
  }

  const brandText = (
    <span className="flex flex-col leading-tight min-w-0">
      <span className="text-white truncate" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.05em' }}>Aura</span>
      <span className="uppercase" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.6rem', letterSpacing: '0.2em', color: MINT }}>Client Portal</span>
    </span>
  )

  const sidebarInner = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Link href="/" aria-label="Aura Client Portal — home" className={`flex-1 min-w-0 rounded-lg ${focusRing}`}>
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="h-9 w-9 rounded-lg bg-white flex items-center justify-center shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/aura-mark.png" alt="" className="h-7 w-7 object-contain" />
            </span>
            {brandText}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className={`md:hidden h-8 w-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.06] ${focusRing}`}
          aria-label="Close navigation"
        >
          <Icon name="x" size={18} />
        </button>
      </div>

      {/* Sections */}
      <nav aria-label="Client Portal" className="flex-1 overflow-y-auto px-3 py-4 space-y-5" style={{ fontFamily: 'var(--font-body)' }}>
        {groups.map(g => (
          <div key={g.label}>
            <p className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body)' }}>
              {g.label}
            </p>
            <ul className="space-y-0.5">
              {g.items.map(item => {
                const on = item.key === active
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => { onSelect(item.key); setMobileOpen(false) }}
                      aria-current={on ? 'true' : undefined}
                      className={itemCls(on)}
                      style={on ? { background: ACTIVE_BG } : undefined}
                    >
                      <span className="flex items-center justify-center w-5 h-5 shrink-0" style={on ? { color: MINT } : undefined}>
                        <NavGlyph name={item.icon} />
                      </span>
                      <span className="min-w-0 truncate">{item.label}</span>
                      {on && <Icon name="chevronRight" size={12} className="ml-auto" style={{ color: MINT }} />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}

        {/* The one real link: booking lives on its own page. */}
        <div>
          <p className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body)' }}>
            Appointments
          </p>
          <Link href="/book" className={itemCls(false)}>
            <span className="flex items-center justify-center w-5 h-5 shrink-0"><NavGlyph name="calendar" /></span>
            <span className="min-w-0 truncate">Book a session</span>
          </Link>
        </div>
      </nav>

      {/* User card + sign out */}
      <div className="mx-3 mt-1 mb-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span aria-hidden className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0" style={{ background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font-display)' }}>
            {avatarText}
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-white truncate" title={userName}>{userName}</div>
            {userSub && <div className="text-[11px] text-white/60 truncate">{userSub}</div>}
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
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

  // Into <body>: the dashboard content animates in with a transform, and a
  // transformed ancestor would capture these `position: fixed` bars.
  return createPortal(
    <>
      {/* Phone top bar — the signed-in header below md. */}
      <div
        className="md:hidden fixed top-0 inset-x-0 z-40 h-14 px-3 flex items-center gap-3 bg-white"
        style={{ borderBottom: '1px solid var(--light-gray)' }}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-[color:var(--paper)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--teal)]"
          style={{ border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
        >
          <Icon name="menu" size={18} />
        </button>
        <span className="flex items-center gap-2 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/aura-mark.png" alt="" className="h-7 w-7 object-contain shrink-0" />
          <span className="flex flex-col leading-tight min-w-0">
            <span className="text-[13px] font-bold truncate" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Aura</span>
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em]" style={{ fontFamily: 'var(--font-display)', color: 'var(--deep-teal)' }}>Client Portal</span>
          </span>
        </span>
      </div>

      {/* Desktop: persistent sidebar. */}
      <aside
        className="hidden md:flex flex-col fixed top-0 left-0 h-screen w-[240px] z-30"
        style={{ background: SIDEBAR_BG }}
      >
        {sidebarInner}
      </aside>

      {/* Phone drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside
            className="absolute top-0 left-0 h-full w-[264px] max-w-[85vw] shadow-xl"
            style={{ background: SIDEBAR_BG }}
          >
            {sidebarInner}
          </aside>
        </div>
      )}
    </>,
    document.body,
  )
}
