'use client'

// Presentational pieces shared by the Clinic Schedule views. Card / KPI /
// skeleton / empty state come from the Patient Dashboard kit and the controls
// from the Decking kit, so this page matches the pages redesigned alongside
// it. What lives here is the schedule-specific remainder: status colours,
// toolbar layout, error banner and table skeleton. Display only — nothing in
// this file fetches or writes anything.

import type { ReactNode } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { statusLabel } from '@/lib/schedule-status'
import { Skeleton, CARD_STYLE } from '../patients/dashboard/ui'
import { BTN_SM, CONTROL_STYLE, LABEL } from '../decking/ui'

// ── Status colours ───────────────────────────────────────────────────────────
// One palette for every view, so "Pending" is the same amber everywhere.
export const STATUS_STYLE: Record<string, { bg: string; fg: string; dot: string; border: string }> = {
  PENDING:     { bg: '#FFF8E6', fg: '#92400E', dot: '#D97706', border: '#FBD38D' },
  CONFIRMED:   { bg: '#E8F4F5', fg: '#14646F', dot: '#1A7B8A', border: '#A9D4D9' },
  CANCELLED:   { bg: '#FDECEC', fg: '#B91C1C', dot: '#DC2626', border: '#F5B5B5' },
  RESCHEDULED: { bg: '#F1EEFD', fg: '#5B21B6', dot: '#7C3AED', border: '#CFC3F7' },
  NO_SHOW:     { bg: '#FFF0E3', fg: '#9A3412', dot: '#EA580C', border: '#FBC79A' },
}
const STATUS_FALLBACK = { bg: '#F3F4F6', fg: '#374151', dot: '#6B7280', border: '#E5E7EB' }

export function statusStyle(status: string) {
  return STATUS_STYLE[status] ?? STATUS_FALLBACK
}

export function StatusBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const s = statusStyle(status)
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap leading-none ${size === 'sm' ? 'px-2 py-1 text-[10.5px]' : 'px-2.5 py-1 text-[11px]'}`}
      style={{ background: s.bg, color: s.fg }}>
      <span aria-hidden className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.dot }} />
      {statusLabel(status)}
    </span>
  )
}

// ── Department colours ───────────────────────────────────────────────────────
// Same hues as the Patient Dashboard department charts.
export const DEPT_COLOR: Record<string, string> = {
  PT: '#2AAABB',
  OT: '#1A7B8A',
  SLP: '#D97706',
  MD: '#DC2626',
  PSYCHOLOGY: '#7C3AED',
  ORTHOSIS: '#0E7490',
  SPED: '#8B5CF6',
}
export function deptColor(dept: string): string {
  return DEPT_COLOR[dept] ?? '#6B7280'
}

// ── Dates ────────────────────────────────────────────────────────────────────
export function fmtLongDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

// ── Layout ───────────────────────────────────────────────────────────────────
// Sticky table headers and the pinned first column need an opaque background,
// and the hover tint has to reach the sticky cell too.
export const CS_CSS = `
.cs-table thead th { position: sticky; top: 0; z-index: 2; }
.cs-table thead tr.cs-filter-row th { top: 38px; }
.cs-table .cs-pin { position: sticky; left: 0; z-index: 1; background: #fff; }
.cs-table thead .cs-pin { z-index: 3; }
.cs-table tbody tr:hover td { background: #F7FAFA; }
.cs-day:focus-visible, .cs-btn:focus-visible { outline: 2px solid var(--teal); outline-offset: -2px; }
`

/** The one filter bar each view gets: controls on the left, status on the right. */
export function Toolbar({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="rounded-xl px-4 py-3" style={CARD_STYLE}>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        {children}
        {right && <div className="flex items-center gap-3 ml-auto min-h-9">{right}</div>}
      </div>
    </div>
  )
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      {htmlFor
        ? <label htmlFor={htmlFor} className={LABEL} style={{ color: 'var(--mid-gray)' }}>{label}</label>
        : <span className={LABEL} style={{ color: 'var(--mid-gray)' }}>{label}</span>}
      {children}
    </div>
  )
}

/** "Updating…" while a reload runs behind content that stays on screen. */
export function UpdatingHint({ show }: { show: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] whitespace-nowrap" style={{ color: 'var(--mid-gray)' }} aria-live="polite">
      {show && <><Loader2 size={12} className="animate-spin" /> Updating…</>}
    </span>
  )
}

export function TodayTag({ label = 'Today' }: { label?: string }) {
  return (
    <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{ background: 'var(--teal)', color: '#fff' }}>
      {label}
    </span>
  )
}

/** A failed load, said out loud above whatever is still on screen. */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-3"
      style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
      <AlertTriangle size={16} className="flex-shrink-0" style={{ color: '#DC2626' }} />
      <p className="text-sm flex-1 min-w-[12rem]" style={{ color: '#991B1B' }}>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={BTN_SM} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
          <RefreshCw size={12} /> Try again
        </button>
      )}
    </div>
  )
}

export function KpiSkeletonRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => <Skeleton key={i} className="h-[78px] rounded-xl" />)}
    </div>
  )
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading schedules">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className="h-4 flex-1" style={{ maxWidth: c === 0 ? 180 : undefined, opacity: 1 - r * 0.1 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Header strip of a results card: title on the left, count on the right. */
export function CardBar({ title, count, children }: { title: ReactNode; count?: ReactNode; children?: ReactNode }) {
  return (
    <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
      <div className="flex items-center gap-2 min-w-0">
        <p className="text-sm font-bold truncate" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{title}</p>
        {children}
      </div>
      {count != null && (
        <span className="text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{count}</span>
      )}
    </div>
  )
}

export const TH = 'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap'
export const TH_BG = '#F7F9F9'
export const TD = 'px-4 py-3 align-middle'
