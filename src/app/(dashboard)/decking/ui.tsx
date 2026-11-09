'use client'

// Presentational pieces used only by the Decking board. Card / KPI / skeleton /
// empty-state come from the Patient Dashboard kit so Decking matches the pages
// redesigned alongside it; what lives here is the Decking-specific remainder.

import type { CSSProperties, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export const CONTROL = 'h-9 px-3 rounded-lg text-sm outline-none focus:border-[var(--teal)]'
export const CONTROL_SM = 'h-8 px-2.5 rounded-lg text-xs outline-none focus:border-[var(--teal)]'
export const CONTROL_STYLE: CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)', fontFamily: 'var(--font-body)' }
export const LABEL = 'block text-[11px] font-semibold uppercase tracking-wider mb-1'
export const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2'
export const BTN_SECONDARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors hover:bg-gray-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2'
export const BTN_SM = 'inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors hover:bg-gray-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2'
export const SUBTLE_BG = '#F6F9F8'
export const TEAL_HEX = '#1A7B8A'

// ── Grid hover / focus behaviour ────────────────────────────────────────────
// Secondary cell controls (block an hour, remove a patient, add a second
// patient) are hidden until the cell is hovered or focused — but only on
// devices that can hover. On touch screens there is no hover, so they stay
// visible rather than becoming unreachable.
export const DECK_CSS = `
.dk-btn:focus-visible { outline: 2px solid var(--teal); outline-offset: -2px; border-radius: 5px; }
.dk-reveal { transition: opacity .12s ease; }
@media (hover: hover) {
  .dk-cell .dk-reveal { opacity: 0; }
  .dk-cell:hover .dk-reveal, .dk-cell:focus-within .dk-reveal { opacity: 1; }
}
.dk-open { transition: background-color .12s ease, border-color .12s ease; }
.dk-open:hover, .dk-open:focus-within { background: #EAF7EE !important; border-color: #86CF9B !important; }
.dk-booked { transition: box-shadow .12s ease; }
.dk-booked:hover { box-shadow: inset 0 0 0 1px rgba(0,0,0,.08); }
.dk-icon-btn { transition: background-color .12s ease, color .12s ease; }
.dk-icon-btn:hover { background: rgba(0,0,0,.06); }
`

// ── Names ────────────────────────────────────────────────────────────────────
// Records are often typed in ALL CAPS. Re-case for display only, and only when
// the value has no lower-case letters at all — anything typed in mixed case is
// left as typed. Same rule as PatientsClient's displayCase(…, 'name').
//
// The letter classes are Unicode (\p{Ll}, \p{L}), not [a-z]. With [a-z] the ñ
// in RIÑOZA matched nothing, so the name split into two "words" — "ri" and
// "oza" — and came out as "RiñOza". Filipino and Spanish surnames carry ñ
// routinely, so this is a name the clinic has on file, not an edge case.
const ROMAN_NUMERALS = new Set(['ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi', 'xii'])

export function displayName(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  if (!s || /\p{Ll}/u.test(s)) return s
  return s.toLowerCase().replace(/\p{L}+/gu, (w: string, offset: number, whole: string) => {
    if (offset > 0 && /\d/.test(whole[offset - 1])) return w
    if (ROMAN_NUMERALS.has(w)) return w.toUpperCase()
    return w[0].toUpperCase() + w.slice(1)
  })
}

/** "Last, First" for display. */
export function personLabel(p: { firstName?: string | null; lastName?: string | null }): string {
  return displayName(`${p.lastName ?? ''}, ${p.firstName ?? ''}`.replace(/^,\s*|,\s*$/g, ''))
}

export function initials(firstName?: string | null, lastName?: string | null): string {
  const a = (firstName ?? '').trim()[0] ?? ''
  const b = (lastName ?? '').trim()[0] ?? ''
  return (a + b).toUpperCase() || '?'
}

export function Avatar({ text, size = 34 }: { text: string; size?: number }) {
  return (
    <span aria-hidden className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36, background: 'var(--pale-teal)', color: 'var(--teal)' }}>
      {text}
    </span>
  )
}

// ── Controls ─────────────────────────────────────────────────────────────────
export function PillTabs({ tabs, value, onChange, label, size = 'md' }: {
  tabs: { id: string; label: ReactNode; title?: string }[]
  value: string
  onChange: (id: string) => void
  label: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex gap-1 p-1 rounded-xl overflow-x-auto max-w-full" style={{ background: '#F3F6F5' }}>
      {tabs.map(t => {
        const active = value === t.id
        return (
          <button key={t.id} type="button" role="tab" aria-selected={active} title={t.title} onClick={() => onChange(t.id)}
            className={`${size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5'} inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 ${active ? '' : 'hover:bg-black/[0.04]'}`}
            style={active
              ? { background: '#fff', color: 'var(--teal)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
              : { background: 'transparent', color: 'var(--mid-gray)' }}>
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

export function ErrorCard({ title, hint, onRetry }: { title: string; hint?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl text-center px-6 py-10" style={{ background: '#fff', border: '1px solid #FECACA' }}>
      <AlertTriangle size={20} className="mx-auto mb-2" style={{ color: '#DC2626' }} />
      <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{title}</p>
      {hint && <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: 'var(--mid-gray)' }}>{hint}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${BTN_SECONDARY} mt-4 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
          <RefreshCw size={12} /> Try again
        </button>
      )}
    </div>
  )
}

/** Booked / open / unavailable to scale, as one thin bar. */
export function CapacityBar({ booked, open, blocked, height = 6, className = '' }: {
  booked: number; open: number; blocked: number; height?: number; className?: string
}) {
  const total = booked + open + blocked
  return (
    <div className={`flex overflow-hidden rounded-full ${className}`} style={{ height, background: '#EEF2F1' }}
      role="img" aria-label={`${booked} booked, ${open} open, ${blocked} unavailable`}>
      {total > 0 && ([
        { w: booked, c: '#7FB2E5', t: `${booked} booked` },
        { w: open, c: '#9AD7AB', t: `${open} open` },
        { w: blocked, c: '#D2D7DC', t: `${blocked} unavailable` },
      ]).filter(seg => seg.w > 0).map(seg => (
        <div key={seg.t} title={seg.t} style={{ width: `${(seg.w / total) * 100}%`, background: seg.c }} />
      ))}
    </div>
  )
}
