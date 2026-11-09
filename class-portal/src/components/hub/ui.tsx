'use client'

// Presentational kit for the signed-in Class Portal, ported from the
// Operations Hub (src/app/(dashboard)/patients/dashboard/ui.tsx and
// src/app/(dashboard)/decking/ui.tsx in the repo root) so pages here can copy
// Ops Hub patterns across with the same names and props.
//
// Colours come from the Ops Hub token NAMES, which globals.css maps onto the
// Aura Academy palette: --teal → moss, --deep-teal → narra, --pale-teal →
// paper-2, --charcoal → ink, --light-gray → paper-3. Never hard-code the Ops
// Hub teal here; use the variables (or an Aura hex where a literal is needed).
//
// Display only: nothing in this file fetches, saves or checks permissions.

import type { CSSProperties, ReactNode } from 'react'

// ── Tokens ───────────────────────────────────────────────────────────────────
export const CARD_STYLE = { background: '#fff', border: '1px solid var(--light-gray)' } as const
/** Header rows, table heads, quiet panels. A step lighter than --paper. */
export const SUBTLE_BG = '#FAF7F1'
export const DANGER = '#B42318'
/** Visible keyboard focus ring, shared by every interactive element. */
export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--teal)]'

export const CONTROL = 'h-9 px-3 rounded-lg text-sm outline-none transition-[border-color,box-shadow] focus:border-[color:var(--teal)] focus:shadow-[0_0_0_3px_rgba(84,125,114,0.18)] disabled:opacity-60 disabled:cursor-not-allowed'
export const CONTROL_SM = 'h-8 px-2.5 rounded-lg text-xs outline-none transition-[border-color,box-shadow] focus:border-[color:var(--teal)] focus:shadow-[0_0_0_3px_rgba(84,125,114,0.18)]'
export const CONTROL_STYLE: CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)', fontFamily: 'var(--font-body)' }
export const LABEL = 'block text-[11px] font-semibold uppercase tracking-wider mb-1'
export const LABEL_STYLE: CSSProperties = { color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }

export const BTN_PRIMARY = `inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold text-white whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`
export const BTN_SECONDARY = `inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors hover:bg-[color:var(--paper)] disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`
export const BTN_SM = `inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors hover:bg-[color:var(--paper)] disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`
/** Low-emphasis destructive action: red text, no fill until hover. */
export const BTN_DANGER_GHOST = `inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`
export const PRIMARY_STYLE: CSSProperties = { background: 'var(--deep-teal)' }
export const SECONDARY_STYLE: CSSProperties = { ...CONTROL_STYLE, color: 'var(--charcoal)' }

export const TH = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap'
export const TH_STYLE: CSSProperties = { color: 'var(--mid-gray)', background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)', fontFamily: 'var(--font-display)' }
export const TD = 'px-3 py-2.5 align-top'
export const TR = 'transition-colors hover:bg-[#FBF9F5]'
export const TR_STYLE: CSSProperties = { borderTop: '1px solid var(--light-gray)' }
export const MODAL_BACKDROP: CSSProperties = { background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(4px)' }
/** Content column used by signed-in dashboards. */
export const PAGE = 'max-w-[1100px] mx-auto space-y-5 min-w-0'

// ── Icons ────────────────────────────────────────────────────────────────────
// The class portal has no icon package; these are Feather/Lucide-style
// strokes drawn inline so they inherit currentColor.
const ICON_PATHS = {
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  check: <><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  refresh: <><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  userPlus: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>,
  student: <><path d="M2 9l10-4 10 4-10 4z" /><path d="M6 11v4c0 1 2.5 3 6 3s6-2 6-3v-4" /></>,
  teacher: <><path d="M4 6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" /><path d="M20 6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 15h2" /></>,
  tag: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" /><path d="M7 7h.01" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  table: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
  external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14 21 3" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  x: <><path d="M18 6 6 18M6 6l12 12" /></>,
  chevronRight: <><path d="m9 18 6-6-6-6" /></>,
  menu: <><path d="M3 6h18M3 12h18M3 18h18" /></>,
  building: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" /></>,
} as const
export type IconName = keyof typeof ICON_PATHS

export function Icon({ name, size = 16, className = '', style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`flex-shrink-0 ${className}`} style={style}>
      {ICON_PATHS[name]}
    </svg>
  )
}

// ── Page structure ───────────────────────────────────────────────────────────
/** Eyebrow + title + one-line description on the left, page actions on the right. */
export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)', fontFamily: 'var(--font-display)' }}>{eyebrow}</p>
        )}
        <h1 className="text-[22px] sm:text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          {title}
        </h1>
        {description && <p className="text-sm mt-1 max-w-2xl break-words" style={{ color: 'var(--mid-gray)' }}>{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Small uppercase label that heads a group of cards. */
export function GroupLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-0.5">
      <h2 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>{children}</h2>
      {hint && <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{hint}</p>}
    </div>
  )
}

