'use client'

// Small presentational pieces shared by the Patient Dashboard sections, so every
// card has the same header, spacing, empty state and skeleton. Uses the app's
// existing tokens (white card, --light-gray rule, --charcoal / --mid-gray type).

import type { CSSProperties, ReactNode } from 'react'

export const CARD_STYLE = { background: '#fff', border: '1px solid var(--light-gray)' } as const

export function DashCard({
  title, description, icon, action, children, footer, flush = false, className = '',
}: {
  title: string
  /** One line under the title saying what the card shows. */
  description?: ReactNode
  icon?: ReactNode
  /** Right-hand slot in the header (toggles, counts). */
  action?: ReactNode
  children: ReactNode
  /** Small print under the body (method notes, caveats). */
  footer?: ReactNode
  /** No body padding — for maps and full-bleed tables. */
  flush?: boolean
  className?: string
}) {
  return (
    <section className={`rounded-xl flex flex-col min-w-0 ${className}`} style={CARD_STYLE}>
      <header className="px-5 pt-4 pb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2"
        style={{ borderBottom: '1px solid var(--light-gray)' }}>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[14px] font-bold leading-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            {icon && <span className="flex-shrink-0" style={{ color: 'var(--teal)' }}>{icon}</span>}
            {title}
          </h2>
          {description && (
            <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--mid-gray)' }}>{description}</p>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </header>
      <div className={`flex-1 min-w-0 ${flush ? '' : 'p-5'}`}>{children}</div>
      {footer && (
        <div className="px-5 py-3 text-[11px] leading-relaxed" style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
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
        <p className="text-[11px] font-semibold uppercase tracking-wider truncate" style={{ color: 'var(--mid-gray)' }}>
          {label}
        </p>
        {icon && <span className="flex-shrink-0" style={{ color: accent }}>{icon}</span>}
      </div>
      <p className="text-2xl font-bold mt-1 leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{sub}</p>}
    </div>
  )
}

export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`animate-pulse rounded-md ${className}`} style={{ background: '#eef3f1', ...style }} />
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

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-12 px-6 text-center">
      <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{title}</p>
      {hint && <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: 'var(--mid-gray)' }}>{hint}</p>}
    </div>
  )
}

/** Department code chip, coloured the same everywhere on the page. */
export function DeptChip({ code, color }: { code: string; color: string }) {
  return (
    <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded leading-none align-middle"
      style={{ background: `${color}18`, color }}>
      {code}
    </span>
  )
}
