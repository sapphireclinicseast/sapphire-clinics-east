'use client'

import { useEffect, useState } from 'react'

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

// Persistent "Install app" button. Uses the native install prompt when the
// browser offers one (captured early on window), and falls back to short
// Add-to-Home-Screen instructions (iOS Safari never fires the prompt event).
export default function InstallButton({ className = '' }: { className?: string }) {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)
  const [standalone, setStandalone] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const w = window as unknown as { __nickelInstallPrompt?: BIPEvent }
    const inStandalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone
    setStandalone(!!inStandalone)
    if (w.__nickelInstallPrompt) setDeferred(w.__nickelInstallPrompt)
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent) }
    const onInstalled = () => { setStandalone(true); setShowHelp(false) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  if (standalone) return null

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isIOS = /iphone|ipad|ipod/i.test(ua)

  async function click() {
    if (deferred) {
      await deferred.prompt()
      await deferred.userChoice.catch(() => {})
      setDeferred(null)
      return
    }
    setShowHelp((s) => !s) // no native prompt (iOS, or already-eligible) → show steps
  }

  return (
    <span className="relative inline-block">
      <button onClick={click} className={className || 'inline-flex items-center gap-2 rounded-xl border border-white/40 px-6 py-3 text-[15px] font-semibold text-white hover:bg-white/10'}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
        Install app
      </button>
      {showHelp && (
        <>
          {/* Dim backdrop — tap anywhere to dismiss */}
          <span onClick={() => setShowHelp(false)} className="fixed inset-0 z-[90] block bg-black/30" />
          {/* Viewport-anchored sheet: fixed with left/right margins so it can never overflow */}
          <span className="fixed inset-x-3 bottom-3 z-[100] mx-auto block max-w-sm rounded-2xl border border-[color:var(--line)] bg-white p-4 text-left text-[13.5px] leading-snug text-[color:var(--slate)] shadow-[0_20px_60px_rgba(20,36,58,.35)]">
            <div className="mb-1 text-[14px] font-semibold text-[color:var(--ink)]">Install Nickel</div>
            {isIOS
              ? <>Tap the <b className="text-[color:var(--ink)]">Share</b> button in Safari (the square with an up-arrow), then choose <b className="text-[color:var(--ink)]">“Add to Home Screen.”</b></>
              : <>Open your browser menu (⋮), then choose <b className="text-[color:var(--ink)]">“Install app”</b> or <b className="text-[color:var(--ink)]">“Add to Home screen.”</b></>}
            <button onClick={() => setShowHelp(false)} className="mt-3 block w-full rounded-lg bg-[color:var(--steel)] py-2 text-center font-semibold text-white">Got it</button>
          </span>
        </>
      )}
    </span>
  )
}
