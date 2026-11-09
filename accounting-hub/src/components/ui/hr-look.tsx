'use client'

// ── The HR Hub house style, for hub pages ─────────────────────────
// hr.sapphireclinicseast.org: cream-green paper, green-grey borders, Aura
// green accents, cards with a coloured left edge, uppercase labels, soft
// pills. A page opts in by spreading HR_VARS on its root: that re-points the
// hub's colour tokens inside the page's own tree, so every cell, modal and
// picker below picks the palette up without being restyled one by one.

import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { HR_VARS } from './hr-tokens'

export { HR_VARS, HR_PAGE_CLASS, HR_PAGE_STYLE } from './hr-tokens'

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

// ── Notice pop-ups (BIR deadlines, recurring expenses, scholars, MOA renewals) ──
// HR Hub modal: white sheet, 12px radius, header and footer rules, soft shadow.
// Carries HR_VARS itself because these render outside any page root.
const NOTICE_TONES = {
  amber: { bg: '#fef3c7', fg: '#b45309', line: '#d97706' },
  red:   { bg: '#fee2e2', fg: '#b91c1c', line: '#dc2626' },
  green: { bg: '#EDF3D9', fg: '#3C6A5F', line: '#4A8073' },
  blue:  { bg: '#eff6ff', fg: '#1d4ed8', line: '#2563eb' },
} as const
export type NoticeTone = keyof typeof NOTICE_TONES

export function HrNoticeModal({ icon, title, subtitle, tone = 'amber', onClose, children, footer }: {
  icon: ReactNode; title: string; subtitle?: ReactNode; tone?: NoticeTone
  onClose: () => void; children: ReactNode; footer?: ReactNode
}) {
  const t = NOTICE_TONES[tone]
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ ...HR_VARS, background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
        className="bg-white w-full max-w-md max-h-[85vh] flex flex-col rounded-xl border overflow-hidden"
        style={{ borderColor: 'var(--light-gray)', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', color: 'var(--charcoal)' }}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--hr-line)' }}>
          <div className="flex items-start gap-3 min-w-0">
            <span className="flex-none w-9 h-9 rounded-[9px] flex items-center justify-center" style={{ background: t.bg, color: t.fg }}>{icon}</span>
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{title}</h2>
              {subtitle && <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex-none p-1 rounded-md transition-colors hover:bg-[var(--pale-teal)]"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <div className="px-5 py-4 space-y-2 overflow-y-auto">{children}</div>
        {footer && <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 border-t" style={{ borderColor: 'var(--hr-line)', background: '#fcfdfa' }}>{footer}</div>}
      </div>
    </div>
  )
}

/** One line in a notice pop-up: name, detail, a due pill and its date (or any trailing action). */
export function HrNoticeRow({ title, detail, pill, pillTone = 'amber', meta, trailing }: {
  title: string; detail?: ReactNode; pill?: string; pillTone?: NoticeTone; meta?: string; trailing?: ReactNode
}) {
  const t = NOTICE_TONES[pillTone]
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2.5"
      style={{ borderColor: 'var(--hr-line)', boxShadow: `inset 3px 0 0 ${t.line}` }}>
      <div className="min-w-0 pl-1">
        <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{title}</p>
        {detail && <p className="text-[11px] truncate" style={{ color: 'var(--mid-gray)' }}>{detail}</p>}
      </div>
      {trailing ?? (
        <div className="text-right whitespace-nowrap">
          {pill && <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: t.bg, color: t.fg }}>{pill}</span>}
          {meta && <p className="text-[10px] mt-0.5 font-mono" style={{ color: 'var(--mid-gray)' }}>{meta}</p>}
        </div>
      )}
    </div>
  )
}

/** Footer buttons for notice pop-ups. */
export const hrNoticeBtn = {
  primary: 'inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-semibold text-white transition-colors hover:bg-[var(--deep-teal)]',
  ghost: 'inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg border bg-white text-[13px] font-semibold transition-colors hover:border-[var(--teal)] hover:text-[var(--teal)]',
}
