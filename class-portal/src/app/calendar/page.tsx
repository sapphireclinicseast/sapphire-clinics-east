'use client'

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth } from '@/lib/session'
import {
  listEvents, createEvent, updateEvent, deleteEvent,
  getCalendarPdfMeta, fetchCalendarPdfBlob, uploadCalendarPdf, deleteCalendarPdf,
  eventTypeLabel, branchShortLabel,
  type CalendarEvent, type CalendarEventType, type CalendarPdfMeta, type CalendarBranch,
} from '@/lib/calendar'
import { Portal } from '@/components/Modal'
import {
  PAGE, PageHeader, PillTabs, Dialog, Banner, Tag, Icon, Skeleton, EmptyState,
  CARD_STYLE, SUBTLE_BG, FOCUS, DANGER,
  CONTROL, CONTROL_STYLE, TEXTAREA, LABEL, LABEL_STYLE, FILE_FOCUS,
  BTN_PRIMARY, BTN_SECONDARY, BTN_SM, BTN_DANGER_GHOST, PRIMARY_STYLE, SECONDARY_STYLE,
} from '@/components/hub/ui'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DOW_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function startOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1))
}
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

type Role = 'ADMIN' | 'BRANCH_ADMIN' | 'TEACHER' | 'FRONTDESK' | 'STUDENT'

