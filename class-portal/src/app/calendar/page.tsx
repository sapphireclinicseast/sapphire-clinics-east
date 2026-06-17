'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth } from '@/lib/session'
import {
  listEvents, createEvent, updateEvent, deleteEvent,
  getCalendarPdfMeta, fetchCalendarPdfBlob, uploadCalendarPdf, deleteCalendarPdf,
  eventTypeLabel, eventTypeColor, branchShortLabel,
  type CalendarEvent, type CalendarEventType, type CalendarPdfMeta, type CalendarBranch,
} from '@/lib/calendar'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

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

  return (
    <div className="max-w-6xl mx-auto animate-fade-up space-y-5">
      <div className="card-static">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
              Academic calendar · {branchShortLabel(activeBranch)}
            </div>
            <h1 className="text-[26px] leading-tight text-[color:var(--deep-teal)]">{MONTH_NAMES[month]} {year}</h1>
            <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
              {canEdit ? 'Click a date to add an event, mark classes cancelled, or schedule activities.' : 'View the school year schedule, holidays, and any cancelled-class days.'}
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {canSwitchBranch && (
              <BranchToggle value={activeBranch} onChange={setActiveBranch} />
            )}
            <button type="button" className="btn-secondary text-xs" onClick={prevMonth}>← Prev</button>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }}
            >Today</button>
            <button type="button" className="btn-secondary text-xs" onClick={nextMonth}>Next →</button>
          </div>
        </div>

        {err && (
          <div className="mt-3 px-4 py-2 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>
        )}

        <div className="mt-4 rounded-xl p-3 border flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
          <div className="text-[12.5px] text-[color:var(--ink)]">
            <span className="font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
              {branchShortLabel(activeBranch)} calendar PDF:
            </span>{' '}
            {pdfMeta ? (
              <>
                <span>{pdfMeta.fileName}</span>{' '}
                <span className="text-[color:var(--mid-gray)]">· uploaded {new Date(pdfMeta.uploadedAt).toLocaleDateString()} by {pdfMeta.uploadedBy}</span>
              </>
            ) : (
              <span className="text-[color:var(--mid-gray)]">Not uploaded yet.</span>
            )}
          </div>
          <div className="flex gap-2">
            {pdfMeta && <button type="button" className="btn-secondary text-xs" onClick={handlePdfView}>View / download</button>}
            {canEdit && (
              <>
                <label className="btn-primary text-xs cursor-pointer">
                  {pdfBusy ? 'Uploading…' : pdfMeta ? 'Replace PDF' : 'Upload PDF'}
                  <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={handlePdfFile} disabled={pdfBusy} />
                </label>
                {pdfMeta && (
                  <button type="button" onClick={handlePdfRemove} className="text-xs px-2 py-1 rounded-md text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)]">Remove</button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card-static">
        <MonthGrid
          year={year}
          month={month}
          events={events}
          today={today}
          loading={loadingEvents}
          onSelect={setSelectedDate}
          selected={selectedDate}
        />
        <Legend />
      </div>

      {selectedDate && (
        <div className="card-static">
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
        </div>
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

/* ─────────── Branch toggle ─────────── */

function BranchToggle({ value, onChange }: { value: CalendarBranch; onChange: (v: CalendarBranch) => void }) {
  return (
    <div className="inline-flex rounded-full border overflow-hidden text-[11.5px] font-semibold" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
      {(['EAST', 'GREENHILLS'] as const).map(b => {
        const active = value === b
        return (
          <button
            key={b}
            type="button"
            onClick={() => onChange(b)}
            className="px-3 py-1.5 transition-colors"
            style={{
              background: active ? 'var(--narra)' : 'transparent',
              color: active ? 'white' : 'var(--ink)',
            }}
          >
            {branchShortLabel(b)}
          </button>
        )
      })}
    </div>
  )
}

/* ─────────── Month grid ─────────── */

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

  const cells: Array<{ day: number | null; dateStr: string | null }> = []
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateStr: null })
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ day: d, dateStr: ymd(new Date(Date.UTC(year, month, d))) })
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, dateStr: null })

  return (
    <div>
      <div className="grid grid-cols-7 gap-px text-center text-[11px] uppercase tracking-[0.08em] font-semibold text-[color:var(--mid-gray)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
        {DOW_SHORT.map(d => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden border" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-3)' }}>
        {cells.map((c, i) => {
          if (!c.day || !c.dateStr) {
            return <div key={i} className="bg-[color:var(--paper-2)] min-h-[88px]" />
          }
          const isToday = c.dateStr === todayStr
          const isSelected = c.dateStr === selected
          const dayEvents = byDate[c.dateStr] ?? []
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(c.dateStr!)}
              className="text-left bg-white min-h-[88px] p-1.5 transition-colors hover:bg-[color:var(--paper-2)] focus:outline-none focus:ring-2 focus:ring-offset-1"
              style={{
                outlineColor: 'var(--narra)',
                borderRadius: 0,
                ...(isSelected ? { boxShadow: 'inset 0 0 0 2px var(--narra)' } : {}),
              }}
            >
              <div className={`text-[12.5px] font-bold ${isToday ? 'text-[color:var(--narra)]' : 'text-[color:var(--ink)]'}`} style={{ fontFamily: 'var(--font-display)' }}>
                {isToday ? (
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[color:var(--narra)] text-white">{c.day}</span>
                ) : c.day}
              </div>
              <div className="mt-1 space-y-0.5">
                {dayEvents.slice(0, 3).map(ev => {
                  const c = eventTypeColor(ev.type)
                  return (
                    <div
                      key={ev.id + '-' + ev.date}
                      className="text-[10.5px] leading-tight px-1.5 py-0.5 rounded truncate"
                      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
                      title={ev.title}
                    >
                      {ev.title}
                    </div>
                  )
                })}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-[color:var(--mid-gray)] pl-1">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
      {loading && <p className="text-[11.5px] text-[color:var(--mid-gray)] text-center mt-2">Loading events…</p>}
    </div>
  )
}

function Legend() {
  const types: CalendarEventType[] = ['CLASS_CANCELLED', 'HOLIDAY', 'FIELD_TRIP', 'IEP_REVIEW', 'EVENT']
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 text-[11px]">
      {types.map(t => {
        const c = eventTypeColor(t)
        return (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded" style={{ background: c.bg, border: `1px solid ${c.border}` }} />
            <span style={{ color: c.fg }}>{eventTypeLabel(t)}</span>
          </span>
        )
      })}
    </div>
  )
}

/* ─────────── Selected-day panel ─────────── */

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
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>Day view</div>
          <h2 className="text-[20px] leading-tight">{display}</h2>
        </div>
        <div className="flex gap-2">
          {canEdit && <button type="button" className="btn-cta text-xs" onClick={onAdd}>+ Add event</button>}
          <button type="button" className="btn-secondary text-xs" onClick={onClose}>Close</button>
        </div>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-[color:var(--mid-gray)] text-center py-6">No events scheduled.</p>
      ) : (
        <ul className="space-y-2.5">
          {events.map(ev => {
            const c = eventTypeColor(ev.type)
            const multiDay = !!ev.endDate
            return (
              <li key={ev.id} className="rounded-xl p-3 border" style={{ borderColor: c.border, background: c.bg }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold" style={{ color: c.fg, fontFamily: 'var(--font-display)' }}>{ev.title}</div>
                    <div className="text-[11.5px] mt-0.5" style={{ color: c.fg, opacity: 0.85 }}>
                      {eventTypeLabel(ev.type)}{multiDay && ev.endDate && <> · {ev.date} → {ev.endDate}</>} · by {ev.createdBy}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1.5">
                      <button type="button" className="btn-secondary text-xs" onClick={() => onEdit(ev)}>Edit</button>
                      <button type="button" className="text-xs px-2 py-1 rounded-md hover:bg-white/40" style={{ color: '#9f1239' }} onClick={() => onDelete(ev)}>Delete</button>
                    </div>
                  )}
                </div>
                {ev.description && (
                  <p className="text-[13px] mt-2 whitespace-pre-wrap" style={{ color: c.fg }}>{ev.description}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/* ─────────── Event composer modal ─────────── */

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
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>
              {editing ? `Edit event · ${branchShortLabel(targetBranch)}` : `New event · ${branchShortLabel(targetBranch)}`}
            </div>
            <h2 className="text-[18px] leading-tight">{editing ? editing.title : 'Add a calendar event'}</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[color:var(--mid-gray)] hover:bg-[color:var(--paper-2)] hover:text-[color:var(--narra)] text-lg leading-none">×</button>
        </div>
        {err && <div className="mb-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}
        <div className="space-y-3">
          <label className="block">
            <span className="label">Title</span>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Field trip to museum" />
          </label>
          <label className="block">
            <span className="label">Type</span>
            <select className="select" value={type} onChange={e => setType(e.target.value as CalendarEventType)}>
              <option value="EVENT">Event</option>
              <option value="FIELD_TRIP">Field trip</option>
              <option value="HOLIDAY">Holiday</option>
              <option value="CLASS_CANCELLED">Classes cancelled</option>
              <option value="IEP_REVIEW">IEP review</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Date</span>
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">End date (optional)</span>
              <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="label">Description (optional)</span>
            <textarea className="input" rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Notes parents should see…" />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn-secondary text-xs" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary text-xs" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : (editing ? 'Save changes' : 'Add event')}
          </button>
        </div>
      </div>
    </div>
  )
}
