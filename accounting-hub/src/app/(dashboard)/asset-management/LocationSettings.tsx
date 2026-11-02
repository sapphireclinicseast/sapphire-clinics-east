'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, MapPin, Plus, Trash2, X } from 'lucide-react'

// Rooms per branch for the asset Location dropdown (Hannah, 2026-11-02).
export type AssetRoom = { id: string; branch: string; name: string; sortOrder: number; used: number }
type Draft = { id?: string; name: string; orig?: string; used: number }

export default function LocationSettings({ branches, rooms, initialBranch, onSaved, onClose }: {
  branches: { value: string; label: string }[]
  rooms: AssetRoom[]
  initialBranch: string
  onSaved: (rooms: AssetRoom[]) => void
  onClose: () => void
}) {
  const [branch, setBranch] = useState(branches.some(b => b.value === initialBranch) ? initialBranch : branches[0]?.value ?? '')
  const fromServer = (list: AssetRoom[]) => {
    const out: Record<string, Draft[]> = {}
    for (const b of branches) out[b.value] = list.filter(r => r.branch === b.value).map(r => ({ id: r.id, name: r.name, orig: r.name, used: r.used }))
    return out
  }
  const [drafts, setDrafts] = useState<Record<string, Draft[]>>(() => fromServer(rooms))
  const [adding, setAdding] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const list = drafts[branch] ?? []
  const setList = (fn: (l: Draft[]) => Draft[]) => setDrafts(d => ({ ...d, [branch]: fn(d[branch] ?? []) }))
  const original = fromServer(rooms)
  const dirty = (b: string) => JSON.stringify((drafts[b] ?? []).map(r => [r.id, r.name.trim()])) !== JSON.stringify((original[b] ?? []).map(r => [r.id, r.name]))

  const add = () => {
    const name = adding.replace(/\s+/g, ' ').trim()
    if (!name) return
    if (list.some(r => r.name.trim().toLowerCase() === name.toLowerCase())) { setError(`"${name}" is already listed`); return }
    setList(l => [...l, { name, used: 0 }])
    setAdding(''); setError('')
  }
  const move = (i: number, by: number) => setList(l => {
    const j = i + by
    if (j < 0 || j >= l.length) return l
    const next = [...l]; [next[i], next[j]] = [next[j], next[i]]
    return next
  })

  const save = async () => {
    setSaving(true); setError('')
    try {
      let latest: AssetRoom[] | null = null
      for (const b of branches.filter(x => dirty(x.value))) {
        const res = await fetch('/api/assets/locations', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branch: b.value, rooms: (drafts[b.value] ?? []).map(r => ({ id: r.id, name: r.name })) }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setBranch(b.value); setError(`${b.label}: ${data.error || 'Save failed'}`); return }
        latest = data.locations
      }
      if (latest) onSaved(latest)
      onClose()
    } catch {
      setError('Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-teal-600" />
            <h2 className="text-lg font-semibold text-gray-900">Location Settings</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <p className="text-sm text-gray-500">
            The rooms and areas of each branch. They are the choices in an asset&apos;s <b>Location</b> dropdown.
            Renaming a room renames it on every asset in it.
          </p>
          {branches.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {branches.map(b => (
                <button key={b.value} onClick={() => { setBranch(b.value); setError('') }}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${branch === b.value ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                  {b.label}{dirty(b.value) ? ' •' : ''}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            {list.length === 0 && <p className="text-sm text-gray-400 italic">No rooms yet for this branch.</p>}
            {list.map((r, i) => (
              <div key={r.id ?? `new-${i}`} className="flex items-center gap-2">
                <input value={r.name} onChange={e => { const v = e.target.value; setList(l => l.map((x, k) => k === i ? { ...x, name: v } : x)) }}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                <span className="w-16 text-right text-[11px] text-gray-400 whitespace-nowrap">{r.used ? `${r.used} asset${r.used > 1 ? 's' : ''}` : ''}</span>
                <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30" title="Move up"><ArrowUp size={14} /></button>
                <button onClick={() => move(i, 1)} disabled={i === list.length - 1} className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30" title="Move down"><ArrowDown size={14} /></button>
                <button onClick={() => setList(l => l.filter((_, k) => k !== i))} disabled={r.used > 0}
                  className="p-1 rounded hover:bg-red-50 text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={r.used > 0 ? 'Assets are still in this room — move them first' : 'Remove'}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input value={adding} onChange={e => setAdding(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
              placeholder="Add a room, e.g. Reception, Pedia Gym, OT Room 2"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            <button onClick={add} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-teal-700 border border-teal-600 hover:bg-teal-50">
              <Plus size={14} /> Add
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={save} disabled={saving || !branches.some(b => dirty(b.value))}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors" style={{ background: 'var(--teal)' }}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save Rooms
          </button>
        </div>
      </div>
    </div>
  )
}
