'use client'

import { useState, useEffect, useCallback } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { branchLabel } from '@/lib/branch-label'
import {
  ClipboardList, BarChart3, Zap, Trash2, CheckCircle2,
  ChevronDown, ChevronUp, ChevronRight, RefreshCw, X, AlertCircle, AlertTriangle,
  Clock, CheckCircle, Ban, QrCode, Bell, Settings, Save, Users, ExternalLink, Download, Mail,
  Search, Star, Trophy, Building2, Layers, Target, ThumbsUp, MessageSquare, Info, Loader2, Calendar,
} from 'lucide-react'
import { generatePeerEvalResultPDF } from '@/lib/pdf-results'
import { CARD_STYLE, DashCard, KpiCard, Skeleton, EmptyState } from '../patients/dashboard/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

type PeerEvalType = 'HR08_ADMIN' | 'HR08_PEER' | 'HR09' | 'HR09_CLINICAL' | 'HR09_ADMIN'
type PeerEvalStatus = 'PENDING' | 'COMPLETED' | 'EXPIRED'

interface StaffMini {
  id: string
  firstName: string
  lastName: string
  department: string
}

interface AssignmentResponse {
  id: string
  scores: Record<string, number>
  strengths: string | null
  improvements: string | null
  submittedAt: string
}

interface Assignment {
  id: string
  formType: PeerEvalType
  assessorId: string
  assesseeId: string
  branch: string
  periodYear: number
  periodMonth: number
  status: PeerEvalStatus
  notes: string | null
  completedAt: string | null
  createdAt: string
  assessor: StaffMini
  assessee: StaffMini
  response: AssignmentResponse | null
}

interface EvalResponse {
  id: string
  assessorId: string
  assesseeId: string
  formType: PeerEvalType
  branch: string
  scores: Record<string, number>
  strengths: string | null
  improvements: string | null
  submittedAt: string
  assessor: StaffMini
  assessee: StaffMini
}

interface NotificationItem {
  staffId: string
  name: string
  department: string
  branch: string
  pendingCount: number
}

interface AdminConfig {
  id: string
  staffId: string
  workDays: string[]
  branch: string
  staff: {
    id: string
    firstName: string
    lastName: string
    department: string
    branch: string
    jobTitle: string | null
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────


const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const DAYS_OF_WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

// Internal form page (no Typeform)
const FORM_PAGE_URL = '/peereval'

const FORM_LABELS: Record<PeerEvalType, string> = {
  HR08_ADMIN:    'HR08 — Admin evaluates clinical staff (annual)',
  HR08_PEER:     'HR08 — Peer evaluation among clinical staff (annual)',
  HR09:          'HR09 — Clinical staff evaluates admin staff (annual)',
  HR09_CLINICAL: 'HR09 — Clinical staff evaluates admin staff',
  HR09_ADMIN:    'HR09 — Admin peers evaluate admin staff',
}

const HR08_QUESTIONS: Record<string, string> = {
  q1:  'Addresses unique needs in sessions',
  q2:  'Quality of interventions',
  q3:  'Communication and rapport',
  q4:  'Professionalism and ethics',
  q5:  'Adaptability',
  q6:  'Client progress effectiveness',
  q7:  'Evidence-based practices',
  q8:  'Collaboration with professionals',
  q9:  'Friendly and approachable',
  q10: 'Positive working relationships',
}

const HR09_QUESTIONS: Record<string, string> = {
  q1: 'Warm and respectful interactions',
  q2: 'Carries out responsibilities with care',
  q3: 'Clear and professional communication',
  q4: 'Professionalism in behavior and appearance',
  q5: 'Responsive and adaptable',
}

function getQuestions(formType: PeerEvalType) {
  return (formType === 'HR09' || formType === 'HR09_CLINICAL' || formType === 'HR09_ADMIN')
    ? HR09_QUESTIONS
    : HR08_QUESTIONS
}

const YEAR_OPTIONS = [2024, 2025, 2026, 2027]

// The score-entry form offers the same whole numbers the old 0–5 slider did.
const RATING_OPTIONS = [0, 1, 2, 3, 4, 5]

// ─── Presentation tokens (display only — no scoring logic lives here) ─────────

const CONTROL = 'h-9 px-3 rounded-lg text-sm outline-none focus:border-[var(--teal)]'
const CONTROL_STYLE: CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)', fontFamily: 'var(--font-body)' }
const controlStyle = (active: boolean): CSSProperties => ({ ...CONTROL_STYLE, borderColor: active ? 'var(--teal)' : 'var(--light-gray)' })
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed'
const BTN_SECONDARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
const BTN_XS = 'inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors disabled:opacity-60'
const LABEL = 'block text-[11px] font-semibold uppercase tracking-wider mb-1.5'
const SECTION_LABEL = 'text-[11px] font-semibold uppercase tracking-wider'
const TH = 'px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap text-left'
const SUBTLE_BG = '#F6F9F8'
const ROW_RULE = '#EEF2F1'
const DISPLAY: CSSProperties = { fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }
const NUM: CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const MODAL_BACKDROP: CSSProperties = { background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fullName(s: StaffMini) {
  return `${s.firstName} ${s.lastName}`
}

/** Soft colour band for a 0–5 score. Same cut-offs the page always used. */
function scoreBand(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return { fg: 'var(--mid-gray)', bg: '#F3F4F6', bar: '#CBD5E1', label: 'No scores yet' }
  if (v >= 4.5) return { fg: '#15803D', bg: '#DCFCE7', bar: '#22C55E', label: 'Excellent' }
  if (v >= 3.5) return { fg: '#0F766E', bg: '#CCFBF1', bar: '#14B8A6', label: 'Good' }
  if (v >= 2.5) return { fg: '#B45309', bg: '#FEF3C7', bar: '#F59E0B', label: 'Fair' }
  return { fg: '#B91C1C', bg: '#FEE2E2', bar: '#F87171', label: 'Needs attention' }
}

function scoreColor(score: number) {
  return scoreBand(score).fg
}

const STATUS_STYLE: Record<PeerEvalStatus, { bg: string; fg: string; Icon: typeof Clock; label: string }> = {
  PENDING:   { bg: '#FEF3C7', fg: '#B45309', Icon: Clock,       label: 'Pending' },
  COMPLETED: { bg: '#DCFCE7', fg: '#15803D', Icon: CheckCircle, label: 'Completed' },
  EXPIRED:   { bg: '#F3F4F6', fg: '#6B7280', Icon: Ban,         label: 'Expired' },
}

function statusBadge(status: PeerEvalStatus) {
  const s = STATUS_STYLE[status] ?? { bg: '#F3F4F6', fg: '#6B7280', Icon: Clock, label: String(status) }
  const Icon = s.Icon
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold whitespace-nowrap leading-tight"
      style={{ background: s.bg, color: s.fg }}>
      <Icon size={11} /> {s.label}
    </span>
  )
}

function typeBadge(formType: PeerEvalType) {
  const map: Record<PeerEvalType, { bg: string; color: string; label: string }> = {
    HR08_ADMIN:    { bg: '#EDE9FE', color: '#5B21B6', label: 'HR08 Admin' },
    HR08_PEER:     { bg: '#DBEAFE', color: '#1E40AF', label: 'HR08 Peer' },
    HR09:          { bg: '#FCE7F3', color: '#9D174D', label: 'HR09' },
    HR09_CLINICAL: { bg: '#FCE7F3', color: '#9D174D', label: 'HR09 Clinical' },
    HR09_ADMIN:    { bg: '#FDF2F8', color: '#831843', label: 'HR09 Admin' },
  }
  const t = map[formType] ?? { bg: '#F3F4F6', color: '#6B7280', label: formType }
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10.5px] font-semibold whitespace-nowrap leading-tight"
      style={{ background: t.bg, color: t.color }}>
      {t.label}
    </span>
  )
}

function periodLabel(_formType: PeerEvalType, year: number, month: number) {
  if (month > 0) return `${MONTH_NAMES[month - 1]} ${year}`
  return `${year}`
}

// ─── Small presentational pieces ──────────────────────────────────────────────

function ScorePill({ value, digits = 1, suffix }: { value: number; digits?: number; suffix?: string }) {
  const b = scoreBand(value)
  return (
    <span title={`${b.label} — average out of 5`}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold leading-none whitespace-nowrap"
      style={{ background: b.bg, color: b.fg, ...NUM }}>
      <Star size={10} fill="currentColor" strokeWidth={0} />
      {value.toFixed(digits)}{suffix && <span className="font-semibold opacity-70">{suffix}</span>}
    </span>
  )
}

function ScoreLegend() {
  const bands = [
    { v: 4.5, range: '4.5 – 5' }, { v: 3.5, range: '3.5 – 4.49' }, { v: 2.5, range: '2.5 – 3.49' }, { v: 0, range: 'Below 2.5' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
      <span className="font-semibold uppercase tracking-wider">Score bands</span>
      {bands.map(({ v, range }) => {
        const b = scoreBand(v)
        return (
          <span key={range} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: b.bar }} />
            <span style={{ color: 'var(--charcoal)' }}>{b.label}</span> {range}
          </span>
        )
      })}
    </div>
  )
}

function CountPill({ tone, children }: { tone: 'amber' | 'green' | 'gray'; children: ReactNode }) {
  const s = tone === 'amber' ? { bg: '#FEF3C7', fg: '#92400E' } : tone === 'green' ? { bg: '#DCFCE7', fg: '#166534' } : { bg: '#F3F4F6', fg: '#6B7280' }
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10.5px] font-semibold whitespace-nowrap leading-tight" style={{ background: s.bg, color: s.fg }}>
      {children}
    </span>
  )
}

function Avatar({ first, last, tone = 'teal' }: { first: string; last: string; tone?: 'teal' | 'amber' | 'green' }) {
  const s = tone === 'amber' ? { bg: '#FEF3C7', fg: '#92400E' } : tone === 'green' ? { bg: '#E7F3EF', fg: '#4A8073' } : { bg: 'var(--pale-teal)', fg: 'var(--teal)' }
  return (
    <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: s.bg, color: s.fg }}>
      {first[0]}{last[0]}
    </span>
  )
}

/** Pill tab bar — used for the page tabs and the Results sub-tabs. */
function PillTabs<T extends string>({ tabs, value, onChange, size = 'md', label }: {
  tabs: { id: T; label: string; icon: typeof ClipboardList }[]
  value: T; onChange: (id: T) => void; size?: 'md' | 'sm'; label: string
}) {
  return (
    <div role="tablist" aria-label={label}
      className="inline-flex gap-1 p-1 rounded-xl overflow-x-auto max-w-full"
      style={size === 'md' ? CARD_STYLE : { background: '#F3F6F5' }}>
      {tabs.map(({ id, label: l, icon: Icon }) => {
        const active = value === id
        return (
          <button key={id} type="button" role="tab" aria-selected={active} onClick={() => onChange(id)}
            className={`flex items-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors ${size === 'md' ? 'px-3.5 py-2 text-sm' : 'px-3 py-1.5 text-xs'} ${active ? '' : 'hover:bg-black/[0.04]'}`}
            style={active
              ? size === 'md'
                ? { background: 'var(--teal)', color: '#fff' }
                : { background: '#fff', color: 'var(--teal)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
              : { background: 'transparent', color: 'var(--mid-gray)' }}>
            <Icon size={size === 'md' ? 15 : 13} />
            {l}
          </button>
        )
      })}
    </div>
  )
}

/** Filter / action strip that sits above a tab's content. */
function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl px-3 py-3 flex flex-wrap items-center gap-2" style={CARD_STYLE}>
      {children}
    </div>
  )
}

function ErrorCard({ title, hint, onRetry }: { title: string; hint?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl px-6 py-10 text-center" style={{ background: '#fff', border: '1px solid #FECACA' }}>
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

function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl px-4 py-2.5 text-xs flex items-center gap-2" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
      <AlertCircle size={14} className="flex-shrink-0" />
      <span className="flex-1 min-w-0">{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="font-semibold underline flex-shrink-0">Try again</button>}
    </div>
  )
}

function SuccessNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
      <p className="flex items-center gap-1.5 font-semibold" style={{ color: '#166534' }}>
        <CheckCircle2 size={15} /> {title}
      </p>
      <div className="mt-1" style={{ color: 'var(--charcoal)' }}>{children}</div>
    </div>
  )
}

function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs leading-relaxed"
      style={{ background: 'var(--pale-teal)', color: 'var(--charcoal)', border: '1px solid #CFE6E2' }}>
      <Info size={15} className="flex-shrink-0 mt-px" style={{ color: 'var(--teal)' }} />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function KpiRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl px-4 py-3.5" style={CARD_STYLE}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-16 mt-2" />
          <Skeleton className="h-3 w-24 mt-2" />
        </div>
      ))}
    </div>
  )
}

function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5" style={{ borderTop: i > 0 ? `1px solid ${ROW_RULE}` : undefined }}>
          <Skeleton className="w-9 h-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5" style={{ width: `${55 - i * 5}%` }} />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function CompletionKpi({ pct, completed, total }: { pct: number; completed: number; total: number }) {
  const tone = pct >= 80 ? '#16A34A' : pct >= 50 ? '#F59E0B' : '#EF4444'
  return (
    <KpiCard label="Completion" icon={<Target size={16} />} accent={tone}
      value={total > 0 ? `${pct}%` : '—'}
      sub={
        <span className="block">
          <span className="block h-1.5 rounded-full overflow-hidden mt-1.5 mb-1" style={{ background: ROW_RULE }}>
            <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tone, transition: 'width 0.3s' }} />
          </span>
          {completed} of {total} assignments completed
        </span>
      } />
  )
}

function ModalShell({ labelledBy, maxWidth, children }: { labelledBy: string; maxWidth: number; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" style={MODAL_BACKDROP}>
      <div role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        className="w-full rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#fff', maxWidth, maxHeight: '90vh', boxShadow: '0 24px 64px rgba(15,23,42,0.22)' }}>
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ id, eyebrow, title, subtitle, onClose }: {
  id: string; eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; onClose: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--light-gray)' }}>
      <div className="min-w-0">
        {eyebrow && <div className="flex flex-wrap items-center gap-2 mb-1.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{eyebrow}</div>}
        <h3 id={id} className="text-base font-bold leading-tight" style={DISPLAY}>{title}</h3>
        {subtitle && <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>{subtitle}</p>}
      </div>
      <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 -mr-1.5 rounded-lg hover:bg-gray-100 flex-shrink-0" style={{ color: 'var(--mid-gray)' }}>
        <X size={18} />
      </button>
    </div>
  )
}

function FeedbackList({ title, icon, fg, bg, border, items }: {
  title: string; icon: ReactNode; fg: string; bg: string; border: string; items: string[]
}) {
  return (
    <div className="rounded-lg p-3" style={{ background: bg, border: `1px solid ${border}` }}>
      <p className="flex items-center gap-1.5 mb-2 text-xs font-semibold" style={{ color: fg }}>
        {icon} {title} <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>· {items.length}</span>
      </p>
      <ul className="space-y-1.5 list-disc pl-4">
        {items.map((s, i) => (
          <li key={i} className="text-xs leading-relaxed" style={{ color: 'var(--charcoal)' }}>{s}</li>
        ))}
      </ul>
    </div>
  )
}

// ─── QR Code Modal ────────────────────────────────────────────────────────────

