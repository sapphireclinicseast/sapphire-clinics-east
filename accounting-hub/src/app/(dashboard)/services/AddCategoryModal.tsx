'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'

interface PickableService { id: string; name: string; parentGroup: string | null }

// A category exists through the services filed under it, so it starts either with
// the existing services ticked here or, with none ticked, a new service.
export default function AddCategoryModal({ onClose, onSaved, onNoServices }: {
  onClose: () => void
  onSaved: (category: string, count: number) => void
  onNoServices: (category: string) => void
}) {
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [services, setServices] = useState<PickableService[]>([])
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/services/parent?services=1')
      .then(r => r.json())
      .then(d => setServices(d.services || []))
      .catch(() => setError('Could not load the services — check the connection and try again'))
  }, [])

  const q = search.trim().toLowerCase()
  const shown = q ? services.filter(s => s.name.toLowerCase().includes(q)) : services

  const toggle = (id: string) => setTicked(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const save = async () => {
    const category = name.trim()
    if (!category) return
    if (ticked.size === 0) { onNoServices(category); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/services/parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(ticked), parentGroup: category }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to save the category'); return }
      onSaved(d.parent || category, d.moved)
    } catch {
      setError('Failed to save the category — check the connection and try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl">
        <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--charcoal)' }}>Add Category</h3>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Category name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus
          placeholder="e.g. MSK/ORTHO/PNI"
          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none mb-4"
          style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
          Existing services to put in it{ticked.size > 0 ? ` (${ticked.size} ticked)` : ''}
        </label>
        <div className="relative mb-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search services..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border text-sm outline-none"
            style={{ borderColor: 'var(--light-gray)' }} />
        </div>
        <div className="rounded-xl border overflow-y-auto mb-2" style={{ borderColor: 'var(--light-gray)', maxHeight: 240 }}>
          {shown.length === 0 ? (
            <p className="text-xs p-3" style={{ color: 'var(--mid-gray)' }}>No services match.</p>
          ) : shown.map(s => (
            <label key={s.id} className="flex items-start gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={ticked.has(s.id)} onChange={() => toggle(s.id)} className="mt-0.5 flex-shrink-0" />
              <span style={{ color: 'var(--charcoal)' }}>{s.name}</span>
            </label>
          ))}
        </div>
        <p className="text-xs mb-5" style={{ color: 'var(--mid-gray)' }}>
          Tick nothing to start it with a new service instead. This only changes where services are listed on this page: names, prices, checkout and payroll stay the same.
        </p>
        {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>}
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
          <button type="button" onClick={save} disabled={saving || !name.trim()} className="px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
            {ticked.size === 0 ? 'Next: add a service' : 'Add Category'}
          </button>
        </div>
      </div>
    </div>
  )
}
