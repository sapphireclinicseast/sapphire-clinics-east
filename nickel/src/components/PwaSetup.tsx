'use client'

import { useEffect, useState } from 'react'

// Registers the service worker (PWA installability) and shows a small,
// dismissible "Install app" prompt when the browser offers one. In a Capacitor
// native shell the beforeinstallprompt event never fires, so nothing shows.
interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export default function PwaSetup() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    const inStandalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone
    if (inStandalone) return
    let dismissed = false
    try { dismissed = localStorage.getItem('nickel-install-dismissed') === '1' } catch { /* ignore */ }
    if (dismissed) return
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); setHidden(false) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  function dismiss() {
    setHidden(true)
    try { localStorage.setItem('nickel-install-dismissed', '1') } catch { /* ignore */ }
  }
  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice.catch(() => {})
    setDeferred(null); setHidden(true)
  }

  if (hidden || !deferred) return null
  return (
    <div style={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 60 }} className="mx-auto max-w-md">
      <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--line)] bg-white p-3 shadow-[0_16px_44px_rgba(20,36,58,.22)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-[color:var(--ink)]">Install Nickel</div>
          <div className="text-[12px] text-[color:var(--slate)]">Add it to your home screen for quick access.</div>
        </div>
        <button onClick={install} className="btn-primary shrink-0 !px-3 !py-2 !text-[13px]">Install</button>
        <button onClick={dismiss} aria-label="Dismiss" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[color:var(--slate)] hover:bg-[color:var(--mist)]">✕</button>
      </div>
    </div>
  )
}
