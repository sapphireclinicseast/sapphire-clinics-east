'use client'

// Redeems a one-time handoff token (minted after the patient app authenticated
// or created the provider) by signing in through NextAuth — so Auth.js sets the
// session cookie itself. On success the provider lands on the staff dashboard,
// already logged in, same tab. No credentials pass through here.

import { Suspense, useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'

function Handoff() {
  const sp = useSearchParams()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const token = sp.get('token')
    if (!token) { setFailed(true); return }
    let cancelled = false
    signIn('credentials', { handoffToken: token, redirect: false })
      .then((res) => {
        if (cancelled) return
        if (res?.ok) window.location.href = '/'
        else setFailed(true)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => { cancelled = true }
  }, [sp])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EDF3D9', color: '#244952', fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 340 }}>
        {failed ? (
          <>
            <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Sign-in link expired</h1>
            <p style={{ color: '#5E6655', fontSize: 14, lineHeight: 1.5, margin: '0 0 18px' }}>
              This one-time sign-in link is no longer valid. Please go back and sign in again.
            </p>
            <a href="/login" style={{ display: 'inline-block', background: '#244952', color: '#fff', borderRadius: 12, padding: '11px 22px', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>
              Go to sign in
            </a>
          </>
        ) : (
          <>
            <div style={{ width: 40, height: 40, border: '3px solid rgba(36,73,82,.2)', borderTopColor: '#244952', borderRadius: '50%', margin: '0 auto 16px', animation: 'hspin 0.8s linear infinite' }} />
            <p style={{ color: '#5E6655', fontSize: 14 }}>Signing you in…</p>
            <style>{`@keyframes hspin{to{transform:rotate(360deg)}}`}</style>
          </>
        )}
      </div>
    </div>
  )
}

export default function ProviderHandoffPage() {
  return (
    <Suspense fallback={null}>
      <Handoff />
    </Suspense>
  )
}
