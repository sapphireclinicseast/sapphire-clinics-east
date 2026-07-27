'use client'

/**
 * PUBLIC payer page for a reusable payment link (/pay/<token>).
 * The payer enters their details here — PayMongo's hosted page doesn't ask for them (QRPh
 * collects nothing) — then we mint a fresh checkout session for this patient and redirect.
 */

import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

// Same per-department palette as the hub, so staff and payers see matching colours.
const DEPT_COLORS: Record<string, { bg: string; fg: string }> = {
  PT: { bg: '#dbeafe', fg: '#1e40af' }, OT: { bg: '#ede9fe', fg: '#6d28d9' },
  ST: { bg: '#ccfbf1', fg: '#0f766e' }, SLP: { bg: '#ccfbf1', fg: '#0f766e' },
  SPED: { bg: '#fef3c7', fg: '#92400e' }, PSY: { bg: '#fce7f3', fg: '#9d174d' },
  PSYCHOLOGY: { bg: '#fce7f3', fg: '#9d174d' }, MD: { bg: '#fee2e2', fg: '#b91c1c' },
  CLI: { bg: '#e0f2fe', fg: '#075985' }, DIG: { bg: '#e0e7ff', fg: '#3730a3' },
  EDU: { bg: '#dcfce7', fg: '#166534' }, MER: { bg: '#ffedd5', fg: '#9a3412' },
  OTHER: { bg: '#f1f5f9', fg: '#475569' },
}

const peso = (n: number) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface LinkInfo {
  itemName: string; quantity: number; amount: number
  department: string | null; departmentLabel: string | null
  allowVoucher: boolean; branchLabel: string; configured: boolean
}