export default function CalendarPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [role, setRole] = useState<Role | null>(null)
  const today = useMemo(() => new Date(), [])
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [composer, setComposer] = useState<{ open: boolean; editing: CalendarEvent | null }>({ open: false, editing: null })
  const [pdfMeta, setPdfMeta] = useState<CalendarPdfMeta | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // The branch this view is showing. For ADMIN/TEACHER this is driven
  // by the toggle (defaults to EAST). For BRANCH_ADMIN/FRONTDESK/STUDENT
  // it's resolved from the server (auth.branch on the token, or
  // user.branch on the row for students) and locked.
  const [activeBranch, setActiveBranch] = useState<CalendarBranch>('EAST')

  useEffect(() => {
    const auth = getAuth()
    if (!auth) { router.replace('/sign-in'); return }
    setRole(auth.role as Role)
    setReady(true)
  }, [router])

  const canEdit = role === 'ADMIN' || role === 'TEACHER'
  // Only ADMIN/TEACHER can flip between branches — others are scoped on
  // the server regardless of what's in the dropdown, but we still lock
  // the UI so the active branch always reflects what they actually see.
  const canSwitchBranch = role === 'ADMIN' || role === 'TEACHER'

  useEffect(() => {
    if (!ready) return
    setLoadingEvents(true)
    const from = ymd(startOfMonth(year, month))
    const lastDay = daysInMonth(year, month)
    const to = ymd(new Date(Date.UTC(year, month, lastDay)))
    listEvents(from, to, canSwitchBranch ? activeBranch : undefined)
      .then(res => {
        setEvents(res.events)
        // For scoped roles, trust the server's resolved branch.
        if (!canSwitchBranch && res.branch) setActiveBranch(res.branch)
      })
      .catch(e => setErr((e as Error).message))
      .finally(() => setLoadingEvents(false))
  }, [ready, year, month, activeBranch, canSwitchBranch])

  useEffect(() => {
    if (!ready) return
    getCalendarPdfMeta(canSwitchBranch ? activeBranch : undefined)
      .then(setPdfMeta)
      .catch(() => { /* ignore */ })
  }, [ready, activeBranch, canSwitchBranch])

  function eventsOnDate(dateStr: string): CalendarEvent[] {
    return events.filter(e => {
      if (e.endDate) return dateStr >= e.date && dateStr <= e.endDate
      return dateStr === e.date
    })
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  async function handlePdfFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setErr(null); setPdfBusy(true)
    try {
      const meta = await uploadCalendarPdf(f, activeBranch)
      setPdfMeta(meta)
    } catch (err) {
      setErr((err as Error).message)
    } finally {
      setPdfBusy(false)
      e.target.value = ''
    }
  }

  async function handlePdfView() {
    setErr(null)
    try {
      const blob = await fetchCalendarPdfBlob(canSwitchBranch ? activeBranch : undefined)
      if (!blob) { setErr('No calendar PDF uploaded yet.'); return }
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function handlePdfRemove() {
    if (!confirm(`Remove the ${branchShortLabel(activeBranch)} academic calendar PDF?`)) return
    setErr(null)
    try {
      await deleteCalendarPdf(activeBranch)
      setPdfMeta(null)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  function refreshEvents() {
    const from = ymd(startOfMonth(year, month))
    const lastDay = daysInMonth(year, month)
    const to = ymd(new Date(Date.UTC(year, month, lastDay)))
    listEvents(from, to, canSwitchBranch ? activeBranch : undefined)
      .then(res => setEvents(res.events))
      .catch(e => setErr((e as Error).message))
  }

  if (!ready) return null

  const periodLabel = `${MONTH_NAMES[month]} ${year}`
  const branchName = branchShortLabel(activeBranch)

  return (
    <div className={`${PAGE} animate-fade-up`}>
      <PageHeader
        eyebrow={`Aura Academy · Calendar · ${branchName}`}
        title="Academic calendar"
        description={canEdit ? 'Click a date to add an event, mark classes cancelled, or schedule activities.' : 'View the school year schedule, holidays, and any cancelled-class days.'}
        actions={canSwitchBranch && (
          <PillTabs
            label="Branch"
            tabs={(['EAST', 'GREENHILLS'] as const).map(b => ({ id: b, label: branchShortLabel(b) }))}
            value={activeBranch}
            onChange={id => setActiveBranch(id as CalendarBranch)}
          />
        )}
      />

      {err && <Banner tone="error">{err}</Banner>}

      {/* Academic calendar PDF — compact strip */}
      <section className="rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3" style={CARD_STYLE} aria-label={`${branchName} calendar PDF`}>
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-9 h-9 rounded-lg inline-flex items-center justify-center flex-shrink-0" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
            <Icon name="file" size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {branchName} calendar PDF
            </p>
            {pdfMeta ? (
              <p className="text-xs mt-0.5 break-words" style={{ color: 'var(--mid-gray)' }}>
                <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{pdfMeta.fileName}</span>
                {' '}· uploaded {new Date(pdfMeta.uploadedAt).toLocaleDateString()} by {pdfMeta.uploadedBy}
              </p>
            ) : (
              <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>Not uploaded yet.</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {pdfMeta && (
            <button type="button" className={BTN_SM} style={SECONDARY_STYLE} onClick={handlePdfView}>
              <Icon name="eye" size={13} /> View / download
            </button>
          )}
          {canEdit && (
            <>
              <label className={`${BTN_SM} ${FILE_FOCUS}`} style={pdfBusy ? { ...PRIMARY_STYLE, color: '#fff', opacity: 0.6 } : { ...PRIMARY_STYLE, color: '#fff' }}>
                <Icon name="upload" size={13} />
                {pdfBusy ? 'Uploading…' : pdfMeta ? 'Replace PDF' : 'Upload PDF'}
                <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={handlePdfFile} disabled={pdfBusy} />
              </label>
              {pdfMeta && (
                <button type="button" onClick={handlePdfRemove} className={BTN_DANGER_GHOST} style={{ color: DANGER }}>
                  <Icon name="trash" size={13} /> Remove
                </button>
              )}
            </>
          )}
        </div>
      </section>

      <section className="rounded-xl min-w-0" style={CARD_STYLE} aria-labelledby="cal-period-label">
        {/* Toolbar: period label + prev / today / next */}
        <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="calendar" size={16} style={{ color: 'var(--teal)' }} />
            <h2 id="cal-period-label" aria-live="polite" className="text-[16px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {periodLabel}
            </h2>
            {loadingEvents && <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }} role="status">Loading…</span>}
          </div>
          <div className="flex items-center gap-1.5" role="group" aria-label="Change month">
            <button type="button" className={`${BTN_SM} w-8 px-0`} style={SECONDARY_STYLE} onClick={prevMonth} aria-label="Previous month" title="Previous month">
              <Icon name="chevronRight" size={15} className="rotate-180" />
            </button>
            <button
              type="button"
              className={BTN_SM}
              style={SECONDARY_STYLE}
              onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }}
              title="Go to the current month"
            >Today</button>
            <button type="button" className={`${BTN_SM} w-8 px-0`} style={SECONDARY_STYLE} onClick={nextMonth} aria-label="Next month" title="Next month">
              <Icon name="chevronRight" size={15} />
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          <MonthGrid
            year={year}
            month={month}
            events={events}
            today={today}
            loading={loadingEvents}
            onSelect={setSelectedDate}
            selected={selectedDate}
          />
        </div>

        <div className="px-4 sm:px-5 py-3 rounded-b-xl" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
          <Legend />
        </div>
      </section>

      {selectedDate && (
        <DayEventsPanel
          dateStr={selectedDate}
          events={eventsOnDate(selectedDate)}
          canEdit={canEdit}
          onAdd={() => setComposer({ open: true, editing: null })}
          onEdit={(ev) => setComposer({ open: true, editing: ev })}
          onDelete={async (ev) => {
            if (!confirm(`Delete "${ev.title}"?`)) return
            try { await deleteEvent(ev.id); refreshEvents() }
            catch (e) { setErr((e as Error).message) }
          }}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {composer.open && (
        <EventComposer
          branch={activeBranch}
          defaultDate={selectedDate ?? ymd(today)}
          editing={composer.editing}
          onClose={() => setComposer({ open: false, editing: null })}
          onSaved={() => { setComposer({ open: false, editing: null }); refreshEvents() }}
        />
      )}
    </div>
  )
}

/* ─────────── Event types: Aura-toned colour + icon + label ─────────── */

// Colour is a secondary cue only — every chip also carries a type icon, and
// the type name is in the hover title and in screen-reader text.
const TYPE_STYLE: Record<CalendarEventType, { bg: string; fg: string; border: string }> = {
  CLASS_CANCELLED: { bg: '#FEF2F2', fg: '#991B1B', border: '#FECACA' },
  HOLIDAY:         { bg: '#FBF5E6', fg: '#6E5112', border: '#EAD9A8' },
  FIELD_TRIP:      { bg: '#EEF3F5', fg: '#36525D', border: '#C9D6DB' },
  IEP_REVIEW:      { bg: '#F7EDE7', fg: '#7A3F2A', border: '#E5C7B6' },
  EVENT:           { bg: '#EEF5E8', fg: '#2F5A28', border: '#CFE0BF' },
}

const TYPE_ICON: Record<CalendarEventType, ReactNode> = {
  // circle with a slash: classes are off
  CLASS_CANCELLED: <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>,
  // sun: holiday
  HOLIDAY: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  // map pin: field trip
  FIELD_TRIP: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>,
  // clipboard: IEP review
  IEP_REVIEW: <><rect x="5" y="4" width="14" height="18" rx="2" /><path d="M9 2h6v4H9zM9 12h6M9 16h4" /></>,
  // calendar dot: general event
  EVENT: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><circle cx="12" cy="16" r="1.5" /></>,
}

function TypeIcon({ type, size = 12, style }: { type: CalendarEventType; size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-shrink-0" style={style}>
      {TYPE_ICON[type]}
    </svg>
  )
}

/** Type badge: icon + label, never colour alone. */
function TypeBadge({ type }: { type: CalendarEventType }) {
  const c = TYPE_STYLE[type]
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider leading-none whitespace-nowrap"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}>
      <TypeIcon type={type} size={11} />
      {eventTypeLabel(type)}
    </span>
  )
}

/* ─────────── Month grid ─────────── */

function buildByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const byDate: Record<string, CalendarEvent[]> = {}
  for (const ev of events) {
    if (ev.endDate) {
      const start = new Date(ev.date + 'T00:00:00Z')
      const end = new Date(ev.endDate + 'T00:00:00Z')
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const k = ymd(d)
        ;(byDate[k] ??= []).push(ev)
      }
    } else {
      ;(byDate[ev.date] ??= []).push(ev)
    }
  }
  return byDate
}

