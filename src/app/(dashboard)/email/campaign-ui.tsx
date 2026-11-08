'use client'

// Presentational pieces shared by the Email Campaigns and SMS Campaigns pages
// (and only those two), so both screens share one header, tab bar, form field,
// status badge and table chrome. Display only — nothing here fetches, sends or
// decides who receives a message.

import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { CARD_STYLE, Skeleton } from '../patients/dashboard/ui'

export const CONTROL = 'w-full h-10 px-3 rounded-lg text-sm outline-none transition-colors focus:border-[var(--teal)]'
export const TEXTAREA = 'w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors focus:border-[var(--teal)]'
export const CONTROL_SM = 'h-8 px-2.5 rounded-lg text-xs outline-none focus:border-[var(--teal)]'
export const CONTROL_STYLE: CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }
export const LABEL = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5'
export const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed'
export const BTN_SECONDARY = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
export const TH = 'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap'
export const MODAL_BACKDROP: CSSProperties = { background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }
export const SUBTLE_BG = '#F6F9F8'

/** Page title block: eyebrow + title + one-line subtitle on the left, primary action on the right. */
export function PageHeader({ eyebrow, title, subtitle, action }: {
  eyebrow: string; title: string; subtitle: ReactNode; action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
          {eyebrow}
        </p>
        <h1 className="text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          {title}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>{subtitle}</p>
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  )
}

