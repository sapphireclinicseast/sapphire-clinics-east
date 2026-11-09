'use client'

// Public header + footer for the patient portal, in the Class Portal's public
// look (class-portal/src/app/layout.tsx + HeaderNav): paper glass bar, brand
// block on the left, compact nav on the right. Kept as its own component so
// the signed-in shell can hide it with one conditional in layout.tsx.
//
// Plain <a> links on purpose (same as before): a full page load re-runs the
// home page's session check, which the signed-in / signed-out split relies on.

import { usePathname } from 'next/navigation'
import ContactMenu, { NAV_LINK } from '@/components/ContactMenu'
import { FOCUS } from '@/components/hub/ui'

const REWARD_POINTS_URL = 'https://sapphireclinicseast.org/reward-points/'

function navLinkStyle(active: boolean): React.CSSProperties {
  return active
    ? { background: 'var(--paper-2)', color: 'var(--deep-teal)', fontWeight: 600 }
    : { color: 'var(--narra)' }
}

export default function PublicHeader() {
  const pathname = usePathname() ?? '/'
  const homeActive = pathname === '/'
  const signInActive = pathname.startsWith('/signin')

  return (
    <header className="bg-[color:var(--paper)]/85 backdrop-blur-md border-b border-[color:var(--paper-3)] sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between gap-2">
        <a href="/" className={`flex items-center gap-2 sm:gap-2.5 leading-tight min-w-0 rounded-lg ${FOCUS}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/aura-mark.png" alt="Aura Health Rehab" width={56} height={28} className="h-7 sm:h-8 w-auto shrink-0" />
          <span className="hidden sm:flex flex-col min-w-0">
            <span className="text-[color:var(--narra)] font-semibold text-[16px] tracking-tight truncate" style={{ fontFamily: 'var(--font-display)' }}>
              Aura Health Rehab
            </span>
            <span className="text-[10.5px] text-[color:var(--mid-gray)] uppercase tracking-[0.16em]" style={{ fontFamily: 'var(--font-display)' }}>
              Patient Portal
            </span>
          </span>
        </a>

        <nav aria-label="Main" className="flex items-center justify-end gap-0.5 sm:gap-1 text-[12.5px] sm:text-sm min-w-0" style={{ fontFamily: 'var(--font-display)' }}>
          <a href="/" aria-current={homeActive ? 'page' : undefined}
            className={`hidden sm:inline-flex ${NAV_LINK} ${homeActive ? '' : 'hover:bg-[color:var(--paper-2)] hover:text-[color:var(--moss)]'}`}
            style={navLinkStyle(homeActive)}>
            Home
          </a>
          <a href="/signin" aria-current={signInActive ? 'page' : undefined}
            className={`inline-flex ${NAV_LINK} ${signInActive ? '' : 'hover:bg-[color:var(--paper-2)] hover:text-[color:var(--moss)]'}`}
            style={navLinkStyle(signInActive)}>
            Sign In
          </a>
          <ContactMenu />
          <a href={REWARD_POINTS_URL} target="_top"
            className={`inline-flex ${NAV_LINK} font-semibold hover:bg-[color:var(--clay-tint)]`}
            style={{ color: 'var(--clay)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span className="hidden sm:inline">Reward Points</span>
            <span className="sm:hidden">Rewards</span>
          </a>
        </nav>
      </div>
    </header>
  )
}

export function PublicFooter() {
  return (
    <footer className="max-w-5xl mx-auto px-3 sm:px-5 py-8 sm:py-10 text-[11px] sm:text-xs text-[color:var(--mid-gray)] flex items-center justify-between gap-3 flex-wrap" style={{ fontFamily: 'var(--font-display)' }}>
      <div>© {new Date().getFullYear()} Aura Health Rehab · Sapphire Clinics East Inc.</div>
      <div className="hidden sm:block">sapphireclinicseast.org</div>
    </footer>
  )
}
