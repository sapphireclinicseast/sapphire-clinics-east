'use client'

// Partner Institutions — the schools and companies we hold agreements with.
//
// Read-only by design. HR Hub owns these records and is the only place they can
// be edited; this exists so whoever is on the desk can answer "do we have a
// discount with that school?" without messaging HR and waiting.
//
// Nothing here writes, so there is no role check beyond being signed in — see
// /api/partner-institutions, which is the thing actually holding the shared key.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Search, Building2, ExternalLink, RefreshCw, Info, Handshake, GraduationCap, Users, X,
  AlertTriangle, SearchX, Mail, Phone, Star, Tag, User, CalendarRange, FileCheck, Image as ImageIcon,
} from 'lucide-react'
import { CARD_STYLE, KpiCard, Skeleton, EmptyState } from '../patients/dashboard/ui'

interface Discount {
  serviceId: string; serviceLabel: string; discountType: string; value: number; note: string
  // HR's "Priority" tick on a discount row: partner students get priority booking
  // for that service, on top of (or instead of) a price cut.
  priority?: boolean
  // Who the row is for (HR's "group" on the discount row): ALL, STUDENT, FACULTY,
  // PARENT, ALUMNI, EMPLOYEE or OTHER. A partner often gives students one rate and
  // faculty or parents another, so one service can carry several rows.
  beneficiary?: string
  beneficiaryLabel?: string
}
interface Institution {
  id: string
  name: string
  type: string
  typeLabel: string
  pointOfContact: string
  email: string
  mobile: string
  telephone: string
  // Additional contacts recorded in HR (beyond the primary point of contact).
  contacts?: { name: string; role: string; email: string; mobile: string; telephone: string }[]
  services: { id: string; label: string }[]
  // HR "Partnership For": referral (clients referred to us) and/or internship
  // (they send us interns). Internship departments come separately.
  purposes?: string[]
  purposeLabels?: string[]
  internshipServices?: { id: string; label: string }[]
  discounts: Discount[]
  agreementType: string
  effectivityFrom: string
  effectivityTo: string
  hasCommission: boolean
  commissionType: string
  commissionValue: number
  commissionNote: string
  hasDocument: boolean
  photoCount: number
  remarks: string
  updatedAt: string
}

const HR_URL = 'https://hr.sapphireclinicseast.org/modules/partner-institutions/index.html'

function fmtDate(d: string) {
  if (!d) return ''
  const dt = new Date(`${d}T00:00:00Z`)
  return Number.isNaN(dt.getTime()) ? d
    : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** "20% off" / "₱500 off" — the two shapes HR stores. */
function discountLabel(d: Discount) {
  const v = d.discountType === 'percent' ? `${d.value}%` : `₱${Number(d.value).toLocaleString()}`
  return `${v} off`
}

/**
 * An agreement that has an end date in the past is worth flagging rather than
 * listing as if it still stands — front desk would otherwise honour a discount
 * the clinic is no longer party to. An empty end date means open-ended.
 */
function isExpired(inst: Institution) {
  if (!inst.effectivityTo) return false
  return inst.effectivityTo < new Date().toISOString().slice(0, 10)
}

/**
 * Sentences from the agreement text that carry a figure — a percentage or a
 * peso amount.
 *
 * These are pulled out and shown first because "what do they get" is the
 * question this page is opened to answer, and today it is buried mid-paragraph.
 *
 * Deliberately the WHOLE sentence, not the number: "₱20,000 per enrolled
 * student to LBCA" is money the clinic PAYS, and "5% discount on psych services
 * for LBCA students" is one the clinic GIVES. A badge reading "₱20,000 off"
 * would be read as a discount and honoured as one. The figure is emphasised
 * inside its sentence instead, so it catches the eye without being restated as
 * something it is not.
 */
function moneySentences(remarks: string): string[] {
  if (!remarks) return []
  return remarks
    .split(/(?<=[.;])\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0 && /\d\s*%|₱\s*[\d,]/.test(t))
}

/** The rest of the agreement text, once the figure sentences are lifted out. */
function otherSentences(remarks: string): string[] {
  if (!remarks) return []
  return remarks
    .split(/(?<=[.;])\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0 && !/\d\s*%|₱\s*[\d,]/.test(t))
}

/** Bold just the figures inside a sentence, leaving the wording intact. */
function withFiguresBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\d+(?:\.\d+)?\s*%|₱\s*[\d,]+(?:\.\d+)?)/g)
  return parts.map((part, i) =>
    /^(\d+(?:\.\d+)?\s*%|₱\s*[\d,]+(?:\.\d+)?)$/.test(part)
      ? <strong key={i} style={{ color: '#166534', fontSize: '0.95em' }}>{part}</strong>
      : <span key={i}>{part}</span>)
}

