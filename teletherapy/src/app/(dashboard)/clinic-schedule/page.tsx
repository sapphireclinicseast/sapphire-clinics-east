'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Users as UsersIcon,
  CheckCircle2,
  Activity,
  Video,
  ExternalLink,
  Cake,
  MapPin,
  Stethoscope,
  User as UserIcon,
  GraduationCap,
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { branchLabel } from '@/lib/branch-label'
import { useBranchSwitcher } from '@/components/BranchSwitcher'
import SessionTrends from '@/components/SessionTrends'
import {
  Avatar, Dialog, EmptyState, Icon, KpiCard, PageHeader, PillTabs, Skeleton,
  BTN_SECONDARY, CARD_STYLE, FOCUS, PAGE, SECONDARY_STYLE, SUBTLE_BG,
} from '@/components/hub/ui'

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
  intern?: { id: string; firstName: string; lastName: string } | null
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
/* Today in Manila as a UTC-midnight Date. Using the browser's UTC date put
   "today" on YESTERDAY between midnight and 8 AM Manila time. */
function manilaToday(): Date {
  const ymd = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
  return new Date(ymd + 'T00:00:00Z')
}
/* Names are stored ALL CAPS; title-case for display. \p{L} + u keeps ñ. */
function niceName(name: string | null | undefined): string {
  const n = (name || '').trim()
  if (!n || n !== n.toUpperCase()) return n
  return n.toLowerCase().replace(/(^|[\s\-'.(])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
}
const STATUS_ORDER = ['CONFIRMED', 'PENDING', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'] as const
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
  const [anchor, setAnchor] = useState<Date>(() => manilaToday())
  const [schedules, setSchedules] = useState<ScheduleItem[]>([])
  const [summary, setSummary] = useState<Summary>({ confirmedSessions: 0, uniquePatients: 0, avgPatientsPerDay: 0, activeDays: 0 })
  const [loading, setLoading] = useState(true)
  const [profilePatient, setProfilePatient] = useState<PatientInfo | null>(null)
  const [moreDay, setMoreDay] = useState<string | null>(null)
  const { isMultiBranch, sharedStaffId, activeStaffId, activeBranch } = useBranchSwitcher()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [adminTab, setAdminTab] = useState<'calendar' | 'trends'>('calendar')

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
        // Interbranch clinicians: pass the active staffId (legacy per-branch
        // records) and, for merged consultants who share one staffId across
        // branches, the active branch code so the API can scope by the
        // patient's branch. Otherwise the API unions all their branches.
        const staffParam = isMultiBranch && activeStaffId ? `&staffId=${activeStaffId}` : ''
        const branchParam = sharedStaffId && activeBranch ? `&patientBranch=${activeBranch.branch}` : ''
        const url = `/api/clinic-schedule?startDate=${isoDay(range.start)}&endDate=${isoDay(range.end)}${staffParam}${branchParam}`
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
  }, [range.start.getTime(), range.end.getTime(), activeStaffId, isMultiBranch, sharedStaffId, activeBranch?.branch])

  function navigate(direction: -1 | 1) {
    if (view === 'day') setAnchor(addDays(anchor, direction))
    else if (view === 'week') setAnchor(addDays(anchor, 7 * direction))
    else {
      const next = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + direction, 1))
      setAnchor(next)
    }
  }
  function goToday() {
    setAnchor(manilaToday())
  }

  // Bucket schedules by ISO day for fast lookup.
  const byDay = useMemo(() => {
    const m = new Map<string, ScheduleItem[]>()
    for (const s of schedules) {
      if (!m.has(s.date)) m.set(s.date, [])
      m.get(s.date)!.push(s)
    }
    // Earliest first within each day.
    m.forEach((list) => list.sort((a, b) => a.startTime.localeCompare(b.startTime)))
    return m
  }, [schedules])

  // Sessions inside the visible range (month view fetches the full 6-week grid).
  const inView = useMemo(() => {
    if (view !== 'month') return schedules
    const m = anchor.getUTCMonth(), y = anchor.getUTCFullYear()
    return schedules.filter((s) => { const d = new Date(s.date + 'T00:00:00Z'); return d.getUTCMonth() === m && d.getUTCFullYear() === y })
  }, [schedules, view, anchor])
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {}
    inView.forEach((s) => { c[s.status] = (c[s.status] ?? 0) + 1 })
    return c
  }, [inView])
  const rangeWord = view === 'day' ? 'this day' : view === 'week' ? 'this week' : 'this month'

  const headerLabel = view === 'day'
    ? fmtDate(isoDay(anchor))
    : view === 'week'
      ? fmtRange(range.start, range.end)
      : `${MONTHS[anchor.getUTCMonth()]} ${anchor.getUTCFullYear()}`

  return (
    <div className={`${PAGE} !max-w-[1240px]`}>
      <PageHeader
        eyebrow="Clinical"
        title="Clinic Schedule"
        description="Your sessions across all branches you work in."
        actions={isAdmin ? (
          <PillTabs
            label="Clinic Schedule view"
            value={adminTab}
            onChange={(id) => setAdminTab(id as 'calendar' | 'trends')}
            tabs={[{ id: 'calendar', label: 'Calendar' }, { id: 'trends', label: 'Session Trends' }]}
          />
        ) : undefined}
      />

      {isAdmin && adminTab === 'trends' ? (
        <SessionTrends />
      ) : (
      <>

      {/* Summary cards — lifetime totals (since the very start) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          icon={<CheckCircle2 size={16} />}
          label="Confirmed Sessions"
          value={summary.confirmedSessions}
          accent="var(--moss)"
          sub="Lifetime total"
        />
        <KpiCard
          icon={<UsersIcon size={16} />}
          label="Unique Patients"
          value={summary.uniquePatients}
          accent="var(--clay)"
          sub="Lifetime total"
        />
        <KpiCard
          icon={<Activity size={16} />}
          label="Avg Patients / Day"
          value={summary.avgPatientsPerDay}
          accent="#8C6A2D"
          sub={`Lifetime · ${summary.activeDays} active day${summary.activeDays === 1 ? '' : 's'}`}
        />
      </div>

      {/* Toolbar + legend */}
      <section className="rounded-xl" style={CARD_STYLE}>
        <div className="px-3 sm:px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <button type="button" onClick={() => navigate(-1)} className={`${BTN_SECONDARY} !px-2`} style={SECONDARY_STYLE} aria-label={`Previous ${view}`} title="Previous">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={goToday} className={BTN_SECONDARY} style={{ ...SECONDARY_STYLE, color: 'var(--deep-teal)' }}>
              Today
            </button>
            <button type="button" onClick={() => navigate(1)} className={`${BTN_SECONDARY} !px-2`} style={SECONDARY_STYLE} aria-label={`Next ${view}`} title="Next">
              <ChevronRight size={16} />
            </button>
            <span className="basis-full sm:basis-auto sm:ml-1.5 text-[14px] sm:text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }} aria-live="polite">
              {headerLabel}
            </span>
          </div>
          <PillTabs
            label="Calendar range"
            size="sm"
            value={view}
            onChange={(id) => setView(id as ViewMode)}
            tabs={[{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }]}
          />
        </div>
        {/* Status legend — explains the coloured chips */}
        <div className="px-3 sm:px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] rounded-b-xl"
          style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG, color: 'var(--mid-gray)' }}>
          <span className="text-[10.5px] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }} aria-live="polite">
            {loading ? 'Loading…' : `${inView.length} session${inView.length === 1 ? '' : 's'} ${rangeWord}`}
          </span>
          {STATUS_ORDER.map((st) => (
            <LegendDot key={st} status={st} label={`${st.charAt(0) + st.slice(1).toLowerCase()}${loading ? '' : ` ${statusCounts[st] ?? 0}`}`} />
          ))}
        </div>
      </section>

      {loading ? (
        <CalendarSkeleton view={view} />
      ) : view === 'day' ? (
        <DayView day={isoDay(anchor)} items={byDay.get(isoDay(anchor)) ?? []} onPatientClick={setProfilePatient} />
      ) : view === 'week' ? (
        <>
          {inView.length === 0 && (
            <div className="rounded-xl" style={CARD_STYLE}>
              <EmptyState icon="calendar" title="No sessions this week." hint="Use the arrows to look at another week, or switch to Month." />
            </div>
          )}
          <WeekView start={range.start} byDay={byDay} onPatientClick={setProfilePatient} />
        </>
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

      </>
      )}
    </div>
  )
}

