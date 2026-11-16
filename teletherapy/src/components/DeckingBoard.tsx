'use client'

/**
 * The clinician's own decking board.
 *
 * Read only, and deliberately so. The board is front desk's — they hold the
 * phone, they know who cancelled — and a second place to edit it would be a
 * second version of the truth. What a consultant needs is to see what is
 * actually written down for them.
 *
 * Live by construction rather than by syncing: the staff portal and the
 * Operations Hub read one database, so the Decking module and the Google Sheet
 * (which writes back into the same rows every five minutes) both land here.
 *
 * ── Why it is laid out by BRANCH ──
 *
 * The first draft was three flat lists — working days, weekly hours, dates —
 * each repeating the branch on every row, and for a consultant who works at
 * both it took real effort to answer "what is my Tuesday at Greenhills".
 * An interbranch consultant does not have one week; they have one week per
 * clinic, and the question they arrive with is always "where am I, and when".
 *
 * So: one card per branch, holding everything about that branch — the window,
 * the weekly hours, and the coming dates. Nothing repeats the branch inside
 * its own card, because the card already said it.
 *
 * Booked hours plus the working window, not a drawn grid. The hub computes an
 * empty cell from the config at render time — an open hour is not a row in any
 * table — so reproducing the grid here would mean a second copy of that
 * arithmetic, free to drift from the hub's.
 */

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, CalendarDays, Clock, Info, Loader2, MapPin, UserPlus } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { branchLabel } from '@/lib/branch-label'
import { CARD_STYLE, EmptyState, SUBTLE_BG } from '@/components/hub/ui'

interface SlotOut {
  id: string
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
  patient: { id: string; firstName: string; lastName: string } | null
}

interface ConfigOut {
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

const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const DAY_SHORT: Record<string, string> = {
  MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
}
const DAY_FULL: Record<string, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday',
  FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
}
const MODE_LABEL: Record<string, string> = {
  ONSITE: 'On-site', TELETHERAPY: 'Teletherapy', HOMECARE: 'Homecare',
}