// ── Presentation ─────────────────────────────────────────────────────────────
// Same control/button vocabulary as Clinic Utilization and Patients, so the page
// reads as part of the same app.

const CONTROL = 'h-9 px-3 rounded-lg text-sm outline-none focus:border-[var(--teal)]'
const CONTROL_STYLE: CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)', fontFamily: 'var(--font-body)' }
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50'
const BTN_SECONDARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors hover:bg-gray-50 disabled:opacity-60'
const SECTION_LABEL = 'text-[10.5px] font-bold uppercase tracking-wider'
const SUBTLE_BG = '#F6F9F8'

/** Soft tones per purpose — Referral green-teal, Internship violet — used on the
 *  purpose badges and on the chips that belong to each purpose, so the colour
 *  alone says which list a department came from. */
const TONE = {
  referral:   { bg: '#E6F1EE', fg: '#1F5F55', border: '#CBE3DC' },
  internship: { bg: '#EFE8FB', fg: '#5B2A86', border: '#DDD0F3' },
  neutral:    { bg: '#F1F5F9', fg: '#475569', border: '#E2E8F0' },
  expired:    { bg: '#FEF2F2', fg: '#991B1B', border: '#FECACA' },
} as const
type Tone = keyof typeof TONE

type PurposeFilter = 'all' | 'referral' | 'internship' | 'both'

/** Older HR records carry no purpose and read as referral-only. */
function purposesOf(i: Institution) { return i.purposes ?? ['referral'] }

