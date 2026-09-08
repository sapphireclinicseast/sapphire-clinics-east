'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AccountActions({ deactivated }: { deactivated: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function act(action: 'deactivate' | 'reactivate' | 'delete') {
    if (action === 'deactivate' && !confirm('Deactivate your account? You’ll be hidden from patients and won’t receive new bookings. You can reactivate anytime.')) return
    if (action === 'delete' && !confirm('Delete your account? This removes you from Nickel. Your data is kept for 3 years (for legal, tax and clinical-record obligations) then permanently disposed. This cannot be undone here.')) return
    setBusy(action); setMsg(null)
    try {
      const r = await fetch('/api/provider/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed')
      if (action === 'delete') { window.location.href = '/provider/login'; return }
      router.refresh()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); setBusy(null) }
  }

  return (
    <section className="card">
      <h2 className="text-[16px] font-semibold">Account</h2>
      {deactivated ? (
        <>
          <p className="mb-3 mt-1 text-[12.5px] text-amber-800">Your account is <b>deactivated</b> — you’re hidden from patients. Reactivate to appear again.</p>
          <button className="btn-primary" disabled={busy !== null} onClick={() => act('reactivate')}>{busy === 'reactivate' ? 'Reactivating…' : 'Reactivate account'}</button>
        </>
      ) : (
        <>
          <p className="mb-3 mt-1 text-[12px] text-[color:var(--slate)]">Take a break or leave Nickel. Deactivating hides you from patients (reversible). Deleting removes you from the platform.</p>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-lg border border-[color:var(--line-2)] px-4 py-2 text-[13px] font-medium text-[color:var(--ink)] hover:bg-[color:var(--mist)]" disabled={busy !== null} onClick={() => act('deactivate')}>{busy === 'deactivate' ? 'Deactivating…' : 'Deactivate account'}</button>
            <button className="rounded-lg border border-red-300 px-4 py-2 text-[13px] font-medium text-red-700 hover:bg-red-50" disabled={busy !== null} onClick={() => act('delete')}>{busy === 'delete' ? 'Deleting…' : 'Delete account'}</button>
          </div>
        </>
      )}
      <p className="mt-3 text-[11.5px] text-[color:var(--muted)]">Data retention: if you deactivate or delete your account, Nickel (operated by Jara Universal OPC) retains your records for <b>three (3) years</b> from the date of deactivation or deletion — as required for clinical, legal and tax obligations — after which they are securely disposed.</p>
      {msg && <p className="mt-2 text-[12.5px] text-red-700">{msg}</p>}
    </section>
  )
}
