'use client'

// ── The HR Hub house style, for hub pages ─────────────────────────
// hr.sapphireclinicseast.org: cream-green paper, green-grey borders, Aura
// green accents, cards with a coloured left edge, uppercase labels, soft
// pills. A page opts in by spreading HR_VARS on its root: that re-points the
// hub's colour tokens inside the page's own tree, so every cell, modal and
// picker below picks the palette up without being restyled one by one.

import type { CSSProperties } from 'react'

export const HR_VARS = {
  '--off-white': '#F6F8EE',   // paper
  '--light-gray': '#DDE6CC',  // border
  '--mid-gray': '#55616A',    // secondary text
  '--charcoal': '#233038',    // text
  '--teal': '#4A8073',        // Aura green (buttons, accents)
  '--deep-teal': '#3C6A5F',
  '--pale-teal': '#EDF3D9',
  '--hr-line': '#E9EFDC',     // row lines
  '--hr-faint': '#8A9AA0',
  '--hr-head': '#f8faf6',     // table header / toolbar
} as CSSProperties

/** Root wrapper: fills the dashboard's content area (its padding included) with the HR paper. */
export const HR_PAGE_CLASS = '-m-4 lg:-m-6 p-4 lg:p-6 space-y-4 min-h-[calc(100%+2rem)] lg:min-h-[calc(100%+3rem)]'
export const HR_PAGE_STYLE: CSSProperties = { ...HR_VARS, background: 'var(--off-white)', color: 'var(--charcoal)' }

/** Loading shimmer (`hr-shimmer` class). Render once per page. */
export function HrShimmerStyle() {
  return <style>{`.hr-shimmer{background:linear-gradient(90deg,#f1f4ec 0%,#f8faf4 50%,#f1f4ec 100%);background-size:200% 100%;animation:hr-shimmer 1.2s linear infinite}@keyframes hr-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}@media (prefers-reduced-motion:reduce){.hr-shimmer{animation:none}}`}</style>
}

export const hrBtn = {
  ghost: 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border bg-white text-xs font-semibold transition-colors hover:border-[var(--teal)] hover:text-[var(--teal)] disabled:opacity-50',
  primary: 'inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-semibold text-white transition-colors hover:bg-[var(--deep-teal)] disabled:opacity-50',
  outline: 'inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border bg-white text-[13px] font-semibold transition-colors hover:bg-[var(--pale-teal)] disabled:opacity-50',
}

export type StatTone = 'amber' | 'red' | 'green' | 'blue' | 'zero'
const TONES: Record<StatTone, { line: string; bg: string; fg: string }> = {
  amber: { line: '#d97706', bg: '#fffbeb', fg: '#b45309' },
  red:   { line: '#dc2626', bg: '#fef2f2', fg: '#b91c1c' },
  green: { line: '#059669', bg: '#ffffff', fg: '#047857' },
  blue:  { line: '#2563eb', bg: '#eff6ff', fg: '#1d4ed8' },
  zero:  { line: '#DDE6CC', bg: '#ffffff', fg: '#8A9AA0' },
}

/** HR-style stat card: label, big value, one-line sub. Clickable when onClick is given. */
export function StatCard({ label, value, sub, tone = 'zero', accent, active, loading, onClick, title, activeSub = 'Showing these below · click to clear', compact }: {
  label: string; value: string; sub: string
  tone?: StatTone
  /** Custom colours instead of a tone (e.g. one colour per account type). */
  accent?: { line: string; bg?: string; fg?: string }
  active?: boolean; loading?: boolean; onClick?: () => void; title?: string; activeSub?: string
  /** Smaller value text, for long peso amounts in narrow cards. */
  compact?: boolean
}) {
  const t = accent ? { line: accent.line, bg: accent.bg || '#ffffff', fg: accent.fg || 'var(--charcoal)' } : TONES[tone]
  if (loading) {
    return <div className="h-[92px] rounded-lg border hr-shimmer" style={{ borderColor: 'var(--light-gray)', borderLeft: '4px solid var(--light-gray)' }} />
  }
  return (
    <button type="button" onClick={onClick} disabled={!onClick} title={title} aria-pressed={onClick ? !!active : undefined}
      className="text-left min-w-0 rounded-lg border px-3 sm:px-4 py-3 transition-shadow enabled:hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default"
      style={{ background: t.bg, borderColor: 'var(--light-gray)', borderLeft: `4px solid ${t.line}`, boxShadow: active ? '0 0 0 2px #a7d3cd' : undefined, outlineColor: 'var(--teal)' }}>
      <p className="text-[11.5px] font-semibold uppercase tracking-[.4px] truncate" style={{ color: 'var(--mid-gray)' }}>{label}</p>
      <p className={`${compact ? 'text-[17px] sm:text-xl' : 'text-[19px] sm:text-2xl'} font-extrabold leading-tight tabular-nums truncate`}
        style={{ fontFamily: 'var(--font-display)', color: t.fg }} title={value}>{value}</p>
      <p className="text-xs truncate" style={{ color: 'var(--mid-gray)' }}>{active ? activeSub : sub}</p>
    </button>
  )
}
