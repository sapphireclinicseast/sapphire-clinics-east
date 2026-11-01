'use client'

// Pick an asset already in Asset Management for one branch — used by "Add to
// Asset Management" when an entry is a balance payment (the down payment made
// the asset; the balance adds to its cost so depreciation covers the full price).
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'

interface AssetRow { id: string; name: string; controlNumber: string | null; totalAmount: number; dateBought: string; classification: string }

const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ExistingAssetPicker({ branch, value, onChange }: { branch: string; value: string; onChange: (id: string) => void }) {
  const [rows, setRows] = useState<AssetRow[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    let alive = true
    fetch(`/api/assets?branch=${encodeURIComponent(branch)}`)
      .then(r => (r.ok ? r.json() : []))
      .then((d: AssetRow[]) => { if (alive) setRows(Array.isArray(d) ? d : []) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [branch])
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = (rows || []).filter(a => !t || `${a.name} ${a.controlNumber || ''}`.toLowerCase().includes(t))
    return list.sort((a, b) => String(b.dateBought).localeCompare(String(a.dateBought))).slice(0, 60)
  }, [rows, q])

  return (
    <div>
      <div className="relative mb-2">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or control no.…"
          className="w-full border rounded-lg pl-8 pr-3 py-2 text-sm" style={{ borderColor: 'var(--light-gray)' }} />
      </div>
      <div className="border rounded-lg max-h-56 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
        {rows == null ? (
          <div className="flex items-center justify-center py-6 text-xs" style={{ color: 'var(--mid-gray)' }}><Loader2 size={14} className="animate-spin mr-1.5" /> Loading assets…</div>
        ) : shown.length === 0 ? (
          <p className="text-center py-6 text-xs" style={{ color: 'var(--mid-gray)' }}>No assets found for this branch.</p>
        ) : shown.map(a => (
          <button key={a.id} type="button" onClick={() => onChange(a.id)}
            className="w-full text-left px-3 py-2 border-b last:border-b-0 text-xs flex items-start justify-between gap-2"
            style={{ borderColor: 'var(--light-gray)', background: value === a.id ? 'var(--pale-teal)' : undefined }}>
            <span className="min-w-0">
              <span className="block font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{a.name}</span>
              <span style={{ color: 'var(--mid-gray)' }}>{a.controlNumber || '—'} · {String(a.dateBought).slice(0, 10)} · {a.classification}</span>
            </span>
            <span className="font-mono whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(Number(a.totalAmount))}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
