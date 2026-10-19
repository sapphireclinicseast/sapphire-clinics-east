'use client'

import { useEffect, useState } from 'react'
import PsychTestsEditor from './PsychTestsEditor'

/**
 * The easy address for the psych heads: /psych-tests, gated by a short shared
 * access code instead of an unguessable URL (Hannah's call — the long token
 * link was too hard to pass around; it still works in parallel). The code is
 * checked server-side, which answers with the edit token; the code is
 * remembered per device so it is typed once.
 */

const TEAL = '#0f766e'
const CHARCOAL = '#1f2d2a'
const GRAY = '#6b7f7a'
const LIGHT = '#e2ece8'

export default function PsychTestsGatePage() {
  const [token, setToken] = useState('')
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const verify = async (candidate: string, silent: boolean) => {
    try {
      const r = await fetch('/api/public/psych-tests/access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: candidate }),
      })
      const d = await r.json()
      if (r.ok && d.token) {
        try { localStorage.setItem('psych-tests-access', candidate) } catch { /* optional */ }
        setToken(d.token)
        return
      }
      if (!silent) setError(d.error || 'That code is not right — please ask the accounting office.')
      try { localStorage.removeItem('psych-tests-access') } catch { /* optional */ }
    } catch {
      if (!silent) setError('Could not check the code — please try again.')
    }
  }

  useEffect(() => {
    (async () => {
      let saved = ''
      try { saved = localStorage.getItem('psych-tests-access') || '' } catch { /* optional */ }
      if (saved) await verify(saved, true)
      setChecking(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setError('')
    await verify(code.trim(), false)
    setBusy(false)
  }

  if (token) return <PsychTestsEditor token={token} />

  return (
    <main style={{ minHeight: '100vh', background: '#f8f7f4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form onSubmit={submit}
        style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 10px 30px rgba(16,52,45,0.08)' }}>
        <p style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: TEAL, fontWeight: 700, margin: 0 }}>
          Aura Health Rehab · Inventory
        </p>
        <h1 style={{ fontSize: 20, color: CHARCOAL, margin: '6px 0 4px' }}>Psych Tests Register</h1>
        <p style={{ fontSize: 13, color: GRAY, margin: '0 0 16px' }}>
          {checking ? 'One moment…' : 'Enter the access code to open the register.'}
        </p>
        {!checking && (
          <>
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Access code"
              autoFocus
              autoCapitalize="none"
              style={{
                width: '100%', padding: '11px 12px', borderRadius: 10, border: `1px solid ${error ? '#f3c6c6' : LIGHT}`,
                fontSize: 15, color: CHARCOAL, outline: 'none', boxSizing: 'border-box', letterSpacing: '0.08em',
              }}
            />
            {error && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#b91c1c' }}>{error}</p>}
            <button type="submit" disabled={busy || !code.trim()}
              style={{
                marginTop: 14, width: '100%', background: TEAL, color: '#fff', border: 0, borderRadius: 10,
                padding: '11px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: busy || !code.trim() ? 0.6 : 1,
              }}>
              {busy ? 'Checking…' : 'Open the register'}
            </button>
          </>
        )}
      </form>
    </main>
  )
}
