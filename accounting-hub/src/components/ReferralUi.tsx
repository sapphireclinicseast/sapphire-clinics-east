'use client'

// Small presentational pieces shared by the Referral section (Referrers tab,
// Referral Dashboard). Same look as the redesigned Budget / Unearned Revenue
// pages: white rounded-2xl cards on the paper surface, muted labels, teal accents.
// View-only — no data, no fetching.
import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, Loader2, X } from 'lucide-react'

export const card = { borderColor: 'var(--light-gray)', background: 'white' }
export const muted = { color: 'var(--mid-gray)' }
export const ink = { color: 'var(--charcoal)' }
export const display = { fontFamily: 'var(--font-display)' }

// Consistent text inputs / selects across the section's forms.
export const inputCls = 'w-full px-3 py-2 rounded-xl border text-sm outline-none bg-white focus:border-[var(--bright-teal)] focus:ring-2 focus:ring-[var(--pale-teal)] transition-shadow'
export const inputStyle = { borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }
export const labelCls = 'block text-xs font-semibold mb-1.5'

// Buttons.
export const btnPrimary = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90'
export const btnSecondary = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border bg-white transition-colors hover:bg-[var(--off-white)]'
export const btnSecondaryStyle = { borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }

// Segmented-control button style (Budget page's `seg`).
export const seg = (on: boolean) => on ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }

export function Tile({ label, value, note, icon, strong, href }: { label: string; value: ReactNode; note?: ReactNode; icon?: ReactNode; strong?: boolean; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-semibold flex items-center gap-1.5" style={muted}>{icon}{label}</p>
      <p className="text-xl font-bold mt-1 tabular-nums break-words" style={{ color: strong ? 'var(--deep-teal)' : 'var(--charcoal)' }}>{value}</p>
      {note != null && <p className="text-[11px] mt-0.5" style={muted}>{note}</p>}
    </>
  )
  const cls = 'block rounded-2xl border p-3 sm:p-4 min-w-0'
  const style = strong ? { borderColor: 'var(--bright-teal)', background: 'var(--pale-teal)' } : card
  return href
    ? <a href={href} className={`${cls} transition-colors hover:border-[var(--bright-teal)]`} style={style}>{body}</a>
    : <div className={cls} style={style}>{body}</div>
}

export function AlertBanner({ children, onRetry, onDismiss }: { children: ReactNode; onRetry?: () => void; onDismiss?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-3" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}>
      <AlertTriangle size={18} className="shrink-0" />
      <div className="text-sm flex-1 min-w-0">{children}</div>
      {onRetry && (
        <button onClick={onRetry} className="px-3 py-1.5 rounded-xl border text-sm font-medium bg-white" style={{ borderColor: '#fecaca' }}>Try again</button>
      )}
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" className="p-1 rounded-lg hover:bg-white/60"><X size={16} /></button>
      )}
    </div>
  )
}

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border px-4 py-12 text-center" style={card}>
      <div className="mx-auto mb-2 w-fit opacity-40" style={muted}>{icon ?? <Inbox size={32} />}</div>
      <p className="text-sm font-medium" style={ink}>{title}</p>
      {children && <div className="text-xs mt-1 max-w-md mx-auto" style={muted}>{children}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export const pulse = 'rounded-2xl border animate-pulse motion-reduce:animate-none'
export const pulseTone = { borderColor: 'var(--light-gray)', background: 'var(--off-white)' }

export function LoadingNote({ children }: { children: ReactNode }) {
  return <p className="text-xs flex items-center gap-2" style={muted}><Loader2 size={14} className="animate-spin" /> {children}</p>
}

// Modal shell: dimmed backdrop, white card with a title row, scrollable body,
// optional footer. Clicking the backdrop or X calls onClose.
export function Modal({ title, subtitle, onClose, children, footer, width = 'max-w-lg', closeOnBackdrop = false }: {
  title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: string; closeOnBackdrop?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeOnBackdrop ? onClose : undefined}>
      <div role="dialog" aria-modal="true" className={`w-full ${width} rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
          <div className="min-w-0">
            <h3 className="text-base font-bold" style={{ ...ink, ...display }}>{title}</h3>
            {subtitle && <p className="text-xs mt-0.5" style={muted}>{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 -mr-1.5 rounded-lg hover:bg-[var(--off-white)] shrink-0"><X size={18} style={muted} /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">{children}</div>
        {footer && <div className="px-5 py-3 border-t flex flex-wrap items-center justify-end gap-2" style={{ borderColor: 'var(--light-gray)' }}>{footer}</div>}
      </div>
    </div>
  )
}
