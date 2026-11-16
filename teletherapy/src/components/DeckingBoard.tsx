'use client'

/**
 * The clinician's own decking board.
 *
 * Read only, and deliberately so. The board is front desk's — they hold the
 * phone, they know who cancelled — and a second place to edit it would be a
 * second version of the truth. What a consultant needs is to see what is
 * actually written down for them, which is what this is.
 *
 * It is live by construction rather than by syncing: the staff portal and the
 * Operations Hub read one database, so the Decking module and the Google Sheet
 * (which writes back into the same rows every five minutes) both land here.
 *
 * Drawn as the hub's Decking grid (Hannah 11/16: "make the view look like the
 * one from operations hub"): one card per working pattern, hours down the side,
 * work days across, each hour Available, booked, or Unavailable. The rows come
 * from lib/decking-slots — a verbatim copy of the hub's own — so an hour here is
 * cut exactly where the hub cuts it. Nothing on it can be clicked to change.
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Ban, CalendarPlus, ChevronDown, Clock, Info, Loader2, MapPin, UserPlus } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { branchLabel } from '@/lib/branch-label'
import { daySlots, toMinutes } from '@/lib/decking-slots'
import { CARD_STYLE, EmptyState } from '@/components/hub/ui'

interface SlotOut {
  id: string
  staffId: string
  dayOfWeek: string
  startTime: string
  endTime: string
  branch: string
  department: string
  deliveryMode: string | null
  paymentType: string
  hmoProvider: string | null
  isClass: boolean
  notes: string | null
  date: string | null
  isMakeup: boolean
  disabled: boolean
  patient: { id: string; firstName: string; lastName: string } | null
}

interface ConfigOut {
  staffId: string
  branch: string
  department: string
  deliveryMode: string | null
  workDays: string[]
  startTime: string
  endTime: string
  slotsPerDay: number | null
  slotMinutes: number | null
  breakStart: string | null
  breakMinutes: number | null
}

interface StaffOut { id: string; firstName: string; lastName: string; department: string }

interface BoardData {
  today?: string
  staff?: StaffOut[]
  configs: ConfigOut[]
  weekly: SlotOut[]
  dated: SlotOut[]
}

// ── The hub's board, its colours and its week (src/app/(dashboard)/decking) ──
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const DAY_LABEL: Record<string, string> = {
  SUN: 'Sunday', MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday',
}
const DAY_SHORT: Record<string, string> = Object.fromEntries(DAYS.map(d => [d, DAY_LABEL[d].slice(0, 3)]))
const MODE_LABEL: Record<string, string> = { ONSITE: 'On-site', TELETHERAPY: 'Teletherapy', HOMECARE: 'Homecare' }

type PayType = 'CASH' | 'HMO' | 'GL'
const PAY_STYLE: Record<PayType, { bg: string; fg: string; border: string; label: string }> = {
  CASH: { bg: '#E3EEFB', fg: '#14507F', border: '#A9CBEC', label: 'Cash' },
  HMO:  { bg: '#EFE4FA', fg: '#5B2A86', border: '#C9AEE6', label: 'HMO' },
  GL:   { bg: '#FDEAD6', fg: '#93460B', border: '#F3C69B', label: 'GL' },
}
const CLASS_STYLE = { bg: '#E6F2EF', fg: '#2F5F55', border: '#A9CFC5', label: 'Class' }
const OPEN_BG     = '#F5FBF6'
const OPEN_FG     = '#166534'
const OPEN_BORDER = '#B9DFC4'
const OFF_CELL_BG = '#EEF1F3'
const OFF_HATCH   = `repeating-linear-gradient(135deg, ${OFF_CELL_BG} 0 6px, #E5E9EC 6px 12px)`
const OFF_BORDER  = '#DDE3E7'
const OFF_FG      = '#66717D'
const GRID_LINE   = '#E3EAE7'
const GRID_LINE_SOFT = '#EDF1EF'
const CELL_RADIUS = 6
const MAKEUP_FG   = '#C2410C'
const TEAL_HEX    = '#1A7B8A'
const ROW_H = 36
const INNER_H = ROW_H - 6

const payOf = (s: SlotOut): PayType => (s.paymentType === 'HMO' || s.paymentType === 'GL' ? s.paymentType : 'CASH')

/** Re-case ALL-CAPS records for display; mixed case is left as typed (the hub's rule). */
const ROMAN = new Set(['ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi', 'xii'])
function displayName(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  if (!s || /\p{Ll}/u.test(s)) return s
  return s.toLowerCase().replace(/\p{L}+/gu, (w: string, offset: number, whole: string) => {
    if (offset > 0 && /\d/.test(whole[offset - 1])) return w
    if (ROMAN.has(w)) return w.toUpperCase()
    return w[0].toUpperCase() + w.slice(1)
  })
}
const personLabel = (p: { firstName?: string | null; lastName?: string | null }) =>
  displayName(`${p.lastName ?? ''}, ${p.firstName ?? ''}`.replace(/^,\s*|,\s*$/g, ''))
