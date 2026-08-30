'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DoctorActions({ doctorId, status, active }: { doctorId: string; status: string; active: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function act(action: string, extra?: Record<string, unknown>) {
    setBusy(true)
    try { await fetch('/api/admin/doctor-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doctorId, action, ...extra }) }); router.refresh() }
    finally { setBusy(false) }
  }
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {status !== 'VERIFIED' && <button disabled={busy} onClick={() => act('approve')} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-emerald-700">Approve</button>}
      {status !== 'REJECTED' && <button disabled={busy} onClick={() => { const r = prompt('Reason for rejection (optional):') ?? undefined; act('reject', { reason: r }) }} className="rounded-lg border border-[color:var(--line-2)] px-2.5 py-1 text-[12px] font-medium hover:bg-[color:var(--mist)]">Reject</button>}
      <button disabled={busy} onClick={() => act('setActive', { active: !active })} className="rounded-lg border border-[color:var(--line-2)] px-2.5 py-1 text-[12px] font-medium hover:bg-[color:var(--mist)]">{active ? 'Suspend' : 'Reactivate'}</button>
    </div>
  )
}
