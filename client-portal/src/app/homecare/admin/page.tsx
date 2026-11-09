'use client'

// Homecare configuration moved into the main /admin console (Homecare tab).
// This route now just redirects any old bookmarks there.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function HomecareAdminRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin') }, [router])
  return (
    <div role="status" className="py-20 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
      Redirecting to the admin console…
    </div>
  )
}
