'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession } from '@/lib/session'
import { listAvailableSlots, type AvailableSlot } from '@/lib/api'

export default function BookSlotsPageWrapper() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
      <BookSlotsPage />
    </Suspense>
  )
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function fmtYMD(d: Date) { return d.toISOString().slice(0, 10) }
function fmtNice(d: Date) { return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }

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
      } catch (e) {
        if (!cancelled) setErr((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (branch && department) load()
    return () => { cancelled = true }
  }, [branch, department, weekStart])

  const daysOfWeek = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const byDay = useMemo(() => {
    const map = new Map<string, AvailableSlot[]>()
    for (const s of slots) {
      const arr = map.get(s.date) ?? []
      arr.push(s); map.set(s.date, arr)
    }
    for (const arr of map.values()) arr.sort((a, b) => a.startTime.localeCompare(b.startTime))
    return map
  }, [slots])

  function choose(slot: AvailableSlot) {
    const qs = new URLSearchParams({
      branch, department,
      staffId: slot.staffId,
      initials: slot.initials,
      sex: slot.sex ?? '',
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
    }).toString()
    router.push(`/book/confirm?${qs}`)
  }

  function sexIcon(sex: 'M' | 'F' | null) {
    if (sex === 'M') return <span title="Male" className="text-sky-600">♂</span>
    if (sex === 'F') return <span title="Female" className="text-pink-600">♀</span>
    return null
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Pick a slot</h1>
          <p className="text-xs text-slate-500">{branch} · {department}</p>
        </div>
        <div className="text-xs text-slate-500">Step 2 of 3</div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button className="px-2 py-1 border rounded text-sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</button>
        <div className="text-sm font-medium">{fmtNice(weekStart)} – {fmtNice(addDays(weekStart, 6))}</div>
        <button className="px-2 py-1 border rounded text-sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
      </div>

      {err && <div className="text-sm text-rose-600 mb-2">{err}</div>}
      {loading && <div className="text-sm text-slate-500">Loading…</div>}

      <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
        {daysOfWeek.map((d) => {
          const key = fmtYMD(d)
          const list = byDay.get(key) ?? []
          return (
            <div key={key} className="bg-white border rounded-lg p-2 min-h-[140px]">
              <div className="text-xs font-semibold text-slate-700">{fmtNice(d)}</div>
              <div className="mt-1 space-y-1">
                {list.length === 0 && <div className="text-xs text-slate-400 italic">No slots</div>}
                {list.map((s, i) => (
                  <button
                    key={`${s.staffId}-${s.startTime}-${i}`}
                    onClick={() => choose(s)}
                    className="w-full text-left px-2 py-1 rounded bg-teal-50 hover:bg-teal-100 border border-teal-200 text-xs flex items-center justify-between"
                  >
                    <span className="font-mono font-semibold">{s.startTime}</span>
                    <span className="text-slate-600 flex items-center gap-1">{s.initials} {sexIcon(s.sex)}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
