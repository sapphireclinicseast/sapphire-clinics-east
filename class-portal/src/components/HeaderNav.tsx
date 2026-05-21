'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getAuth, clearAuth, type AuthSession } from '@/lib/session'

export default function HeaderNav() {
  const [auth, setAuthState] = useState<AuthSession | null>(null)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  // Refresh on every route change so the nav reflects sign-in / sign-out
  // even when navigations stay inside the same layout (router.push).
  useEffect(() => {
    setMounted(true)
    setAuthState(getAuth())
  }, [pathname])

  useEffect(() => {
    // React to auth changes from other tabs.
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

  const dashboardHref =
    auth?.role === 'ADMIN' ? '/admin'
    : auth?.role === 'FRONTDESK' ? '/frontdesk'
    : '/profile'

  // Compact link styling shared by every nav entry — tightens on mobile
  // so the row can fit Home / Enroll / About / Sign In on phone widths
  // without wrapping past the brand block.
  const linkCls = 'px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-[color:var(--narra)] hover:text-[color:var(--moss)] hover:bg-[color:var(--paper-2)] transition-colors whitespace-nowrap'

  return (
    <nav className="flex flex-wrap gap-0.5 sm:gap-1 text-[12.5px] sm:text-sm items-center justify-end" style={{ fontFamily: 'var(--font-display)' }}>
      <a href="/" className={linkCls}>Home</a>
      <a href="/#enroll" className={linkCls}>Enroll</a>
      <a href="/about" className={linkCls}>About Us</a>
      {!mounted || !auth ? (
        <a href="/sign-in" className={linkCls}>Sign In</a>
      ) : (
        <>
          <a href="/calendar" className={linkCls}>Calendar</a>
          <a href={dashboardHref} className={linkCls}>
            {auth.role === 'ADMIN' ? 'Admin' : auth.role === 'FRONTDESK' ? 'Front desk' : 'My Profile'}
          </a>
          <button onClick={handleSignOut} className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] transition-colors font-semibold whitespace-nowrap">
            Sign Out
          </button>
        </>
      )}
    </nav>
  )
}
