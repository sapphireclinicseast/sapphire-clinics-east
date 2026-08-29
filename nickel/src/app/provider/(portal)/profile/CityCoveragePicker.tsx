'use client'

import { useRef, useState } from 'react'
import { searchLocations, type PhLocation } from '@/lib/ph-locations'

export type CoverageArea = PhLocation

// Typeahead for city coverage. Type a city → pick from the dropdown → the chip
// carries province/region/ZIP automatically. Unlisted cities can still be added
// as free text (province/region/ZIP left blank).
export default function CityCoveragePicker({ value, onChange }: {
  value: CoverageArea[]; onChange: (v: CoverageArea[]) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const results = searchLocations(q)
  const already = new Set(value.map((v) => v.city.toLowerCase()))

  function add(loc: CoverageArea) {
    if (already.has(loc.city.toLowerCase())) { setQ(''); setOpen(false); return }
    onChange([...value, loc])
    setQ(''); setOpen(false); setHi(0)
    inputRef.current?.focus()
  }
  function addFreeText() {
    const city = q.trim(); if (!city) return
    add({ city, province: '', region: '', zip: '' })
  }
  function remove(city: string) { onChange(value.filter((v) => v.city !== city)) }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[hi]) add(results[hi]); else addFreeText() }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div>
      {/* Selected coverage chips */}
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {value.map((a) => (
            <span key={a.city} className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--line-2)] bg-white py-1 pl-2.5 pr-1.5 text-[12.5px]">
              <span>
                <span className="font-semibold text-[color:var(--ink)]">{a.city}</span>
                {(a.province || a.region || a.zip) && (
                  <span className="text-[color:var(--muted)]"> · {[a.province, a.zip].filter(Boolean).join(' ')}</span>
                )}
              </span>
              <button type="button" onClick={() => remove(a.city)} aria-label={`Remove ${a.city}`}
                className="flex h-5 w-5 items-center justify-center rounded text-[color:var(--muted)] hover:bg-[color:var(--mist-2)] hover:text-[color:var(--ink)]">×</button>
            </span>
          ))}
        </div>
      )}

      {/* Typeahead input */}
      <div className="relative">
        <input
          ref={inputRef}
          className="input"
          value={q}
          placeholder="Type a city — e.g. Quezon City, Cebu City, Davao City"
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
        />
        {open && q.trim() && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[color:var(--line)] bg-white shadow-lg">
            {results.map((loc, i) => (
              <button
                key={`${loc.city}-${loc.zip}`} type="button"
                onMouseDown={(e) => e.preventDefault()} onClick={() => add(loc)} onMouseEnter={() => setHi(i)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] ${i === hi ? 'bg-[color:var(--mist)]' : ''}`}
              >
                <span className="font-medium text-[color:var(--ink)]">{loc.city}</span>
                <span className="text-[11.5px] text-[color:var(--muted)]">{loc.province} · {loc.zip}</span>
              </button>
            ))}
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={addFreeText}
              className="flex w-full items-center gap-2 border-t border-[color:var(--line)] px-3 py-2 text-left text-[12.5px] text-[color:var(--steel)]">
              + Add “{q.trim()}” as a custom area
            </button>
          </div>
        )}
      </div>
      <p className="mt-1 text-[11px] text-[color:var(--slate)]">Clients in these areas can find and book you. Province, region and ZIP fill in automatically when you pick a listed city.</p>
    </div>
  )
}