const shortName = (p: { firstName: string; lastName: string }) => {
  const i = (p.firstName ?? '').trim().charAt(0).toUpperCase()
  return i ? `${displayName(p.lastName)}, ${i}.` : displayName(p.lastName)
}
const initials = (f?: string | null, l?: string | null) =>
  (((f ?? '').trim()[0] ?? '') + ((l ?? '').trim()[0] ?? '')).toUpperCase() || '?'
/** Calendar order (Sun first, as the hub); an unknown key sorts last rather than vanishing. */
const dayRank = (d: string) => { const i = DAYS.indexOf(d); return i < 0 ? 99 : i }
const sortDays = (days: string[]) => [...days].sort((a, b) => dayRank(a) - dayRank(b))
function hourParts(t: string): { h: string; ap: string } {
  const [h, m] = t.split(':').map(Number)
  const hh = h % 12 || 12
  return { h: m ? `${hh}:${String(m).padStart(2, '0')}` : String(hh), ap: h >= 12 ? 'PM' : 'AM' }
}
function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
const cfgKey = (c: ConfigOut) => `${c.staffId}|${c.branch}|${c.department}|${c.deliveryMode ?? ''}`

/**
 * Which working pattern a weekly hour belongs to: same person, branch and
 * department, then the one for its delivery mode, else the general one (no
 * mode), else the only one there is. An hour that fits none is listed apart
 * rather than dropped.
 */
function configForSlot(s: SlotOut, configs: ConfigOut[]): ConfigOut | null {
  const same = configs.filter(c => c.staffId === s.staffId && c.branch === s.branch && c.department === s.department)
  if (same.length === 0) return null
  if (s.deliveryMode) {
    const exact = same.find(c => c.deliveryMode === s.deliveryMode)
    if (exact) return exact
  }
  const general = same.find(c => !c.deliveryMode)
  if (general) return general
  if (!s.deliveryMode) {
    const onsite = same.find(c => c.deliveryMode === 'ONSITE')
    if (onsite) return onsite
  }
  return same.length === 1 ? same[0] : null
}