/** Pill tab bar, same look as the Customer Survey page tabs. */
export function PillTabs<T extends string>({ tabs, value, onChange, label }: {
  tabs: { id: T; label: string; icon: LucideIcon }[]
  value: T; onChange: (id: T) => void; label: string
}) {
  return (
    <div role="tablist" aria-label={label}
      className="inline-flex gap-1 p-1 rounded-xl overflow-x-auto max-w-full" style={CARD_STYLE}>
      {tabs.map(({ id, label: l, icon: Icon }) => {
        const active = value === id
        return (
          <button key={id} type="button" role="tab" aria-selected={active} onClick={() => onChange(id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${active ? '' : 'hover:bg-black/[0.04]'}`}
            style={active ? { background: 'var(--teal)', color: '#fff' } : { background: 'transparent', color: 'var(--mid-gray)' }}>
            <Icon size={15} />
            {l}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Label + control + hint. The label is only a <label> when it names a single
 * control (htmlFor) — it never wraps the children, so a click on empty space in
 * a radio/button group can't silently pick the group's first option.
 */
export function Field({ label, htmlFor, aside, hint, children }: {
  label: ReactNode; htmlFor?: string; aside?: ReactNode; hint?: ReactNode; children: ReactNode
}) {
  const labelCls = `${LABEL} mb-0`
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        {htmlFor
          ? <label htmlFor={htmlFor} className={labelCls} style={{ color: 'var(--mid-gray)' }}>{label}</label>
          : <p className={labelCls} style={{ color: 'var(--mid-gray)' }}>{label}</p>}
        {aside && <div className="flex-shrink-0 text-[11px]">{aside}</div>}
      </div>
      {children}
      {hint && <div className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'var(--mid-gray)' }}>{hint}</div>}
    </div>
  )
}

/** Equal-width segmented choice (send now / schedule, branch). */
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string; icon?: LucideIcon }[]
  value: T; onChange: (v: T) => void; label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 p-1 rounded-xl" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
      {options.map(({ value: v, label: l, icon: Icon }) => {
        const active = value === v
        return (
          <button key={v} type="button" role="radio" aria-checked={active} onClick={() => onChange(v)}
            className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${active ? '' : 'hover:bg-black/[0.04]'}`}
            style={active
              ? { background: '#fff', color: 'var(--teal)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { background: 'transparent', color: 'var(--mid-gray)' }}>
            {Icon && <Icon size={14} className="flex-shrink-0" />}
            <span className="truncate">{l}</span>
          </button>
        )
      })}
    </div>
  )
}

const STATUS_TONE: Record<string, { bg: string; fg: string; dot: string }> = {
  sent:      { bg: '#DCFCE7', fg: '#166534', dot: '#16A34A' },
  sending:   { bg: '#FEF3C7', fg: '#92400E', dot: '#D97706' },
  partial:   { bg: '#FEF3C7', fg: '#92400E', dot: '#D97706' },
  partialFailed: { bg: '#FFEDD5', fg: '#9A3412', dot: '#EA580C' },
  scheduled: { bg: '#DBEAFE', fg: '#1E40AF', dot: '#3B82F6' },
  failed:    { bg: '#FEE2E2', fg: '#991B1B', dot: '#DC2626' },
  draft:     { bg: '#F1F5F9', fg: '#475569', dot: '#94A3B8' },
}

function Pill({ tone, title, children }: { tone: { bg: string; fg: string; dot: string }; title?: string; children: ReactNode }) {
  return (
    <span title={title}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide leading-tight whitespace-nowrap"
      style={{ background: tone.bg, color: tone.fg }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tone.dot }} />
      {children}
    </span>
  )
}

/**
 * Campaign status badge. Same cases, in the same order, as the badges these
 * pages used before: auto-tranche partial, legacy failed-partial, short sent,
 * then the plain status.
 */
export function StatusBadge({ row }: {
  row: { status: string; sentCount: number; recipientCount: number; nextTrancheAt: string | null }
}) {
  if (row.status === 'partial') {
    const nextLabel = row.nextTrancheAt
      ? new Date(row.nextTrancheAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : null
    return (
      <div className="flex flex-col items-start gap-1">
        <Pill tone={STATUS_TONE.partial} title={nextLabel ? 'Next batch fires automatically — no action needed' : undefined}>
          Partial ({row.sentCount}/{row.recipientCount})
        </Pill>
        {nextLabel && <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>Next batch {nextLabel}</span>}
      </div>
    )
  }
  if (row.status === 'failed' && row.sentCount > 0 && row.sentCount < row.recipientCount) {
    return <Pill tone={STATUS_TONE.partialFailed}>Partial ({row.sentCount}/{row.recipientCount})</Pill>
  }
  if (row.status === 'sent' && row.sentCount > 0 && row.sentCount < row.recipientCount) {
    return <Pill tone={STATUS_TONE.sent}>Sent ({row.sentCount}/{row.recipientCount})</Pill>
  }
  return <Pill tone={STATUS_TONE[row.status] ?? STATUS_TONE.draft}>{row.status}</Pill>
}

/** Inline callout. */
export function Notice({ tone = 'info', icon: Icon, children }: {
  tone?: 'info' | 'warn' | 'success'; icon?: LucideIcon; children: ReactNode
}) {
  const t = tone === 'warn'
    ? { bg: '#FFFBEB', border: '#FDE68A', fg: '#92400E' }
    : tone === 'success'
      ? { bg: '#ECFDF5', border: '#A7F3D0', fg: '#065F46' }
      : { bg: SUBTLE_BG, border: 'var(--light-gray)', fg: 'var(--charcoal)' }
  return (
    <div className="flex gap-2 text-xs leading-relaxed px-3 py-2.5 rounded-lg" style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.fg }}>
      {Icon && <Icon size={14} className="flex-shrink-0 mt-px" />}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Visible load error with an optional retry. */
export function ErrorBanner({ title, message, onRetry }: { title: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
      <AlertTriangle size={16} className="flex-shrink-0" style={{ color: '#DC2626' }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: '#991B1B' }}>{title}</p>
        {message && <p className="text-xs mt-0.5 break-words" style={{ color: '#B91C1C' }}>{message}</p>}
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className={BTN_SECONDARY} style={{ ...CONTROL_STYLE, color: '#991B1B', borderColor: '#FECACA' }}>
          <RefreshCw size={12} /> Try again
        </button>
      )}
    </div>
  )
}

/** Placeholder rows for a campaign table while it loads. */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y" style={{ borderColor: 'var(--light-gray)' }} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3.5" style={{ width: `${70 - i * 8}%` }} />
            <Skeleton className="h-2.5" style={{ width: `${45 - i * 5}%` }} />
          </div>
          <Skeleton className="h-3.5 w-12" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-3.5 w-28 hidden sm:block" />
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  )
}

/** Skeleton row for a KPI strip. */
export function KpiSkeletonRow({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl px-4 py-3.5" style={CARD_STYLE}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-14 mt-2" />
          <Skeleton className="h-3 w-24 mt-2" />
        </div>
      ))}
    </>
  )
}

/** Small square icon button for table row actions. */
export function RowAction({ title, onClick, hover, children }: {
  title: string; onClick: () => void; hover: string; children: ReactNode
}) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${hover}`}>
      {children}
    </button>
  )
}

/** "Mar 4, 2026, 9:00 AM"-style date used in the campaign tables. */
export const fmtDateTime = (d: string) => new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