function CalendarSkeleton({ view }: { view: ViewMode }) {
  if (view === 'day') {
    return (
      <div className="rounded-xl p-4 space-y-3" style={CARD_STYLE} role="status" aria-label="Loading schedule">
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    )
  }
  const cells = view === 'week' ? 7 : 35
  return (
    <div className={`grid gap-2 ${view === 'week' ? 'grid-cols-1 md:grid-cols-7' : 'grid-cols-7'}`} role="status" aria-label="Loading schedule">
      {Array.from({ length: cells }).map((_, i) => (
        <Skeleton key={i} className={view === 'week' ? 'h-40 rounded-xl' : 'h-24 rounded-lg'} />
      ))}
    </div>
  )
}

function DayView({ day, items, onPatientClick }: {
  day: string; items: ScheduleItem[]; onPatientClick: (p: PatientInfo) => void
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl" style={CARD_STYLE}>
        <EmptyState icon="calendar" title="No sessions scheduled for this day." hint={fmtDate(day)} />
      </div>
    )
  }
  return (
    <ul className="rounded-xl" style={CARD_STYLE}>
      {items.map((s, i) => (
        <ScheduleRow key={s.id} item={s} first={i === 0} onPatientClick={onPatientClick} />
      ))}
    </ul>
  )
}