export default function PayPage() {
  const { token } = useParams<{ token: string }>()
  const statusParam = useSearchParams().get('status')

  const [info, setInfo] = useState<LinkInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState<{ ok: boolean; reason?: string; discount?: number; netAmount?: number; pwdPatientName?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/public/pay/${token}`)
      if (!r.ok) { setNotFound(true); return }
      setInfo(await r.json())
    } catch { setNotFound(true) } finally { setLoading(false) }
  }, [token])
  useEffect(() => { load() }, [load])

  const checkCode = async () => {
    if (!code.trim() || !info) { setPreview(null); return }
    // PWD/Senior codes are matched against the clinic's patient records, so the name and
    // contact number matter as much as the email — ask for all of them up front.
    if (!email.trim() || !firstName.trim() || !lastName.trim() || !phone.trim()) {
      setPreview({ ok: false, reason: 'Fill in your name, contact number and email first, then apply the code.' })
      return
    }
    const r = await fetch('/api/public/pay/voucher-check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, code, email, firstName, lastName, phone }),
    })
    setPreview(await r.json())
  }

  const pay = async () => {
    setBusy(true); setError('')
    try {
      const r = await fetch(`/api/public/pay/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, phone, email, voucherCode: code.trim() || undefined }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not start your payment.')
      window.location.href = j.checkoutUrl          // hand off to PayMongo
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); setBusy(false) }
  }

  const canPay = !!firstName.trim() && !!lastName.trim() && !!phone.trim() && !!email.trim() && !busy && !(preview && !preview.ok)
  const charge = preview?.ok ? (preview.netAmount ?? info?.amount ?? 0) : (info?.amount ?? 0)

  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: '#f8f7f4', padding: '32px 16px' }}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>{children}</div>
    </div>
  )

  if (loading) return shell(<p style={{ textAlign: 'center', color: '#6b7280', fontSize: 14 }}>Loading…</p>)
  if (notFound || !info) {
    return shell(
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', marginBottom: 8 }}>Link unavailable</h1>
        <p style={{ fontSize: 13, color: '#6b7280' }}>This payment link is no longer active. Please contact the clinic for a new one.</p>
      </div>,
    )
  }

  if (statusParam === 'success') {
    return shell(
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
        <div style={{ fontSize: 34, marginBottom: 6 }}>✓</div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f766e', marginBottom: 8 }}>Payment received</h1>
        <p style={{ fontSize: 13, color: '#6b7280' }}>Thank you. Your payment for <strong>{info.itemName}</strong> has been received. A receipt will follow from the clinic.</p>
      </div>,
    )
  }

  const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }
  const input: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }

  return shell(
    <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
      <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>{info.branchLabel}</p>
      <h1 style={{ fontSize: 17, fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>{info.itemName}</h1>
      {info.departmentLabel && (() => {
        const c = DEPT_COLORS[(info.department || '').toUpperCase()] || DEPT_COLORS.OTHER
        return (
          <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg }}>
            {info.departmentLabel}
          </span>
        )
      })()}
      <p style={{ fontSize: 26, fontWeight: 700, color: '#0f766e', margin: '6px 0 4px' }}>
        {peso(charge)}
        {preview?.ok && (preview.discount || 0) > 0 && (
          <span style={{ fontSize: 13, fontWeight: 400, color: '#9ca3af', textDecoration: 'line-through', marginLeft: 8 }}>{peso(info.amount)}</span>
        )}
      </p>
      {info.quantity > 1 && <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>Quantity: {info.quantity}</p>}

      {statusParam === 'cancelled' && (
        <div style={{ background: '#fffbeb', color: '#92400e', fontSize: 12, padding: '8px 10px', borderRadius: 8, marginBottom: 12 }}>
          Your previous attempt was cancelled. You can try again below.
        </div>
      )}
      {!info.configured && (
        <div style={{ background: '#fef2f2', color: '#b91c1c', fontSize: 12, padding: '8px 10px', borderRadius: 8, marginBottom: 12 }}>
          Online payment is temporarily unavailable. Please contact the clinic.
        </div>
      )}

      <p style={{ fontSize: 12, color: '#6b7280', margin: '14px 0 10px' }}>Please enter your details so we can match this payment to your record.</p>

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={label}>First name</label><input style={input} value={firstName} onChange={e => { setFirstName(e.target.value); setPreview(null) }} autoComplete="given-name" /></div>
          <div><label style={label}>Last name</label><input style={input} value={lastName} onChange={e => { setLastName(e.target.value); setPreview(null) }} autoComplete="family-name" /></div>
        </div>
        <div><label style={label}>Contact number</label><input style={input} value={phone} onChange={e => { setPhone(e.target.value); setPreview(null) }} placeholder="09xx xxx xxxx" inputMode="tel" autoComplete="tel" /></div>
        <div><label style={label}>Email address</label><input style={input} type="email" value={email} onChange={e => { setEmail(e.target.value); setPreview(null) }} autoComplete="email" /></div>

        {info.allowVoucher && (
          <div>
            <label style={label}>Voucher code (optional)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...input, fontFamily: 'monospace' }} value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setPreview(null) }} placeholder="e.g. SUMMER10" />
              <button onClick={checkCode} disabled={!code.trim()}
                style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: code.trim() ? 'pointer' : 'not-allowed', opacity: code.trim() ? 1 : .5 }}>
                Apply
              </button>
            </div>
            {preview && (
              <p style={{ fontSize: 12, marginTop: 6, color: preview.ok ? '#166534' : '#b91c1c', lineHeight: 1.5 }}>
                {preview.ok
                  ? `✓ Discount ${peso(preview.discount || 0)} applied`
                  : preview.reason}
                {preview.ok && preview.pwdPatientName && (
                  <span style={{ display: 'block', color: '#6b7280' }}>
                    Verified against the PWD/Senior ID registered for {preview.pwdPatientName}.
                  </span>
                )}
              </p>
            )}
          </div>
        )}
      </div>

      {error && <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 12 }}>{error}</p>}

      <button onClick={pay} disabled={!canPay || !info.configured}
        style={{
          width: '100%', marginTop: 18, padding: '13px 16px', borderRadius: 12, border: 'none',
          background: canPay && info.configured ? '#0f766e' : '#9ca3af', color: '#fff',
          fontSize: 15, fontWeight: 700, cursor: canPay && info.configured ? 'pointer' : 'not-allowed',
        }}>
        {busy ? 'Redirecting…' : `Pay ${peso(charge)}`}
      </button>
      <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 10 }}>
        You&apos;ll be redirected to PayMongo to complete your payment securely.
      </p>
    </div>,
  )
}
