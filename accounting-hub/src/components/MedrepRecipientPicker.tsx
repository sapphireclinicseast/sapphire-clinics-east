'use client'

// Who receives the med rep's one-time new-referred-patient incentive: a
// searchable list of HR staff (Hannah 2026-11-11: "allow me to set who is this
// staff via dropdown of staff list"; NameCombobox, never a browser pick list).
// The incentive reaches a payslip only when the person is an active hub
// payroll employee linked to that HR record, so the list says when they aren't.

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { NameCombobox } from '@/components/NameCombobox'

export interface IncentiveStaff { id: string; name: string; jobTitle: string; onPayroll?: boolean }

export function MedrepRecipientPicker({ staff, staffId, staffName, onPick, disabled, className, style }: {
  staff: IncentiveStaff[]
  staffId: string | null
  /** Saved name, shown while the staff list loads (or if that person left HR). */
  staffName?: string | null
  onPick: (s: IncentiveStaff | null) => void
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const current = staff.find(s => s.id === staffId) || null
  const saved = current?.name || staffName || ''
  // What's typed while picking; null = show the saved recipient.
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? saved

  // One option per name (HR lists a few people twice); the first record wins.
  const byName = useMemo(() => {
    const m = new Map<string, IncentiveStaff>()
    for (const s of staff) if (!m.has(s.name)) m.set(s.name, s)
    return m
  }, [staff])
  const options = useMemo(() => [...byName.keys()], [byName])
  const hints = useMemo(() => Object.fromEntries([...byName.values()].map(s => [s.name,
    [s.jobTitle, s.onPayroll === false ? 'not on hub payroll' : ''].filter(Boolean).join(' · ')])), [byName])

  const commit = (v: string) => {
    const name = v.trim().toUpperCase()
    setDraft(null) // back to the saved name (or the one just picked, once saved)
    if (!name) { if (staffId) onPick(null); return }
    const s = byName.get(name)
    if (s && s.id !== staffId) onPick(s)
  }

  return (
    <div className={`relative ${className || ''}`} style={style}>
      <NameCombobox value={text} onChange={setDraft} onCommit={commit} options={options} hints={hints} matchHints browseOnFocus
        placeholder="Pick the staff member…" disabled={disabled} maxOptions={200}
        className="w-full px-3 py-2 pr-8 rounded-xl border text-sm bg-white" style={{ borderColor: 'var(--light-gray)' }} />
      {text && !disabled && (
        <button type="button" onClick={() => { setDraft(null); onPick(null) }} aria-label="Clear the recipient" title="No recipient (incentive off)"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--off-white)]">
          <X size={14} style={{ color: 'var(--mid-gray)' }} />
        </button>
      )}
      {current && current.onPayroll === false && (
        <p className="text-[11px] mt-1" style={{ color: '#b45309' }}>
          {current.name} isn&apos;t an active hub payroll employee, so the incentive can&apos;t reach a payslip. Mark it paid by hand, or add them in Payroll.
        </p>
      )}
    </div>
  )
}