export default function DeckingBoard() {
  const [data, setData] = useState<BoardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const ctl = new AbortController()
    setLoading(true); setError('')
    fetch('/api/decking', { cache: 'no-store', signal: ctl.signal })
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Could not load your decking.')
        setData(d)
      })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => setLoading(false))
    return () => ctl.abort()
  }, [])

  // Weekly hours, each filed under the pattern (card) it belongs to.
  const { byConfig, loose } = useMemo(() => {
    const byConfig = new Map<string, SlotOut[]>()
    const loose: SlotOut[] = []
    for (const s of data?.weekly ?? []) {
      const c = configForSlot(s, data!.configs)
      if (!c) { if (!s.disabled) loose.push(s); continue }
      const k = cfgKey(c)
      byConfig.set(k, [...(byConfig.get(k) ?? []), s])
    }
    return { byConfig, loose }
  }, [data])

  // An interbranch consultant is decked separately at each branch; with both on
  // one page every card and every listed hour says where it is.
  const multiBranch = useMemo(() => {
    if (!data) return false
    return new Set([...data.configs.map(c => c.branch), ...data.weekly.map(s => s.branch), ...data.dated.map(s => s.branch)]).size > 1
  }, [data])

  if (loading) {
    return (
      <div className="rounded-xl px-5 py-10 flex items-center justify-center gap-2 text-sm" style={{ ...CARD_STYLE, color: 'var(--mid-gray)' }}>
        <Loader2 size={15} className="animate-spin" /> Loading your decking…
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-xl" style={CARD_STYLE}>
        <EmptyState title="Couldn't load your decking" hint={error} />
      </div>
    )
  }

  const nothingAtAll = !data || (data.configs.length === 0 && data.weekly.length === 0 && data.dated.length === 0)
  const todayKey = DAYS[new Date(`${data?.today ?? new Date().toISOString().slice(0, 10)}T12:00:00`).getDay()]
  const staffById = new Map((data?.staff ?? []).map(s => [s.id, s]))

  return (
    <div className="space-y-4 min-w-0">
      {/* The note. It is the point of the page as much as the board is: a
          consultant looking at a wrong schedule needs to know whose it is to
          fix, and that it is not fixed here. */}
      <div role="note" className="rounded-xl px-4 py-3 flex gap-2.5" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
        <Info size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#92400E' }} aria-hidden />
        <p className="text-[13px] leading-relaxed m-0" style={{ color: '#7A5C00' }}>
          This is the board exactly as front desk keep it. <strong>If your decking is not up to
          date, please inquire with the front desk so they can update it</strong> — they edit it in
          the Decking module or in the branch Google Sheet, and whichever they use shows here.
          It cannot be changed from this page.
        </p>
      </div>

      {nothingAtAll ? (
        <div className="rounded-xl" style={CARD_STYLE}>
          <EmptyState title="Nothing on the board for you yet"
            hint="Front desk have not set up a schedule or booked any hours under your name. Ask them to set it up." />
        </div>
      ) : (
        <>
          <Legend />
          {data!.configs.map(c => (
            <BoardCard key={cfgKey(c)} config={c} staff={staffById.get(c.staffId) ?? null}
              slots={byConfig.get(cfgKey(c)) ?? []} todayKey={todayKey} />
          ))}

          {loose.length > 0 && (
            <ListCard icon={<Clock size={13} />} title="Other weekly hours" note="booked under a branch or service with no schedule set up">
              {[...loose].sort((a, b) => DAYS.indexOf(a.dayOfWeek) - DAYS.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime))
                .map(s => <SlotLine key={s.id} slot={s} lead={DAY_SHORT[s.dayOfWeek] ?? s.dayOfWeek} showBranch />)}
            </ListCard>
          )}

          {/* One-off and make-up dates. Kept out of the weekday columns: a
              one-off drawn in its weekday column reads as "every Tuesday",
              which is exactly the claim it must not make. */}
          {data!.dated.length > 0 && (
            <ListCard icon={<CalendarPlus size={13} />} iconColor={MAKEUP_FG} title="Coming dates" note="single dates only — these do not repeat">
              {[...data!.dated].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.startTime.localeCompare(b.startTime))
                .map(s => <SlotLine key={s.id} slot={s} lead={fmtDate(s.date!)} wideLead showBranch={multiBranch} />)}
            </ListCard>
          )}
        </>
      )}
    </div>
  )
}

