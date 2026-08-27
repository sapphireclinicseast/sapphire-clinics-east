'use client'

// Homecare configuration moved into the main /admin console (Homecare tab).
// This route now just redirects any old bookmarks there.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function HomecareAdminRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin') }, [router])
  return <div className="p-8 text-sm text-[color:var(--mid-gray)]">Redirecting to the admin console…</div>
}
