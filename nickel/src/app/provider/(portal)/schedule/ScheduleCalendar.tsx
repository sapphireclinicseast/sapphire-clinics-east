'use client'

import { useMemo, useState } from 'react'

export interface CalSession { id: string; date: string; startTime: string; endTime: string; patientName: string; status: string; rescheduled?: boolean }
type View = 'day' | 'week' | 'month'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}` }
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const startOfWeek = (d: Date) => addDays(d, -d.getDay())

// Nickel palette per status.
function chipStyle(s: CalSession): { bg: string; text: string; dash: boolean } {
  if (s.rescheduled) return { bg: 'var(--mist)', text: 'var(--steel-deep,#1e4b7d)', dash: true }
  switch (s.status) {
    case 'CONFIRMED': return { bg: 'var(--mist-2,#eaf1fa)', text: 'var(--steel-deep,#1e4b7d)', dash: false }
    case 'PAID': case 'PENDING': return { bg: '#faedd6', text: '#8a5a12', dash: false }
    case 'COMPLETED': return { bg: 'var(--steel,#2f6bb0)', text: '#ffffff', dash: false }
    case 'CANCELLED': return { bg: '#fbe4e4', text: '#a12', dash: false }
    default: return { bg: 'var(--mist)', text: 'var(--slate)', dash: false }
  }
}

function Chip({ s }: { s: CalSession }) {
  const c = chipStyle(s)
  return (
    <div className="truncate rounded-md px-1.5 py-1 text-[11px] font-medium" style={{ background: c.bg, color: c.text, border: c.dash ? '1px dashed currentColor' : 'none' }} title={`${fmtTime(s.startTime)} · ${s.patientName}`}>
      {fmtTime(s.startTime)} {s.patientName}
    </div>
  )
}

export default function ScheduleCalendar({ sessions }: { sessions: CalSession[] }) {
  const [view, setView] = useState<View>('week')
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const byDay = useMemo(() => { const m = new Map<string, CalSession[]>(); for (const s of sessions) { const a = m.get(s.date) ?? []; a.push(s); m.set(s.date, a) } for (const a of m.values()) a.sort((x, y) => x.startTime.localeCompare(y.startTime)); return m }, [sessions])

  const step = (dir: number) => setAnchor((d) => view === 'day' ? addDays(d, dir) : view === 'week' ? addDays(d, dir * 7) : new Date(d.getFullYear(), d.getMonth() + dir, 1))
  const today = new Date(); const todayStr = ymd(today)

  let label = ''
  if (view === 'day') label = `${DOW[anchor.getDay()]}, ${MON[anchor.getMonth()]} ${anchor.getDate()}, ${anchor.getFullYear()}`
  else if (view === 'week') { const s = startOfWeek(anchor); const e = addDays(s, 6); label = `${MON[s.getMonth()]} ${s.getDate()} – ${MON[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}` }
  else label = `${MON[anchor.getMonth()]} ${anchor.getFullYear()}`

  return (
    <section className="card">
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setAnchor(new Date())} className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[12.5px] font-medium hover:bg-[color:var(--mist)]">Today</button>
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} aria-label="Previous" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--line-2)] hover:bg-[color:var(--mist)]">‹</button>
          <button onClick={() => step(1)} aria-label="Next" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--line-2)] hover:bg-[color:var(--mist)]">›</button>
        </div>
        <div className="text-[14px] font-semibold text-[color:var(--ink)]">{label}</div>
        <div className="ml-auto flex rounded-lg border border-[color:var(--line)] p-0.5 text-[12.5px]">
          {(['day', 'week', 'month'] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 font-medium capitalize ${view === v ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)]'}`}>{v}</button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-[color:var(--slate)]">
        <span className="font-semibold text-[color:var(--muted)]">Legend:</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: 'var(--mist-2,#eaf1fa)', border: '1px solid var(--steel,#2f6bb0)' }} /> Confirmed</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: '#faedd6' }} /> Pending</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: 'var(--steel,#2f6bb0)' }} /> Completed</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: '#fbe4e4' }} /> Cancelled</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-dashed border-[color:var(--steel)]" /> Rescheduled</span>
      </div>

      {view === 'day' && (() => {
        const list = byDay.get(ymd(anchor)) ?? []
        return (
          <div className="rounded-xl border border-[color:var(--line)] p-3">
            {list.length === 0 ? <p className="py-6 text-center text-[13px] text-[color:var(--slate)]">No sessions this day.</p> : (
              <div className="space-y-1.5">{list.map((s) => <Chip key={s.id} s={s} />)}</div>
            )}
          </div>
        )
      })()}

      {view === 'week' && (() => {
        const s0 = startOfWeek(anchor)
        return (
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => {
              const d = addDays(s0, i); const key = ymd(d); const list = byDay.get(key) ?? []; const isToday = key === todayStr
              return (
                <div key={i} className={`min-h-[120px] rounded-xl border p-1.5 ${isToday ? 'border-[color:var(--steel)] bg-[color:var(--mist)]' : 'border-[color:var(--line)]'}`}>
                  <div className="mb-1 flex items-baseline justify-between px-0.5">
                    <span className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">{DOW[d.getDay()]}</span>
                    <span className={`text-[13px] font-semibold ${isToday ? 'text-[color:var(--steel)]' : 'text-[color:var(--ink)]'}`}>{d.getDate()}</span>
                  </div>
                  <div className="space-y-1">{list.map((s) => <Chip key={s.id} s={s} />)}</div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {view === 'month' && (() => {
        const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
        const gridStart = startOfWeek(first)
        const weeks = Array.from({ length: 6 }).map((_, w) => Array.from({ length: 7 }).map((_, i) => addDays(gridStart, w * 7 + i)))
        return (
          <div>
            <div className="mb-1 grid grid-cols-7 gap-1.5 text-center text-[10px] uppercase tracking-wide text-[color:var(--muted)]">{DOW.map((d) => <div key={d}>{d}</div>)}</div>
            <div className="space-y-1.5">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1.5">
                  {week.map((d, i) => {
                    const key = ymd(d); const list = byDay.get(key) ?? []; const inMonth = d.getMonth() === anchor.getMonth(); const isToday = key === todayStr
                    return (
                      <div key={i} className={`min-h-[76px] rounded-lg border p-1 ${isToday ? 'border-[color:var(--steel)] bg-[color:var(--mist)]' : 'border-[color:var(--line)]'} ${inMonth ? '' : 'opacity-40'}`}>
                        <div className={`px-0.5 text-right text-[12px] font-semibold ${isToday ? 'text-[color:var(--steel)]' : 'text-[color:var(--ink)]'}`}>{d.getDate()}</div>
                        <div className="space-y-0.5">
                          {list.slice(0, 2).map((s) => <Chip key={s.id} s={s} />)}
                          {list.length > 2 && <div className="px-1 text-[10.5px] text-[color:var(--muted)]">+{list.length - 2} more</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </section>
  )
}