/** The hub's colour key, so the cells read the same as on the Decking module. */
function Legend() {
  const items = [
    { label: 'Available', style: { background: OPEN_BG, border: `1px dashed ${OPEN_BORDER}` } },
    ...(['CASH', 'HMO', 'GL'] as PayType[]).map(p => ({ label: PAY_STYLE[p].label, style: { background: PAY_STYLE[p].bg, borderLeft: `3px solid ${PAY_STYLE[p].border}` } })),
    { label: 'Unavailable', style: { background: OFF_HATCH, border: `1px solid ${OFF_BORDER}` } },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>
      {items.map(i => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-5 h-3.5" style={{ ...i.style, borderRadius: 4 }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

/** One working pattern as the hub draws it: header, then hours × work days. */
function BoardCard({ config, staff, slots, todayKey }: {
  config: ConfigOut; staff: StaffOut | null; slots: SlotOut[]; todayKey: string
}) {
  const [open, setOpen] = useState(true)
  const days = sortDays(config.workDays)
  const rows = daySlots(config.startTime, config.endTime, {
    slotsPerDay: config.slotsPerDay, slotMinutes: config.slotMinutes, breakStart: config.breakStart, breakMinutes: config.breakMinutes,
  })
  const starts = rows.map(r => r.startTime)
  const customLength = rows.some(r => !r.startTime.endsWith(':00'))
  const cell = (day: string, start: string) => slots.filter(s => s.dayOfWeek === day && s.startTime === start)
  // Hours that are not on the grid: off-the-hour times, or days not in the pattern.
  const startSet = new Set(starts)
  const offGrid = slots.filter(s => !s.disabled && (!startSet.has(s.startTime) || !days.includes(s.dayOfWeek)))

  // "x of y booked", walking the same cells the grid draws (the hub's rule):
  // unavailable wins, then any occupant, else open. Unavailable is left out of y.
  let booked = 0, blocked = 0, total = 0
  for (const d of days) for (const st of starts) {
    total++
    const c = cell(d, st)
    if (c.some(s => s.disabled)) blocked++
    else if (c.length > 0) booked++
  }
  const openN = total - booked - blocked
  const bookable = booked + openN
  const pct = bookable > 0 ? Math.round((booked / bookable) * 100) : 0

  const name = staff ? personLabel(staff) : 'Your schedule'
  const lastDay = days[days.length - 1]
  const lastRow = starts[starts.length - 1]
  const thBase: React.CSSProperties = { position: 'sticky', top: 0, background: '#F6F8F7', padding: '0.45rem 0.6rem', borderBottom: '1px solid var(--light-gray)' }

  return (
    <section className="rounded-xl overflow-hidden min-w-0" style={CARD_STYLE} aria-label={`${name} — ${branchLabel(config.branch) ?? config.branch}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" style={{ borderBottom: open ? '1px solid var(--light-gray)' : 'none' }}>
        <span aria-hidden className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
          style={{ width: 34, height: 34, fontSize: 12, background: 'var(--pale-teal)', color: 'var(--teal)' }}>
          {staff ? initials(staff.firstName, staff.lastName) : '•'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <h3 className="text-[15px] font-bold leading-tight truncate max-w-full m-0" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{name}</h3>
            <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-md leading-none" style={{ background: '#E6F1F3', color: TEAL_HEX }}>{config.department}</span>
            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md leading-none"
              style={{ background: '#fff', color: '#475569', border: '1px solid var(--light-gray)' }}>
              <MapPin size={10} aria-hidden /> {branchLabel(config.branch) ?? config.branch}
            </span>
            {config.deliveryMode && (
              <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md leading-none" style={{ background: '#fff', color: '#475569', border: '1px solid var(--light-gray)' }}>
                {MODE_LABEL[config.deliveryMode] ?? config.deliveryMode}
              </span>
            )}
          </div>
          {days.length > 0 ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0 text-xs" style={{ color: 'var(--mid-gray)' }}>
              <span className="inline-flex items-center gap-[3px]" role="img" aria-label={`Works ${days.map(d => DAY_LABEL[d]).join(', ')}`}>
                {DAYS.map(d => {
                  const on = days.includes(d)
                  return (
                    <span key={d} aria-hidden className="inline-flex items-center justify-center rounded text-[9.5px] font-bold leading-none"
                      style={{ width: 16, height: 16, background: on ? 'var(--pale-teal)' : 'transparent', color: on ? 'var(--teal)' : '#B8C2C0',
                        boxShadow: d === todayKey ? `inset 0 -2px 0 ${on ? 'var(--teal)' : '#C9D2D0'}` : undefined }}>
                      {d.charAt(0)}
                    </span>
                  )
                })}
              </span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums">
                <Clock size={11} className="flex-shrink-0" aria-hidden />
                {formatTime(config.startTime)} – {formatTime(config.endTime)}
              </span>
              {config.breakStart && config.breakMinutes ? (
                <span className="whitespace-nowrap">break {formatTime(config.breakStart)} · {config.breakMinutes} min</span>
              ) : null}
            </div>
          ) : (
            <p className="text-xs mt-0.5 m-0" style={{ color: 'var(--mid-gray)' }}>No work days set</p>
          )}
        </div>

        {total > 0 && (
          <div className="order-last w-full sm:order-none sm:w-48"
            title={`${booked} booked · ${openN} open${blocked > 0 ? ` · ${blocked} unavailable (not counted)` : ''}`}>
            <div className="flex items-baseline justify-between gap-2 text-[11px] mb-1" style={{ color: 'var(--mid-gray)' }}>
              <span><strong className="tabular-nums" style={{ color: 'var(--charcoal)' }}>{booked}</strong> of <span className="tabular-nums">{bookable}</span> booked</span>
              <span className="tabular-nums font-semibold">{pct}%</span>
            </div>
            <div className="flex overflow-hidden rounded-full" style={{ height: 6, background: '#EEF2F1' }} role="img" aria-label={`${booked} booked, ${openN} open`}>
              {bookable > 0 && <>
                <div style={{ width: `${(booked / bookable) * 100}%`, background: '#7FB2E5' }} />
                <div style={{ width: `${(openN / bookable) * 100}%`, background: '#9AD7AB' }} />
              </>}
            </div>
          </div>
        )}

        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          title={open ? 'Collapse' : 'Expand'} aria-label={open ? 'Collapse' : 'Expand'}
          className="ml-auto inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-[color:var(--paper)]" style={{ color: 'var(--mid-gray)' }}>
          <ChevronDown size={16} className="transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>
      </header>

      {open && (days.length === 0 || starts.length === 0 ? (
        <p className="px-4 py-5 text-[13px] m-0" style={{ color: 'var(--mid-gray)' }}>
          Front desk have not set the days or hours of this schedule yet, so there is no grid to draw.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate" style={{ borderSpacing: 0, minWidth: 64 + days.length * 132, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 64 }} />
              {days.map(d => <col key={d} />)}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" style={{ ...thBase, left: 0, zIndex: 3, textAlign: 'right', borderRight: '1px solid var(--light-gray)',
                  fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--mid-gray)' }}>
                  Time
                </th>
                {days.map(day => {
                  const isToday = day === todayKey
                  return (
                    <th key={day} scope="col" style={{ ...thBase, zIndex: 2, textAlign: 'center',
                      borderRight: day === lastDay ? 'none' : `1px solid ${GRID_LINE_SOFT}`,
                      boxShadow: isToday ? `inset 0 -2px 0 ${TEAL_HEX}` : undefined,
                      fontSize: '0.74rem', fontWeight: 700, color: isToday ? 'var(--teal)' : 'var(--charcoal)' }}>
                      <span className="hidden sm:inline">{DAY_LABEL[day] ?? day}</span>
                      <span className="sm:hidden">{DAY_SHORT[day] ?? day}</span>
                      {isToday && (
                        <span className="ml-1.5 align-middle inline-block rounded-full px-1.5 text-[9px] font-bold uppercase tracking-wider leading-[15px]"
                          style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>Today</span>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {starts.map(start => {
                const hp = hourParts(start)
                return (
                  <tr key={start}>
                    <th scope="row" style={{ position: 'sticky', left: 0, zIndex: 1, background: '#FAFBFB', padding: '0 0.55rem', textAlign: 'right',
                      whiteSpace: 'nowrap', color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid var(--light-gray)',
                      borderBottom: start === lastRow ? 'none' : `1px solid ${GRID_LINE}`, height: ROW_H }}>
                      {customLength ? (
                        <span className="text-[11px] font-semibold tabular-nums">{formatTime(start)}</span>
                      ) : (
                        <><span className="text-[12px] font-semibold">{hp.h}</span><span className="ml-0.5 text-[9.5px] font-semibold uppercase" style={{ opacity: 0.75 }}>{hp.ap}</span></>
                      )}
                    </th>
                    {days.map(day => {
                      const occ = cell(day, start)
                      const off = occ.find(s => s.disabled)
                      const people = occ.filter(s => !s.disabled)
                      const where = `${DAY_LABEL[day] ?? day} ${formatTime(start)}`
                      const td: React.CSSProperties = { padding: 3, verticalAlign: 'middle', height: ROW_H,
                        borderRight: day === lastDay ? 'none' : `1px solid ${GRID_LINE_SOFT}`,
                        borderBottom: start === lastRow ? 'none' : `1px solid ${GRID_LINE}` }
                      if (off) {
                        const why = off.notes || 'Unavailable'
                        return (
                          <td key={day} style={td}>
                            <div className="flex items-center gap-1.5 px-1.5 min-w-0" title={`${why} — ${where}`}
                              style={{ minHeight: INNER_H, color: OFF_FG, background: OFF_HATCH, border: `1px solid ${OFF_BORDER}`, borderRadius: CELL_RADIUS }}>
                              <Ban size={11} className="flex-shrink-0" aria-hidden />
                              <span className="truncate text-[11px] font-semibold">{why}</span>
                            </div>
                          </td>
                        )
                      }
                      if (people.length === 0) {
                        return (
                          <td key={day} style={td}>
                            <div className="flex items-center gap-1 px-1.5 min-w-0 text-[11px] font-semibold" title={`Open — ${where}`}
                              style={{ minHeight: INNER_H, color: OPEN_FG, background: OPEN_BG, border: `1px dashed ${OPEN_BORDER}`, borderRadius: CELL_RADIUS }}>
                              <span className="truncate">Available</span>
                            </div>
                          </td>
                        )
                      }
                      const lineH = people.length > 1 ? Math.min(INNER_H, 20) : INNER_H
                      return (
                        <td key={day} style={td}>
                          <div className="flex flex-col gap-0.5">
                            {people.map(s => {
                              const st = s.isClass ? CLASS_STYLE : PAY_STYLE[payOf(s)]
                              const label = s.isClass ? 'Class' : s.patient ? shortName(s.patient) : 'Open — no patient'
                              const full = s.isClass ? 'Class' : s.patient ? personLabel(s.patient) : 'No patient booked'
                              return (
                                <div key={s.id} className="flex items-center gap-1 pl-1.5 pr-1 min-w-0"
                                  title={`${full} · ${s.isClass ? 'Class' : st.label}${s.hmoProvider ? ` (${s.hmoProvider})` : ''} · ${where}${s.notes ? ` — ${s.notes}` : ''}`}
                                  style={{ background: st.bg, color: st.fg, borderLeft: `3px solid ${st.border}`, borderRadius: CELL_RADIUS, minHeight: lineH }}>
                                  {s.isMakeup && <UserPlus size={10} className="flex-shrink-0" style={{ color: MAKEUP_FG }} aria-label="Make-up" />}
                                  <span className="flex-1 min-w-0 truncate text-[11.5px] font-semibold leading-tight">{label}</span>
                                  {!s.isClass && s.patient && (
                                    <span className="flex-shrink-0 rounded px-1 text-[9.6px] font-bold leading-[1.6]"
                                      style={{ background: 'rgba(255,255,255,0.75)', border: `1px solid ${st.border}`, color: st.fg, letterSpacing: '0.03em' }}>
                                      {payOf(s) === 'HMO' && s.hmoProvider ? s.hmoProvider : st.label}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      {open && offGrid.length > 0 && (
        <div style={{ borderTop: '1px solid var(--light-gray)' }}>
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            <span aria-hidden className="inline-flex items-center justify-center w-6 h-6 rounded-md" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}><Clock size={13} /></span>
            <p className="text-[11px] font-semibold uppercase tracking-wider m-0" style={{ color: 'var(--charcoal)' }}>Custom slots</p>
            <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>· weekly, at times off the grid</span>
          </div>
          <ul className="px-3 pb-3 flex flex-col gap-1.5 m-0 list-none">
            {[...offGrid].sort((a, b) => DAYS.indexOf(a.dayOfWeek) - DAYS.indexOf(b.dayOfWeek) || toMinutes(a.startTime) - toMinutes(b.startTime))
              .map(s => <SlotLine key={s.id} slot={s} lead={DAY_SHORT[s.dayOfWeek] ?? s.dayOfWeek} />)}
          </ul>
        </div>
      )}
    </section>
  )
}

/** A card holding a list of single hours (off-grid weekly hours, coming dates). */
function ListCard({ icon, iconColor, title, note, children }: { icon: React.ReactNode; iconColor?: string; title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl overflow-hidden min-w-0" style={CARD_STYLE}>
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span aria-hidden className="inline-flex items-center justify-center w-6 h-6 rounded-md" style={{ background: 'var(--pale-teal)', color: iconColor ?? 'var(--teal)' }}>{icon}</span>
        <p className="text-[11px] font-semibold uppercase tracking-wider m-0" style={{ color: 'var(--charcoal)' }}>{title}</p>
        <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>· {note}</span>
      </div>
      <ul className="px-3 pb-3 flex flex-col gap-1.5 m-0 list-none">{children}</ul>
    </section>
  )
}

/** One listed hour, in the hub's custom-slot row style: day or date, time, who, how paid. */
function SlotLine({ slot, lead, wideLead = false, showBranch = false }: { slot: SlotOut; lead: string; wideLead?: boolean; showBranch?: boolean }) {
  const st = slot.isClass ? CLASS_STYLE : PAY_STYLE[payOf(slot)]
  return (
    <li className="rounded-lg px-2.5 py-2" style={{ border: `1px solid ${slot.isMakeup ? '#FBD5BC' : '#EEF2F1'}`, background: slot.isMakeup ? '#FFFBF8' : '#fff' }}>
      <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap min-w-0">
        <span className="flex-shrink-0 inline-flex items-center justify-center rounded-md text-[10.5px] font-bold uppercase"
          style={{ minWidth: wideLead ? '8.5rem' : '2.6rem', height: '1.6rem', padding: '0 0.45rem', letterSpacing: '0.04em', color: 'var(--teal)', background: 'var(--pale-teal)' }}>
          {lead}
        </span>
        <span className="flex-shrink-0 text-[13px] font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>
          {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
        </span>
        <span className="flex-1 min-w-[10rem] flex items-center gap-2">
          {slot.isMakeup && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: '#FFF1E8', color: MAKEUP_FG, border: '1px solid #FBD5BC' }}>
              <UserPlus size={9} className="inline -mt-px mr-0.5" aria-hidden />Make-up
            </span>
          )}
          {showBranch && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: 'var(--paper)', color: 'var(--deep-teal)', border: '1px solid var(--light-gray)' }}>
              {branchLabel(slot.branch) ?? slot.branch}
            </span>
          )}
          <span className="truncate text-[13px] font-medium" style={{ color: 'var(--charcoal)' }}>
            {slot.isClass ? 'Class' : slot.patient ? personLabel(slot.patient) : <em style={{ color: 'var(--mid-gray)' }}>Open — no patient booked</em>}
          </span>
          {!slot.isClass && slot.patient && (
            <span className="flex-shrink-0 rounded px-1.5 py-px text-[10px] font-bold uppercase" title={slot.hmoProvider ?? undefined}
              style={{ background: st.bg, color: st.fg, border: `1px solid ${st.border}`, letterSpacing: '0.03em' }}>
              {payOf(slot) === 'HMO' && slot.hmoProvider ? slot.hmoProvider : st.label}
            </span>
          )}
        </span>
      </div>
      {slot.notes && <p className="text-[11.5px] mt-1 mb-0" style={{ color: 'var(--mid-gray)' }}>{slot.notes}</p>}
    </li>
  )
}

/** Shown when the account has no Staff record to look up. */
export function DeckingUnlinked() {
  return (
    <div className="rounded-xl px-4 py-3 flex gap-2.5" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5' }}>
      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#B42318' }} aria-hidden />
      <p className="text-[13px] m-0" style={{ color: '#B42318' }}>
        Your account is not linked to a staff record, so there is no board to show. Ask HR to link it.
      </p>
    </div>
  )
}