const MAKEUP_FG = '#C2410C'
const MAKEUP_BG = '#FFF7F1'
const MAKEUP_BORDER = '#FBD5BC'
const PAY_STYLE: Record<string, { bg: string; fg: string }> = {
  CASH: { bg: '#EFF6FF', fg: '#1D4ED8' },
  HMO:  { bg: '#F5F3FF', fg: '#6D28D9' },
  GL:   { bg: '#FFF7ED', fg: '#9A3412' },
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-PH', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

/** "in 3 days", "Tomorrow" — so a date reads without counting on a calendar. */
function relativeDay(iso: string, todayIso: string): string | null {
  const a = new Date(`${iso}T00:00:00Z`).getTime()
  const b = new Date(`${todayIso}T00:00:00Z`).getTime()
  const days = Math.round((a - b) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days > 1 && days <= 14) return `in ${days} days`
  return null
}

/** The window a config describes, as one readable line. */
function windowLine(c: ConfigOut): string {
  const bits = [`${formatTime(c.startTime)} – ${formatTime(c.endTime)}`]
  if (c.slotsPerDay) bits.push(`${c.slotsPerDay} patients a day`)
  else if (c.slotMinutes) bits.push(`${c.slotMinutes} min each`)
  if (c.breakStart) {
    bits.push(`break ${formatTime(c.breakStart)}${c.breakMinutes ? ` (${c.breakMinutes} min)` : ''}`)
  }
  return bits.join(' · ')
}

export default function DeckingBoard() {
  const [data, setData] = useState<{ today: string; configs: ConfigOut[]; weekly: SlotOut[]; dated: SlotOut[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const ctl = new AbortController()
    setLoading(true); setError('')
    fetch('/api/decking', { cache: 'no-store', signal: ctl.signal })
      .then(async r => {
        const d = await r.json().catch(() => null)
        if (!r.ok || !d) throw new Error(d?.error ?? 'Could not load your decking.')
        setData(d)
      })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => setLoading(false))
    return () => ctl.abort()
  }, [])

  /** Everything this consultant has, gathered under the clinic it belongs to. */
  const branches = useMemo(() => {
    if (!data) return []
    const keys = [...new Set([
      ...data.configs.map(c => c.branch),
      ...data.weekly.map(s => s.branch),
      ...data.dated.map(s => s.branch),
    ])].sort()
    return keys.map(branch => {
      const configs = data.configs.filter(c => c.branch === branch)
      const weekly = data.weekly.filter(s => s.branch === branch)
      const dated = data.dated.filter(s => s.branch === branch)
      // Days worth a row: configured anywhere in this branch, or booked.
      const days = DAY_ORDER.filter(d =>
        configs.some(c => c.workDays.includes(d)) || weekly.some(s => s.dayOfWeek === d))
      const departments = [...new Set([
        ...configs.map(c => c.department),
        ...weekly.map(s => s.department),
        ...dated.map(s => s.department),
      ])]
      return { branch, configs, weekly, dated, days, departments }
    })
  }, [data])

  if (loading) {
    return (
      <div className="rounded-xl px-5 py-12 flex items-center justify-center gap-2 text-sm"
        style={{ ...CARD_STYLE, color: 'var(--mid-gray)' }}>
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

  return (
    <div className="space-y-4 min-w-0">
      {/* One line, not a paragraph. It used to be four lines of bold across
          the top of the page, which is a lot of shouting for a thing that is
          true every day and actionable on about one of them. */}
      <p className="flex items-start gap-2 text-[12.5px] leading-relaxed rounded-lg px-3.5 py-2.5 m-0"
        style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#7A5C00' }}>
        <Info size={14} className="flex-shrink-0 mt-0.5" aria-hidden />
        <span>
          This is front desk&rsquo;s board, shown as they keep it.{' '}
          <strong>Not up to date? Ask front desk to update it</strong> — it cannot be changed here.
        </span>
      </p>

      {branches.length === 0 ? (
        <div className="rounded-xl" style={CARD_STYLE}>
          <EmptyState
            title="Nothing on the board for you yet"
            hint="Front desk have not set up a schedule or booked any hours under your name. Ask them to set it up."
          />
        </div>
      ) : (
        branches.map(b => (
          <BranchCard key={b.branch} {...b} today={data!.today} />
        ))
      )}
    </div>
  )
}

/**
 * One clinic: the window, the week, and the coming dates.
 *
 * Self-contained on purpose. The branch is said once, in the header, and
 * never again inside — a chip on every row repeating what the card already
 * says is the noise the first version was made of.
 */
function BranchCard({ branch, configs, weekly, dated, days, departments, today }: {
  branch: string
  configs: ConfigOut[]
  weekly: SlotOut[]
  dated: SlotOut[]
  days: string[]
  departments: string[]
  today: string
}) {
  const bookedCount = weekly.length
  // A config with no days is not a weekly schedule. Saying "No days set"
  // three times down the page told the clinician nothing; what it actually
  // means is that this service is booked date by date, which IS how
  // psychology and the doctors work — so say that instead.
  const scheduled = configs.filter(c => c.workDays.length > 0)
  const byDate = configs.filter(c => c.workDays.length === 0)

  return (
    <section className="rounded-xl overflow-hidden" style={CARD_STYLE}>
      {/* ── Header: where you are ── */}
      <header className="px-4 py-3 flex flex-wrap items-center gap-x-2.5 gap-y-1"
        style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}>
        <MapPin size={15} style={{ color: 'var(--deep-teal)' }} aria-hidden />
        <h3 className="text-[14px] font-bold m-0"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          {branchLabel(branch) ?? branch}
        </h3>
        {departments.map(d => (
          <span key={d} className="text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide"
            style={{ background: '#fff', color: 'var(--deep-teal)', border: '1px solid var(--light-gray)' }}>
            {d}
          </span>
        ))}
        <span className="ml-auto text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>
          {bookedCount > 0 ? `${bookedCount} weekly ${bookedCount === 1 ? 'hour' : 'hours'}` : 'no weekly hours'}
          {dated.length > 0 ? ` · ${dated.length} dated` : ''}
        </span>
      </header>

      {/* ── The window, one line per service ── */}
      <div className="px-4 py-2.5 flex flex-col gap-1.5"
        style={{ borderBottom: '1px solid var(--light-gray)' }}>
        {scheduled.map((c, i) => (
          <p key={`s${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] m-0"
            style={{ color: 'var(--mid-gray)' }}>
            <Clock size={12} className="flex-shrink-0" aria-hidden />
            {c.deliveryMode && (
              <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>
                {MODE_LABEL[c.deliveryMode] ?? c.deliveryMode}
              </span>
            )}
            <span className="font-semibold" style={{ color: 'var(--deep-teal)' }}>
              {DAY_ORDER.filter(d => c.workDays.includes(d)).map(d => DAY_SHORT[d]).join(' · ')}
            </span>
            <span>{windowLine(c)}</span>
          </p>
        ))}
        {byDate.map((c, i) => (
          <p key={`d${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] m-0"
            style={{ color: 'var(--mid-gray)' }}>
            <CalendarClock size={12} className="flex-shrink-0" aria-hidden />
            {c.deliveryMode && (
              <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>
                {MODE_LABEL[c.deliveryMode] ?? c.deliveryMode}
              </span>
            )}
            <span>Booked date by date, no fixed weekly days &middot; {windowLine(c)}</span>
          </p>
        ))}
        {configs.length === 0 && (
          <p className="text-[12.5px] m-0" style={{ color: 'var(--mid-gray)' }}>
            No working hours set for this branch.
          </p>
        )}
      </div>

      {/* ── The week ── */}
      {days.length > 0 && (
        <div className="divide-y" style={{ borderColor: 'var(--light-gray)' }}>
          {days.map(day => {
            const rows = weekly.filter(s => s.dayOfWeek === day)
            return (
              <div key={day} className="flex items-stretch">
                {/* Day rail — fixed width so every day lines up down the card. */}
                <div className="w-[88px] flex-shrink-0 px-3 py-2.5"
                  style={{ background: rows.length ? '#FBFDF6' : '#fff', borderRight: '1px solid var(--light-gray)' }}>
                  <p className="text-[12px] font-bold m-0"
                    style={{ fontFamily: 'var(--font-display)', color: rows.length ? 'var(--deep-teal)' : 'var(--mid-gray)' }}>
                    {DAY_FULL[day]}
                  </p>
                  <p className="text-[10.5px] m-0 mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                    {rows.length === 0 ? 'free' : `${rows.length} ${rows.length === 1 ? 'hour' : 'hours'}`}
                  </p>
                </div>
                <div className="flex-1 min-w-0 px-3 py-2">
                  {rows.length === 0 ? (
                    <p className="text-[12px] m-0 py-1" style={{ color: '#9AA5A0' }}>Nothing booked</p>
                  ) : (
                    <ul className="flex flex-col gap-1 m-0 p-0 list-none">
                      {rows.map(s => <SlotRow key={s.id} slot={s} />)}
                    </ul>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Coming dates, inside the branch they belong to ──
          A one-off is never drawn in a weekday column: there it would read as
          "every Tuesday", which is the one thing it must not say. For
          psychology and the doctors these dates ARE the schedule. */}
      {dated.length > 0 && (
        <div style={{ borderTop: '1px solid var(--light-gray)' }}>
          <p className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider m-0 flex items-center gap-1.5"
            style={{ background: MAKEUP_BG, color: MAKEUP_FG, borderBottom: `1px solid ${MAKEUP_BORDER}` }}>
            <CalendarDays size={12} aria-hidden /> Coming dates
            <span className="font-normal normal-case tracking-normal text-[11px]" style={{ color: '#9A6B4A' }}>
              single dates — these do not repeat
            </span>
          </p>
          <div className="divide-y" style={{ borderColor: 'var(--light-gray)' }}>
            {[...new Set(dated.map(s => s.date!))].sort().map(date => {
              const rel = relativeDay(date, today)
              return (
                <div key={date} className="flex items-stretch">
                  <div className="w-[160px] flex-shrink-0 px-3 py-2.5"
                    style={{ background: '#FFFCFA', borderRight: '1px solid var(--light-gray)' }}>
                    <p className="text-[12px] font-bold m-0"
                      style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                      {fmtDate(date)}
                    </p>
                    {rel && (
                      <p className="text-[10.5px] m-0 mt-0.5 font-semibold" style={{ color: MAKEUP_FG }}>{rel}</p>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 px-3 py-2">
                    <ul className="flex flex-col gap-1 m-0 p-0 list-none">
                      {dated.filter(s => s.date === date).map(s => <SlotRow key={s.id} slot={s} />)}
                    </ul>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

/** One hour: when, who, and how it is paid. */
function SlotRow({ slot }: { slot: SlotOut }) {
  const pay = PAY_STYLE[slot.paymentType] ?? PAY_STYLE.CASH
  return (
    <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg px-2.5 py-1.5"
      style={{
        background: slot.isMakeup ? MAKEUP_BG : '#fff',
        border: `1px solid ${slot.isMakeup ? MAKEUP_BORDER : 'var(--light-gray)'}`,
      }}>
      <span className="text-[12.5px] font-semibold tabular-nums whitespace-nowrap"
        style={{ color: 'var(--charcoal)' }}>
        {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
      </span>
      {slot.isMakeup && (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
          style={{ background: '#FFF1E8', color: MAKEUP_FG, border: `1px solid ${MAKEUP_BORDER}` }}>
          <UserPlus size={9} aria-hidden /> Make-up
        </span>
      )}
      <span className="text-[12.5px] truncate min-w-0 flex-1" style={{ color: 'var(--charcoal)' }}>
        {slot.isClass
          ? 'Class'
          : slot.patient
            ? `${slot.patient.lastName}, ${slot.patient.firstName}`
            : <span style={{ color: '#9AA5A0' }}>Open — no patient booked</span>}
      </span>
      {!slot.isClass && slot.patient && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
          style={{ background: pay.bg, color: pay.fg }}
          title={slot.hmoProvider ?? undefined}>
          {slot.paymentType === 'HMO' && slot.hmoProvider ? slot.hmoProvider : slot.paymentType}
        </span>
      )}
      {slot.notes && (
        <span className="basis-full text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>
          {slot.notes}
        </span>
      )}
    </li>
  )
}