function MonthGrid({
  year, month, events, today, loading, onSelect, selected,
}: {
  year: number
  month: number
  events: CalendarEvent[]
  today: Date
  loading: boolean
  onSelect: (d: string) => void
  selected: string | null
}) {
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const totalDays = daysInMonth(year, month)
  const todayStr = ymd(today)

  const byDate = buildByDate(events)

  const cells: Array<{ day: number | null; dateStr: string | null }> = []
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateStr: null })
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ day: d, dateStr: ymd(new Date(Date.UTC(year, month, d))) })
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, dateStr: null })

  // Phone agenda: the month's days that have events, in order. Weekday comes
  // from the cell's column (the grid starts on Sunday), so no extra date maths.
  const agenda = cells
    .map((c, i) => ({ ...c, dow: i % 7 }))
    .filter(c => c.dateStr && (byDate[c.dateStr]?.length ?? 0) > 0)

  return (
    <div>
      {/* ── Grid (tablet and up) ── */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-7 gap-px text-center text-[11px] uppercase tracking-wider font-semibold mb-1.5" style={{ fontFamily: 'var(--font-display)' }} aria-hidden>
          {DOW_SHORT.map((d, i) => (
            <div key={d} className="py-1" style={{ color: 'var(--mid-gray)', opacity: i === 0 || i === 6 ? 0.7 : 1 }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px rounded-lg overflow-hidden" style={{ border: '1px solid var(--light-gray)', background: 'var(--light-gray)' }}>
          {cells.map((c, i) => {
            if (!c.day || !c.dateStr) {
              // Outside this month: muted filler, not focusable.
              return <div key={i} aria-hidden className="min-h-[96px]" style={{ background: 'var(--paper)' }} />
            }
            const dow = i % 7
            const weekend = dow === 0 || dow === 6
            const isToday = c.dateStr === todayStr
            const isSelected = c.dateStr === selected
            const dayEvents = byDate[c.dateStr] ?? []
            const longDate = `${DOW_LONG[dow]}, ${MONTH_NAMES[month]} ${c.day}, ${year}`
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelect(c.dateStr!)}
                aria-current={isToday ? 'date' : undefined}
                title={`${longDate}${dayEvents.length ? ` · ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ''}`}
                className="text-left min-h-[96px] p-1.5 flex flex-col min-w-0 transition-colors hover:bg-[color:var(--paper)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--teal)]"
                style={{
                  background: weekend ? SUBTLE_BG : '#fff',
                  ...(isSelected ? { boxShadow: 'inset 0 0 0 2px var(--deep-teal)' } : {}),
                }}
              >
                <span className="sr-only">{longDate}{isToday ? ', today' : ''}{dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}: ` : ', no events'}</span>
                <span className="flex items-center gap-1.5 flex-wrap" aria-hidden>
                  {isToday ? (
                    <span className="inline-flex items-center justify-center min-w-6 h-6 px-1 rounded-full text-[12px] font-bold text-white" style={{ background: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>{c.day}</span>
                  ) : (
                    <span className="inline-flex items-center justify-center min-w-6 h-6 text-[12.5px] font-bold" style={{ fontFamily: 'var(--font-display)', color: weekend ? 'var(--mid-gray)' : 'var(--charcoal)' }}>{c.day}</span>
                  )}
                  {isToday && <Tag tone="brand">Today</Tag>}
                </span>
                <span className="mt-1 space-y-0.5 block min-w-0">
                  {loading && dayEvents.length === 0 ? (
                    (c.day % 4 === 1) && <Skeleton className="h-4 w-4/5" />
                  ) : (
                    <>
                      {dayEvents.slice(0, 3).map(ev => {
                        const t = TYPE_STYLE[ev.type]
                        return (
                          <span
                            key={ev.id + '-' + ev.date}
                            className="flex items-center gap-1 text-[10.5px] font-semibold leading-tight px-1.5 py-0.5 rounded min-w-0"
                            style={{ background: t.bg, color: t.fg, border: `1px solid ${t.border}` }}
                            title={`${eventTypeLabel(ev.type)}: ${ev.title}`}
                          >
                            <TypeIcon type={ev.type} size={11} />
                            <span className="sr-only">{eventTypeLabel(ev.type)}: </span>
                            <span className="truncate">{ev.title}</span>
                          </span>
                        )
                      })}
                      {dayEvents.length > 3 && (
                        <span className="block text-[10.5px] font-semibold pl-1 underline underline-offset-2" style={{ color: 'var(--deep-teal)' }}>
                          +{dayEvents.length - 3} more
                        </span>
                      )}
                    </>
                  )}
                </span>
              </button>
            )
          })}
        </div>
        {!loading && events.length === 0 && (
          <p className="text-xs text-center mt-3" style={{ color: 'var(--mid-gray)' }}>No events in {MONTH_NAMES[month]} {year}.</p>
        )}
      </div>

      {/* ── Agenda (phones) ── */}
      <div className="sm:hidden">
        {loading && agenda.length === 0 ? (
          <div className="space-y-3" role="status" aria-label="Loading events">
            {Array.from({ length: 3 }).map((_, n) => (
              <div key={n} className="flex gap-3" aria-hidden>
                <Skeleton className="w-11 h-12 rounded-lg" />
                <div className="flex-1 space-y-1.5 pt-1">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : agenda.length === 0 ? (
          <EmptyState icon="calendar" title={`No events in ${MONTH_NAMES[month]} ${year}.`} hint="Use the arrows above to look at another month." />
        ) : (
          <ol className="space-y-2">
            {agenda.map(c => {
              const dateStr = c.dateStr!
              const isToday = dateStr === todayStr
              const isSelected = dateStr === selected
              const dayEvents = byDate[dateStr] ?? []
              return (
                <li key={dateStr}>
                  <button
                    type="button"
                    onClick={() => onSelect(dateStr)}
                    aria-current={isToday ? 'date' : undefined}
                    className={`w-full text-left flex gap-3 p-2.5 rounded-xl transition-colors hover:bg-[color:var(--paper)] ${FOCUS}`}
                    style={{ border: `1px solid ${isSelected ? 'var(--deep-teal)' : 'var(--light-gray)'}`, background: c.dow === 0 || c.dow === 6 ? SUBTLE_BG : '#fff' }}
                  >
                    <span className="w-11 flex-shrink-0 flex flex-col items-center justify-center rounded-lg py-1.5"
                      style={isToday ? { background: 'var(--deep-teal)', color: '#fff' } : { background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                      <span className="text-[10px] font-bold uppercase tracking-wider leading-none">{DOW_SHORT[c.dow]}</span>
                      <span className="text-[17px] font-bold leading-tight mt-0.5" style={{ fontFamily: 'var(--font-display)' }}>{c.day}</span>
                    </span>
                    <span className="flex-1 min-w-0 space-y-1.5">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[12px] font-semibold" style={{ color: 'var(--mid-gray)' }}>{DOW_LONG[c.dow]}, {MONTH_NAMES[month]} {c.day}</span>
                        {isToday && <Tag tone="brand">Today</Tag>}
                      </span>
                      {dayEvents.map(ev => (
                        <span key={ev.id} className="block min-w-0">
                          <span className="block text-[13.5px] font-semibold leading-snug break-words" style={{ color: 'var(--charcoal)' }}>{ev.title}</span>
                          <span className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <TypeBadge type={ev.type} />
                            {ev.endDate && <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{ev.date} → {ev.endDate}</span>}
                          </span>
                        </span>
                      ))}
                    </span>
                    <Icon name="chevronRight" size={16} className="self-center" style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}

function Legend() {
  const types: CalendarEventType[] = ['CLASS_CANCELLED', 'HOLIDAY', 'FIELD_TRIP', 'IEP_REVIEW', 'EVENT']
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider mr-1" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>Key</span>
      {types.map(t => <TypeBadge key={t} type={t} />)}
    </div>
  )
}

/* ─────────── Selected-day dialog ─────────── */

function DayEventsPanel({
  dateStr, events, canEdit, onAdd, onEdit, onDelete, onClose,
}: {
  dateStr: string
  events: CalendarEvent[]
  canEdit: boolean
  onAdd: () => void
  onEdit: (ev: CalendarEvent) => void
  onDelete: (ev: CalendarEvent) => void
  onClose: () => void
}) {
  const display = new Date(dateStr + 'T00:00:00Z').toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
  return (
    <Portal>
      <Dialog
        labelId="cal-day-title"
        size="md"
        eyebrow="Day view"
        title={display}
        description={events.length ? `${events.length} event${events.length === 1 ? '' : 's'}` : undefined}
        onClose={onClose}
        footer={<>
          <button type="button" className={BTN_SECONDARY} style={SECONDARY_STYLE} onClick={onClose}>Close</button>
          {canEdit && (
            <button type="button" className={BTN_PRIMARY} style={PRIMARY_STYLE} onClick={onAdd}>
              <Icon name="plus" size={15} /> Add event
            </button>
          )}
        </>}
      >
        {events.length === 0 ? (
          <EmptyState icon="calendar" title="No events scheduled." hint={canEdit ? 'Use Add event to put something on this day.' : undefined} />
        ) : (
          <ul className="space-y-2.5">
            {events.map(ev => {
              const c = TYPE_STYLE[ev.type]
              const multiDay = !!ev.endDate
              return (
                <li key={ev.id} className="rounded-xl p-3" style={{ border: '1px solid var(--light-gray)', borderLeft: `4px solid ${c.border}` }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <TypeBadge type={ev.type} />
                      <p className="font-bold text-[14px] leading-snug mt-1.5 break-words" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{ev.title}</p>
                      <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                        {multiDay && ev.endDate && <>{ev.date} → {ev.endDate} · </>}by {ev.createdBy}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1">
                        <button type="button" className={BTN_SM} style={SECONDARY_STYLE} onClick={() => onEdit(ev)} aria-label={`Edit ${ev.title}`}>
                          <Icon name="edit" size={13} /> Edit
                        </button>
                        <button type="button" className={BTN_DANGER_GHOST} style={{ color: DANGER }} onClick={() => onDelete(ev)} aria-label={`Delete ${ev.title}`}>
                          <Icon name="trash" size={13} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                  {ev.description && (
                    <p className="text-[13px] mt-2 whitespace-pre-wrap break-words" style={{ color: 'var(--charcoal)' }}>{ev.description}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Dialog>
    </Portal>
  )
}

/* ─────────── Event composer dialog ─────────── */

function EventComposer({
  branch, defaultDate, editing, onClose, onSaved,
}: {
  branch: CalendarBranch
  defaultDate: string
  editing: CalendarEvent | null
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(editing?.date ?? defaultDate)
  const [endDate, setEndDate] = useState(editing?.endDate ?? '')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [type, setType] = useState<CalendarEventType>(editing?.type ?? 'EVENT')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const targetBranch = editing?.branch ?? branch

  async function handleSave() {
    if (!title.trim()) { setErr('Title is required.'); return }
    if (endDate && endDate < date) { setErr('End date cannot be before start date.'); return }
    setBusy(true); setErr(null)
    try {
      if (editing) {
        await updateEvent(editing.id, {
          date, endDate: endDate || null, title: title.trim(), description: description.trim() || null, type,
        })
      } else {
        await createEvent({
          branch: targetBranch,
          date, endDate: endDate || null, title: title.trim(), description: description.trim() || null, type,
        })
      }
      onSaved()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Portal>
      <Dialog
        labelId="cal-composer-title"
        size="md"
        eyebrow={editing ? `Edit event · ${branchShortLabel(targetBranch)}` : `New event · ${branchShortLabel(targetBranch)}`}
        title={editing ? editing.title : 'Add a calendar event'}
        onClose={onClose}
        footer={<>
          <button type="button" className={BTN_SECONDARY} style={SECONDARY_STYLE} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={BTN_PRIMARY} style={PRIMARY_STYLE} onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : (editing ? 'Save changes' : 'Add event')}
          </button>
        </>}
      >
        {err && <div className="mb-4"><Banner tone="error">{err}</Banner></div>}
        <div className="space-y-3">
          <label className="block">
            <span className={LABEL} style={LABEL_STYLE}>Title</span>
            <input className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Field trip to museum" />
          </label>
          <label className="block">
            <span className={LABEL} style={LABEL_STYLE}>Type</span>
            <select className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={type} onChange={e => setType(e.target.value as CalendarEventType)}>
              <option value="EVENT">Event</option>
              <option value="FIELD_TRIP">Field trip</option>
              <option value="HOLIDAY">Holiday</option>
              <option value="CLASS_CANCELLED">Classes cancelled</option>
              <option value="IEP_REVIEW">IEP review</option>
            </select>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block min-w-0">
              <span className={LABEL} style={LABEL_STYLE}>Date</span>
              <input type="date" className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={date} onChange={e => setDate(e.target.value)} />
            </label>
            <label className="block min-w-0">
              <span className={LABEL} style={LABEL_STYLE}>End date (optional)</span>
              <input type="date" className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={endDate} onChange={e => setEndDate(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className={LABEL} style={LABEL_STYLE}>Description (optional)</span>
            <textarea className={TEXTAREA} style={CONTROL_STYLE} rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Notes parents should see…" />
          </label>
        </div>
      </Dialog>
    </Portal>
  )
}