function Pill({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  const t = TONE[tone]
  return (
    <span title={title}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-4 whitespace-nowrap"
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.border}` }}>
      {children}
    </span>
  )
}

function PurposeBadge({ purpose }: { purpose: string }) {
  const internship = purpose === 'internship'
  return (
    <Pill tone={internship ? 'internship' : 'referral'}>
      {internship ? <GraduationCap size={11} /> : <Handshake size={11} />}
      {internship ? 'Internship' : 'Referral'}
    </Pill>
  )
}

/** A row of compact chips that folds the tail into "+N more". */
function ChipList({ items, tone, max }: { items: { id: string; label: string }[]; tone: Tone; max?: number }) {
  const t = TONE[tone]
  const visible = max ? items.slice(0, max) : items
  const hidden = items.length - visible.length
  return (
    <div className="flex flex-wrap gap-1 min-w-0">
      {visible.map(s => (
        <span key={s.id} className="inline-block max-w-full truncate px-1.5 py-0.5 rounded-md text-[11px] font-semibold leading-4"
          style={{ background: t.bg, color: t.fg }} title={s.label}>
          {s.label}
        </span>
      ))}
      {hidden > 0 && (
        <span className="inline-block px-1.5 py-0.5 rounded-md text-[11px] font-semibold leading-4"
          style={{ background: '#fff', color: 'var(--mid-gray)', border: '1px dashed var(--light-gray)' }}
          title={items.slice(visible.length).map(s => s.label).join(', ')}>
          +{hidden} more
        </span>
      )}
    </div>
  )
}

function DiscountBadge({ d }: { d: Discount }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 px-2 py-1 rounded-lg text-[12px] font-bold leading-4"
      style={{ background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC' }}>
      {/* No icon: the label already reads "5% off", and a percent glyph beside
          it showed the sign twice. It would also be wrong outright on a peso
          discount, where the label is "₱500 off". */}
      {discountLabel(d)}
      <span className="font-semibold">on {d.serviceLabel}</span>
      {d.beneficiary && d.beneficiary !== 'ALL' && (
        <span title={`This rate is for ${d.beneficiaryLabel || d.beneficiary} of the institution`}
          className="px-1.5 rounded text-[10.5px] font-bold"
          style={{ background: '#DBEAFE', color: '#1E40AF', border: '1px solid #93C5FD' }}>
          for {d.beneficiaryLabel || d.beneficiary}
        </span>
      )}
      {d.priority && (
        <span title="Priority: students from this institution are prioritised for this service"
          className="inline-flex items-center gap-0.5 px-1.5 rounded text-[10.5px] font-bold"
          style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>
          <Star size={9} fill="currentColor" /> Priority
        </span>
      )}
    </span>
  )
}

/** A quiet marker, not a warning panel. Most partners are in this state, and a
 *  block of amber on each of them competes with the green on the ones that DO
 *  have a rate — which is the thing worth spotting. */
function NoDiscount() {
  return <Pill tone="neutral">No discount set</Pill>
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

/** Email / phone lines, clickable: the desk is usually mid-call when they look. */
function ContactLines({ email, phone, compact = false }: { email: string; phone: string; compact?: boolean }) {
  return (
    <>
      {email && (
        <a href={`mailto:${email}`} onClick={stop}
          className={`flex items-center gap-1.5 min-w-0 hover:underline ${compact ? 'text-xs' : 'text-[13px]'}`}
          style={{ color: 'var(--teal)' }} title={email}>
          <Mail size={12} className="flex-shrink-0" style={{ color: 'var(--mid-gray)' }} />
          <span className={compact ? 'truncate' : 'break-all'}>{email}</span>
        </a>
      )}
      {phone && (
        <a href={`tel:${phone.replace(/\s+/g, '')}`} onClick={stop}
          className={`flex items-center gap-1.5 min-w-0 hover:underline tabular-nums ${compact ? 'text-xs' : 'text-[13px]'}`}
          style={{ color: 'var(--teal)' }}>
          <Phone size={12} className="flex-shrink-0" style={{ color: 'var(--mid-gray)' }} />
          <span className="truncate">{phone}</span>
        </a>
      )}
    </>
  )
}

function agreementLine(i: Institution) {
  return `${i.effectivityFrom ? `From ${fmtDate(i.effectivityFrom)}` : 'No start date recorded'}${
    i.effectivityTo ? ` to ${fmtDate(i.effectivityTo)}` : i.effectivityFrom ? ' · open-ended' : ''}`
}

const GRID_COLS = 'lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1.1fr)_minmax(0,1.45fr)_minmax(0,1fr)]'

export default function PartnerInstitutionsPage() {
  const [list, setList] = useState<Institution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [purpose, setPurpose] = useState<PurposeFilter>('all')
  // Kept as an id rather than the object so a Refresh shows the fresh record.
  const [openId, setOpenId] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/partner-institutions', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not load partner institutions')
      setList(d.institutions ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load partner institutions')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const types = useMemo(
    () => [...new Set(list.map(i => i.typeLabel).filter(Boolean))].sort(),
    [list],
  )

  // Headline counts, from the list already in hand — no extra request.
  const stats = useMemo(() => {
    let referral = 0, internship = 0, both = 0, expired = 0
    for (const i of list) {
      const p = purposesOf(i)
      const r = p.includes('referral'), n = p.includes('internship')
      if (r) referral++
      if (n) internship++
      if (r && n) both++
      if (isExpired(i)) expired++
    }
    return { total: list.length, referral, internship, both, expired }
  }, [list])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return list.filter(i => {
      if (type !== 'all' && i.typeLabel !== type) return false
      if (purpose !== 'all') {
        const p = purposesOf(i)
        if (purpose === 'both' ? !(p.includes('referral') && p.includes('internship')) : !p.includes(purpose)) return false
      }
      if (!needle) return true
      // Contact and service names too: "who do we call at Xavier" and "who do
      // we have an OT discount with" are both questions this page gets asked.
      return [i.name, i.pointOfContact, i.email, i.remarks, ...i.services.map(s => s.label), ...(i.purposeLabels ?? []), ...(i.internshipServices ?? []).map(s => s.label), ...(i.contacts ?? []).flatMap(c => [c.name, c.role, c.email])]
        .join(' ').toLowerCase().includes(needle)
    })
  }, [list, q, type, purpose])

  const opened = openId ? list.find(i => i.id === openId) ?? null : null

  useEffect(() => {
    if (!openId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId])

  const initialLoad = loading && list.length === 0
  const filtered = q.trim() !== '' || type !== 'all' || purpose !== 'all'

  const purposePills: { key: PurposeFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'referral', label: 'Referral', count: stats.referral },
    { key: 'internship', label: 'Internship', count: stats.internship },
    { key: 'both', label: 'Both', count: stats.both },
  ]

  return (
    <div className="max-w-[1200px] mx-auto space-y-5 min-w-0">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>Clinic Tools</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Partner Institutions
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Schools and companies we hold agreements with, and what each one entitles them to.
          </p>
        </div>
        <button onClick={load} disabled={loading} className={BTN_SECONDARY} style={CONTROL_STYLE}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--teal)' }} /> Refresh
        </button>
      </div>

      {/* Said plainly rather than left for someone to discover by hunting for a
          save button that is not there. */}
      <div className="flex items-start gap-2.5 rounded-xl px-4 py-2.5" style={{ background: '#F1F7F8', border: '1px solid #CFE3E6' }}>
        <Info size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--teal)' }} />
        <p className="text-[13px] leading-relaxed m-0" style={{ color: '#12606C' }}>
          View only. These records live in HR Hub &mdash; to add a partner or change an agreement,{' '}
          <a href={HR_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2 whitespace-nowrap"
             style={{ color: '#12606C' }}>
            open Partner Institutions in HR Hub <ExternalLink size={11} className="inline -mt-0.5" />
          </a>.
        </p>
      </div>

      {/* ── KPIs ── */}
      {!error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {initialLoad ? (
            Array.from({ length: 4 }).map((_, n) => (
              <div key={n} className="rounded-xl px-4 py-3.5" style={CARD_STYLE}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-14 mt-2" />
                <Skeleton className="h-3 w-24 mt-2" />
              </div>
            ))
          ) : (
            <>
              <KpiCard label="Partners" icon={<Building2 size={16} />} value={stats.total}
                sub={stats.expired > 0 ? `${stats.expired} agreement${stats.expired === 1 ? '' : 's'} expired` : 'All agreements current'} />
              <KpiCard label="Referral" icon={<Handshake size={16} />} accent={TONE.referral.fg} value={stats.referral}
                sub="Refer clients to us" />
              <KpiCard label="Internship" icon={<GraduationCap size={16} />} accent={TONE.internship.fg} value={stats.internship}
                sub="Send us interns" />
              <KpiCard label="Both" icon={<Users size={16} />} accent="var(--gold)" value={stats.both}
                sub="Referral and internship" />
            </>
          )}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-3" style={CARD_STYLE}>
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} aria-label="Search partner institutions"
            placeholder="Search institution, contact, or service…"
            className={`${CONTROL} w-full pl-8 ${q ? 'pr-8' : ''}`} style={CONTROL_STYLE} />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100" style={{ color: 'var(--mid-gray)' }}>
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Purpose filter">
          {purposePills.map(p => {
            const on = purpose === p.key
            return (
              <button key={p.key} type="button" aria-pressed={on} onClick={() => setPurpose(p.key)}
                className={`h-8 px-3 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${on ? '' : 'hover:bg-gray-50'}`}
                style={on
                  ? { background: 'var(--teal)', color: '#fff', border: '1px solid var(--teal)' }
                  : { background: '#fff', color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}>
                {p.label}
                {!initialLoad && <span className="ml-1.5 tabular-nums" style={{ opacity: on ? 0.8 : 0.55 }}>{p.count}</span>}
              </button>
            )
          })}
        </div>
        <select value={type} onChange={e => setType(e.target.value)} aria-label="Institution type"
          className={CONTROL} style={CONTROL_STYLE}>
          <option value="all">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* ── List ── */}
      {error ? (
        <div role="alert" className="rounded-xl text-center px-6 py-10" style={{ background: '#fff', border: '1px solid #FECACA' }}>
          <AlertTriangle size={20} className="mx-auto mb-2" style={{ color: '#DC2626' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Couldn&rsquo;t load partner institutions</p>
          <p className="text-xs mt-1 max-w-md mx-auto" style={{ color: '#991B1B' }}>{error}</p>
          <button onClick={load} disabled={loading} className={`${BTN_SECONDARY} mt-4 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Try again
          </button>
        </div>
      ) : (
        <section className="rounded-xl overflow-hidden min-w-0" style={CARD_STYLE}>
          <header className="px-5 py-3 flex flex-wrap items-center justify-between gap-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
            <h2 className="text-[14px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {initialLoad ? 'Partners' : filtered ? `${shown.length} of ${list.length} partners` : `${list.length} partner${list.length === 1 ? '' : 's'}`}
            </h2>
            <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Click a partner for the full agreement</span>
          </header>

          {/* Column heads only when the row is laid out as columns. */}
          <div className={`hidden lg:grid ${GRID_COLS} gap-5 px-5 py-2`} style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}>
            {['Institution', 'Services & departments', 'What they get', 'Contact'].map(h => (
              <span key={h} className={SECTION_LABEL} style={{ color: 'var(--mid-gray)' }}>{h}</span>
            ))}
          </div>

          {initialLoad ? (
            <div aria-hidden>
              {Array.from({ length: 5 }).map((_, n) => (
                <div key={n} className={`grid grid-cols-1 ${GRID_COLS} gap-3 lg:gap-5 px-5 py-4`} style={{ borderTop: n ? '1px solid var(--light-gray)' : undefined }}>
                  <div><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-32 mt-2" /></div>
                  <div className="flex gap-1"><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-12" /></div>
                  <div><Skeleton className="h-3.5 w-full" /><Skeleton className="h-3.5 w-2/3 mt-1.5" /></div>
                  <div><Skeleton className="h-3.5 w-28" /><Skeleton className="h-3.5 w-36 mt-1.5" /></div>
                </div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center">
              {list.length === 0
                ? <Building2 size={26} className="mt-10 -mb-8" style={{ color: 'var(--light-gray)' }} />
                : <SearchX size={26} className="mt-10 -mb-8" style={{ color: 'var(--light-gray)' }} />}
              <EmptyState
                title={list.length === 0 ? 'No partner institutions recorded yet' : 'Nothing matches that search'}
                hint={list.length === 0 ? 'Partners added in HR Hub will appear here.' : 'Try a different name, contact or service, or clear the filters.'} />
              {list.length > 0 && filtered && (
                <button type="button" onClick={() => { setQ(''); setType('all'); setPurpose('all') }}
                  className={`${BTN_SECONDARY} -mt-6 mb-8 text-xs`} style={{ ...CONTROL_STYLE, color: 'var(--teal)' }}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <ul>
              {shown.map((i, n) => {
                const expired = isExpired(i)
                const p = purposesOf(i)
                const money = moneySentences(i.remarks)
                const contactCount = (i.contacts ?? []).length
                const phone = i.mobile || i.telephone
                return (
                  <li key={i.id} style={{ borderTop: n ? '1px solid var(--light-gray)' : undefined }}>
                    <div role="button" tabIndex={0} aria-label={`View ${i.name}`}
                      onClick={() => setOpenId(i.id)}
                      onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(i.id) } }}
                      className={`grid grid-cols-1 ${GRID_COLS} gap-3 lg:gap-5 px-5 py-4 cursor-pointer transition-colors hover:bg-[#F8FAF9] focus:outline-none focus-visible:bg-[#F3F7F6]`}
                      style={{ opacity: expired ? 0.72 : 1 }}>
                      {/* Who they are */}
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold leading-snug" style={{ color: 'var(--charcoal)' }}>{i.name}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {p.map(x => <PurposeBadge key={x} purpose={x} />)}
                          {i.typeLabel && <Pill tone="neutral">{i.typeLabel}</Pill>}
                          {expired && <Pill tone="expired">Expired {fmtDate(i.effectivityTo)}</Pill>}
                        </div>
                      </div>

                      {/* Services & departments */}
                      <div className="min-w-0 space-y-1.5">
                        {i.services.length > 0 && <ChipList items={i.services} tone="referral" max={3} />}
                        {p.includes('internship') && (
                          (i.internshipServices ?? []).length > 0 ? (
                            <div className="flex items-start gap-1.5 min-w-0">
                              <GraduationCap size={13} className="flex-shrink-0 mt-0.5" style={{ color: TONE.internship.fg }} aria-label="Interns accepted in" />
                              <ChipList items={i.internshipServices ?? []} tone="internship" max={3} />
                            </div>
                          ) : (
                            <p className="text-xs italic" style={{ color: 'var(--mid-gray)' }}>Intern departments not set in HR Hub yet</p>
                          )
                        )}
                        {i.services.length === 0 && !p.includes('internship') && (
                          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>&mdash;</span>
                        )}
                      </div>

                      {/* What they get — the thing front desk opens this page for. */}
                      <div className="min-w-0">
                        {i.discounts.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {i.discounts.slice(0, 2).map((d, k) => <DiscountBadge key={`${d.serviceId}-${k}`} d={d} />)}
                            {i.discounts.length > 2 && (
                              <span className="self-center text-[11px] font-semibold" style={{ color: 'var(--mid-gray)' }}>+{i.discounts.length - 2} more</span>
                            )}
                          </div>
                        ) : money.length > 0 ? (
                          <p className="text-[13px] leading-relaxed line-clamp-2" style={{ color: '#14532D' }}>
                            {withFiguresBold(money[0])}
                          </p>
                        ) : <NoDiscount />}
                        {i.discounts.length === 0 && money.length > 1 && (
                          <p className="text-[11px] font-semibold mt-1" style={{ color: 'var(--mid-gray)' }}>+{money.length - 1} more on rates</p>
                        )}
                      </div>

                      {/* Who to call */}
                      <div className="min-w-0 space-y-0.5">
                        {(i.pointOfContact || i.email || phone || contactCount > 0) ? (
                          <>
                            {i.pointOfContact && <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{i.pointOfContact}</p>}
                            <ContactLines email={i.email} phone={phone} compact />
                            {contactCount > 0 && (
                              <p className="text-[11px] font-semibold" style={{ color: 'var(--mid-gray)' }}>
                                +{contactCount} more contact{contactCount === 1 ? '' : 's'}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-xs italic" style={{ color: 'var(--mid-gray)' }}>No contact recorded</p>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {opened && <PartnerDetail inst={opened} onClose={() => setOpenId(null)} />}
    </div>
  )
}

// ── Detail panel ─────────────────────────────────────────────────────────────

function DetailSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="px-6 py-4" style={{ borderTop: '1px solid var(--light-gray)' }}>
      <h4 className={`flex items-center gap-1.5 mb-2.5 ${SECTION_LABEL}`} style={{ color: 'var(--mid-gray)' }}>
        <span style={{ color: 'var(--teal)' }}>{icon}</span>{title}
      </h4>
      {children}
    </section>
  )
}

function PartnerDetail({ inst: i, onClose }: { inst: Institution; onClose: () => void }) {
  const expired = isExpired(i)
  const p = purposesOf(i)
  const money = moneySentences(i.remarks)
  const rest = otherSentences(i.remarks)
  const contacts = [
    ...((i.pointOfContact || i.email || i.mobile || i.telephone)
      ? [{ name: i.pointOfContact, role: 'Primary contact', email: i.email, phone: i.mobile || i.telephone }]
      : []),
    ...(i.contacts ?? []).map(c => ({ name: c.name, role: c.role, email: c.email, phone: c.mobile || c.telephone })),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="pi-detail-title"
        className="bg-white rounded-xl w-full max-w-[720px] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4">
          <div className="min-w-0">
            <h3 id="pi-detail-title" className="text-lg font-bold leading-snug" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {i.name}
            </h3>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {p.map(x => <PurposeBadge key={x} purpose={x} />)}
              {i.typeLabel && <Pill tone="neutral">{i.typeLabel}</Pill>}
              {expired && <Pill tone="expired">Expired {fmtDate(i.effectivityTo)}</Pill>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" autoFocus
            className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center hover:bg-gray-100" style={{ color: 'var(--mid-gray)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto min-h-0">
          {/* What they get */}
          <DetailSection icon={<Tag size={12} />} title="What they get">
            {/* Structured discounts are the good case — an exact figure against
                an exact service. Few records carry them yet, so the sentences
                below usually carry the weight. */}
            {i.discounts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {i.discounts.map((d, k) => <DiscountBadge key={`${d.serviceId}-${k}`} d={d} />)}
              </div>
            )}
            {money.length > 0 ? (
              <div className="rounded-lg px-3.5 py-2.5" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                <p className={`${SECTION_LABEL} mb-1`} style={{ color: '#166534' }}>What the agreement says on rates</p>
                {money.map((t, k) => (
                  <p key={k} className={`text-[13.5px] leading-relaxed ${k ? 'mt-1.5' : ''}`} style={{ color: '#14532D' }}>
                    {withFiguresBold(t)}
                  </p>
                ))}
              </div>
            ) : i.discounts.length === 0 && <NoDiscount />}
            {rest.length > 0 && (
              <p className="text-[13px] leading-relaxed mt-3" style={{ color: 'var(--mid-gray)' }}>{rest.join(' ')}</p>
            )}
            {/* Commission is deliberately NOT shown. This page is open at the
                front desk, often with the patient across the counter, and what
                the clinic pays a partner per referral is not part of answering
                "what discount do they get". It stays in HR Hub for whoever
                negotiates the agreement. */}
          </DetailSection>

          {/* Partnership */}
          {(i.services.length > 0 || p.includes('internship')) && (
            <DetailSection icon={<Handshake size={12} />} title="Partnership">
              <div className="space-y-3">
                {i.services.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--charcoal)' }}>Services</p>
                    <ChipList items={i.services} tone="referral" />
                  </div>
                )}
                {p.includes('internship') && (
                  <div>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--charcoal)' }}>Interns accepted in</p>
                    {(i.internshipServices ?? []).length > 0
                      ? <ChipList items={i.internshipServices ?? []} tone="internship" />
                      : <p className="text-xs italic" style={{ color: 'var(--mid-gray)' }}>Departments not set in HR Hub yet</p>}
                  </div>
                )}
              </div>
            </DetailSection>
          )}

          {/* Contacts */}
          <DetailSection icon={<User size={12} />} title={contacts.length > 1 ? `Contacts (${contacts.length})` : 'Contact'}>
            {contacts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {contacts.map((c, k) => (
                  <div key={k} className="rounded-lg px-3.5 py-2.5 min-w-0 space-y-0.5" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                    {(c.name || c.role) && (
                      <p className="text-[13px] font-semibold" style={{ color: 'var(--charcoal)' }}>
                        {c.name || '—'}
                        {c.role && <span className="block text-[11px] font-normal" style={{ color: 'var(--mid-gray)' }}>{c.role}</span>}
                      </p>
                    )}
                    <ContactLines email={c.email} phone={c.phone} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs italic" style={{ color: 'var(--mid-gray)' }}>No contact recorded</p>
            )}
          </DetailSection>

          {/* Agreement */}
          <DetailSection icon={<CalendarRange size={12} />} title="Agreement">
            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[13px]">
              {i.agreementType && i.agreementType !== 'NA' && (
                <><dt style={{ color: 'var(--mid-gray)' }}>Type</dt><dd style={{ color: 'var(--charcoal)' }}>{i.agreementType}</dd></>
              )}
              <dt style={{ color: 'var(--mid-gray)' }}>Effectivity</dt>
              <dd style={{ color: expired ? '#991B1B' : 'var(--charcoal)' }}>{agreementLine(i)}</dd>
              <dt style={{ color: 'var(--mid-gray)' }}>Document</dt>
              <dd className="flex items-center gap-1.5" style={{ color: 'var(--charcoal)' }}>
                {i.hasDocument
                  ? <><FileCheck size={13} style={{ color: TONE.referral.fg }} /> Signed document on file in HR Hub</>
                  : <span style={{ color: 'var(--mid-gray)' }}>None on file</span>}
              </dd>
              {i.photoCount > 0 && (
                <><dt style={{ color: 'var(--mid-gray)' }}>Photos</dt>
                  <dd className="flex items-center gap-1.5" style={{ color: 'var(--charcoal)' }}>
                    <ImageIcon size={13} style={{ color: 'var(--mid-gray)' }} /> {i.photoCount} photo{i.photoCount === 1 ? '' : 's'} in HR Hub
                  </dd></>
              )}
            </dl>
          </DetailSection>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
          <a href={HR_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
            style={{ color: 'var(--teal)' }}>
            Edit in HR Hub <ExternalLink size={12} />
          </a>
          <button onClick={onClose} className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>Close</button>
        </div>
      </div>
    </div>
  )
}
