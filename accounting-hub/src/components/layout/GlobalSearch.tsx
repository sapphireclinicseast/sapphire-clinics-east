'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Loader2, ArrowRight, CornerDownLeft } from 'lucide-react'

interface Hit {
  id: string; type: string; title: string; subtitle: string
  amount: number | null; reference: string; date: string; href: string
  detail: Record<string, string>
}

const SECTION: Record<string, string> = {
  '/sales-summary': 'Sales Summary', '/petty-cash': 'Petty Cash', '/expenses': 'Expenses',
  '/inventory': 'Inventory', '/chart-of-accounts': 'Chart of Accounts',
  '/asset-management': 'Asset Management',
}
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function GlobalSearch() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Hit[]>([])
  const [active, setActive] = useState<Hit | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
        const d = r.ok ? await r.json() : { results: [] }
        setResults(d.results || [])
      } catch { setResults([]) }
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) }
      if (e.key === 'Escape') { if (active) setActive(null); else setOpen(false) }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [active])

  const goToSection = (h: Hit) => { setActive(null); setOpen(false); setQ(''); setResults([]); router.push(h.href) }

  // group by type, preserving order
  const groups: { type: string; items: Hit[] }[] = []
  for (const r of results) {
    let g = groups.find(x => x.type === r.type)
    if (!g) { g = { type: r.type, items: [] }; groups.push(g) }
    g.items.push(r)
  }

  return (
    <div className="relative flex-1 max-w-xl" ref={boxRef}>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
        <input
          ref={inputRef}
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search transactions, suppliers, inventory, amounts, references…"
          className="w-full pl-9 pr-16 py-2 rounded-xl border text-sm outline-none focus:border-[var(--teal)]"
          style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}
        />
        {q ? (
          <button onClick={() => { setQ(''); setResults([]); inputRef.current?.focus() }} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X size={15} style={{ color: 'var(--mid-gray)' }} />
          </button>
        ) : (
          <kbd className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono"
            style={{ background: 'var(--light-gray)', color: 'var(--mid-gray)' }}>⌘K</kbd>
        )}
      </div>

      {/* Results dropdown */}
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-2 rounded-xl shadow-xl border bg-white max-h-[70vh] overflow-auto z-50"
          style={{ borderColor: 'var(--light-gray)' }}>
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin" style={{ color: 'var(--teal)' }} /></div>
          ) : results.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>No matches for “{q.trim()}”.</div>
          ) : (
            groups.map(g => (
              <div key={g.type}>
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide sticky top-0"
                  style={{ color: 'var(--mid-gray)', background: 'var(--off-white)' }}>{g.type}</div>
                {g.items.map(h => (
                  <button key={h.type + h.id} onClick={() => setActive(h)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--pale-teal)] transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--charcoal)' }}>{h.title}</p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--mid-gray)' }}>{h.subtitle}</p>
                    </div>
                    {h.amount != null && <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(h.amount)}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {/* Transaction detail popup */}
      {active && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setActive(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1 gap-3">
              <div>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{active.type}</span>
                <h2 className="text-lg font-bold mt-2" style={{ color: 'var(--charcoal)' }}>{active.title}</h2>
              </div>
              <button onClick={() => setActive(null)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>

            <div className="mt-3 rounded-xl border divide-y" style={{ borderColor: 'var(--light-gray)' }}>
              {Object.entries(active.detail).map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4 px-3 py-2" style={{ borderColor: 'var(--light-gray)' }}>
                  <span className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>{k}</span>
                  <span className="text-xs text-right" style={{ color: 'var(--charcoal)' }}>{v}</span>
                </div>
              ))}
            </div>

            <button onClick={() => goToSection(active)}
              className="w-full mt-5 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>
              Open in {SECTION[active.href] || 'section'} <ArrowRight size={15} />
            </button>
            <p className="text-[11px] text-center mt-2 flex items-center justify-center gap-1" style={{ color: 'var(--mid-gray)' }}>
              <CornerDownLeft size={11} /> Goes to where this transaction was created
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
