'use client'

import { useCallback, useEffect, useState } from 'react'

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

// Registers the service worker, offers PWA install, and manages web-push
// subscription for signed-in users (patient / provider / doctor).
export default function PwaSetup() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)
  const [installHidden, setInstallHidden] = useState(true)
  const [loggedIn, setLoggedIn] = useState(false)
  const [showNotif, setShowNotif] = useState(false)

  const subscribePush = useCallback(async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
      const reg = await navigator.serviceWorker.ready
      const keyRes = await fetch('/api/push/subscribe').then((r) => r.json()).catch(() => ({}))
      if (!keyRes.key) return
      const existing = await reg.pushManager.getSubscription()
      const sub = existing ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(keyRes.key) })
      await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) })
      setShowNotif(false)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})

    // Install prompt
    const inStandalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone
    let dismissed = false
    try { dismissed = localStorage.getItem('nickel-install-dismissed') === '1' } catch { /* ignore */ }
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); if (!inStandalone && !dismissed) setInstallHidden(false) }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // Push: only for signed-in users
    fetch('/api/notifications').then((r) => r.json()).then((d) => {
      if (!d.role) return
      setLoggedIn(true)
      if (typeof Notification === 'undefined') return
      if (Notification.permission === 'granted') subscribePush()
      else if (Notification.permission === 'default') {
        let notifDismissed = false
        try { notifDismissed = localStorage.getItem('nickel-notif-dismissed') === '1' } catch { /* ignore */ }
        if (!notifDismissed) setShowNotif(true)
      }
    }).catch(() => {})

    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [subscribePush])

  async function enableNotifs() {
    try { const p = await Notification.requestPermission(); if (p === 'granted') await subscribePush(); else dismissNotif() } catch { dismissNotif() }
  }
  function dismissNotif() { setShowNotif(false); try { localStorage.setItem('nickel-notif-dismissed', '1') } catch { /* ignore */ } }
  function dismissInstall() { setInstallHidden(true); try { localStorage.setItem('nickel-install-dismissed', '1') } catch { /* ignore */ } }
  async function install() { if (!deferred) return; await deferred.prompt(); await deferred.userChoice.catch(() => {}); setDeferred(null); setInstallHidden(true) }

  const showInstall = !installHidden && !!deferred
  const showNotifBar = showNotif && loggedIn && !showInstall
  if (!showInstall && !showNotifBar) return null

  return (
    <div style={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 60 }} className="mx-auto max-w-md">
      <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--line)] bg-white p-3 shadow-[0_16px_44px_rgba(20,36,58,.22)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-[color:var(--ink)]">{showInstall ? 'Install Nickel' : 'Turn on notifications'}</div>
          <div className="text-[12px] text-[color:var(--slate)]">{showInstall ? 'Add it to your home screen for quick access.' : 'Get alerted about confirmations, messages and consults.'}</div>
        </div>
        {showInstall
          ? <button onClick={install} className="btn-primary shrink-0 !px-3 !py-2 !text-[13px]">Install</button>
          : <button onClick={enableNotifs} className="btn-primary shrink-0 !px-3 !py-2 !text-[13px]">Enable</button>}
        <button onClick={showInstall ? dismissInstall : dismissNotif} aria-label="Dismiss" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[color:var(--slate)] hover:bg-[color:var(--mist)]">✕</button>
      </div>
    </div>
  )
}
