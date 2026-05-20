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

  const dashboardHref = auth?.role === 'ADMIN' ? '/admin' : '/profile'

  return (
    <nav className="flex gap-1 text-sm items-center" style={{ fontFamily: 'var(--font-display)' }}>
      <a href="/" className="px-3 py-2 rounded-lg text-[color:var(--narra)] hover:text-[color:var(--moss)] hover:bg-[color:var(--paper-2)] transition-colors">Home</a>
      <a href="/#enroll" className="px-3 py-2 rounded-lg text-[color:var(--narra)] hover:text-[color:var(--moss)] hover:bg-[color:var(--paper-2)] transition-colors">Enroll</a>
      <a href="/about" className="px-3 py-2 rounded-lg text-[color:var(--narra)] hover:text-[color:var(--moss)] hover:bg-[color:var(--paper-2)] transition-colors">About SPED Class</a>
      {!mounted || !auth ? (
        <a href="/sign-in" className="px-3 py-2 rounded-lg text-[color:var(--narra)] hover:text-[color:var(--moss)] hover:bg-[color:var(--paper-2)] transition-colors">Sign In</a>
      ) : (
        <>
          <a href="/calendar" className="px-3 py-2 rounded-lg text-[color:var(--narra)] hover:text-[color:var(--moss)] hover:bg-[color:var(--paper-2)] transition-colors">Calendar</a>
          <a href={dashboardHref} className="px-3 py-2 rounded-lg text-[color:var(--narra)] hover:text-[color:var(--moss)] hover:bg-[color:var(--paper-2)] transition-colors">
            {auth.role === 'ADMIN' ? 'Admin' : 'My Profile'}
          </a>
          <button onClick={handleSignOut} className="px-3 py-2 rounded-lg text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] transition-colors font-semibold">
            Sign Out
          </button>
        </>
      )}
    </nav>
  )
}
