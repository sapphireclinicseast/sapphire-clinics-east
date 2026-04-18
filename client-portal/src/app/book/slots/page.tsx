'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession } from '@/lib/session'
import { listAvailableSlots, type AvailableSlot } from '@/lib/api'

export default function BookSlotsPageWrapper() {
  return (
    <Suspense fallback={<div className="text-sm text-[color:var(--mid-gray)]">Loading…</div>}>
      <BookSlotsPage />
    </Suspense>
  )
}

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function fmtYMD(d: Date) { return d.toISOString().slice(0, 10) }
function fmtWeekday(d: Date) { return d.toLocaleDateString('en-US', { weekday: 'short' }) }
function fmtDay(d: Date) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
function isToday(d: Date) { const t = new Date(); return d.toDateString() === t.toDateString() }

function BookSlotsPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const branch = sp.get('branch') ?? ''
  const department = sp.get('department') ?? ''

  const [weekStart, setWeekStart] = useState<Date>(() => new Date())
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!getSession()) { router.push('/'); return }
    if (!branch || !department) { router.push('/book'); return }
  }, [router, branch, department])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setErr(null)
      try {
        const from = fmtYMD(weekStart)
        const to = fmtYMD(addDays(weekStart, 6))
        const r = await listAvailableSlots(branch, department, from, to)
        if (!cancelled) setSlots(r.slots)
      } catch (e) { if (!cancelled) setErr((e as Error).message) } finally { if (!cancelled) setLoading(false) }
    }
    if (branch && department) load()
    return () => { cancelled = true }
  }, [branch, department, weekStart])

  const daysOfWeek = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const byDay = useMemo(() => {
    const map = new Map<string, AvailableSlot[]>()
    for (const s of slots) {
      const arr = map.get(s.date) ?? []; arr.push(s); map.set(s.date, arr)
    }
    for (const arr of map.values()) arr.sort((a, b) => a.startTime.localeCompare(b.startTime))
    return map
  }, [slots])

  function choose(slot: AvailableSlot) {
    const qs = new URLSearchParams({
      branch, department, staffId: slot.staffId, initials: slot.initials,
      sex: slot.sex ?? '', date: slot.date, startTime: slot.startTime, endTime: slot.endTime,
    }).toString()
    router.push(`/book/confirm?${qs}`)
  }

  const totalSlots = slots.length

  return (
    <div className="animate-fade-up">
      <StepHeader active={2} />

      <div className="card-static">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h1 className="text-[28px] text-[color:var(--deep-teal)] leading-tight">Pick a slot</h1>
            <p className="text-sm text-[color:var(--mid-gray)] mt-1">
              <span className="px-2 py-0.5 rounded-md bg-[color:var(--pale-teal)] text-[color:var(--deep-teal)] text-xs font-semibold mr-1.5" style={{ fontFamily: 'var(--font-display)' }}>{branch}</span>
              <span className="px-2 py-0.5 rounded-md bg-[color:var(--pale-teal)] text-[color:var(--deep-teal)] text-xs font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{department}</span>
              <span className="ml-3 text-[color:var(--mid-gray)]">{loading ? '…' : `${totalSlots} slots this week`}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5" style={{ fontFamily: 'var(--font-display)' }}>
            <button className="btn-secondary !py-1.5 !px-3 !text-[12.5px]" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</button>
            <button className="btn-secondary !py-1.5 !px-3 !text-[12.5px]" onClick={() => setWeekStart(new Date())}>This week</button>
            <button className="btn-secondary !py-1.5 !px-3 !text-[12.5px]" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
          </div>
        </div>

        {err && <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800 mb-4">{err}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
          {daysOfWeek.map((d, i) => {
            const key = fmtYMD(d)
            const list = byDay.get(key) ?? []
            const today = isToday(d)
            return (
              <div key={key} className={`day-col animate-fade-up stagger-${Math.min(i+1,7)} ${today ? 'ring-2 ring-[color:var(--gold)] ring-offset-2 ring-offset-[color:var(--off-white)]' : ''}`}>
                <div className="day-col-header flex items-center justify-between">
                  <span>{fmtWeekday(d)}</span>
                  <span className={today ? 'text-[color:var(--gold)] font-bold' : ''}>{fmtDay(d)}</span>
                </div>
                <div className="space-y-1.5">
                  {loading && <div className="h-6 rounded bg-[color:var(--pale-teal)] animate-pulse"></div>}
                  {!loading && list.length === 0 && (
                    <div className="text-[11px] text-[color:var(--mid-gray)] italic py-1">No slots</div>
                  )}
                  {list.map((s, idx) => (
                    <button
                      key={`${s.staffId}-${s.startTime}-${idx}`}
                      onClick={() => choose(s)}
                      className="slot-tile w-full"
                    >
                      <span className="slot-tile-time">{s.startTime}</span>
                      <span className="flex items-center gap-1 text-[color:var(--mid-gray)]">
                        {s.initials}
                        <SexIcon sex={s.sex} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-2 mt-6 text-[11.5px] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
          <Legend color="bg-[color:var(--gold)]" label="Today" />
          <span className="mx-1">·</span>
          <span className="inline-flex items-center gap-1"><span className="text-sky-600">♂</span> Male</span>
          <span className="mx-0.5">·</span>
          <span className="inline-flex items-center gap-1"><span className="text-pink-600">♀</span> Female</span>
        </div>
      </div>
    </div>
  )
}

function SexIcon({ sex }: { sex: 'M' | 'F' | null }) {
  if (sex === 'M') return <span title="Male" className="text-sky-600">♂</span>
  if (sex === 'F') return <span title="Female" className="text-pink-600">♀</span>
  return null
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${color}`}></span>{label}</span>
}

function StepHeader({ active }: { active: 1 | 2 | 3 }) {
  const steps = ['Service', 'Slot', 'Confirm']
  return (
    <div className="flex items-center gap-3 mb-6" style={{ fontFamily: 'var(--font-display)' }}>
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const state = n === active ? 'active' : n < active ? 'done' : 'todo'
        return (
          <div key={label} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`step-dot ${state === 'active' ? 'step-dot-active' : state === 'done' ? 'step-dot-done' : ''}`}></span>
              <span className={`text-[11.5px] uppercase tracking-[0.12em] ${state === 'active' ? 'text-[color:var(--gold)] font-semibold' : state === 'done' ? 'text-[color:var(--teal)]' : 'text-[color:var(--mid-gray)]'}`}>
                {n}. {label}
              </span>
            </div>
            {i < steps.length - 1 && <span className="w-6 h-px bg-[color:var(--light-gray)]"></span>}
          </div>
        )
      })}
    </div>
  )
}
