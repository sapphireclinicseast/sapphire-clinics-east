'use client'

import { useState } from 'react'

export default function ActiveToggle({ providerId, active }: { providerId: string; active: boolean }) {
  const [on, setOn] = useState(active)
  const [busy, setBusy] = useState(false)
  async function toggle() {
    setBusy(true)
    try {
      const r = await fetch('/api/admin/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId, action: 'setActive', active: !on }) })
      if (r.ok) setOn(!on)
    } finally { setBusy(false) }
  }
  return (
    <button onClick={toggle} disabled={busy}
      className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${on ? 'border border-[color:var(--line-2)] text-[color:var(--slate)] hover:bg-[color:var(--mist)]' : 'bg-[color:var(--steel)] text-white'}`}>
      {busy ? '…' : on ? 'Suspend' : 'Reactivate'}
    </button>
  )
}