function WeekView({ start, byDay, onPatientClick }: {
  start: Date; byDay: Map<string, ScheduleItem[]>; onPatientClick: (p: PatientInfo) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const todayISO = isoDay(manilaToday())
  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
      {days.map((d) => {
        const iso = isoDay(d)
        const items = byDay.get(iso) ?? []
        const isToday = iso === todayISO
        return (
          <div
            key={iso}
            className="rounded-xl p-2.5 md:min-h-[160px] flex flex-col min-w-0"
            style={{ ...CARD_STYLE, ...(isToday ? { borderColor: 'var(--moss)', boxShadow: '0 0 0 2px rgba(74,128,115,0.22)' } : null) }}
          >
            <div className="flex items-baseline justify-between mb-2 pb-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
              <p className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: isToday ? 'var(--deep-teal)' : 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>
                {DOW_SHORT[d.getUTCDay()]}{isToday && <span className="sr-only"> (today)</span>}
              </p>
              <p className="text-[16px] font-bold tabular-nums" style={{ fontFamily: 'var(--font-display)', color: isToday ? 'var(--deep-teal)' : 'var(--charcoal)' }}>
                {d.getUTCDate()}
              </p>
            </div>
            {items.length === 0 ? (
              <p className="text-[11px] mt-1" style={{ color: 'var(--light-gray)' }} aria-label="No sessions">—</p>
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
  const todayISO = isoDay(manilaToday())
  return (
    <div className="rounded-xl p-2 sm:p-3 overflow-x-auto" style={CARD_STYLE}>
      <div className="min-w-[560px]">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DOW_SHORT.map((d) => (
            <div key={d} className="text-center text-[10.5px] font-semibold uppercase tracking-wider py-1.5" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>
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
                className="min-h-[104px] p-1.5 rounded-lg flex flex-col min-w-0"
                style={{
                  background: isCurrentMonth ? '#fff' : SUBTLE_BG,
                  border: `1px solid ${isToday ? 'var(--moss)' : isCurrentMonth ? 'var(--light-gray)' : 'transparent'}`,
                  ...(isToday ? { boxShadow: '0 0 0 2px rgba(74,128,115,0.22)' } : null),
                }}
              >
                <button
                  type="button"
                  onClick={() => onDayClick(iso)}
                  className={`self-start mb-1 w-6 h-6 rounded-md text-[12px] font-semibold tabular-nums transition-colors hover:bg-[var(--off-white)] ${FOCUS}`}
                  style={isToday
                    ? { background: 'var(--deep-teal)', color: '#fff' }
                    : { color: isCurrentMonth ? 'var(--charcoal)' : 'var(--mid-gray)' }}
                  title="Open day view"
                  aria-label={`Open ${fmtDate(iso)}`}
                >
                  {d.getUTCDate()}
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
                        className={`text-[10px] font-semibold hover:underline w-full text-left rounded ${FOCUS}`}
                        style={{ color: 'var(--teal)' }}
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
    </div>
  )
}

function StatusBadge({ status, small = false }: { status: string; small?: boolean }) {
  return (
    <span className={cn(`${small ? 'text-[9.5px] px-1.5' : 'text-[10.5px] px-2'} font-semibold py-0.5 rounded-full whitespace-nowrap`, statusClass(status))}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

function ScheduleRow({ item, first, onPatientClick }: {
  item: ScheduleItem; first: boolean; onPatientClick: (p: PatientInfo) => void
}) {
  const hasPatient = !!item.patient
  const patientLabel = hasPatient ? `${niceName(item.patient!.lastName)}, ${niceName(item.patient!.firstName)}` : '— No patient assigned —'
  return (
    <li className="px-4 sm:px-5 py-3.5 flex items-start gap-3.5" style={{ borderTop: first ? undefined : '1px solid var(--light-gray)' }}>
      <div className="w-14 shrink-0 rounded-lg py-1.5 text-center" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
        <p className="text-[13px] font-bold leading-tight tabular-nums" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          {fmtTime12h(item.startTime).replace(/ (AM|PM)/, '')}
        </p>
        <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--mid-gray)' }}>{fmtTime12h(item.startTime).slice(-2)}</p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {hasPatient ? (
            <button
              type="button"
              onClick={() => onPatientClick(item.patient!)}
              className={`font-semibold text-[14.5px] text-left rounded hover:underline ${FOCUS}`}
              style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}
              title="View patient profile"
            >
              {patientLabel}
            </button>
          ) : (
            <span className="font-semibold text-[14px] italic" style={{ color: 'var(--mid-gray)' }}>{patientLabel}</span>
          )}
          <StatusBadge status={item.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px]" style={{ color: 'var(--mid-gray)' }}>
          <span className="inline-flex items-center gap-1 tabular-nums"><Icon name="clock" size={12} /> {fmtTime12h(item.startTime)} – {fmtTime12h(item.endTime)}</span>
          <span aria-hidden>·</span>
          <span>{item.sessionType}</span>
          <span aria-hidden>·</span>
          <span>{item.staff.department} · {branchLabel(item.staff.branch)}</span>
          {item.intern && (
            <span className="inline-flex items-center gap-1 font-semibold" style={{ color: '#8A5A3C' }} title="Assigned intern">
              <GraduationCap size={12} /> {niceName(item.intern.firstName)} {niceName(item.intern.lastName)}
            </span>
          )}
        </div>
      </div>
      {item.meetLink && (
        <a
          href={item.meetLink}
          target="_blank"
          rel="noopener noreferrer"
          className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold text-white transition-opacity hover:opacity-90 ${FOCUS}`}
          style={{ background: 'var(--deep-teal)' }}
          title="Join virtual session"
        >
          <Video size={13} /> Join <ExternalLink size={11} />
        </a>
      )}
    </li>
  )
}

function CompactScheduleChip({ item, onPatientClick }: {
  item: ScheduleItem; onPatientClick: (p: PatientInfo) => void
}) {
  const patient = item.patient ? `${niceName(item.patient.firstName)} ${item.patient.lastName[0] ?? ''}.` : 'No patient'
  const Wrapper: 'button' | 'div' = item.patient ? 'button' : 'div'
  return (
    <Wrapper
      type={item.patient ? 'button' : undefined}
      onClick={item.patient ? () => onPatientClick(item.patient!) : undefined}
      className={cn(
        'w-full text-left text-[10.5px] leading-tight px-2 py-1.5 rounded-md border block',
        statusClass(item.status),
        item.patient && `hover:opacity-90 cursor-pointer ${FOCUS}`
      )}
      title={item.patient ? `${item.status.charAt(0) + item.status.slice(1).toLowerCase()} · View patient profile` : item.status}
    >
      <p className="font-semibold truncate tabular-nums">{fmtTime12h(item.startTime)}{item.endTime ? `–${fmtTime12h(item.endTime)}` : ''}</p>
      <p className="truncate opacity-90">{patient}</p>
    </Wrapper>
  )
}

function MonthChip({ item, onPatientClick }: {
  item: ScheduleItem; onPatientClick: (p: PatientInfo) => void
}) {
  const patient = item.patient ? `${niceName(item.patient.firstName)} ${item.patient.lastName[0] ?? ''}.` : 'No patient'
  const time = fmtTime12h(item.startTime).replace(' ', '').toLowerCase() // e.g. 4:00pm
  const Wrapper: 'button' | 'div' = item.patient ? 'button' : 'div'
  return (
    <Wrapper
      type={item.patient ? 'button' : undefined}
      onClick={item.patient ? (e) => { e.stopPropagation(); onPatientClick(item.patient!) } : undefined}
      className={cn(
        'w-full text-left text-[9.5px] leading-snug px-1 py-0.5 rounded border block truncate',
        statusClass(item.status),
        item.patient && `hover:opacity-90 cursor-pointer ${FOCUS}`
      )}
      title={item.patient ? `${item.status.charAt(0) + item.status.slice(1).toLowerCase()} · View patient profile` : item.status}
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
  const fullName = `${niceName(patient.firstName)} ${niceName(patient.lastName)}`
  const initials = `${patient.firstName[0] ?? ''}${patient.lastName[0] ?? ''}`.toUpperCase()
  const fields: { icon: React.ReactNode; label: string; value: string }[] = [
    { icon: <Cake size={14} />, label: 'Date of Birth', value: fmtDob(patient.dob) },
    { icon: <Cake size={14} />, label: 'Age', value: calcAge(patient.dob) },
    { icon: <UserIcon size={14} />, label: 'Sex', value: patient.sex || '—' },
    { icon: <Stethoscope size={14} />, label: 'Patient Type', value: patient.patientType || '—' },
    { icon: <Stethoscope size={14} />, label: 'Diagnosis', value: patient.diagnosis || '—' },
    { icon: <MapPin size={14} />, label: 'City', value: patient.city || '—' },
  ]

  return (
    <Dialog
      labelId="cs-patient-profile"
      eyebrow="Patient profile"
      title={<span className="inline-flex items-center gap-2.5"><Avatar text={initials} size={32} /> {fullName}</span>}
      onClose={onClose}
    >
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3.5">
        {fields.map((f) => (
          <div key={f.label} className={`flex items-start gap-2.5 min-w-0 ${f.label === 'Diagnosis' ? 'sm:col-span-2' : ''}`}>
            <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
              {f.icon}
            </span>
            <div className="min-w-0">
              <dt className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>{f.label}</dt>
              <dd className="text-[14px] font-medium break-words" style={{ color: 'var(--charcoal)' }}>{f.value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </Dialog>
  )
}

function LegendDot({ status, label }: { status: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('inline-block w-3 h-3 rounded-sm', statusClass(status))} aria-hidden />
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
    <Dialog
      labelId="cs-day-more"
      eyebrow={`${items.length} session${items.length === 1 ? '' : 's'}`}
      title={fmtDate(day)}
      onClose={onClose}
    >
      {items.length === 0 ? (
        <EmptyState icon="calendar" title="No sessions." />
      ) : (
        <ul className="rounded-xl" style={CARD_STYLE}>
          {items.map((s, i) => (
            <DayMoreRow key={s.id} item={s} first={i === 0} onPatientClick={onPatientClick} />
          ))}
        </ul>
      )}
    </Dialog>
  )
}

function DayMoreRow({ item, first, onPatientClick }: { item: ScheduleItem; first: boolean; onPatientClick: (p: PatientInfo) => void }) {
  const hasPatient = !!item.patient
  const patientLabel = hasPatient ? `${niceName(item.patient!.lastName)}, ${niceName(item.patient!.firstName)}` : 'No patient assigned'
  return (
    <li className="flex items-center gap-2.5 px-3 py-2.5" style={{ borderTop: first ? undefined : '1px solid var(--light-gray)' }}>
      <span className="w-16 shrink-0 text-[12px] font-bold tabular-nums" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
        {fmtTime12h(item.startTime)}
      </span>
      <div className="flex-1 min-w-0">
        {hasPatient ? (
          <button
            type="button"
            onClick={() => onPatientClick(item.patient!)}
            className={`font-semibold text-[13px] text-left rounded hover:underline ${FOCUS}`}
            style={{ color: 'var(--charcoal)' }}
            title="View patient profile"
          >
            {patientLabel}
          </button>
        ) : (
          <span className="text-[13px] italic" style={{ color: 'var(--mid-gray)' }}>{patientLabel}</span>
        )}
        <p className="text-[11px] truncate" style={{ color: 'var(--mid-gray)' }}>
          {item.sessionType} · {item.staff.department} · {branchLabel(item.staff.branch)}
        </p>
      </div>
      <StatusBadge status={item.status} small />
    </li>
  )
}
