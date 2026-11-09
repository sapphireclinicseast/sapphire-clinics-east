// Small HR Hub-look pieces shared by the PayMongo page and its POS Links panel.
// Display only: no state, no data.

import type { CSSProperties, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

export const LINE: CSSProperties = { borderColor: 'var(--hr-line)' }
export const BORDER: CSSProperties = { borderColor: 'var(--light-gray)' }

/** Text inputs and selects. */
export const FIELD = 'w-full h-9 px-3 rounded-lg border bg-white text-[13px] outline-none transition-shadow focus:border-[var(--teal)] focus:shadow-[0_0_0_3px_rgba(74,128,115,0.12)] disabled:opacity-60'
export const LABEL = 'block text-[11px] font-bold uppercase tracking-[.4px] mb-1'

/** Segmented-toggle button colours. */
export const seg = (on: boolean): CSSProperties => (on ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' })

/** Payment status → soft pill + row edge. */
export const STATUS_LOOK: Record<string, { label: string; bg: string; fg: string; edge: string }> = {
  PAID:               { label: 'Paid',             bg: '#dcfce7', fg: '#166534', edge: '#059669' },
  'Remitted to Bank': { label: 'Remitted to bank', bg: '#dcfce7', fg: '#166534', edge: '#059669' },
  'For Clearing':     { label: 'For clearing',     bg: '#dbeafe', fg: '#1e40af', edge: '#2563eb' },
  PENDING:            { label: 'Pending',          bg: '#fef3c7', fg: '#92400e', edge: '#d97706' },
  FAILED:             { label: 'Failed',           bg: '#fee2e2', fg: '#991b1b', edge: '#dc2626' },
  EXPIRED:            { label: 'Expired',          bg: '#fee2e2', fg: '#991b1b', edge: '#dc2626' },
}
export const statusLook = (s: string) => STATUS_LOOK[s] || { label: s, bg: '#f1f5f2', fg: 'var(--mid-gray)', edge: 'var(--light-gray)' }

export function Pill({ bg, fg, children, title, className = '' }: { bg: string; fg: string; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={`inline-block px-2 py-0.5 rounded-full text-[10.5px] font-semibold whitespace-nowrap ${className}`} style={{ background: bg, color: fg }}>
      {children}
    </span>
  )
}

export function StatusPill({ s }: { s: string }) {
  const l = statusLook(s)
  return <Pill bg={l.bg} fg={l.fg}>{l.label}</Pill>
}

/** Table header cell: 11px bold uppercase on the pale header band. */
export function Th({ children, right, className = '' }: { children?: ReactNode; right?: boolean; className?: string }) {
  return (
    <th className={`px-3 py-2 text-[11px] font-bold uppercase tracking-[.5px] whitespace-nowrap border-b ${right ? 'text-right' : 'text-left'} ${className}`}
      style={{ background: 'var(--hr-head)', color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>
      {children}
    </th>
  )
}

/** White card with an optional header row (icon, title, count, one-line sub, actions on the right). */
export function Card({ icon, title, count, sub, actions, children, className = '' }: {
  icon?: ReactNode; title?: ReactNode; count?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`rounded-lg border bg-white min-w-0 ${className}`} style={BORDER}>
      {title != null && (
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-3.5 pb-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {icon && <span className="inline-flex flex-shrink-0" style={{ color: 'var(--teal)' }}>{icon}</span>}
              <span className="min-w-0">{title}</span>
              {count != null && <span className="text-xs font-semibold" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-body)' }}>{count}</span>}
            </h2>
            {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{sub}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** A notice strip: amber (heads-up), red (error) or green-pale (info). */
export function Notice({ tone, icon, children }: { tone: 'amber' | 'red' | 'info'; icon?: ReactNode; children: ReactNode }) {
  const t = tone === 'red'
    ? { bg: '#fef2f2', line: '#dc2626', fg: '#991b1b' }
    : tone === 'amber'
      ? { bg: '#fffbeb', line: '#d97706', fg: '#92400e' }
      : { bg: 'var(--pale-teal)', line: 'var(--teal)', fg: 'var(--charcoal)' }
  return (
    <div className="flex items-start gap-2 rounded-lg border px-4 py-3 text-[13px]" style={{ background: t.bg, color: t.fg, borderColor: 'var(--light-gray)', borderLeft: `4px solid ${t.line}` }}>
      <span className="mt-0.5 flex-shrink-0">{icon ?? <AlertTriangle size={15} />}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** Shimmer rows while a table loads (needs <HrShimmerStyle /> on the page). */
export function ShimmerRows({ n = 4 }: { n?: number }) {
  return (
    <div className="p-4 space-y-2" aria-busy="true">
      {Array.from({ length: n }, (_, i) => <div key={i} className="h-9 rounded-md hr-shimmer" />)}
    </div>
  )
}
