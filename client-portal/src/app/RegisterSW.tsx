'use client'

// Registers the service worker so the portal is installable and has an offline
// shell. No-ops where service workers are unavailable (older browsers, SSR).
import { useEffect } from 'react'

export default function RegisterSW() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* registration is best-effort; the app works fine without it */
      })
    }
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad, { once: true })
  }, [])
  return null
}
