'use client'

// AR → For Follow Up → "Collection Report Settings": per-branch details printed
// on the HMO Collection Report PDF (lib/collection-report). Company details are
// the same row Invoice Settings edits.

import { useEffect, useState } from 'react'
import { Loader2, Settings, X } from 'lucide-react'
import { COLLECTION_BRANCHES, missingCollectionSettings, type CollectionBranchSettings } from '@/lib/collection-report'

const API = '/api/accounts-receivable/collection-settings'

type FieldKey = Exclude<keyof CollectionBranchSettings, 'branch' | 'companySaved' | 'collectionSaved' | 'updatedByName'>

const SECTIONS: { title: string; hint: string; fields: { key: FieldKey; label: string; placeholder?: string; wide?: boolean }[] }[] = [
  {
    title: 'Company details',
    hint: 'The letterhead for this branch. Shared with Invoice Settings.',
    fields: [
      { key: 'companyName', label: 'Company name', placeholder: 'Sapphire Clinics East Incorporated', wide: true },
      { key: 'tradeName', label: 'Branch / trade name', placeholder: 'Aura Health Rehab – East', wide: true },
      { key: 'address', label: 'Address', wide: true },
      { key: 'phone', label: 'Contact numbers' },
      { key: 'email', label: 'Email' },
      { key: 'tin', label: 'TIN (optional)', placeholder: '000-000-000-00000' },
    ],
  },
  {
    title: 'Bank details',
    hint: 'Where the HMO should remit payment.',
    fields: [
      { key: 'bankName', label: 'Bank', placeholder: 'BDO Unibank Inc.' },
      { key: 'bankBranch', label: 'Bank branch' },
      { key: 'bankAccountName', label: 'Account name', wide: true },
      { key: 'bankAccountNo', label: 'Account number' },
    ],
  },
  {
    title: 'Finance officer',
    hint: 'The person who follows up HMO collections; signs the report.',
    fields: [
      { key: 'officerName', label: 'Name' },
      { key: 'officerPosition', label: 'Position', placeholder: 'Finance Officer' },
      { key: 'officerEmail', label: 'Email' },
      { key: 'officerPhone', label: 'Contact number' },
    ],
  },
]

const inputStyle = { borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }

export default function CollectionSettingsModal({ canEdit, initialBranch, notice, onClose, onSaved }: {
  canEdit: boolean
  initialBranch?: string
  notice?: string
  onClose: () => void
  onSaved?: (branches: CollectionBranchSettings[]) => void
}) {
  const [branches, setBranches] = useState<CollectionBranchSettings[] | null>(null)
  const [active, setActive] = useState(initialBranch && COLLECTION_BRANCHES.some(b => b.value === initialBranch) ? initialBranch : COLLECTION_BRANCHES[0].value)
  const [forms, setForms] = useState<Record<string, CollectionBranchSettings>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    let alive = true
    fetch(API)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then(d => {
        if (!alive) return
        setBranches(d.branches || [])
        setForms(Object.fromEntries((d.branches || []).map((b: CollectionBranchSettings) => [b.branch, b])))
      })
      .catch(() => { if (alive) setError('Could not load the settings. Close and try again.') })
    return () => { alive = false }
  }, [])

  const form = forms[active]
  const set = (key: FieldKey, value: string) => setForms(prev => ({ ...prev, [active]: { ...prev[active], [key]: value } }))

  const save = async () => {
    if (!form) return
    setSaving(true); setError(''); setSavedMsg('')
    try {
      const r = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const d = await r.json().catch(() => null)
      if (!r.ok) { setError(d?.error || 'Could not save'); return }
      setBranches(d.branches)
      setForms(prev => ({ ...prev, ...Object.fromEntries((d.branches as CollectionBranchSettings[]).map(b => [b.branch, b])) }))
      setSavedMsg(`${COLLECTION_BRANCHES.find(b => b.value === active)?.label} saved.`)
      onSaved?.(d.branches)
    } catch {
      setError('Could not save. Check your connection and try again.')
    } finally { setSaving(false) }
  }

  const saved = branches?.find(b => b.branch === active)
  const missing = form ? missingCollectionSettings(form) : []

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-2xl mb-8 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
          <X size={18} style={{ color: 'var(--mid-gray)' }} />
        </button>
        <h3 className="text-lg font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <Settings size={18} className="inline mr-1" style={{ color: 'var(--teal)' }} /> Collection Report Settings
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
          Printed on the HMO Collection Report (For Follow Up → Download as PDF), per branch.
        </p>
        {notice && (
          <p className="text-xs rounded-lg px-3 py-2 mb-4" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}>{notice}</p>
        )}

        <div className="inline-flex rounded-xl p-1 mb-4" style={{ background: 'var(--off-white)' }}>
          {COLLECTION_BRANCHES.map(b => {
            const f = forms[b.value]
            const gaps = f ? missingCollectionSettings(f).length : 0
            return (
              <button key={b.value} onClick={() => { setActive(b.value); setSavedMsg(''); setError('') }}
                className="px-4 py-1.5 rounded-lg text-sm font-medium"
                style={active === b.value ? { background: 'white', color: 'var(--teal)', boxShadow: '0 1px 2px rgba(0,0,0,.08)' } : { color: 'var(--mid-gray)' }}>
                {b.label}{gaps > 0 && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle" style={{ background: '#B91C1C' }} title="Incomplete" />}
              </button>
            )
          })}
        </div>

        {!form ? (
          <p className="py-10 text-center text-sm flex items-center justify-center gap-2" style={{ color: 'var(--mid-gray)' }}>
            {error ? error : <><Loader2 size={14} className="animate-spin" /> Loading…</>}
          </p>
        ) : (
          <div className="space-y-5">
            {(!saved?.companySaved || !saved?.collectionSaved) && (
              <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                {!saved?.companySaved ? 'Company details are the official branch details until you save. ' : ''}
                {!saved?.collectionSaved && active === 'SANDBOX_EAST' ? 'Bank details come from SOA Settings until you save.' : ''}
              </p>
            )}
            {SECTIONS.map(sec => (
              <div key={sec.title}>
                <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{sec.title}</p>
                <p className="text-[11px] mb-2" style={{ color: 'var(--mid-gray)' }}>{sec.hint}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {sec.fields.map(f => (
                    <label key={f.key} className={f.wide ? 'sm:col-span-2' : undefined}>
                      <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>{f.label}</span>
                      <input type="text" value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder}
                        disabled={!canEdit} className="w-full px-3 py-2 rounded-xl border text-sm outline-none disabled:bg-gray-50" style={inputStyle} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {missing.length > 0 && (
              <p className="text-xs" style={{ color: '#B91C1C' }}>Still needed for this branch: {missing.join(' and ')}.</p>
            )}
            {saved?.updatedByName && <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Last saved by {saved.updatedByName}</p>}
          </div>
        )}

        {error && form && <p className="text-xs mt-4" style={{ color: '#B91C1C' }}>{error}</p>}
        {savedMsg && <p className="text-xs mt-4" style={{ color: 'var(--teal)' }}>{savedMsg}</p>}

        <div className="flex gap-3 pt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm font-medium" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            {canEdit ? 'Close' : 'Done'}
          </button>
          {canEdit && (
            <button onClick={save} disabled={saving || !form}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--teal)' }}>
              {saving ? 'Saving…' : `Save ${COLLECTION_BRANCHES.find(b => b.value === active)?.label}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
