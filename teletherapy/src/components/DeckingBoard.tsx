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
 * Booked hours plus the working window, not a drawn grid. The hub computes an
 * empty cell from the config at render time — an open hour is not a row in any
 * table — so reproducing the grid here would mean a second copy of that
 * arithmetic, free to drift from the hub's. The window is stated instead, and
 * the hours that are actually taken are listed under it.
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, CalendarPlus, Info, Loader2, UserPlus } from 'lucide-react'
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
  patientsPerDay: number | null
}

const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const DAY_FULL: Record<string, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday',
  FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
}
const MODE_LABEL: Record<string, string> = {
  ONSITE: 'On-site', TELETHERAPY: 'Teletherapy', HOMECARE: 'Homecare',
}

const MAKEUP_FG = '#C2410C'
const PAY_STYLE: Record<string, { bg: string; fg: string }> = {
  CASH: { bg: '#EFF6FF', fg: '#1D4ED8' },
  HMO:  { bg: '#F5F3FF', fg: '#6D28D9' },
  GL:   { bg: '#FFF7ED', fg: '#9A3412' },
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-PH', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

/** "On-site · East Branch · OT" — the heading for one working pattern. */
function configTitle(c: ConfigOut): string {
  const parts = [branchLabel(c.branch) ?? c.branch, c.department]
  if (c.deliveryMode) parts.unshift(MODE_LABEL[c.deliveryMode] ?? c.deliveryMode)
  return parts.join(' · ')
}

export default function DeckingBoard({ staffId }: { staffId?: string | null }) {
  const [data, setData] = useState<{ configs: ConfigOut[]; weekly: SlotOut[]; dated: SlotOut[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const ctl = new AbortController()
    setLoading(true); setError('')
    fetch(`/api/decking${staffId ? `?staffId=${encodeURIComponent(staffId)}` : ''}`,
      { cache: 'no-store', signal: ctl.signal })
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Could not load your decking.')
        setData(d)
      })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => setLoading(false))
    return () => ctl.abort()
  }, [staffId])

  // Days with something on them, in week order. A consultant whose config
  // says Mon–Fri but who has nothing booked on Wednesday still sees
  // Wednesday — an empty column IS the information on a board like this.
  const days = useMemo(() => {
    if (!data) return []
    const configured = new Set(data.configs.flatMap(c => c.workDays))
    const booked = new Set(data.weekly.map(s => s.dayOfWeek))
    return DAY_ORDER.filter(d => configured.has(d) || booked.has(d))
  }, [data])

  const totalBooked = data?.weekly.length ?? 0

  if (loading) {
    return (
      <div className="rounded-xl px-5 py-10 flex items-center justify-center gap-2 text-sm"
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

  const nothingAtAll = !data || (data.configs.length === 0 && totalBooked === 0 && data.dated.length === 0)

  return (
    <div className="space-y-4 min-w-0">
      {/* The note. It is the point of the page as much as the board is: a
          consultant looking at a wrong schedule needs to know whose it is to
          fix, and that it is not fixed here. */}
      <div role="note" className="rounded-xl px-4 py-3 flex gap-2.5"
        style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
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
          <EmptyState
            title="Nothing on the board for you yet"
            hint="Front desk have not set up a schedule or booked any hours under your name. Ask them to set it up."
          />
        </div>
      ) : (
        <>
          {/* ── The working window, per branch / service ── */}
          {data!.configs.length > 0 && (
            <section className="rounded-xl overflow-hidden" style={CARD_STYLE}>
              <header className="px-4 py-2.5 flex items-center gap-2"
                style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}>
                <CalendarDays size={14} style={{ color: 'var(--deep-teal)' }} aria-hidden />
                <h3 className="text-[13px] font-bold m-0"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                  Your working days
                </h3>
              </header>
              <ul className="divide-y" style={{ borderColor: 'var(--light-gray)' }}>
                {data!.configs.map((c, i) => (
                  <li key={`${c.branch}-${c.department}-${c.deliveryMode ?? 'general'}-${i}`} className="px-4 py-3">
                    <p className="text-[13px] font-semibold m-0" style={{ color: 'var(--charcoal)' }}>
                      {configTitle(c)}
                    </p>
                    <p className="text-[12.5px] mt-1 m-0" style={{ color: 'var(--mid-gray)' }}>
                      {c.workDays.length > 0
                        ? DAY_ORDER.filter(d => c.workDays.includes(d)).map(d => DAY_FULL[d].slice(0, 3)).join(' · ')
                        : 'No days set'}
                      {' — '}
                      {formatTime(c.startTime)} to {formatTime(c.endTime)}
                      {c.patientsPerDay ? ` · up to ${c.patientsPerDay} patients a day` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── The booked hours, by weekday ── */}
          <section className="rounded-xl overflow-hidden" style={CARD_STYLE}>
            <header className="px-4 py-2.5 flex flex-wrap items-center gap-2"
              style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}>
              <h3 className="text-[13px] font-bold m-0"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                Booked hours each week
              </h3>
              <span className="text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>
                {totalBooked} {totalBooked === 1 ? 'hour' : 'hours'} held
              </span>
            </header>

            {days.length === 0 ? (
              <div className="px-4 py-6 text-[13px]" style={{ color: 'var(--mid-gray)' }}>
                No weekly hours on the board. Anything arranged for a single date is listed below.
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--light-gray)' }}>
                {days.map(day => {
                  const rows = data!.weekly.filter(s => s.dayOfWeek === day)
                  return (
                    <div key={day} className="px-4 py-3 flex flex-wrap gap-x-4 gap-y-2">
                      <p className="text-[12.5px] font-bold w-[92px] flex-shrink-0 m-0"
                        style={{ fontFamily: 'var(--font-display)', color: 'var(--deep-teal)' }}>
                        {DAY_FULL[day]}
                      </p>
                      {rows.length === 0 ? (
                        <p className="text-[12.5px] m-0" style={{ color: 'var(--mid-gray)' }}>
                          Nothing booked
                        </p>
                      ) : (
                        <ul className="flex-1 min-w-[200px] flex flex-col gap-1.5 m-0 p-0 list-none">
                          {rows.map(s => <SlotRow key={s.id} slot={s} />)}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* ── One-off and make-up dates ──
              Kept out of the weekday columns above. A one-off drawn in its
              weekday column reads as "every Tuesday", which is exactly the
              claim it must not make — and for psychology and the doctors,
              whose boards are dated blocks rather than a standing week, this
              IS their schedule. */}
          {data!.dated.length > 0 && (
            <section className="rounded-xl overflow-hidden" style={CARD_STYLE}>
              <header className="px-4 py-2.5 flex items-center gap-2"
                style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}>
                <CalendarPlus size={14} style={{ color: MAKEUP_FG }} aria-hidden />
                <h3 className="text-[13px] font-bold m-0"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                  Coming dates
                </h3>
                <span className="text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>
                  single dates only — these do not repeat
                </span>
              </header>
              <div className="divide-y" style={{ borderColor: 'var(--light-gray)' }}>
                {[...new Set(data!.dated.map(s => s.date!))].sort().map(date => (
                  <div key={date} className="px-4 py-3 flex flex-wrap gap-x-4 gap-y-2">
                    <p className="text-[12.5px] font-bold w-[150px] flex-shrink-0 m-0"
                      style={{ fontFamily: 'var(--font-display)', color: 'var(--deep-teal)' }}>
                      {fmtDate(date)}
                    </p>
                    <ul className="flex-1 min-w-[200px] flex flex-col gap-1.5 m-0 p-0 list-none">
                      {data!.dated.filter(s => s.date === date).map(s => <SlotRow key={s.id} slot={s} />)}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

/** One hour: when, who, and how it is paid. */
function SlotRow({ slot }: { slot: SlotOut }) {
  const pay = PAY_STYLE[slot.paymentType] ?? PAY_STYLE.CASH
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-1.5"
      style={{
        background: slot.isMakeup ? '#FFFBF8' : '#fff',
        border: `1px solid ${slot.isMakeup ? '#FBD5BC' : 'var(--light-gray)'}`,
      }}>
      <span className="text-[12.5px] font-semibold tabular-nums whitespace-nowrap"
        style={{ color: 'var(--charcoal)' }}>
        {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
      </span>
      {slot.isMakeup && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
          style={{ background: '#FFF1E8', color: MAKEUP_FG, border: '1px solid #FBD5BC' }}>
          <UserPlus size={9} className="inline -mt-px mr-0.5" aria-hidden />Make-up
        </span>
      )}
      <span className="text-[12.5px] truncate min-w-0" style={{ color: 'var(--charcoal)' }}>
        {slot.isClass
          ? 'Class'
          : slot.patient
            ? `${slot.patient.lastName}, ${slot.patient.firstName}`
            : <em style={{ color: 'var(--mid-gray)' }}>Open — no patient booked</em>}
      </span>
      {!slot.isClass && slot.patient && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ml-auto"
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