export function DashCard({
  title, description, icon, action, children, footer, flush = false, className = '', id,
}: {
  title: ReactNode
  /** One line under the title saying what the card shows. */
  description?: ReactNode
  icon?: ReactNode
  /** Right-hand slot in the header (toggles, counts, buttons). */
  action?: ReactNode
  children: ReactNode
  /** Small print under the body (method notes, caveats). */
  footer?: ReactNode
  /** No body padding — for full-bleed tables. */
  flush?: boolean
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={`rounded-xl flex flex-col min-w-0 ${className}`} style={CARD_STYLE}>
      <header className="px-4 sm:px-5 pt-4 pb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2"
        style={{ borderBottom: '1px solid var(--light-gray)' }}>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[14px] font-bold leading-tight tracking-normal"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            {icon && <span className="flex-shrink-0" style={{ color: 'var(--teal)' }}>{icon}</span>}
            {title}
          </h2>
          {description && (
            <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--mid-gray)' }}>{description}</p>
          )}
        </div>
        {action && <div className="flex-shrink-0 max-w-full">{action}</div>}
      </header>
      <div className={`flex-1 min-w-0 ${flush ? '' : 'p-4 sm:p-5'}`}>{children}</div>
      {footer && (
        <div className="px-4 sm:px-5 py-3 text-[11px] leading-relaxed rounded-b-xl" style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--mid-gray)', background: SUBTLE_BG }}>
          {footer}
        </div>
      )}
    </section>
  )
}

export function KpiCard({
  label, value, sub, accent = 'var(--teal)', icon,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  accent?: string
  icon?: ReactNode
}) {
  return (
    <div className="rounded-xl px-4 py-3.5 min-w-0" style={CARD_STYLE}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider truncate" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>
          {label}
        </p>
        {icon && <span className="flex-shrink-0" style={{ color: accent }}>{icon}</span>}
      </div>
      <p className="text-2xl font-bold mt-1 leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
      {sub && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--mid-gray)' }}>{sub}</p>}
    </div>
  )
}

export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`animate-pulse rounded-md ${className}`} style={{ background: 'var(--paper-2)', ...style }} />
}

/** Placeholder KPI tiles while counts load. */
export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, n) => (
        <div key={n} className="rounded-xl px-4 py-3.5" style={CARD_STYLE} aria-hidden>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-14 mt-2" />
          <Skeleton className="h-3 w-24 mt-2" />
        </div>
      ))}
    </>
  )
}

/** Placeholder rows for a table or list while it loads. */
export function RowsSkeleton({ rows = 5, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, n) => (
        <div key={n} className="flex items-center gap-4 px-4 sm:px-5 py-3.5" style={{ borderTop: n ? '1px solid var(--light-gray)' : undefined }} aria-hidden>
          <Skeleton className="w-8 h-8 rounded-full" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3.5" style={{ width: `${44 - n * 4}%` }} />
            <Skeleton className="h-2.5" style={{ width: `${30 - n * 3}%` }} />
          </div>
          <Skeleton className="h-5 w-20 rounded-full hidden sm:block" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  )
}

/** Placeholder rows for a bar-list card while it loads. */
export function BarListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-3.5" style={{ width: 130 }} />
          <Skeleton className="h-4 flex-1" style={{ maxWidth: `${90 - i * 12}%` }} />
          <Skeleton className="h-3.5" style={{ width: 48 }} />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: ReactNode; icon?: IconName }) {
  return (
    <div className="py-10 px-6 text-center">
      {icon && <Icon name={icon} size={24} className="mx-auto mb-2" style={{ color: 'var(--light-gray)' }} />}
      <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{title}</p>
      {hint && <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: 'var(--mid-gray)' }}>{hint}</p>}
    </div>
  )
}

export function ErrorCard({ title, hint, onRetry }: { title: string; hint?: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl text-center px-6 py-10" style={{ background: '#fff', border: '1px solid #FECACA' }}>
      <Icon name="alert" size={20} className="mx-auto mb-2" style={{ color: DANGER }} />
      <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{title}</p>
      {hint && <p className="text-xs mt-1 max-w-sm mx-auto break-words" style={{ color: 'var(--mid-gray)' }}>{hint}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${BTN_SECONDARY} mt-4 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
          <Icon name="refresh" size={12} /> Try again
        </button>
      )}
    </div>
  )
}

// ── Status ───────────────────────────────────────────────────────────────────
export type Tone = 'success' | 'error' | 'warn' | 'info' | 'neutral'

