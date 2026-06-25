'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Users as UsersIcon,
  CheckCircle2,
  Activity,
  Video,
  ExternalLink,
  Calendar as CalendarIcon,
  Clock,
  X as XIcon,
  Cake,
  MapPin,
  Stethoscope,
  User as UserIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBranchSwitcher } from '@/components/BranchSwitcher'

type ViewMode = 'day' | 'week' | 'month'

interface PatientInfo {
  id: string
  firstName: string
  lastName: string
  dob: string | null
  sex: string | null
  patientType: string | null
  diagnosis: string | null
  city: string | null
}

interface ScheduleItem {
  id: string
  date: string // YYYY-MM-DD
  startTime: string
  endTime: string
  duration: string
  sessionType: string
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED' | 'COMPLETED' | string
  meetLink: string | null
  notes: string | null
  patient: PatientInfo | null
  staff: { id: string; firstName: string; lastName: string; department: string; branch: string }
}

interface Summary {
  confirmedSessions: number
  uniquePatients: number
  avgPatientsPerDay: number
  activeDays: number
}

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Date helpers — all UTC to match what the API returns.
function isoDay(d: Date) { return d.toISOString().slice(0, 10) }
function addDays(d: Date, n: number) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x }
function startOfWeek(d: Date) { const x = new Date(d); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x }
function startOfMonth(d: Date) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)) }
function endOfMonth(d: Date) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)) }
function startOfMonthGrid(d: Date) { return startOfWeek(startOfMonth(d)) }
function endOfMonthGrid(d: Date) { return addDays(startOfMonthGrid(d), 41) } // 6 rows × 7 = 42 cells

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
function fmtRange(s: Date, e: Date) {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`
}
function fmtTime12h(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

// Status colours — saturated brand-palette fills, picked to be visually
// distinct at 12 px swatch size (the previous tints all read "warm beige"
// in the legend).
//   Confirmed  — Sage   (medium teal-green, white text) → "active"
//   Pending    — Sun    (saturated amber, ink text)     → "waiting"
//   Completed  — Narra  (deep green, paper text)        → "done/closed"
//   Cancelled  — Clay   (warm red-brown, white text)    → "stopped"
//   Rescheduled— Paper2 with DASHED ink border          → "in transit"
function statusClass(status: string): string {
  switch (status) {
    case 'CONFIRMED':   return 'bg-[var(--sage)] text-white border border-[var(--moss)]'
    case 'PENDING':     return 'bg-[var(--sun)] text-[var(--ink)] border border-[#8C6A2D]'
    case 'COMPLETED':   return 'bg-[var(--narra)] text-[var(--paper)] border border-[var(--narra)]'
    case 'CANCELLED':   return 'bg-[var(--clay)] text-white border border-[#7A3F29]'
    case 'RESCHEDULED': return 'bg-[var(--paper-2)] text-[var(--ink)] border-2 border-dashed border-[var(--ink)]/55'
    default:            return 'bg-[var(--paper-2)] text-[var(--mid-gray)] border border-[var(--paper-3)]'
  }
}

export default function ClinicSchedulePage() {
  const [view, setView] = useState<ViewMode>('week')
  const [anchor, setAnchor] = useState<Date>(() => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  })
  const [schedules, setSchedules] = useState<ScheduleItem[]>([])
  const [summary, setSummary] = useState<Summary>({ confirmedSessions: 0, uniquePatients: 0, avgPatientsPerDay: 0, activeDays: 0 })
  const [loading, setLoading] = useState(true)
  const [profilePatient, setProfilePatient] = useState<PatientInfo | null>(null)
  const [moreDay, setMoreDay] = useState<string | null>(null)
  const { isMultiBranch, activeStaffId } = useBranchSwitcher()

  const range = useMemo(() => {
    if (view === 'day') return { start: anchor, end: anchor }
    if (view === 'week') { const s = startOfWeek(anchor); return { start: s, end: addDays(s, 6) } }
    return { start: startOfMonthGrid(anchor), end: endOfMonthGrid(anchor) }
  }, [view, anchor])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        // Pass the active staffId for interbranch clinicians so the API
        // scopes to that branch only. Otherwise the API unions all of
        // their branches.
        const staffParam = isMultiBranch && activeStaffId ? `&staffId=${activeStaffId}` : ''
        const url = `/api/clinic-schedule?startDate=${isoDay(range.start)}&endDate=${isoDay(range.end)}${staffParam}`
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) { setSchedules([]); setSummary({ confirmedSessions: 0, uniquePatients: 0, avgPatientsPerDay: 0, activeDays: 0 }) }
        } else {
          const data = await res.json()
          if (!cancelled) {
            setSchedules(data.schedules ?? [])
            setSummary(data.summary ?? { confirmedSessions: 0, uniquePatients: 0, avgPatientsPerDay: 0, activeDays: 0 })
          }
        }
      } catch {
        if (!cancelled) { setSchedules([]); setSummary({ confirmedSessions: 0, uniquePatients: 0, avgPatientsPerDay: 0, activeDays: 0 }) }
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [range.start.getTime(), range.end.getTime(), activeStaffId, isMultiBranch])

  function navigate(direction: -1 | 1) {
    if (view === 'day') setAnchor(addDays(anchor, direction))
    else if (view === 'week') setAnchor(addDays(anchor, 7 * direction))
    else {
      const next = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + direction, 1))
      setAnchor(next)
    }
  }
  function goToday() {
    const now = new Date()
    setAnchor(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())))
  }

  // Bucket schedules by ISO day for fast lookup.
  const byDay = useMemo(() => {
    const m = new Map<string, ScheduleItem[]>()
    for (const s of schedules) {
      if (!m.has(s.date)) m.set(s.date, [])
      m.get(s.date)!.push(s)
    }
    return m
  }, [schedules])

  const headerLabel = view === 'day'
    ? fmtDate(isoDay(anchor))
    : view === 'week'
      ? fmtRange(range.start, range.end)
      : `${MONTHS[anchor.getUTCMonth()]} ${anchor.getUTCFullYear()}`

  return (
    <div className="max-w-6xl mx-auto">

      {/* Hero */}
      <div className="hero-gradient rounded-2xl px-8 py-8 mb-6 animate-fade-up">
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/20">
            <CalendarDays className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Clinic Schedule
            </h1>
            <p className="text-white/70 text-sm mt-1">
              Your sessions across all branches you work in.
            </p>
          </div>
        </div>
      </div>

      {/* Summary cards — lifetime totals (since the very start) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <SummaryCard
          icon={<CheckCircle2 size={18} />}
          label="Confirmed Sessions"
          value={summary.confirmedSessions}
          stagger="stagger-1"
          accent="moss"
          subtext="Lifetime Total"
        />
        <SummaryCard
          icon={<UsersIcon size={18} />}
          label="Unique Patients"
          value={summary.uniquePatients}
          stagger="stagger-2"
          accent="clay"
          subtext="Lifetime Total"
        />
        <SummaryCard
          icon={<Activity size={18} />}
          label="Avg Patients / Day"
          value={summary.avgPatientsPerDay}
          stagger="stagger-3"
          accent="sun"
          subtext={`Lifetime · ${summary.activeDays} Active Day${summary.activeDays === 1 ? '' : 's'}`}
        />
      </div>

      {/* Toolbar */}
      <div className="card-static !py-3 !px-4 mb-4 flex flex-wrap items-center gap-3 justify-between animate-fade-up stagger-3">
        <div className="flex items-center gap-1.5">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg text-[var(--mid-gray)] hover:bg-[var(--paper-2)] hover:text-[var(--narra)] transition-colors" title="Previous">
            <ChevronLeft size={18} />
          </button>
          <button onClick={goToday} className="text-[12px] font-semibold px-3 py-1.5 rounded-lg text-[var(--narra)] hover:bg-[var(--paper-2)] transition-colors">
            Today
          </button>
          <button onClick={() => navigate(1)} className="p-1.5 rounded-lg text-[var(--mid-gray)] hover:bg-[var(--paper-2)] hover:text-[var(--narra)] transition-colors" title="Next">
            <ChevronRight size={18} />
          </button>
          <span className="ml-2 text-[14px] font-semibold text-[var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
            {headerLabel}
          </span>
        </div>

        <div className="inline-flex rounded-lg bg-[var(--paper-2)] p-1">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'px-3 py-1 text-[12px] font-semibold rounded-md transition-all capitalize',
                view === v
                  ? 'bg-[var(--narra)] text-[var(--paper)] shadow-sm'
                  : 'text-[var(--mid-gray)] hover:text-[var(--narra)]'
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Status legend — explains the colored chips in week/day views */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 px-1 text-[11px] text-[var(--mid-gray)]">
        <span className="font-semibold uppercase tracking-wider text-[var(--narra)]">Legend:</span>
        <LegendDot status="CONFIRMED" label="Confirmed" />
        <LegendDot status="PENDING" label="Pending" />
        <LegendDot status="COMPLETED" label="Completed" />
        <LegendDot status="CANCELLED" label="Cancelled" />
        <LegendDot status="RESCHEDULED" label="Rescheduled" />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-7 h-7 text-[var(--moss)] animate-spin" />
          <p className="text-sm text-[var(--mid-gray)]">Loading schedule...</p>
        </div>
      ) : view === 'day' ? (
        <DayView day={isoDay(anchor)} items={byDay.get(isoDay(anchor)) ?? []} onPatientClick={setProfilePatient} />
      ) : view === 'week' ? (
        <WeekView start={range.start} byDay={byDay} onPatientClick={setProfilePatient} />
      ) : (
        <MonthView
          anchor={anchor}
          byDay={byDay}
          onDayClick={(iso) => { setAnchor(new Date(iso + 'T00:00:00Z')); setView('day') }}
          onPatientClick={setProfilePatient}
          onShowMore={(iso) => setMoreDay(iso)}
        />
      )}

      {moreDay && (
        <DayMorePopup
          day={moreDay}
          items={byDay.get(moreDay) ?? []}
          onClose={() => setMoreDay(null)}
          onPatientClick={(p) => setProfilePatient(p)}
        />
      )}

      {profilePatient && (
        <PatientProfileModal patient={profilePatient} onClose={() => setProfilePatient(null)} />
      )}
    </div>
  )
}

function SummaryCard({
  icon, label, value, stagger, accent, subtext,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  stagger: string
  accent: 'moss' | 'clay' | 'sun'
  subtext?: string
}) {
  const ringColor = accent === 'moss' ? 'var(--sage-tint)' : accent === 'clay' ? 'var(--clay-tint)' : 'var(--sun-tint)'
  const fgColor = accent === 'moss' ? 'var(--moss)' : accent === 'clay' ? 'var(--clay)' : '#7a5e1c'
  return (
    <div className={cn('card-static !p-4 animate-fade-up', stagger)}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: ringColor, color: fgColor }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--mid-gray)]">{label}</p>
          <p className="text-[22px] font-bold text-[var(--narra)] leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{value}</p>
          {subtext && <p className="text-[11px] text-[var(--mid-gray)] mt-0.5">{subtext}</p>}
        </div>
      </div>
    </div>
  )
}

function DayView({ day, items, onPatientClick }: {
  day: string; items: ScheduleItem[]; onPatientClick: (p: PatientInfo) => void
}) {
  if (items.length === 0) {
    return (
      <div className="card-static text-center py-14 animate-fade-up">
        <CalendarIcon size={28} className="text-[var(--paper-3)] mx-auto mb-2" />
        <p className="text-[13px] text-[var(--mid-gray)] font-medium">No sessions scheduled for this day.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2 animate-fade-up">
      {items.map((s, i) => (
        <ScheduleRow key={s.id} item={s} delay={i} onPatientClick={onPatientClick} />
      ))}
    </div>
  )
}

function WeekView({ start, byDay, onPatientClick }: {
  start: Date; byDay: Map<string, ScheduleItem[]>; onPatientClick: (p: PatientInfo) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const todayISO = isoDay(new Date())
  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-2 animate-fade-up">
      {days.map((d) => {
        const iso = isoDay(d)
        const items = byDay.get(iso) ?? []
        const isToday = iso === todayISO
        return (
          <div
            key={iso}
            className={cn(
              'card-static !p-3 min-h-[160px] flex flex-col',
              isToday && 'ring-2 ring-[var(--moss)]/40'
            )}
          >
            <div className="flex items-baseline justify-between mb-2 pb-2 border-b border-[var(--paper-3)]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--mid-gray)]">
                {DOW_SHORT[d.getUTCDay()]}
              </p>
              <p className={cn('text-[16px] font-bold', isToday ? 'text-[var(--clay)]' : 'text-[var(--narra)]')} style={{ fontFamily: 'var(--font-display)' }}>
                {d.getUTCDate()}
              </p>
            </div>
            {items.length === 0 ? (
              <p className="text-[11px] text-[var(--paper-3)] mt-1">—</p>
            ) : (
              <div className="space-y-1.5 flex-1">
                {items.map((s) => (
                  <CompactScheduleChip key={s.id} item={s} onPatientClick={onPatientClick} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function MonthView({ anchor, byDay, onDayClick, onPatientClick, onShowMore }: {
  anchor: Date
  byDay: Map<string, ScheduleItem[]>
  onDayClick: (iso: string) => void
  onPatientClick: (p: PatientInfo) => void
  onShowMore: (iso: string) => void
}) {
  const start = startOfMonthGrid(anchor)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const todayISO = isoDay(new Date())
  return (
    <div className="card-static !p-3 animate-fade-up">
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW_SHORT.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--mid-gray)] py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const iso = isoDay(d)
          const items = byDay.get(iso) ?? []
          const isCurrentMonth = d.getUTCMonth() === anchor.getUTCMonth()
          const isToday = iso === todayISO
          return (
            <div
              key={iso}
              className={cn(
                'min-h-[110px] p-1.5 rounded-lg border flex flex-col',
                isCurrentMonth ? 'bg-white border-[var(--paper-3)]' : 'bg-[var(--paper-2)]/40 border-transparent',
                isToday && 'ring-2 ring-[var(--moss)]/50'
              )}
            >
              <button
                type="button"
                onClick={() => onDayClick(iso)}
                className="text-left mb-1 hover:opacity-80 transition-opacity"
                title="Open day view"
              >
                <span className={cn(
                  'text-[12px] font-semibold',
                  isToday ? 'text-[var(--clay)]' : isCurrentMonth ? 'text-[var(--narra)]' : 'text-[var(--paper-3)]'
                )}>
                  {d.getUTCDate()}
                </span>
              </button>
              {items.length > 0 && (
                <div className="space-y-0.5 flex-1 overflow-hidden">
                  {items.slice(0, 3).map((s) => (
                    <MonthChip key={s.id} item={s} onPatientClick={onPatientClick} />
                  ))}
                  {items.length > 3 && (
                    <button
                      type="button"
                      onClick={() => onShowMore(iso)}
                      className="text-[9.5px] text-[var(--moss)] font-semibold hover:underline w-full text-left"
                      title="Show all sessions for this day"
                    >
                      +{items.length - 3} more…
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScheduleRow({ item, delay, onPatientClick }: {
  item: ScheduleItem; delay: number; onPatientClick: (p: PatientInfo) => void
}) {
  const hasPatient = !!item.patient
  const patientLabel = hasPatient ? `${item.patient!.lastName}, ${item.patient!.firstName}` : '— No patient assigned —'
  return (
    <div
      className={cn('card-static !p-3 animate-fade-up flex items-start gap-3', `stagger-${Math.min(delay + 1, 10)}`)}
    >
      <div className="w-12 shrink-0 text-center">
        <p className="text-[12px] font-bold text-[var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
          {fmtTime12h(item.startTime).replace(/ (AM|PM)/, '')}
        </p>
        <p className="text-[10px] text-[var(--mid-gray)] uppercase">{fmtTime12h(item.startTime).slice(-2)}</p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          {hasPatient ? (
            <button
              type="button"
              onClick={() => onPatientClick(item.patient!)}
              className="font-semibold text-[14px] text-[var(--narra)] hover:text-[var(--clay)] hover:underline transition-colors"
              title="View patient profile"
            >
              {patientLabel}
            </button>
          ) : (
            <span className="font-semibold text-[14px] text-[var(--mid-gray)] italic">{patientLabel}</span>
          )}
          <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', statusClass(item.status))}>
            {item.status}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[var(--mid-gray)]">
          <span className="flex items-center gap-1"><Clock size={11} /> {fmtTime12h(item.startTime)} – {fmtTime12h(item.endTime)}</span>
          <span>·</span>
          <span>{item.sessionType}</span>
          <span>·</span>
          <span className="opacity-70">{item.staff.department} · {item.staff.branch}</span>
        </div>
      </div>
      {item.meetLink && (
        <a
          href={item.meetLink}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-[var(--moss)] text-[var(--paper)] hover:bg-[var(--narra)] transition-colors"
          title="Join virtual session"
        >
          <Video size={12} /> Join <ExternalLink size={10} />
        </a>
      )}
    </div>
  )
}

function CompactScheduleChip({ item, onPatientClick }: {
  item: ScheduleItem; onPatientClick: (p: PatientInfo) => void
}) {
  const patient = item.patient ? `${item.patient.firstName} ${item.patient.lastName[0]}.` : 'No patient'
  const Wrapper: 'button' | 'div' = item.patient ? 'button' : 'div'
  return (
    <Wrapper
      type={item.patient ? 'button' : undefined}
      onClick={item.patient ? () => onPatientClick(item.patient!) : undefined}
      className={cn(
        'w-full text-left text-[10.5px] leading-tight px-1.5 py-1 rounded border block',
        statusClass(item.status),
        item.patient && 'hover:opacity-90 cursor-pointer'
      )}
      title={item.patient ? 'View patient profile' : undefined}
    >
      <p className="font-semibold truncate">{fmtTime12h(item.startTime)}</p>
      <p className="truncate opacity-90">{patient}</p>
    </Wrapper>
  )
}

function MonthChip({ item, onPatientClick }: {
  item: ScheduleItem; onPatientClick: (p: PatientInfo) => void
}) {
  const patient = item.patient ? `${item.patient.firstName} ${item.patient.lastName[0]}.` : 'No patient'
  const time = fmtTime12h(item.startTime).replace(' ', '').toLowerCase() // e.g. 4:00pm
  const Wrapper: 'button' | 'div' = item.patient ? 'button' : 'div'
  return (
    <Wrapper
      type={item.patient ? 'button' : undefined}
      onClick={item.patient ? (e) => { e.stopPropagation(); onPatientClick(item.patient!) } : undefined}
      className={cn(
        'w-full text-left text-[9.5px] leading-snug px-1 py-0.5 rounded border block truncate',
        statusClass(item.status),
        item.patient && 'hover:opacity-90 cursor-pointer'
      )}
      title={item.patient ? 'View patient profile' : undefined}
    >
      <span className="font-semibold">{time}</span>
      <span className="opacity-90"> · {patient}</span>
    </Wrapper>
  )
}

// ── Patient profile modal ─────────────────────────────────────────
function calcAge(dobIso: string | null): string {
  if (!dobIso) return '—'
  const dob = new Date(dobIso + 'T00:00:00Z')
  if (Number.isNaN(dob.getTime())) return '—'
  const now = new Date()
  let age = now.getUTCFullYear() - dob.getUTCFullYear()
  const m = now.getUTCMonth() - dob.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--
  return `${age}`
}
function fmtDob(dobIso: string | null): string {
  if (!dobIso) return '—'
  const d = new Date(dobIso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return dobIso
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

function PatientProfileModal({ patient, onClose }: { patient: PatientInfo; onClose: () => void }) {
  const fullName = `${patient.firstName} ${patient.lastName}`
  const initials = `${patient.firstName[0] ?? ''}${patient.lastName[0] ?? ''}`.toUpperCase()
  const fields: { icon: React.ReactNode; label: string; value: string }[] = [
    { icon: <UserIcon size={14} />, label: 'Full Name', value: fullName },
    { icon: <Cake size={14} />, label: 'Date of Birth', value: fmtDob(patient.dob) },
    { icon: <Cake size={14} />, label: 'Age', value: calcAge(patient.dob) },
    { icon: <UserIcon size={14} />, label: 'Sex', value: patient.sex || '—' },
    { icon: <Stethoscope size={14} />, label: 'Patient Type', value: patient.patientType || '—' },
    { icon: <Stethoscope size={14} />, label: 'Diagnosis', value: patient.diagnosis || '—' },
    { icon: <MapPin size={14} />, label: 'City', value: patient.city || '—' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-gate"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hero-gradient px-5 py-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white font-bold text-[14px]">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              {fullName}
            </h2>
            <p className="text-white/70 text-[11px]">Patient Profile</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
            title="Close"
          >
            <XIcon size={18} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {fields.map((f) => (
            <div key={f.label} className="flex items-start gap-3 pb-2.5 border-b border-[var(--paper-3)] last:border-0 last:pb-0">
              <div className="w-7 h-7 rounded-md bg-[var(--paper-2)] text-[var(--moss)] flex items-center justify-center shrink-0">
                {f.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--mid-gray)]">{f.label}</p>
                <p className="text-[14px] font-medium text-[var(--narra)] break-words">{f.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LegendDot({ status, label }: { status: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('inline-block w-3 h-3 rounded-sm', statusClass(status))} />
      <span>{label}</span>
    </span>
  )
}

// Popup listing all sessions for a single day in the Month view.
// Stays inside the Month view so the user doesn't lose their place.
function DayMorePopup({ day, items, onClose, onPatientClick }: {
  day: string
  items: ScheduleItem[]
  onClose: () => void
  onPatientClick: (p: PatientInfo) => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-gate"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hero-gradient px-5 py-4 flex items-center gap-3">
          <CalendarIcon size={18} className="text-white shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              {fmtDate(day)}
            </h2>
            <p className="text-white/70 text-[11px]">{items.length} session{items.length === 1 ? '' : 's'}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
            title="Close"
          >
            <XIcon size={18} />
          </button>
        </div>
        <div className="p-3 max-h-[60vh] overflow-y-auto space-y-1.5">
          {items.length === 0 ? (
            <p className="text-[12px] text-[var(--mid-gray)] italic text-center py-6">No sessions.</p>
          ) : (
            items.map((s) => (
              <DayMoreRow key={s.id} item={s} onPatientClick={onPatientClick} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function DayMoreRow({ item, onPatientClick }: { item: ScheduleItem; onPatientClick: (p: PatientInfo) => void }) {
  const hasPatient = !!item.patient
  const patientLabel = hasPatient ? `${item.patient!.lastName}, ${item.patient!.firstName}` : 'No patient assigned'
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-[var(--paper-3)] bg-white">
      <div className="w-14 shrink-0 text-center">
        <p className="text-[11px] font-bold text-[var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
          {fmtTime12h(item.startTime)}
        </p>
      </div>
      <div className="flex-1 min-w-0">
        {hasPatient ? (
          <button
            type="button"
            onClick={() => onPatientClick(item.patient!)}
            className="font-semibold text-[13px] text-[var(--narra)] hover:text-[var(--clay)] hover:underline transition-colors text-left"
            title="View patient profile"
          >
            {patientLabel}
          </button>
        ) : (
          <span className="text-[13px] text-[var(--mid-gray)] italic">{patientLabel}</span>
        )}
        <p className="text-[10.5px] text-[var(--mid-gray)] truncate">
          {item.sessionType} · {item.staff.department} · {item.staff.branch}
        </p>
      </div>
      <span className={cn('text-[9.5px] font-semibold px-2 py-0.5 rounded-full shrink-0', statusClass(item.status))}>
        {item.status}
      </span>
    </div>
  )
}
