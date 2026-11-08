'use client'

// Presentational pieces shared by the Settings pages (Connected Accounts and
// Team). Display only: nothing here fetches, saves, connects or disconnects.
// Builds on the Patient Dashboard card tokens so these screens match the rest
// of the Operations Hub.

import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, CheckCircle2, Info, RefreshCw } from 'lucide-react'
import { CARD_STYLE } from '../patients/dashboard/ui'

export const CONTROL = 'w-full h-10 px-3 rounded-lg text-sm outline-none transition-colors focus:border-[var(--teal)]'
export const CONTROL_STYLE: CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }
export const LABEL = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5'
export const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold text-white whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed'
export const BTN_SECONDARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
export const BTN_SM = 'inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
/** Low-emphasis destructive action: red text, no fill until hover. */
export const BTN_DANGER_GHOST = `${BTN_SM} hover:bg-red-50`
export const DANGER = '#DC2626'
export const SUBTLE_BG = '#F6F9F8'
export const TH = 'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap'
export const MODAL_BACKDROP: CSSProperties = { background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }

/** "Settings" eyebrow + title + subtitle on the left, page actions on the right. */
export function SettingsHeader({ title, subtitle, actions }: { title: string; subtitle: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>Settings</p>
        <h1 className="text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          {title}
        </h1>
        <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--mid-gray)' }}>{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Small uppercase label that heads a group of cards. */
export function GroupLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-0.5">
      <h2 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--mid-gray)' }}>{children}</h2>
      {hint && <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{hint}</p>}
    </div>
  )
}

export type StatusTone = 'connected' | 'off' | 'expired' | 'error' | 'checking' | 'neutral'

const TONES: Record<StatusTone, { bg: string; fg: string; dot: string; border: string }> = {
  connected: { bg: '#ECFDF5', fg: '#065F46', dot: '#10B981', border: '#A7F3D0' },
  off:       { bg: '#F1F5F9', fg: '#475569', dot: '#94A3B8', border: '#E2E8F0' },
  expired:   { bg: '#FFFBEB', fg: '#92400E', dot: '#F59E0B', border: '#FDE68A' },
  error:     { bg: '#FEF2F2', fg: '#991B1B', dot: '#DC2626', border: '#FECACA' },
  checking:  { bg: SUBTLE_BG, fg: 'var(--mid-gray)', dot: '#CBD5E1', border: 'var(--light-gray)' },
  neutral:   { bg: SUBTLE_BG, fg: 'var(--charcoal)', dot: 'var(--teal)', border: 'var(--light-gray)' },
}

/** Connection status pill with a coloured dot. */
export function StatusPill({ tone, children, title }: { tone: StatusTone; children: ReactNode; title?: string }) {
  const t = TONES[tone]
  return (
    <span title={title}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4 whitespace-nowrap"
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.border}` }}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tone === 'checking' ? 'animate-pulse' : ''}`} style={{ background: t.dot }} />
      {children}
    </span>
  )
}

/** Square brand tile for a provider (logo or icon on a tinted background). */
export function ProviderTile({ color, bg, children, size = 40 }: { color: string; bg?: string; children: ReactNode; size?: number }) {
  return (
    <span aria-hidden className="inline-flex items-center justify-center rounded-xl flex-shrink-0"
      style={{ width: size, height: size, background: bg ?? `${color}14`, color, border: `1px solid ${color}22` }}>
      {children}
    </span>
  )
}

/** Inline result / OAuth callback message. */
export function Banner({ tone, children, onRetry }: { tone: 'success' | 'error' | 'warn' | 'info'; children: ReactNode; onRetry?: () => void }) {
  const t = tone === 'success'
    ? { bg: '#ECFDF5', border: '#A7F3D0', fg: '#065F46', icon: CheckCircle2 as LucideIcon }
    : tone === 'error'
      ? { bg: '#FEF2F2', border: '#FECACA', fg: '#991B1B', icon: AlertTriangle as LucideIcon }
      : tone === 'warn'
        ? { bg: '#FFFBEB', border: '#FDE68A', fg: '#92400E', icon: AlertTriangle as LucideIcon }
        : { bg: SUBTLE_BG, border: 'var(--light-gray)', fg: 'var(--charcoal)', icon: Info as LucideIcon }
  const Icon = t.icon
  return (
    <div role={tone === 'error' ? 'alert' : 'status'}
      className="flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm leading-relaxed"
      style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.fg }}>
      <Icon size={16} className="flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${BTN_SM} hover:bg-white/60 -my-1`}
          style={{ border: `1px solid ${t.border}`, color: t.fg, background: '#fff' }}>
          <RefreshCw size={12} /> Try again
        </button>
      )}
    </div>
  )
}

/** Card shell for one provider / integration. Same chrome as DashCard, with a tile + status slot. */
export function ProviderCard({ tile, name, description, status, actions, children, footer }: {
  tile: ReactNode
  name: string
  description: ReactNode
  status?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  footer?: ReactNode
}) {
  return (
    <section className="rounded-xl flex flex-col min-w-0" style={CARD_STYLE}>
      <header className="px-5 py-4 flex flex-wrap items-start gap-x-4 gap-y-3">
        {tile}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {name}
            </h3>
            {status}
          </div>
          <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--mid-gray)' }}>{description}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 flex-shrink-0">{actions}</div>}
      </header>
      {children && <div className="min-w-0" style={{ borderTop: '1px solid var(--light-gray)' }}>{children}</div>}
      {footer && (
        <div className="px-5 py-3 text-[11px] leading-relaxed mt-auto rounded-b-xl"
          style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--mid-gray)', background: SUBTLE_BG }}>
          {footer}
        </div>
      )}
    </section>
  )
}

const AVATAR_COLORS = ['#1A7B8A', '#7B4FBF', '#C2410C', '#0E7490', '#B45309', '#1D4ED8', '#BE185D', '#15803D']

/** Initials avatar, colour picked from the text so the same person keeps the same colour. */
export function InitialsAvatar({ name, size = 34 }: { name: string; size?: number }) {
  const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  const initials = ((parts[0]?.charAt(0) ?? '') + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase() || '?'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const c = AVATAR_COLORS[h % AVATAR_COLORS.length]
  return (
    <span aria-hidden className="inline-flex items-center justify-center rounded-full flex-shrink-0 font-bold"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: `${c}18`, color: c, border: `1px solid ${c}30` }}>
      {initials}
    </span>
  )
}

/** "Mar 4, 2026" */
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "just now" / "5m ago" / "3d ago" */
export function relTime(iso: string | null | undefined) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24); if (d < 14) return `${d}d ago`
  const w = Math.round(d / 7); if (d < 60) return `${w}w ago`
  const mo = Math.round(d / 30); if (mo < 12) return `${mo}mo ago`
  return `${Math.round(d / 365)}y ago`
}