const TONES: Record<Tone, { bg: string; fg: string; dot: string; border: string; icon: IconName }> = {
  success: { bg: '#EEF5E8', fg: '#2F5A28', dot: 'var(--sage)', border: '#CFE0BF', icon: 'check' },
  error:   { bg: '#FEF2F2', fg: '#991B1B', dot: '#DC2626', border: '#FECACA', icon: 'alert' },
  warn:    { bg: '#FBF3E8', fg: '#7A4E21', dot: 'var(--sun)', border: '#EBD3B4', icon: 'alert' },
  info:    { bg: SUBTLE_BG, fg: 'var(--charcoal)', dot: 'var(--slate)', border: 'var(--light-gray)', icon: 'info' },
  neutral: { bg: SUBTLE_BG, fg: 'var(--mid-gray)', dot: 'var(--light-gray)', border: 'var(--light-gray)', icon: 'info' },
}

/** Status pill: a coloured dot AND a text label, so status never rests on colour alone. */
export function StatusPill({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  const t = TONES[tone]
  return (
    <span title={title}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4 whitespace-nowrap align-middle"
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.border}` }}>
      <span aria-hidden className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.dot }} />
      {children}
    </span>
  )
}

/** Small square tag for categories (role, intern, partial). Text always carries the meaning. */
export function Tag({ children, tone = 'neutral', title }: { children: ReactNode; tone?: Tone | 'brand'; title?: string }) {
  const t = tone === 'brand'
    ? { bg: 'var(--pale-teal)', fg: 'var(--deep-teal)', border: 'var(--light-gray)' }
    : TONES[tone]
  return (
    <span title={title}
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider leading-none whitespace-nowrap align-middle"
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.border}` }}>
      {children}
    </span>
  )
}

/** Department / code chip, kept for parity with the Ops Hub kit. */
export function DeptChip({ code, color }: { code: string; color: string }) {
  return (
    <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded leading-none align-middle"
      style={{ background: `${color}18`, color }}>
      {code}
    </span>
  )
}

/** Inline result message (saved, failed, heads-up). Icon + text, never colour alone. */
export function Banner({ tone, children, onRetry }: { tone: Exclude<Tone, 'neutral'>; children: ReactNode; onRetry?: () => void }) {
  const t = TONES[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'}
      className="flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm leading-relaxed"
      style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.fg }}>
      <Icon name={t.icon} size={16} className="mt-0.5" />
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${BTN_SM} -my-1`}
          style={{ border: `1px solid ${t.border}`, color: t.fg, background: '#fff' }}>
          <Icon name="refresh" size={12} /> Try again
        </button>
      )}
    </div>
  )
}

// ── Controls ─────────────────────────────────────────────────────────────────
export function PillTabs({ tabs, value, onChange, label, size = 'md' }: {
  tabs: { id: string; label: ReactNode; title?: string; count?: number }[]
  value: string
  onChange: (id: string) => void
  label: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex gap-1 p-1 rounded-xl overflow-x-auto max-w-full" style={{ background: 'var(--pale-teal)', fontFamily: 'var(--font-display)' }}>
      {tabs.map(t => {
        const active = value === t.id
        return (
          <button key={t.id} type="button" role="tab" aria-selected={active} title={t.title} onClick={() => onChange(t.id)}
            className={`${size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5'} inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--teal)] ${active ? '' : 'hover:bg-black/[0.04]'}`}
            style={active
              ? { background: '#fff', color: 'var(--deep-teal)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
              : { background: 'transparent', color: 'var(--mid-gray)' }}>
            {t.label}
            {typeof t.count === 'number' && (
              <span className="tabular-nums text-[10.5px] px-1.5 rounded-full" style={{ background: active ? 'var(--pale-teal)' : 'rgba(0,0,0,0.05)' }}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Centered dialog shell. Clicking the backdrop calls onClose (as the old modals did). */
export function Dialog({ title, description, onClose, children, labelId }: {
  title: ReactNode
  description?: ReactNode
  onClose: () => void
  children: ReactNode
  /** id for aria-labelledby; must be unique on the page. */
  labelId: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={MODAL_BACKDROP} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={labelId}
        className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <header className="px-5 pt-4 pb-3 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <div className="min-w-0">
            <h2 id={labelId} className="text-[15px] font-bold leading-tight tracking-normal" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{title}</h2>
            {description && <p className="text-xs mt-1 break-words" style={{ color: 'var(--mid-gray)' }}>{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={`w-8 h-8 -mr-1.5 -mt-1 inline-flex items-center justify-center rounded-lg hover:bg-[color:var(--paper)] ${FOCUS}`} style={{ color: 'var(--mid-gray)' }}>
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ── Names ────────────────────────────────────────────────────────────────────
// Records are often typed in ALL CAPS. Re-case for display only, and only when
// the value has no lower-case letters at all — anything typed in mixed case is
// left as typed. Same rule as the Ops Hub's decking/ui displayName.
const ROMAN_NUMERALS = new Set(['ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi', 'xii'])

export function displayName(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  if (!s || /[a-z]/.test(s)) return s
  return s.toLowerCase().replace(/[a-z]+/g, (w: string, offset: number, whole: string) => {
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
      style={{ width: size, height: size, fontSize: size * 0.36, background: 'var(--pale-teal)', color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>
      {text}
    </span>
  )
}
