'use client'

import { useState } from 'react'

export default function DoctorPayoutButton({ doctorId, amount }: { doctorId: string; amount: number }) {
  const [busy, setBusy] = useState(false)
  const [ref, setRef] = useState('')
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function pay() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/doctor-payout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doctorId, reference: ref }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Failed')
      window.location.reload()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); setBusy(false) }
  }

  if (!open) return <button className="btn-primary !px-4 !py-1.5 !text-[13px]" onClick={() => setOpen(true)}>Mark paid</button>
  return (
    <div className="flex items-center justify-end gap-2">
      <input className="input !w-36 !py-1.5 !text-[13px]" placeholder="Transfer ref (opt.)" value={ref} onChange={(e) => setRef(e.target.value)} />
      <button className="btn-primary !bg-emerald-600 !px-3 !py-1.5 !text-[13px]" disabled={busy} onClick={pay}>{busy ? '…' : `Pay ₱${Math.round(amount).toLocaleString('en-PH')}`}</button>
      <button className="text-[12px] text-[color:var(--muted)]" onClick={() => setOpen(false)}>Cancel</button>
      {msg && <span className="text-[12px] text-red-600">{msg}</span>}
    </div>
  )
}