function QrCodeModal({ onClose }: { onClose: () => void }) {
  const forms = [
    { branch: 'SBEA', label: 'East Branch', url: `${FORM_PAGE_URL}?branch=SBEA` },
    { branch: 'SBGH', label: 'Greenhills Branch', url: `${FORM_PAGE_URL}?branch=SBGH` },
  ]
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <ModalShell labelledBy="pe-qr-title" maxWidth={560}>
      <ModalHeader id="pe-qr-title" title="QR Codes — Peer Evaluation Form"
        subtitle="Scan to open the form — no login required" onClose={onClose} />
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto">
        {forms.map(f => {
          const fullUrl = `${origin}${f.url}`
          return (
            <div key={f.branch} className="rounded-xl p-4 flex flex-col items-center gap-3 text-center"
              style={{ background: SUBTLE_BG, border: `1px solid ${ROW_RULE}` }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(fullUrl)}`}
                alt={`QR code for ${f.label}`}
                width={180}
                height={180}
                className="rounded-lg block bg-white"
                style={{ border: '1px solid var(--light-gray)' }}
              />
              <div>
                <div className="text-sm font-bold" style={DISPLAY}>{f.label}</div>
                <a href={f.url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold mt-1 hover:underline" style={{ color: 'var(--teal)' }}>
                  <ExternalLink size={11} /> Open form
                </a>
              </div>
            </div>
          )
        })}
      </div>
      <div className="px-6 py-4 flex justify-end flex-shrink-0" style={{ borderTop: '1px solid var(--light-gray)' }}>
        <button type="button" onClick={onClose} className={BTN_SECONDARY} style={CONTROL_STYLE}>Close</button>
      </div>
    </ModalShell>
  )
}

// ─── Notification Banner ──────────────────────────────────────────────────────

function NotificationBanner({ branch }: { branch: string }) {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const params = branch ? `?branch=${branch}` : ''
        const res = await fetch(`/api/peer-eval/notifications${params}`)
        if (res.ok) setItems(await res.json())
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [branch])

  if (loading || dismissed || items.length === 0) return null

  return (
    <div className="rounded-xl px-4 py-3" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
      <div className="flex items-center gap-2.5">
        <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#FEF3C7' }}>
          <Bell size={14} style={{ color: '#B45309' }} />
        </span>
        <p className="flex-1 min-w-0 text-sm font-semibold" style={{ color: '#92400E' }}>
          {items.length} clinician{items.length !== 1 ? 's' : ''} in clinic today with pending peer evals
        </p>
        <button type="button" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}
          className={`${BTN_XS} hover:bg-black/5`} style={{ color: '#B45309' }}>
          {expanded ? 'Hide' : 'Show'}
        </button>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss"
          className="p-1 rounded-md hover:bg-black/5" style={{ color: '#B45309' }}>
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="mt-2.5 pl-[38px] space-y-1.5">
          {items.map(item => (
            <div key={item.staffId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: '#78350F' }}>
              <span className="font-semibold">{item.name}</span>
              <span style={{ color: '#B45309' }}>·</span>
              <span>{item.department}</span>
              <CountPill tone="amber">{item.pendingCount} pending</CountPill>
            </div>
          ))}
          <p className="text-[11px] italic pt-1" style={{ color: '#A16207' }}>
            Remind them to complete their peer evaluation forms today.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Score Entry Modal ────────────────────────────────────────────────────────

function ScoreEntryModal({
  assignment,
  onClose,
  onSubmit,
}: {
  assignment: Assignment
  onClose: () => void
  onSubmit: (data: { scores: Record<string, number>; strengths: string; improvements: string }) => Promise<void>
}) {
  const questions = getQuestions(assignment.formType)
  const qKeys = Object.keys(questions)
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(qKeys.map(k => [k, assignment.response?.scores?.[k] ?? 3]))
  )
  const [strengths, setStrengths] = useState(assignment.response?.strengths ?? '')
  const [improvements, setImprovements] = useState(assignment.response?.improvements ?? '')
  const [submitting, setSubmitting] = useState(false)
  // Display only: a failed save used to fail silently; now the message shows in the footer.
  const [saveError, setSaveError] = useState('')

  async function handleSubmit() {
    setSubmitting(true)
    setSaveError('')
    try {
      await onSubmit({ scores, strengths, improvements })
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save response')
    } finally {
      setSubmitting(false)
    }
  }

  const textareaClass = 'w-full px-3 py-2 rounded-lg text-sm outline-none focus:border-[var(--teal)] resize-y'

  return (
    <ModalShell labelledBy="pe-score-title" maxWidth={640}>
      <ModalHeader id="pe-score-title"
        eyebrow={<>{typeBadge(assignment.formType)}<span>{periodLabel(assignment.formType, assignment.periodYear, assignment.periodMonth)}</span></>}
        title="Score Entry"
        subtitle={<><strong style={{ color: 'var(--charcoal)' }}>{fullName(assignment.assessor)}</strong> evaluating <strong style={{ color: 'var(--charcoal)' }}>{fullName(assignment.assessee)}</strong></>}
        onClose={onClose} />

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        <section>
          <div className="flex items-baseline justify-between gap-3 mb-2.5">
            <p className={SECTION_LABEL} style={{ color: 'var(--mid-gray)' }}>Scores (0 – 5)</p>
            <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{qKeys.length} criteria</p>
          </div>
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${ROW_RULE}` }}>
            {qKeys.map((key, idx) => {
              const current = scores[key] ?? 3
              return (
                <div key={key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-2.5"
                  style={{ borderTop: idx > 0 ? `1px solid ${ROW_RULE}` : undefined, background: idx % 2 ? '#FBFCFC' : '#fff' }}>
                  <div className="flex-1 min-w-[200px] text-sm leading-snug" style={{ color: 'var(--charcoal)' }}>
                    <span className="inline-block w-8 text-[10.5px] font-bold" style={{ color: 'var(--mid-gray)' }}>{key.toUpperCase()}</span>
                    {questions[key]}
                  </div>
                  <div role="radiogroup" aria-label={`${key.toUpperCase()} score`} className="inline-flex gap-0.5 p-0.5 rounded-lg flex-shrink-0" style={{ background: '#F3F6F5' }}>
                    {RATING_OPTIONS.map(n => {
                      const active = current === n
                      const b = scoreBand(n)
                      return (
                        <button key={n} type="button" role="radio" aria-checked={active}
                          onClick={() => setScores(prev => ({ ...prev, [key]: n }))}
                          className={`w-8 h-8 rounded-md text-sm font-bold transition-colors ${active ? '' : 'hover:bg-white'}`}
                          style={active
                            ? { background: b.bg, color: b.fg, boxShadow: `inset 0 0 0 1.5px ${b.bar}`, ...NUM }
                            : { color: 'var(--mid-gray)', ...NUM }}>
                          {n}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="space-y-4">
          <p className={SECTION_LABEL} style={{ color: 'var(--mid-gray)' }}>Comments</p>
          <div>
            <label htmlFor="pe-strengths" className={LABEL} style={{ color: 'var(--charcoal)' }}>
              Strengths / Notable Contributions
            </label>
            <textarea
              id="pe-strengths"
              value={strengths}
              onChange={e => setStrengths(e.target.value)}
              rows={3}
              placeholder="What does this person do well?"
              className={textareaClass}
              style={CONTROL_STYLE}
            />
          </div>
          <div>
            <label htmlFor="pe-improvements" className={LABEL} style={{ color: 'var(--charcoal)' }}>
              Areas for Improvement
            </label>
            <textarea
              id="pe-improvements"
              value={improvements}
              onChange={e => setImprovements(e.target.value)}
              rows={3}
              placeholder="What could be improved?"
              className={textareaClass}
              style={CONTROL_STYLE}
            />
          </div>
        </section>
      </div>

      <div className="px-6 py-4 flex flex-wrap items-center justify-end gap-2 flex-shrink-0" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
        {saveError && (
          <span role="alert" className="mr-auto inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#B91C1C' }}>
            <AlertCircle size={13} /> {saveError}
          </span>
        )}
        <button type="button" onClick={onClose} className={BTN_SECONDARY} style={CONTROL_STYLE}>
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className={BTN_PRIMARY}
          style={{ background: 'var(--teal)' }}
        >
          {submitting ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save Response</>}
        </button>
      </div>
    </ModalShell>
  )
}

// ─── Front Desk Pending Evals View ────────────────────────────────────────────

function FrontDeskPendingView({ role }: { role: string }) {
  const branch = role === 'AHEA_FRONT_DESK' ? 'SBEA' : 'SBGH'
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [qrStaff, setQrStaff] = useState<StaffMini | null>(null) // which staff's QR to show

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams({ branch, status: 'PENDING', year: String(new Date().getFullYear()) })
        const res = await fetch(`/api/peer-eval/assignments?${params}`)
        if (!res.ok) throw new Error('Failed to load')
        setAssignments(await res.json())
      } catch (e: any) { setError(e.message) }
      finally { setLoading(false) }
    }
    load()
  }, [branch])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  if (loading) {
    return (
      <div className="space-y-4">
        <KpiRowSkeleton count={3} />
        <div className="rounded-xl" style={CARD_STYLE}><ListSkeleton rows={4} /></div>
      </div>
    )
  }
  if (error) return <ErrorCard title="Couldn't load pending evaluations" hint={error} />

  // Group pending by assessor
  const byAssessor = new Map<string, { assessor: StaffMini; evals: Assignment[] }>()
  for (const a of assignments) {
    if (!byAssessor.has(a.assessorId)) byAssessor.set(a.assessorId, { assessor: a.assessor, evals: [] })
    byAssessor.get(a.assessorId)!.evals.push(a)
  }
  const assessorGroups = Array.from(byAssessor.values()).sort((a, b) => a.assessor.lastName.localeCompare(b.assessor.lastName))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard label="Pending evaluations" icon={<Clock size={16} />} accent="#D97706"
          value={assignments.length.toLocaleString()} sub={`${new Date().getFullYear()} · ${branchLabel(branch)}`} />
        <KpiCard label="Assessors with pending" icon={<Users size={16} />}
          value={assessorGroups.length.toLocaleString()} sub="Staff who still have forms to fill" />
        <KpiCard label="Branch" icon={<Building2 size={16} />}
          value={<span className="text-lg">{branchLabel(branch)}</span>} sub="Your front desk branch" />
      </div>

      {/* Info banner */}
      <InfoNote>
        Each staff member has their own <strong>QR Code</strong> that links directly to their evaluations.
        Click the QR icon next to their name to show it, or use <strong>Open Survey</strong> to open their form.
      </InfoNote>

      <DashCard title="Pending by assessor" icon={<ClipboardList size={15} />} flush
        description={`${assignments.length} pending evaluation${assignments.length !== 1 ? 's' : ''} for ${branchLabel(branch)}`}>
        {assignments.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <CheckCircle2 size={36} className="mx-auto mb-3" style={{ color: '#16A34A' }} />
            <p className="text-sm font-bold" style={{ color: '#15803D' }}>All caught up!</p>
            <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>No pending peer evaluations at this time.</p>
          </div>
        ) : (
          <div>
            {assessorGroups.map(({ assessor, evals }, gi) => {
              const staffUrl = `${origin}/peereval?branch=${branch}&staffId=${assessor.id}`
              return (
                <div key={assessor.id} style={{ borderTop: gi > 0 ? '1px solid var(--light-gray)' : undefined }}>
                  {/* Assessor header */}
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Avatar first={assessor.firstName} last={assessor.lastName} tone="amber" />
                    <div className="flex-1 min-w-[140px]">
                      <div className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{fullName(assessor)}</div>
                      <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{assessor.department} · {evals.length} pending</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQrStaff(assessor)}
                      title="Show QR Code"
                      aria-label={`Show QR code for ${fullName(assessor)}`}
                      className={`${BTN_SECONDARY} w-9 px-0`}
                      style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}
                    >
                      <QrCode size={15} />
                    </button>
                    <a
                      href={staffUrl}
                      target="_blank" rel="noreferrer"
                      className={BTN_PRIMARY}
                      style={{ background: 'var(--teal)' }}
                    >
                      <ExternalLink size={13} /> Open Survey
                    </a>
                  </div>

                  {/* Eval items */}
                  <ul className="px-4 pb-3 pl-[64px] space-y-1">
                    {evals.map(a => (
                      <li key={a.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg px-3 py-2 text-sm" style={{ background: SUBTLE_BG }}>
                        <Clock size={13} className="flex-shrink-0" style={{ color: '#D97706' }} />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium" style={{ color: 'var(--charcoal)' }}>Evaluate: {fullName(a.assessee)}</span>
                          <span className="ml-2 text-[11px]" style={{ color: 'var(--mid-gray)' }}>{a.assessee.department}</span>
                        </div>
                        {typeBadge(a.formType)}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </DashCard>

      {/* Per-staff QR modal */}
      {qrStaff && (() => {
        const staffUrl = `${origin}/peereval?branch=${branch}&staffId=${qrStaff.id}`
        return (
          <ModalShell labelledBy="pe-staff-qr-title" maxWidth={440}>
            <ModalHeader id="pe-staff-qr-title" title={`Peer Evaluation — ${fullName(qrStaff)}`}
              subtitle="Scan to go directly to their evaluations" onClose={() => setQrStaff(null)} />
            <div className="p-6 flex flex-col items-center gap-4 overflow-y-auto">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(staffUrl)}&color=1A7B8A`}
                alt={`QR code for ${fullName(qrStaff)}`}
                width={220} height={220}
                className="rounded-xl block p-2 bg-white"
                style={{ border: '1px solid var(--light-gray)' }}
              />
              <div className="text-center">
                <div className="text-sm font-bold" style={DISPLAY}>{fullName(qrStaff)}</div>
                <div className="text-[11px] mt-0.5 mb-1.5" style={{ color: 'var(--mid-gray)' }}>{qrStaff.department} · {branchLabel(branch)}</div>
                <a href={staffUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: 'var(--teal)' }}>
                  <ExternalLink size={11} /> Open form
                </a>
              </div>
              <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
                This QR code is unique to {qrStaff.firstName} and links directly to their pending evaluations.
              </p>
            </div>
            <div className="px-6 py-4 flex justify-end flex-shrink-0" style={{ borderTop: '1px solid var(--light-gray)' }}>
              <button type="button" onClick={() => setQrStaff(null)} className={BTN_SECONDARY} style={CONTROL_STYLE}>
                Close
              </button>
            </div>
          </ModalShell>
        )
      })()}
    </div>
  )
}

// ─── Assignments Tab ──────────────────────────────────────────────────────────

function AssignmentsTab({ role }: { role: string }) {
  const isFrontDesk = ['AHEA_FRONT_DESK', 'AHGH_FRONT_DESK'].includes(role)
  const canManage   = !isFrontDesk
  const defaultBranch = role === 'AHEA_ADMIN' || role === 'AHEA_FRONT_DESK' ? 'SBEA'
                      : role === 'AHGH_ADMIN' || role === 'AHGH_FRONT_DESK' ? 'SBGH'
                      : ''

  const [filterFormType, setFilterFormType] = useState('')
  const [filterBranch, setFilterBranch]     = useState(defaultBranch)
  const [filterYear, setFilterYear]         = useState(new Date().getFullYear())
  const [filterMonth, setFilterMonth]       = useState(0)
  const [filterStatus, setFilterStatus]     = useState('')
  // Answered-between, applied to the response's submittedAt. The year/month
  // pickers describe the evaluation PERIOD, which is not the same question as
  // "has anyone actually answered recently".
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const [assignments, setAssignments]           = useState<Assignment[]>([])
  const [loading, setLoading]                   = useState(false)
  const [error, setError]                       = useState('')
  const [expandedId, setExpandedId]             = useState<string | null>(null)
  const [scoreModalAssignment, setScoreModal]   = useState<Assignment | null>(null)
  const [actionLoading, setActionLoading]       = useState<string | null>(null)
  const [showQr, setShowQr]                     = useState(false)
  const [emailLogs, setEmailLogs]               = useState<Map<string, { sentAt: string; sentBy: string | null }>>(new Map())
  const [emailSending, setEmailSending]         = useState<Set<string>>(new Set())

  const fetchAssignments = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (filterFormType) params.set('formType', filterFormType)
      if (filterBranch) params.set('branch', filterBranch)
      if (filterYear) params.set('year', String(filterYear))
      if (filterMonth) params.set('month', String(filterMonth))
      if (filterStatus) params.set('status', filterStatus)
      if (filterFrom) params.set('from', filterFrom)
      if (filterTo) params.set('to', filterTo)
      const res = await fetch(`/api/peer-eval/assignments?${params}`)
      if (!res.ok) throw new Error('Failed to load assignments')
      setAssignments(await res.json())

      // Fetch email-sent logs for the same branch/year/month context
      const logParams = new URLSearchParams()
      if (filterBranch) logParams.set('branch', filterBranch)
      if (filterYear) logParams.set('year', String(filterYear))
      if (filterMonth) logParams.set('month', String(filterMonth))
      const logsRes = await fetch(`/api/peer-eval/email-assessor?${logParams}`)
      if (logsRes.ok) {
        const logsData: { assessorId: string; sentAt: string; sentBy: string | null }[] = await logsRes.json()
        setEmailLogs(new Map(logsData.map(l => [l.assessorId, l])))
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filterFormType, filterBranch, filterYear, filterMonth, filterStatus, filterFrom, filterTo])

  useEffect(() => { fetchAssignments() }, [fetchAssignments])

  async function handleDelete(id: string) {
    if (!confirm('Delete this assignment?')) return
    setActionLoading(id)
    try {
      await fetch('/api/peer-eval/assignments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      setAssignments(prev => prev.filter(a => a.id !== id))
    } finally { setActionLoading(null) }
  }

  async function handleMarkComplete(assignment: Assignment) {
    setActionLoading(assignment.id)
    try {
      const res = await fetch(`/api/peer-eval/${assignment.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }) })
      const updated = await res.json()
      setAssignments(prev => prev.map(a => a.id === updated.id ? { ...a, status: updated.status, completedAt: updated.completedAt } : a))
    } finally { setActionLoading(null) }
  }

  async function handleScoreSubmit(assignment: Assignment, data: { scores: Record<string, number>; strengths: string; improvements: string }) {
    const res = await fetch('/api/peer-eval/responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignmentId: assignment.id, ...data }) })
    if (!res.ok) throw new Error('Failed to save response')
    setScoreModal(null)
    fetchAssignments()
  }

  async function handleEmailAssessor(assessorId: string, assessorName: string) {
    const existing = emailLogs.get(assessorId)
    if (existing) {
      const d = new Date(existing.sentAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      const resend = confirm(`A reminder email was already sent to ${assessorName} on ${d}.\n\nSend another one?`)
      if (!resend) return
    }
    setEmailSending(prev => new Set(prev).add(assessorId))
    try {
      const res = await fetch('/api/peer-eval/email-assessor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessorId, branch: filterBranch, periodYear: filterYear, periodMonth: filterMonth }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send email')
      setEmailLogs(prev => new Map(prev).set(assessorId, { sentAt: data.sentAt, sentBy: null }))
    } catch (e: any) {
      alert('Could not send email: ' + e.message)
    } finally {
      setEmailSending(prev => { const s = new Set(prev); s.delete(assessorId); return s })
    }
  }

  const total     = assignments.length
  const completed = assignments.filter(a => a.status === 'COMPLETED').length
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0
  const pendingTotal = assignments.filter(a => a.status === 'PENDING').length
  const expiredTotal = assignments.filter(a => a.status === 'EXPIRED').length

  // Group by assessor for card-based view
  const byAssessorMap = new Map<string, { assessor: StaffMini; items: Assignment[] }>()
  for (const a of assignments) {
    if (!byAssessorMap.has(a.assessorId)) byAssessorMap.set(a.assessorId, { assessor: a.assessor, items: [] })
    byAssessorMap.get(a.assessorId)!.items.push(a)
  }
  const groups = Array.from(byAssessorMap.values()).sort((a, b) => a.assessor.firstName.localeCompare(b.assessor.firstName))

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Toolbar>
        <select aria-label="Evaluation type" value={filterFormType} onChange={e => setFilterFormType(e.target.value)} className={CONTROL} style={controlStyle(!!filterFormType)}>
          <option value="">All Types</option>
          <option value="HR08_ADMIN">HR08 Admin</option>
          <option value="HR08_PEER">HR08 Peer</option>
          <option value="HR09">HR09</option>
        </select>

        {!defaultBranch && (
          <select aria-label="Branch" value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className={CONTROL} style={controlStyle(!!filterBranch)}>
            <option value="">All Branches</option>
            <option value="SBEA">East Branch</option>
            <option value="SBGH">Greenhills Branch</option>
          </select>
        )}

        <select aria-label="Year" value={filterYear} onChange={e => setFilterYear(parseInt(e.target.value))} className={CONTROL} style={CONTROL_STYLE}>
          {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select aria-label="Month" value={filterMonth} onChange={e => setFilterMonth(parseInt(e.target.value))} className={CONTROL} style={controlStyle(!!filterMonth)}>
          <option value={0}>All Months</option>
          {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>

        <select aria-label="Status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={CONTROL} style={controlStyle(!!filterStatus)}>
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="COMPLETED">Completed</option>
          <option value="EXPIRED">Expired</option>
        </select>

        {/* Answered between — the response date, not the evaluation period. */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Answered between">
          <span className={SECTION_LABEL} style={{ color: 'var(--mid-gray)' }}>Answered</span>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            aria-label="Answered from" title="Answered from" className={`${CONTROL} w-[9.5rem]`} style={controlStyle(!!filterFrom)} />
          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            aria-label="Answered to" title="Answered to" className={`${CONTROL} w-[9.5rem]`} style={controlStyle(!!filterTo)} />
          {(filterFrom || filterTo) && (
            <button type="button" onClick={() => { setFilterFrom(''); setFilterTo('') }}
              className={`${BTN_XS} hover:bg-gray-100`} style={{ color: 'var(--mid-gray)' }}>
              <X size={11} /> Clear dates
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button type="button" onClick={() => setShowQr(true)} className={BTN_SECONDARY} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }} title="QR Codes">
            <QrCode size={15} /> QR Codes
          </button>
          <button type="button" onClick={fetchAssignments} className={`${BTN_SECONDARY} w-9 px-0`} style={{ ...CONTROL_STYLE, color: 'var(--mid-gray)' }} title="Refresh" aria-label="Refresh">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </Toolbar>

      {/* Completion stats */}
      {loading ? <KpiRowSkeleton /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Assignments" icon={<ClipboardList size={16} />}
            value={total.toLocaleString()} sub={`${groups.length} assessor${groups.length !== 1 ? 's' : ''}`} />
          <CompletionKpi pct={pct} completed={completed} total={total} />
          <KpiCard label="Pending" icon={<Clock size={16} />} accent="#D97706"
            value={pendingTotal.toLocaleString()} sub="Waiting on the assessor" />
          <KpiCard label="Expired" icon={<Ban size={16} />} accent="#9CA3AF"
            value={expiredTotal.toLocaleString()} sub="Past their window" />
        </div>
      )}

      {error && <InlineError message={error} onRetry={fetchAssignments} />}

      <DashCard title="Assignments by assessor" icon={<ClipboardList size={15} />} flush
        description="Open an assessor to see who they are assessing, enter scores or send a reminder."
        action={!loading && groups.length > 0 ? <CountPill tone="gray">{groups.length} assessors</CountPill> : undefined}>
        {loading ? (
          <ListSkeleton rows={5} />
        ) : assignments.length === 0 ? (
          error
            ? <EmptyState title="Assignments couldn't be loaded" hint="Use Try again above to reload them." />
            : <EmptyState title="No assignments found." hint="Use the Generate tab to create assignments." />
        ) : (
          <div>
            {groups.map(({ assessor, items }, gi) => {
              const isExpanded = expandedId === assessor.id
              const pendingCount = items.filter(i => i.status === 'PENDING').length
              const completedCount = items.filter(i => i.status === 'COMPLETED').length
              const log = emailLogs.get(assessor.id)
              const sending = emailSending.has(assessor.id)
              return (
                <div key={assessor.id} style={{ borderTop: gi > 0 ? `1px solid ${ROW_RULE}` : undefined }}>
                  <div className={`flex items-center gap-2 px-4 py-2.5 transition-colors ${isExpanded ? '' : 'hover:bg-[#FAFCFB]'}`}
                    style={isExpanded ? { background: SUBTLE_BG } : undefined}>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : assessor.id)}
                      aria-expanded={isExpanded}
                      className="flex-1 min-w-0 flex items-center gap-3 text-left py-0.5"
                    >
                      <ChevronRight size={15} className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} style={{ color: 'var(--mid-gray)' }} />
                      <Avatar first={assessor.firstName} last={assessor.lastName} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{assessor.firstName}</div>
                        <div className="text-[11px] truncate" style={{ color: 'var(--mid-gray)' }}>{assessor.department}</div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {pendingCount > 0 && <CountPill tone="amber">{pendingCount} pending</CountPill>}
                        {completedCount > 0 && <CountPill tone="green">{completedCount} done</CountPill>}
                      </div>
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleEmailAssessor(assessor.id, `${assessor.firstName} ${assessor.lastName}`)}
                        disabled={sending}
                        title={log ? `Sent ${new Date(log.sentAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} — click to resend` : `Email reminder to ${assessor.firstName}`}
                        className={`${BTN_XS} flex-shrink-0`}
                        style={{
                          cursor: sending ? 'wait' : 'pointer',
                          background: log ? '#DCFCE7' : '#E0F2FE',
                          color: log ? '#166534' : '#0369A1',
                        }}
                      >
                        {sending ? <Loader2 size={11} className="animate-spin" /> : <Mail size={11} />}
                        {sending ? 'Sending…' : log ? 'Email sent!' : 'Email Assessor'}
                      </button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-3 pt-1 sm:pl-[60px]" style={{ background: SUBTLE_BG }}>
                      <p className={`${SECTION_LABEL} px-1 pb-2`} style={{ color: 'var(--mid-gray)' }}>
                        Assessing:
                      </p>
                      <ul className="rounded-lg overflow-hidden bg-white" style={{ border: `1px solid ${ROW_RULE}` }}>
                        {items.map((a, ii) => (
                          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm"
                            style={{ borderTop: ii > 0 ? `1px solid ${ROW_RULE}` : undefined }}>
                            {typeBadge(a.formType)}
                            <div className="flex-1 min-w-[140px]">
                              <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{fullName(a.assessee)}</span>
                              <span className="ml-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>{a.assessee.department}</span>
                            </div>
                            {/* When it was actually answered. The status badge
                                says "Completed" but not when, which is the whole
                                question when checking for recent activity. */}
                            {a.response?.submittedAt && (
                              <span className="inline-flex items-center gap-1 text-[11px] whitespace-nowrap" style={{ color: 'var(--mid-gray)', ...NUM }}
                                title={`Answered ${new Date(a.response.submittedAt).toLocaleString('en-PH')}`}>
                                <Calendar size={11} />
                                {new Date(a.response.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            )}
                            {statusBadge(a.status)}
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              {a.status !== 'COMPLETED' && canManage && (
                                <button type="button" onClick={() => setScoreModal(a)} title="Enter scores"
                                  className={`${BTN_XS} hover:brightness-95`} style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                                  <ClipboardList size={12} /> Scores
                                </button>
                              )}
                              {a.status === 'COMPLETED' && a.response && canManage && (
                                <button type="button" onClick={() => setScoreModal(a)} title="View scores"
                                  className={`${BTN_XS} hover:brightness-95`} style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>
                                  <ClipboardList size={12} /> View
                                </button>
                              )}
                              {canManage && (
                                <button type="button" onClick={() => handleDelete(a.id)} disabled={actionLoading === a.id} title="Delete" aria-label="Delete assignment"
                                  className={`${BTN_XS} px-2 hover:brightness-95`} style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </DashCard>

      {scoreModalAssignment && canManage && (
        <ScoreEntryModal
          assignment={scoreModalAssignment}
          onClose={() => setScoreModal(null)}
          onSubmit={(data) => handleScoreSubmit(scoreModalAssignment, data)}
        />
      )}

      {showQr && <QrCodeModal onClose={() => setShowQr(false)} />}
    </div>
  )
}

// ─── By-Assessee Tab ──────────────────────────────────────────────────────────

function ByAssesseeTab({ role }: { role: string }) {
  const defaultBranch = role === 'AHEA_ADMIN' ? 'SBEA' : role === 'AHGH_ADMIN' ? 'SBGH' : ''

  const [filterFormType, setFilterFormType] = useState('')
  const [filterBranch, setFilterBranch]     = useState(defaultBranch)
  const [filterYear, setFilterYear]         = useState(new Date().getFullYear())
  const [filterMonth, setFilterMonth]       = useState(0)
  const [filterStatus, setFilterStatus]     = useState('')

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [expandedId, setExpandedId]   = useState<string | null>(null)

  const fetchAssignments = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (filterFormType) params.set('formType', filterFormType)
      if (filterBranch)   params.set('branch', filterBranch)
      if (filterYear)     params.set('year', String(filterYear))
      if (filterMonth)    params.set('month', String(filterMonth))
      if (filterStatus)   params.set('status', filterStatus)
      const res = await fetch(`/api/peer-eval/assignments?${params}`)
      if (!res.ok) throw new Error('Failed to load assignments')
      setAssignments(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filterFormType, filterBranch, filterYear, filterMonth, filterStatus])

  useEffect(() => { fetchAssignments() }, [fetchAssignments])

  const total     = assignments.length
  const completed = assignments.filter(a => a.status === 'COMPLETED').length
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0
  const pendingTotal = assignments.filter(a => a.status === 'PENDING').length

  // Group by assessee
  const byAssesseeMap = new Map<string, { assessee: StaffMini; items: Assignment[] }>()
  for (const a of assignments) {
    if (!byAssesseeMap.has(a.assesseeId)) byAssesseeMap.set(a.assesseeId, { assessee: a.assessee, items: [] })
    byAssesseeMap.get(a.assesseeId)!.items.push(a)
  }
  const groups = Array.from(byAssesseeMap.values()).sort((a, b) =>
    a.assessee.firstName.localeCompare(b.assessee.firstName)
  )
  const fullyDone = groups.filter(g => g.items.length > 0 && g.items.every(i => i.status === 'COMPLETED')).length

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Toolbar>
        <select aria-label="Evaluation type" value={filterFormType} onChange={e => setFilterFormType(e.target.value)} className={CONTROL} style={controlStyle(!!filterFormType)}>
          <option value="">All Types</option>
          <option value="HR08_ADMIN">HR08 Admin</option>
          <option value="HR08_PEER">HR08 Peer</option>
          <option value="HR09">HR09</option>
        </select>

        {!defaultBranch && (
          <select aria-label="Branch" value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className={CONTROL} style={controlStyle(!!filterBranch)}>
            <option value="">All Branches</option>
            <option value="SBEA">East Branch</option>
            <option value="SBGH">Greenhills Branch</option>
          </select>
        )}

        <select aria-label="Year" value={filterYear} onChange={e => setFilterYear(parseInt(e.target.value))} className={CONTROL} style={CONTROL_STYLE}>
          {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select aria-label="Month" value={filterMonth} onChange={e => setFilterMonth(parseInt(e.target.value))} className={CONTROL} style={controlStyle(!!filterMonth)}>
          <option value={0}>All Months</option>
          {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>

        <select aria-label="Status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={CONTROL} style={controlStyle(!!filterStatus)}>
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="COMPLETED">Completed</option>
          <option value="EXPIRED">Expired</option>
        </select>

        <button type="button" onClick={fetchAssignments} className={`${BTN_SECONDARY} w-9 px-0 ml-auto`} style={{ ...CONTROL_STYLE, color: 'var(--mid-gray)' }} title="Refresh" aria-label="Refresh">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </Toolbar>

      {/* Completion stats */}
      {loading ? <KpiRowSkeleton /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Staff assessed" icon={<Users size={16} />}
            value={groups.length.toLocaleString()} sub={`${total} assignment${total !== 1 ? 's' : ''}`} />
          <CompletionKpi pct={pct} completed={completed} total={total} />
          <KpiCard label="Pending" icon={<Clock size={16} />} accent="#D97706"
            value={pendingTotal.toLocaleString()} sub="Evaluations still open" />
          <KpiCard label="Fully evaluated" icon={<CheckCircle2 size={16} />} accent="#16A34A"
            value={fullyDone.toLocaleString()} sub="Every assessor has answered" />
        </div>
      )}

      {error && <InlineError message={error} onRetry={fetchAssignments} />}

      <DashCard title="Assignments by assessee" icon={<Users size={15} />} flush
        description="Open a staff member to see who is assessing them and where each form stands."
        action={!loading && groups.length > 0 ? <CountPill tone="gray">{groups.length} staff</CountPill> : undefined}>
        {loading ? (
          <ListSkeleton rows={5} />
        ) : groups.length === 0 ? (
          error
            ? <EmptyState title="Assignments couldn't be loaded" hint="Use Try again above to reload them." />
            : <EmptyState title="No assignments found." hint="Use the Generate tab to create assignments." />
        ) : (
          <div>
            {groups.map(({ assessee, items }, gi) => {
              const isExpanded    = expandedId === assessee.id
              const pendingCount  = items.filter(i => i.status === 'PENDING').length
              const completedCount = items.filter(i => i.status === 'COMPLETED').length
              return (
                <div key={assessee.id} style={{ borderTop: gi > 0 ? `1px solid ${ROW_RULE}` : undefined }}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : assessee.id)}
                    aria-expanded={isExpanded}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isExpanded ? '' : 'hover:bg-[#FAFCFB]'}`}
                    style={isExpanded ? { background: SUBTLE_BG } : undefined}
                  >
                    <ChevronRight size={15} className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} style={{ color: 'var(--mid-gray)' }} />
                    <Avatar first={assessee.firstName} last={assessee.lastName} tone="green" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{fullName(assessee)}</div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--mid-gray)' }}>{assessee.department} · {items.length} evaluator{items.length !== 1 ? 's' : ''} assigned</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {pendingCount > 0 && <CountPill tone="amber">{pendingCount} pending</CountPill>}
                      {completedCount > 0 && <CountPill tone="green">{completedCount} done</CountPill>}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-3 pt-1 sm:pl-[60px]" style={{ background: SUBTLE_BG }}>
                      <p className={`${SECTION_LABEL} px-1 pb-2`} style={{ color: 'var(--mid-gray)' }}>
                        Assessed by:
                      </p>
                      <ul className="rounded-lg overflow-hidden bg-white" style={{ border: `1px solid ${ROW_RULE}` }}>
                        {items.map((a, ii) => (
                          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm"
                            style={{ borderTop: ii > 0 ? `1px solid ${ROW_RULE}` : undefined }}>
                            {typeBadge(a.formType)}
                            <div className="flex-1 min-w-[140px]">
                              <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{fullName(a.assessor)}</span>
                              <span className="ml-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>{a.assessor.department}</span>
                            </div>
                            {statusBadge(a.status)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </DashCard>
    </div>
  )
}

function ExpandedRow({ assignment }: { assignment: Assignment }) {
  const questions = getQuestions(assignment.formType)

  return (
    <div style={{ fontSize: '0.78rem', color: '#374151', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div><span style={{ color: '#9ca3af' }}>Created:</span> {new Date(assignment.createdAt).toLocaleDateString()}</div>
        {assignment.completedAt && <div><span style={{ color: '#9ca3af' }}>Completed:</span> {new Date(assignment.completedAt).toLocaleDateString()}</div>}
        <div>
          <span style={{ color: '#9ca3af' }}>Form: </span>
          <span style={{ fontWeight: 600, color: '#374151' }}>{FORM_LABELS[assignment.formType]}</span>
        </div>
      </div>

      {assignment.response && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6, color: '#111827', fontSize: '0.8rem' }}>Scores</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
            {Object.keys(questions).map(key => (
              <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.7rem' }}>{key.toUpperCase()}</span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: scoreColor(assignment.response!.scores[key] ?? 0) }}>
                  {assignment.response!.scores[key] ?? '—'}
                </span>
              </div>
            ))}
          </div>
          {assignment.response.strengths && (
            <div style={{ marginTop: 6 }}><span style={{ color: '#9ca3af' }}>Strengths: </span>{assignment.response.strengths}</div>
          )}
          {assignment.response.improvements && (
            <div style={{ marginTop: 4 }}><span style={{ color: '#9ca3af' }}>Improvements: </span>{assignment.response.improvements}</div>
          )}
        </div>
      )}

      {assignment.notes && (
        <div><span style={{ color: '#9ca3af' }}>Notes: </span>{assignment.notes}</div>
      )}
    </div>
  )
}

// ─── Results Tab ──────────────────────────────────────────────────────────────

function ResultsTab({ role }: { role: string }) {
  const defaultBranch = role === 'AHEA_ADMIN' ? 'SBEA' : role === 'AHGH_ADMIN' ? 'SBGH' : ''

  const [filterBranch, setFilterBranch] = useState(defaultBranch)
  const [filterYear, setFilterYear]     = useState(new Date().getFullYear())
  const [filterFormType, setFilterFormType] = useState('')
  const [responses, setResponses]       = useState<EvalResponse[]>([])
  const [loading, setLoading]           = useState(false)
  // Display only: a failed load used to leave the tab blank (or crash on a
  // non-array body); now it shows an error card with Try again.
  const [error, setError]               = useState('')
  const [expandedAssessee, setExpandedAssessee] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedRank, setExpandedRank] = useState<string | null>(null) // 'overall-1', 'dept-OT-2', etc
  const [subTab, setSubTab] = useState<'overview' | 'by-department'>('overview')
  const [allStaff, setAllStaff] = useState<Array<{ id: string; firstName: string; lastName: string; department: string; branch: string }>>([])

  // Load full staff list (for "Per Department" view — so staff w/o evals still show)
  useEffect(() => {
    fetch('/api/staff').then(r => r.ok ? r.json() : []).then(setAllStaff).catch(() => undefined)
  }, [])

  const fetchResponses = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (filterBranch) params.set('branch', filterBranch)
      if (filterYear) params.set('year', String(filterYear))
      if (filterFormType) params.set('formType', filterFormType)
      const res = await fetch(`/api/peer-eval/responses?${params}`)
      const data = await res.json()
      if (!res.ok || !Array.isArray(data)) throw new Error((data && data.error) || 'Failed to load results')
      setResponses(data)
    } catch (e: unknown) {
      setError((e instanceof Error && e.message) || 'Failed to load results')
    } finally { setLoading(false) }
  }, [filterBranch, filterYear, filterFormType])

  useEffect(() => { fetchResponses() }, [fetchResponses])

  const byAssessee = new Map<string, { assessee: StaffMini; responses: EvalResponse[] }>()
  for (const r of responses) {
    if (!byAssessee.has(r.assesseeId)) byAssessee.set(r.assesseeId, { assessee: r.assessee, responses: [] })
    byAssessee.get(r.assesseeId)!.responses.push(r)
  }
  const allAssesseeGroups = Array.from(byAssessee.values()).sort((a, b) => a.assessee.lastName.localeCompare(b.assessee.lastName))
  const assesseeGroups = searchQuery.trim()
    ? allAssesseeGroups.filter(g => {
        const q = searchQuery.toLowerCase().trim()
        const fn = g.assessee.firstName.toLowerCase()
        const ln = g.assessee.lastName.toLowerCase()
        return fn.includes(q) || ln.includes(q) || (ln + ' ' + fn).includes(q) || (fn + ' ' + ln).includes(q) || g.assessee.department.toLowerCase().includes(q)
      })
    : allAssesseeGroups

  function avgScores(resps: EvalResponse[]) {
    if (resps.length === 0) return {}
    const totals: Record<string, number> = {}
    const counts: Record<string, number> = {}
    for (const r of resps) {
      for (const [k, v] of Object.entries(r.scores)) {
        totals[k] = (totals[k] ?? 0) + v
        counts[k] = (counts[k] ?? 0) + 1
      }
    }
    return Object.fromEntries(Object.keys(totals).map(k => [k, totals[k] / counts[k]]))
  }

  function overallAvg(avgs: Record<string, number>) {
    const vals = Object.values(avgs)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }

  const formTypeForQuestions = (filterFormType || 'HR08_PEER') as PeerEvalType
  const questions = getQuestions(formTypeForQuestions)

  // Headline figures for the KPI row — display only, from the responses already loaded.
  const allScoreValues = responses.flatMap(r => Object.values(r.scores))
  const pageAvg = allScoreValues.length > 0 ? allScoreValues.reduce((a, b) => a + b, 0) / allScoreValues.length : null
  const deptCount = new Set(allAssesseeGroups.map(g => g.assessee.department)).size
  const pageBand = scoreBand(pageAvg)

  return (
    <div className="space-y-4">
      <Toolbar>
        <select aria-label="Evaluation type" value={filterFormType} onChange={e => setFilterFormType(e.target.value)} className={CONTROL} style={controlStyle(!!filterFormType)}>
          <option value="">All Types</option>
          <option value="HR08_ADMIN">HR08 Admin</option>
          <option value="HR08_PEER">HR08 Peer</option>
          <option value="HR09">HR09</option>
        </select>
        {!defaultBranch && (
          <select aria-label="Branch" value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className={CONTROL} style={controlStyle(!!filterBranch)}>
            <option value="">All Branches</option>
            <option value="SBEA">East Branch</option>
            <option value="SBGH">Greenhills Branch</option>
          </select>
        )}
        <select aria-label="Year" value={filterYear} onChange={e => setFilterYear(parseInt(e.target.value))} className={CONTROL} style={CONTROL_STYLE}>
          {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex items-center gap-2 ml-auto">
          {/* Sub-tab switcher inside Results */}
          <PillTabs size="sm" label="Results views" value={subTab} onChange={setSubTab} tabs={[
            { id: 'overview' as const,      label: 'Overview',                 icon: BarChart3 },
            { id: 'by-department' as const, label: 'Per Department Rankings',  icon: Layers },
          ]} />
          <button type="button" onClick={fetchResponses} className={`${BTN_SECONDARY} w-9 px-0`} style={{ ...CONTROL_STYLE, color: 'var(--mid-gray)' }} title="Refresh" aria-label="Refresh">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </Toolbar>

      {error ? (
        <ErrorCard title="Couldn't load peer evaluation results" hint={error} onRetry={fetchResponses} />
      ) : (
        <>
          {loading && responses.length === 0 ? <KpiRowSkeleton /> : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard label="Staff with results" icon={<Users size={16} />}
                value={allAssesseeGroups.length.toLocaleString()} sub={`Evaluated in ${filterYear}`} />
              <KpiCard label="Responses" icon={<ClipboardList size={16} />}
                value={responses.length.toLocaleString()} sub="Submitted evaluation forms" />
              <KpiCard label="Avg. score" icon={<Star size={16} />} accent={pageBand.fg}
                value={pageAvg != null
                  ? <span>{pageAvg.toFixed(2)}<span className="text-sm font-semibold" style={{ color: 'var(--mid-gray)' }}> / 5</span></span>
                  : '—'}
                sub={<span style={{ color: pageAvg != null ? pageBand.fg : undefined, fontWeight: pageAvg != null ? 600 : undefined }}>{pageAvg != null ? `${pageBand.label} · all criteria` : 'No scores yet'}</span>} />
              <KpiCard label="Departments" icon={<Layers size={16} />}
                value={deptCount.toLocaleString()} sub="With at least one result" />
            </div>
          )}

          {subTab === 'by-department' && (
            loading && responses.length === 0 ? (
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
                {Array.from({ length: 2 }).map((_, i) => <div key={i} className="rounded-xl" style={CARD_STYLE}><ListSkeleton rows={4} /></div>)}
              </div>
            ) : (
              <PerDepartmentRankings
                groups={allAssesseeGroups}
                allStaff={allStaff}
                filterBranch={filterBranch}
              />
            )
          )}

          {subTab === 'overview' && (
            <>
              {/* Leaderboards first (hidden when user is searching) */}
              {!searchQuery && allAssesseeGroups.length > 0 && (
                <PeerEvalLeaderboards
                  groups={allAssesseeGroups}
                  expandedRank={expandedRank}
                  onExpand={setExpandedRank}
                />
              )}

              <DashCard title="Individual results" icon={<BarChart3 size={15} />} flush
                description="Average per criterion for each staff member, out of 5. Open a row for the breakdown and comments."
                footer={<ScoreLegend />}>
                {/* Search bar BELOW the Top 5 */}
                <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
                  <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search by name or department..."
                      aria-label="Search by name or department"
                      className={`${CONTROL} w-full pl-9 pr-8`}
                      style={controlStyle(!!searchQuery)}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        title="Clear search"
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100"
                      >
                        <X size={13} style={{ color: 'var(--mid-gray)' }} />
                      </button>
                    )}
                  </div>
                  <span className="text-xs ml-auto" style={{ color: 'var(--mid-gray)', ...NUM }}>
                    {searchQuery ? `${assesseeGroups.length} of ${allAssesseeGroups.length}` : `${allAssesseeGroups.length} assessees`}
                  </span>
                </div>

                {loading ? (
                  <ListSkeleton rows={6} />
                ) : assesseeGroups.length === 0 ? (
                  <EmptyState
                    title={searchQuery ? 'No staff match this search' : 'No results found for this period.'}
                    hint={searchQuery ? 'Try a different name or department, or clear the search.' : 'Results appear here once evaluators submit their forms.'} />
                ) : (
                  <div>
                    {/* Sticky column header */}
                    <div className="sticky top-0 z-10 hidden sm:flex items-center gap-3 px-4 py-2" style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}>
                      <span className={`${SECTION_LABEL} w-[15px]`} aria-hidden />
                      <span className={`${SECTION_LABEL} flex-1`} style={{ color: 'var(--mid-gray)' }}>Staff</span>
                      <span className={`${SECTION_LABEL} w-[96px] text-right`} style={{ color: 'var(--mid-gray)' }}>Average</span>
                      <span className={`${SECTION_LABEL} w-[100px]`} style={{ color: 'var(--mid-gray)' }}>Criteria</span>
                      <span className={`${SECTION_LABEL} w-[64px] text-right`} style={{ color: 'var(--mid-gray)' }}>Report</span>
                    </div>

                    {assesseeGroups.map(({ assessee, responses: resps }, gi) => {
                      const avgs = avgScores(resps)
                      const overall = overallAvg(avgs)
                      const isExpanded = expandedAssessee === assessee.id
                      const qSet = resps.length > 0 ? getQuestions(resps[0].formType) : questions
                      const strengths = resps.map(r => r.strengths).filter(Boolean) as string[]
                      const improvements = resps.map(r => r.improvements).filter(Boolean) as string[]

                      return (
                        <div key={assessee.id} style={{ borderTop: gi > 0 ? `1px solid ${ROW_RULE}` : undefined }}>
                          <div className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${isExpanded ? '' : 'hover:bg-[#FAFCFB]'}`}
                            style={isExpanded ? { background: SUBTLE_BG } : undefined}>
                            <button
                              type="button"
                              onClick={() => setExpandedAssessee(isExpanded ? null : assessee.id)}
                              aria-expanded={isExpanded}
                              className="flex-1 min-w-0 flex items-center gap-3 text-left py-0.5"
                            >
                              <ChevronRight size={15} className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} style={{ color: 'var(--mid-gray)' }} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{fullName(assessee)}</div>
                                <div className="text-[11px] truncate" style={{ color: 'var(--mid-gray)' }}>{assessee.department} · {resps.length} evaluation{resps.length !== 1 ? 's' : ''}</div>
                              </div>
                              <span className="w-[96px] flex justify-end flex-shrink-0">
                                <ScorePill value={overall} suffix=" / 5" />
                              </span>
                              <span className="w-[100px] hidden sm:flex gap-[3px] items-end h-7 flex-shrink-0" aria-hidden>
                                {Object.keys(qSet).map(k => {
                                  const val = avgs[k] ?? 0
                                  const h = Math.round((val / 5) * 24) + 4
                                  return <span key={k} title={`${k.toUpperCase()}: ${val.toFixed(1)}`} className="block w-[6px] rounded-sm" style={{ height: h, background: scoreBand(val).bar }} />
                                })}
                              </span>
                            </button>
                            <span className="w-[64px] flex justify-end flex-shrink-0">
                              <button
                                type="button"
                                title="Download PDF"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const formType = resps[0]?.formType ?? 'HR08_PEER'
                                  const qSet = getQuestions(formType)
                                  generatePeerEvalResultPDF({
                                    assesseeName: fullName(assessee),
                                    department: assessee.department,
                                    branch: (assessee as unknown as { branch?: string }).branch,
                                    overallAvg: overall,
                                    questions: qSet,
                                    averages: avgs,
                                    responses: resps.map(r => ({
                                      assessorName: fullName(r.assessor),
                                      submittedAt: r.submittedAt,
                                      overallAvg: overallAvg(r.scores),
                                      scores: r.scores,
                                      strengths: r.strengths,
                                      improvements: r.improvements,
                                    })),
                                  })
                                }}
                                className={`${BTN_XS} hover:bg-white`}
                                style={{ color: 'var(--teal)', border: '1px solid var(--light-gray)', background: '#fff' }}
                              >
                                <Download size={12} /> PDF
                              </button>
                            </span>
                          </div>

                          {isExpanded && (
                            <div className="px-4 pb-4 pt-2 sm:pl-[46px] space-y-4" style={{ background: SUBTLE_BG }}>
                              <div className="rounded-lg bg-white p-4" style={{ border: `1px solid ${ROW_RULE}` }}>
                                <p className={`${SECTION_LABEL} mb-3`} style={{ color: 'var(--mid-gray)' }}>Per-criterion average</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                                  {Object.entries(qSet).map(([key, label]) => {
                                    const avg = avgs[key] ?? 0
                                    const b = scoreBand(avg)
                                    return (
                                      <div key={key} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1"
                                        title={`${b.label} — ${avg.toFixed(2)} / 5`}>
                                        <span className="text-[10.5px] font-bold" style={{ color: 'var(--mid-gray)' }}>{key.toUpperCase()}</span>
                                        <span className="text-xs leading-snug" style={{ color: 'var(--charcoal)' }}>{label}</span>
                                        <span className="text-sm font-bold text-right" style={{ color: b.fg, ...NUM }}>{avg.toFixed(1)}</span>
                                        <div className="col-start-2 col-span-2 h-2 rounded-full overflow-hidden" style={{ background: ROW_RULE }}>
                                          <div className="h-full rounded-full" style={{ width: `${(avg / 5) * 100}%`, background: b.bar }} />
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>

                              {(strengths.length > 0 || improvements.length > 0) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {strengths.length > 0 && (
                                    <FeedbackList title="Strengths" icon={<ThumbsUp size={13} />} items={strengths}
                                      fg="#166534" bg="#F0FDF4" border="#BBF7D0" />
                                  )}
                                  {improvements.length > 0 && (
                                    <FeedbackList title="Areas for Improvement" icon={<MessageSquare size={13} />} items={improvements}
                                      fg="#92400E" bg="#FFFBEB" border="#FDE68A" />
                                  )}
                                </div>
                              )}

                              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                                Evaluated by: {resps.map(r => fullName(r.assessor)).join(', ')}
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </DashCard>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ─── Generate Tab ─────────────────────────────────────────────────────────────

function GenerateTab({ role }: { role: string }) {
  const defaultBranch = role === 'AHEA_ADMIN' ? 'SBEA' : role === 'AHGH_ADMIN' ? 'SBGH' : ''
  const isAdmin = ['ADMIN', 'MARKETING_ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN'].includes(role)

  const [formType, setFormType] = useState<PeerEvalType>('HR08_PEER')
  const [branch, setBranch]     = useState(defaultBranch || 'SBEA')
  const [year, setYear]         = useState(new Date().getFullYear())
  const [month, setMonth]       = useState(new Date().getMonth() + 1)

  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)
  const [genError, setGenError] = useState('')

  if (!isAdmin) {
    return (
      <div className="rounded-xl" style={CARD_STYLE}>
        <EmptyState title="Admin access required" hint="You need Admin access to generate assignments." />
      </div>
    )
  }

  async function handleGenerate() {
    if (!confirm(`Generate ${formType} assignments for ${branchLabel(branch)} — ${year}?\n\nDuplicate assignments will be skipped automatically.`)) return
    setGenerating(true); setResult(null); setGenError('')
    try {
      const body: Record<string, any> = { formType, branch, year }
      const res = await fetch('/api/peer-eval/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) setGenError(data.error ?? 'Generation failed')
      else setResult(data)
    } catch (e: any) {
      setGenError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  // Partial: only the three generatable types have a description.
  const descMap: Partial<Record<PeerEvalType, string>> = {
    HR08_ADMIN: 'Administration staff will assess ALL clinical staff in the selected branch. Annual.',
    HR08_PEER:  'Clinical staff are paired with same-department, same-work-day peers. Each assessee receives 2–3 assessors. Annual.',
    HR09:       'Each admin staff member is assessed by at least 10 randomly selected clinical staff. Annual.',
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4 items-start">
        <DashCard title="Evaluation Type" icon={<ClipboardList size={15} />} description="Which form to create assignments for.">
          <div className="space-y-2" role="radiogroup" aria-label="Evaluation type">
            {(['HR08_ADMIN', 'HR08_PEER', 'HR09'] as PeerEvalType[]).map(t => {
              const active = formType === t
              return (
                <label key={t}
                  className={`flex items-start gap-3 cursor-pointer px-3.5 py-3 rounded-lg transition-colors ${active ? '' : 'hover:bg-[#FAFCFB]'}`}
                  style={{ border: `1.5px solid ${active ? 'var(--teal)' : 'var(--light-gray)'}`, background: active ? 'var(--pale-teal)' : '#fff' }}>
                  <input type="radio" name="formType" value={t} checked={active} onChange={() => setFormType(t)} className="mt-0.5" style={{ accentColor: 'var(--teal)' }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{t.replace('_', ' ')} {typeBadge(t)}</div>
                    <div className="text-xs leading-snug mt-0.5" style={{ color: 'var(--mid-gray)' }}>{descMap[t]}</div>
                  </div>
                </label>
              )
            })}
          </div>
        </DashCard>

        <div className="space-y-4 min-w-0">
          {!defaultBranch && (
            <DashCard title="Branch" icon={<Building2 size={15} />}>
              <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#F3F6F5' }} role="group" aria-label="Branch">
                {['SBEA', 'SBGH'].map(b => {
                  const active = branch === b
                  return (
                    <button key={b} type="button" aria-pressed={active} onClick={() => setBranch(b)}
                      className="flex-1 px-3 py-2 rounded-md text-sm font-semibold transition-colors"
                      style={active ? { background: '#fff', color: 'var(--teal)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' } : { color: 'var(--mid-gray)' }}>
                      {branchLabel(b)}
                    </button>
                  )
                })}
              </div>
            </DashCard>
          )}

          <DashCard title="Period" icon={<Calendar size={15} />} description="All assignments are annual">
            <select aria-label="Year" value={year} onChange={e => setYear(parseInt(e.target.value))} className={`${CONTROL} w-full`} style={CONTROL_STYLE}>
              {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </DashCard>

          <div className="rounded-xl p-4 space-y-2" style={CARD_STYLE}>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className={`${BTN_PRIMARY} w-full h-10`}
              style={{ background: 'var(--teal)' }}
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
              {generating ? 'Generating…' : `Generate ${formType} Assignments`}
            </button>
            <p className="text-[11px] text-center" style={{ color: 'var(--mid-gray)' }}>
              Duplicate assignments are skipped automatically.
            </p>
          </div>
        </div>
      </div>

      {result && (
        <SuccessNote title="Generation Complete">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div><span className="text-lg font-bold" style={{ color: '#15803D', ...NUM }}>{result.created}</span> created</div>
            <div><span className="text-lg font-bold" style={{ color: 'var(--mid-gray)', ...NUM }}>{result.skipped}</span> skipped (duplicates)</div>
          </div>
          {result.errors.length > 0 && <div className="mt-2 text-xs" style={{ color: '#B91C1C' }}>Errors: {result.errors.join(', ')}</div>}
        </SuccessNote>
      )}

      {genError && <InlineError message={genError} />}

      <DashCard title="Assignment Logic Reference" icon={<Info size={15} />}
        footer={<>Staff fill out evaluations via the internal form at <strong>/peereval</strong> (accessible by QR code, no login required). Duplicate assignments are skipped automatically.</>}>
        <ul className="space-y-2.5 text-xs leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
          <li className="flex items-start gap-2.5">{typeBadge('HR08_ADMIN')}<span>Each Administration staff → assesses all clinical staff in same branch. Annual.</span></li>
          <li className="flex items-start gap-2.5">{typeBadge('HR08_PEER')}<span>Clinical staff → same-department peers sharing at least 1 work day. 2–3 assessors per assessee. Annual.</span></li>
          <li className="flex items-start gap-2.5">{typeBadge('HR09')}<span>Each admin staff member is assessed by at least 10 randomly selected clinical staff in the branch. Annual.</span></li>
        </ul>
      </DashCard>
    </div>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({ role }: { role: string }) {
  const defaultBranch = role === 'AHEA_ADMIN' ? 'SBEA' : role === 'AHGH_ADMIN' ? 'SBGH' : ''

  const [filterBranch, setFilterBranch] = useState(defaultBranch || 'SBEA')
  const [configs, setConfigs]   = useState<AdminConfig[]>([])
  const [loading, setLoading]   = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [syncing, setSyncing]   = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced: number; created: number; updated: number; errors: string[] } | null>(null)
  const [error, setError]       = useState('')
  const [editDays, setEditDays] = useState<Record<string, string[]>>({})

  const fetchConfigs = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/peer-eval/admin-config?branch=${filterBranch}`)
      if (!res.ok) throw new Error('Failed to load configs')
      const data: AdminConfig[] = await res.json()
      setConfigs(data)
      const init: Record<string, string[]> = {}
      data.forEach(c => { init[c.staffId] = c.workDays })
      setEditDays(init)
    } catch (e: any) {
      setError(e.message)
    } finally { setLoading(false) }
  }, [filterBranch])

  useEffect(() => { fetchConfigs() }, [fetchConfigs])

  function toggleDay(staffId: string, day: string) {
    setEditDays(prev => {
      const current = prev[staffId] ?? []
      return { ...prev, [staffId]: current.includes(day) ? current.filter(d => d !== day) : [...current, day] }
    })
  }

  async function saveConfig(config: AdminConfig) {
    setSavingId(config.staffId)
    try {
      const res = await fetch('/api/peer-eval/admin-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: config.staffId, workDays: editDays[config.staffId] ?? [], branch: config.branch }),
      })
      if (!res.ok) throw new Error('Save failed')
      await fetchConfigs()
    } catch (e: any) {
      setError(e.message)
    } finally { setSavingId(null) }
  }

  async function handleSync() {
    if (!confirm('Sync admin staff from HR Platform? This will auto-create configs for any Administration staff not yet configured.')) return
    setSyncing(true); setSyncResult(null); setError('')
    try {
      const res = await fetch('/api/peer-eval/admin-config', { method: 'PATCH' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      setSyncResult(data)
      await fetchConfigs()
    } catch (e: any) {
      setError(e.message)
    } finally { setSyncing(false) }
  }

  return (
    <div className="space-y-4">
      <Toolbar>
        <div className="flex items-center gap-2 text-sm font-bold mr-1" style={DISPLAY}>
          <Users size={16} style={{ color: 'var(--teal)' }} />
          Admin Staff Work Days
        </div>
        {!defaultBranch && (
          <select aria-label="Branch" value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className={CONTROL} style={CONTROL_STYLE}>
            <option value="SBEA">East Branch</option>
            <option value="SBGH">Greenhills Branch</option>
          </select>
        )}
        <button type="button" onClick={fetchConfigs} className={`${BTN_SECONDARY} w-9 px-0`} style={{ ...CONTROL_STYLE, color: 'var(--mid-gray)' }} title="Refresh" aria-label="Refresh">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className={`${BTN_SECONDARY} ml-auto`}
          style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync from HR Platform'}
        </button>
      </Toolbar>

      <InfoNote>
        Admin staff (Administration department) are sourced from <strong>HR Platform → Staff Profiles</strong>.
        Use &quot;Sync from HR Platform&quot; to import or update the list.
        Configure which days each admin is in the clinic — used for scheduling context.
      </InfoNote>

      {error && <InlineError message={error} onRetry={fetchConfigs} />}

      {syncResult && (
        <SuccessNote title="Sync complete">
          <div className="text-sm">{syncResult.created} created · {syncResult.updated} already configured</div>
          {syncResult.errors.length > 0 && <div className="mt-1.5 text-xs" style={{ color: '#B91C1C' }}>{syncResult.errors.map((e, i) => <div key={i}>{e}</div>)}</div>}
        </SuccessNote>
      )}

      <DashCard title="Admin staff" icon={<Calendar size={15} />} flush
        description="Tap a day to toggle it, then Save that row."
        action={!loading && configs.length > 0 ? <CountPill tone="gray">{configs.length} staff</CountPill> : undefined}>
        {loading ? (
          <ListSkeleton rows={4} />
        ) : configs.length === 0 ? (
          <EmptyState title="No admin staff configured." hint="Use &quot;Sync from HR Platform&quot; to import." />
        ) : (
          <div className="overflow-auto max-h-[65vh]">
            <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 720 }}>
              <thead>
                <tr>
                  <th className={`${TH} sticky top-0 z-10`} style={{ background: SUBTLE_BG, color: 'var(--mid-gray)', borderBottom: '1px solid var(--light-gray)' }}>Staff Member</th>
                  <th className={`${TH} sticky top-0 z-10`} style={{ background: SUBTLE_BG, color: 'var(--mid-gray)', borderBottom: '1px solid var(--light-gray)' }}>Branch</th>
                  <th className={`${TH} sticky top-0 z-10`} style={{ background: SUBTLE_BG, color: 'var(--mid-gray)', borderBottom: '1px solid var(--light-gray)', minWidth: 320 }}>Work Days in Clinic</th>
                  <th className={`${TH} sticky top-0 z-10 text-right`} style={{ background: SUBTLE_BG, color: 'var(--mid-gray)', borderBottom: '1px solid var(--light-gray)', textAlign: 'right' }}>Save</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((c) => {
                  const days = editDays[c.staffId] ?? c.workDays
                  const saved = JSON.stringify(days.slice().sort()) === JSON.stringify((c.workDays as string[]).slice().sort())
                  return (
                    <tr key={c.staffId} className="hover:bg-[#FAFCFB]">
                      <td className="px-4 py-3 align-middle" style={{ borderBottom: `1px solid ${ROW_RULE}` }}>
                        <div className="font-semibold" style={{ color: 'var(--charcoal)' }}>{c.staff.firstName} {c.staff.lastName}</div>
                        {c.staff.jobTitle && <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{c.staff.jobTitle}</div>}
                      </td>
                      <td className="px-4 py-3 align-middle whitespace-nowrap" style={{ borderBottom: `1px solid ${ROW_RULE}`, color: 'var(--charcoal)' }}>{branchLabel(c.branch) ?? c.branch}</td>
                      <td className="px-4 py-3 align-middle" style={{ borderBottom: `1px solid ${ROW_RULE}` }}>
                        <div className="flex gap-1 flex-wrap">
                          {DAYS_OF_WEEK.map(day => {
                            const on = days.includes(day)
                            return (
                              <button
                                key={day}
                                type="button"
                                aria-pressed={on}
                                onClick={() => toggleDay(c.staffId, day)}
                                className="h-7 px-2.5 rounded-full text-[11px] font-semibold transition-colors"
                                style={on
                                  ? { background: 'var(--pale-teal)', color: 'var(--teal)', border: '1.5px solid var(--teal)' }
                                  : { background: '#fff', color: 'var(--mid-gray)', border: '1.5px solid var(--light-gray)' }}
                              >
                                {day}
                              </button>
                            )
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-right" style={{ borderBottom: `1px solid ${ROW_RULE}` }}>
                        <button
                          type="button"
                          onClick={() => saveConfig(c)}
                          disabled={saved || savingId === c.staffId}
                          className={`${BTN_XS} h-8 px-3`}
                          style={saved
                            ? { background: '#F3F4F6', color: '#9CA3AF', cursor: 'default' }
                            : { background: 'var(--teal)', color: '#fff', cursor: 'pointer' }}
                        >
                          {savingId === c.staffId ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          {savingId === c.staffId ? 'Saving…' : saved ? 'Saved' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = 'assignments' | 'by-assessee' | 'results' | 'generate' | 'settings'

export default function PeerEvalClient({ role }: { role: string }) {
  const isFrontDesk = ['AHEA_FRONT_DESK', 'AHGH_FRONT_DESK'].includes(role)
  const isMainAdmin = ['ADMIN', 'MARKETING_ADMIN'].includes(role)

  const defaultBranch = role === 'AHEA_ADMIN' || role === 'AHEA_FRONT_DESK' ? 'SBEA'
                      : role === 'AHGH_ADMIN' || role === 'AHGH_FRONT_DESK' ? 'SBGH'
                      : ''

  const [activeTab, setActiveTab] = useState<Tab>('assignments')

  const allTabs: { id: Tab; label: string; icon: typeof ClipboardList; visible: boolean }[] = [
    { id: 'assignments',  label: 'Assignments',  icon: ClipboardList, visible: true },
    { id: 'by-assessee',  label: 'By Assessee',  icon: Users,         visible: isMainAdmin },
    { id: 'results',      label: 'Results',      icon: BarChart3,     visible: isMainAdmin },
    { id: 'generate',     label: 'Generate',     icon: Zap,           visible: !isFrontDesk },
    { id: 'settings',     label: 'Settings',     icon: Settings,      visible: isMainAdmin },
  ]
  const tabs = allTabs.filter(t => t.visible)

  return (
    <div className="max-w-6xl space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>Clinic Tools</p>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold leading-tight" style={DISPLAY}>
            Peer Evaluation
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest" style={{ background: '#FEF3C7', color: '#92400E', fontFamily: 'var(--font-body)' }}>BETA</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Manage HR08 and HR09 peer evaluation assignments and responses.
          </p>
        </div>
        {defaultBranch && (
          <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold" style={{ ...CONTROL_STYLE, background: SUBTLE_BG, color: 'var(--mid-gray)' }}
            title="Your account is scoped to this branch">
            <Building2 size={15} style={{ color: 'var(--teal)' }} /> {branchLabel(defaultBranch)}
          </span>
        )}
      </div>

      {defaultBranch && <NotificationBanner branch={defaultBranch} />}

      {/* ── Page tabs ── */}
      {tabs.length > 1 && (
        <PillTabs label="Peer evaluation sections" tabs={tabs} value={activeTab} onChange={setActiveTab} />
      )}

      <div className="min-w-0">
        {activeTab === 'assignments'  && (isFrontDesk ? <FrontDeskPendingView role={role} /> : <AssignmentsTab role={role} />)}
        {activeTab === 'by-assessee' && isMainAdmin   && <ByAssesseeTab role={role} />}
        {activeTab === 'results'     && isMainAdmin   && <ResultsTab role={role} />}
        {activeTab === 'generate'    && !isFrontDesk  && <GenerateTab role={role} />}
        {activeTab === 'settings'    && isMainAdmin   && <SettingsTab role={role} />}
      </div>
    </div>
  )
}


// ─── Per-Department Rankings (all staff, high → low) ────────────────────────
// Shows every staff member in each department ranked by overall peer-eval
// score. Staff without any evaluations still appear at the bottom so gaps
// in coverage are visible at a glance.

function PerDepartmentRankings({
  groups,
  allStaff,
  filterBranch,
}: {
  groups: { assessee: StaffMini; responses: EvalResponse[] }[]
  allStaff: Array<{ id: string; firstName: string; lastName: string; department: string; branch: string }>
  filterBranch: string
}) {
  // Build lookup of peer-eval data per staffId
  const evalByStaff = new Map<string, { overall: number; responseCount: number }>()
  for (const g of groups) {
    const allScores = g.responses.flatMap(r => Object.values(r.scores))
    const overall = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0
    evalByStaff.set(g.assessee.id, { overall, responseCount: g.responses.length })
  }

  // Filter by branch if set
  const staffPool = filterBranch ? allStaff.filter(s => s.branch === filterBranch) : allStaff

  // Group by department
  const deptMap = new Map<string, Array<{
    id: string; name: string; department: string; branch: string;
    overall: number; responseCount: number; hasData: boolean
  }>>()
  for (const st of staffPool) {
    const ev = evalByStaff.get(st.id)
    const entry = {
      id: st.id,
      name: st.firstName + ' ' + st.lastName,
      department: st.department,
      branch: st.branch,
      overall: ev?.overall ?? 0,
      responseCount: ev?.responseCount ?? 0,
      hasData: !!ev,
    }
    if (!deptMap.has(st.department)) deptMap.set(st.department, [])
    deptMap.get(st.department)!.push(entry)
  }

  // Sort depts alphabetically, sort entries high→low (eval-less staff last)
  const depts = Array.from(deptMap.keys()).sort()
  const medalColors = ['#D99A1E', '#94A3B8', '#B87333'] // gold, silver, bronze

  if (depts.length === 0) {
    return (
      <div className="rounded-xl" style={CARD_STYLE}>
        <EmptyState title={`No staff on record${filterBranch ? ' for this branch' : ''}.`} />
      </div>
    )
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))' }}>
      {depts.map(dept => {
        const ranked = deptMap.get(dept)!.slice().sort((a, b) => {
          if (a.hasData !== b.hasData) return a.hasData ? -1 : 1
          return b.overall - a.overall
        })
        // Compute rank positions (tied = same rank, next rank skips)
        let prevScore: number | null = null
        let currentRank = 0
        const ranks: number[] = []
        ranked.forEach((r, i) => {
          if (!r.hasData) {
            ranks.push(-1)
            return
          }
          if (prevScore === null || r.overall !== prevScore) {
            currentRank = i + 1
            prevScore = r.overall
          }
          ranks.push(currentRank)
        })

        const withData = ranked.filter(r => r.hasData).length

        return (
          <section key={dept} className="rounded-xl min-w-0 flex flex-col" style={CARD_STYLE}>
            <header className="px-4 pt-3 pb-2.5 flex items-end justify-between gap-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--teal)' }}>
                  Department{filterBranch ? ` · ${branchLabel(filterBranch)}` : ''}
                </p>
                <h3 className="text-[15px] font-bold leading-tight truncate" style={DISPLAY}>{dept}</h3>
              </div>
              <span className="text-[11px] whitespace-nowrap flex-shrink-0" style={{ color: 'var(--mid-gray)', ...NUM }}>
                {ranked.length} staff · {withData} with evals
              </span>
            </header>

            <ol className="p-2 space-y-1">
              {ranked.map((r, i) => {
                const rank = ranks[i]
                const medal = rank > 0 && rank <= 3 ? medalColors[rank - 1] : undefined
                const b = scoreBand(r.overall)
                return (
                  <li key={r.id} className="flex items-center gap-3 rounded-lg px-2.5 py-2"
                    style={{
                      background: rank === 1 ? '#FFFBEB' : r.hasData ? 'transparent' : '#FAFAFA',
                      border: `1px solid ${rank === 1 ? '#FDE68A' : 'transparent'}`,
                    }}>
                    <span className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                      style={medal ? { background: medal + '22', color: medal } : { background: r.hasData ? ROW_RULE : '#F3F4F6', color: 'var(--mid-gray)' }}>
                      {r.hasData ? rank : '—'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold leading-snug truncate" style={{ color: r.hasData ? 'var(--charcoal)' : 'var(--mid-gray)' }}>
                        {r.name}
                      </div>
                      <div className="text-[11px] mt-px" style={{ color: 'var(--mid-gray)' }}>
                        {r.hasData
                          ? (r.responseCount + ' eval' + (r.responseCount !== 1 ? 's' : ''))
                          : 'No evaluations yet'}
                        {' · '}
                        <span>{branchLabel(r.branch) ?? r.branch}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {r.hasData ? (
                        <>
                          <div className="text-base font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: b.fg, ...NUM }}>
                            {r.overall.toFixed(2)}
                          </div>
                          <div className="text-[9.5px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                            of 5
                          </div>
                        </>
                      ) : (
                        <span className="text-[11px] italic" style={{ color: '#C4C9CF' }}>no data</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </div>
  )
}

// ─── Peer Eval Leaderboards ──────────────────────────────────────────────────
// Top 5 by overall average score, across three groupings:
//   • Overall (all branches, all depts)
//   • Per branch (SBEA / SBGH)
//   • Per department (OT, PT, SLP, etc.)
// Tied ranks are collapsed into one row; click to reveal each member.

interface PeerEvalLeaderEntry {
  id: string
  name: string
  department: string
  branch?: string
  overall: number
  responseCount: number
}

interface PeerEvalRankGroup {
  rank: number
  score: number
  members: PeerEvalLeaderEntry[]
}

function groupByScoreDesc(entries: PeerEvalLeaderEntry[], n: number): PeerEvalRankGroup[] {
  const sorted = [...entries].sort((a, b) => b.overall - a.overall)
  const groups: PeerEvalRankGroup[] = []
  const seen: number[] = []
  for (const e of sorted) {
    // round to 2 decimals for grouping so 4.15 and 4.1500001 count the same
    const k = Math.round(e.overall * 100) / 100
    if (seen.length === 0 || k !== seen[seen.length - 1]) {
      if (seen.length >= n) break
      seen.push(k)
      groups.push({ rank: seen.length, score: k, members: [e] })
    } else {
      groups[groups.length - 1].members.push(e)
    }
  }
  return groups
}

function PeerEvalLeaderboards({
  groups,
  expandedRank,
  onExpand,
}: {
  groups: { assessee: StaffMini; responses: EvalResponse[] }[]
  expandedRank: string | null
  onExpand: (key: string | null) => void
}) {
  // Flatten to entries with each assessee's overall average
  const entries: PeerEvalLeaderEntry[] = groups.map(g => {
    const allScores = g.responses.flatMap(r => Object.values(r.scores))
    const overall = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0
    return {
      id:           g.assessee.id,
      name:         `${g.assessee.firstName} ${g.assessee.lastName}`,
      department:   g.assessee.department,
      branch:       (g.assessee as unknown as { branch?: string }).branch,
      overall,
      responseCount: g.responses.length,
    }
  })

  const overallTop = groupByScoreDesc(entries, 5)

  // Per branch
  const branches = [...new Set(entries.map(e => e.branch).filter(Boolean) as string[])].sort()
  const byBranch: Record<string, PeerEvalRankGroup[]> = {}
  for (const b of branches) {
    byBranch[b] = groupByScoreDesc(entries.filter(e => e.branch === b), 5)
  }

  // Per department
  const depts = [...new Set(entries.map(e => e.department))].sort()
  const byDept: Record<string, PeerEvalRankGroup[]> = {}
  for (const d of depts) {
    byDept[d] = groupByScoreDesc(entries.filter(e => e.department === d), 5)
  }

  return (
    <div className="space-y-5">
      <LeaderboardSection title="Top 5 — Overall" groups={overallTop} keyPrefix="overall" expandedRank={expandedRank} onExpand={onExpand} />

      {branches.length > 0 && (
        <div>
          <p className={`${SECTION_LABEL} mb-2 flex items-center gap-1.5`} style={{ color: 'var(--mid-gray)' }}>
            <Building2 size={12} /> Top 5 — Per Branch
          </p>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))' }}>
            {branches.map(b => (
              <LeaderboardSection
                key={b}
                title={b === 'SBEA' ? 'East Branch' : b === 'SBGH' ? 'Greenhills Branch' : b}
                subtitle="Branch"
                groups={byBranch[b]}
                keyPrefix={'branch-' + b}
                expandedRank={expandedRank}
                onExpand={onExpand}
                compact
              />
            ))}
          </div>
        </div>
      )}

      {depts.length > 0 && (
        <div>
          <p className={`${SECTION_LABEL} mb-2 flex items-center gap-1.5`} style={{ color: 'var(--mid-gray)' }}>
            <Layers size={12} /> Top 5 — Per Department
          </p>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
            {depts.map(d => (
              <LeaderboardSection
                key={d}
                title={d}
                subtitle="Department"
                groups={byDept[d]}
                keyPrefix={'dept-' + d}
                expandedRank={expandedRank}
                onExpand={onExpand}
                compact
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LeaderboardSection({
  title,
  subtitle,
  groups,
  keyPrefix,
  expandedRank,
  onExpand,
  compact,
}: {
  title: string
  subtitle?: string
  groups: PeerEvalRankGroup[]
  keyPrefix: string
  expandedRank: string | null
  onExpand: (key: string | null) => void
  compact?: boolean
}) {
  const medalColors = ['#D99A1E', '#94A3B8', '#B87333'] // gold, silver, bronze

  return (
    <section className="rounded-xl min-w-0 flex flex-col" style={CARD_STYLE}>
      <header className={compact ? 'px-4 pt-3 pb-2.5' : 'px-5 pt-4 pb-3'} style={{ borderBottom: '1px solid var(--light-gray)' }}>
        {subtitle && (
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--teal)' }}>
            {subtitle}
          </p>
        )}
        <h3 className={`flex items-center gap-2 font-bold leading-tight ${compact ? 'text-[14px]' : 'text-[15px]'}`} style={DISPLAY}>
          {!compact && <Trophy size={15} style={{ color: '#D99A1E' }} />}
          {title}
        </h3>
      </header>
      {groups.length === 0 ? (
        <p className="py-6 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>
          No data yet
        </p>
      ) : (
        <ol className={compact ? 'p-2 space-y-1' : 'p-3 space-y-1.5'}>
          {groups.map(g => {
            const tied = g.members.length > 1
            const key = keyPrefix + '-' + g.rank
            const expanded = expandedRank === key
            const medal = g.rank <= 3 ? medalColors[g.rank - 1] : undefined
            const names = g.members.map(m => m.name).join(', ')
            const b = scoreBand(g.score)
            const content = (
              <>
                <span className={`${compact ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm'} rounded-full flex-shrink-0 flex items-center justify-center font-bold`}
                  style={medal ? { background: medal + '22', color: medal } : { background: ROW_RULE, color: 'var(--mid-gray)' }}>
                  {g.rank}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`${compact ? 'text-[13px]' : 'text-sm'} font-semibold leading-snug break-words`} style={{ color: 'var(--charcoal)' }}>
                    {names}
                  </div>
                  {tied ? (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>
                      <span className="px-1.5 py-px rounded-full text-[10px] font-bold" style={{ background: '#FEF3C7', color: '#92400E' }}>
                        Tied · {g.members.length}
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        {expanded ? 'Hide' : 'Tap to see each person'}
                      </span>
                    </div>
                  ) : (
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                      {g.members[0].department}{g.members[0].branch ? ' · ' + (branchLabel(g.members[0].branch) ?? g.members[0].branch) : ''} · {g.members[0].responseCount} eval{g.members[0].responseCount !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`${compact ? 'text-base' : 'text-xl'} font-bold leading-none`} style={{ fontFamily: 'var(--font-display)', color: b.fg, ...NUM }}>
                    {g.score.toFixed(2)}
                  </div>
                  <div className="text-[9.5px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                    of 5
                  </div>
                </div>
              </>
            )
            return (
              <li key={key} className="rounded-lg overflow-hidden"
                style={{ background: g.rank === 1 ? '#FFFBEB' : 'transparent', border: `1px solid ${g.rank === 1 ? '#FDE68A' : 'transparent'}` }}>
                {tied ? (
                  <button type="button" aria-expanded={expanded} onClick={() => onExpand(expanded ? null : key)}
                    className={`w-full text-left flex items-center gap-3 hover:bg-black/[0.02] ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
                    {content}
                  </button>
                ) : (
                  <div className={`flex items-center gap-3 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>{content}</div>
                )}

                {tied && expanded && (
                  <div className="px-2.5 pb-2.5 space-y-1">
                    {g.members.map(m => (
                      <div key={m.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md bg-white px-3 py-1.5 text-xs" style={{ border: `1px solid ${ROW_RULE}` }}>
                        <span className="flex-1 min-w-0 font-semibold" style={{ color: 'var(--charcoal)' }}>{m.name}</span>
                        <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{m.department}{m.branch ? ' · ' + (branchLabel(m.branch) ?? m.branch) : ''}</span>
                        <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{m.responseCount} eval{m.responseCount !== 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
