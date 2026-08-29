'use client'

import { useState } from 'react'

export default function ReviewActions({ providerId, status, hasSpecialization, specializedApproved }: {
  providerId: string; status: string; hasSpecialization: boolean; specializedApproved: boolean
}) {
  const [allowSpec, setAllowSpec] = useState(specializedApproved)
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function act(action: string, body: Record<string, unknown> = {}) {
    setBusy(action); setMsg(null)
    try {
      const r = await fetch('/api/admin/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId, action, note, ...body }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Action failed')
      window.location.href = '/admin'
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Action failed'); setBusy(null) }
  }

  return (
    <div>
      {msg && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>}

      {hasSpecialization && (
        <label className="mb-4 flex items-center justify-between rounded-xl border border-[color:var(--teal,#12a594)] bg-[color:var(--teal-soft,#e2f5f2)] px-4 py-3">
          <span><b className="text-[color:var(--ink)]">Allow specialized rate</b><div className="text-[12.5px] text-[color:var(--slate)]">Turn on once the certification is verified against the PRC / issuing body.</div></span>
          <input type="checkbox" checked={allowSpec} onChange={(e) => setAllowSpec(e.target.checked)} className="h-5 w-5" style={{ accentColor: 'var(--teal,#12a594)' }} />
        </label>
      )}

      <div>
        <div className="label">Internal note (optional)</div>
        <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth recording about this review…" />
      </div>

      {!rejecting ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!!busy} onClick={() => act('approve', { allowSpecialized: allowSpec })}>
            {busy === 'approve' ? 'Approving…' : status === 'VERIFIED' ? 'Update & keep verified' : 'Approve professional'}
          </button>
          {hasSpecialization && status === 'VERIFIED' && (
            <button className="btn-outline" disabled={!!busy} onClick={() => act('setSpecialized', { allowSpecialized: allowSpec })}>Save specialized-rate setting</button>
          )}
          <button className="btn-outline !text-red-600" disabled={!!busy} onClick={() => setRejecting(true)}>Reject…</button>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="label !text-red-700">Reason for rejection (shown to the applicant)</div>
          <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. TOR is unreadable — please re-upload a clearer scan." />
          <div className="mt-3 flex gap-2">
            <button className="btn-primary !bg-red-600" disabled={!!busy || !reason.trim()} onClick={() => act('reject', { reason })}>{busy === 'reject' ? 'Rejecting…' : 'Confirm rejection'}</button>
            <button className="btn-outline" onClick={() => setRejecting(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
