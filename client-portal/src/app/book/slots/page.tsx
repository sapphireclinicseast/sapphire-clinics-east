'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession } from '@/lib/session'
import { listTherapists, listAvailableSlots, type AvailableSlot, type Therapist, type SlotChoice } from '@/lib/api'

export default function BookSlotsPageWrapper() {
  return (
    <Suspense fallback={<div className="text-sm text-[color:var(--mid-gray)]">Loading…</div>}>
      <BookSlotsPage />
    </Suspense>
  )
}

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
// Format a Date as YYYY-MM-DD in the BROWSER's local calendar — NOT UTC.
// Using toISOString() here would shift Asia/Manila (UTC+8) dates back by one
// day at local midnight, labelling Monday's column as Sunday's YMD and
// causing the server to confirm the wrong calendar day.
function fmtYMD(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function fmtWeekday(d: Date) { return d.toLocaleDateString('en-US', { weekday: 'short' }) }
function fmtDay(d: Date) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
function fmtRange(a: Date, b: Date) {
  return `${a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}
function isToday(d: Date) { const t = new Date(); return d.toDateString() === t.toDateString() }
// Snap a date to the Sunday that starts its week (in local time).
function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate()) // local midnight
  r.setDate(r.getDate() - r.getDay())
  return r
}

function BookSlotsPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const branch = sp.get('branch') ?? ''
  const department = sp.get('department') ?? ''

  const [therapists, setTherapists] = useState<Therapist[]>([])
  const [loadingTherapists, setLoadingTherapists] = useState(true)
  const [selectedTherapist, setSelectedTherapist] = useState<Therapist | null>(null)

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Up to 3 picks in order (1st, 2nd, 3rd)
  const [picks, setPicks] = useState<SlotChoice[]>([])

  useEffect(() => {
    if (!getSession()) { router.push('/'); return }
    if (!branch || !department) { router.push('/book'); return }
    // Phase-1 rollout: only allow online booking for the enabled services.
    // If a user reaches /book/slots via a bookmark/URL for a disabled service,
    // bounce them back to step 1 where the contact-clinic panel surfaces.
    const ENABLED_SBEA = new Set(['PT', 'PSYCHOLOGY', 'MD'])
    const ENABLED_SBGH = new Set(['PT', 'PSYCHOLOGY', 'PSYCHIATRY'])
    const ok =
      (branch === 'SBEA' && ENABLED_SBEA.has(department)) ||
      (branch === 'SBGH' && ENABLED_SBGH.has(department))
    if (!ok) {
      router.push('/book')
    }
  }, [router, branch, department])

  // Load therapists once.
  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoadingTherapists(true); setErr(null)
      try {
        const r = await listTherapists(branch, department)
        if (!cancelled) setTherapists(r.therapists)
      } catch (e) {
        if (!cancelled) setErr((e as Error).message)
      } finally {
        if (!cancelled) setLoadingTherapists(false)
      }
    }
    if (branch && department) run()
    return () => { cancelled = true }
  }, [branch, department])

  // Load slots when therapist or week changes. The endpoint now uses the
  // Decking Module's work-hours + capacity logic, and staff-filters server-side.
  const loadSlots = useCallback(async () => {
    if (!selectedTherapist) return
    setLoadingSlots(true); setErr(null)
    try {
      const from = fmtYMD(weekStart)
      const to = fmtYMD(addDays(weekStart, 6))
      const r = await listAvailableSlots(branch, department, from, to, selectedTherapist.id)
      setSlots(r.slots)
    } catch (e) { setErr((e as Error).message) } finally { setLoadingSlots(false) }
  }, [branch, department, weekStart, selectedTherapist])

  useEffect(() => { loadSlots() }, [loadSlots])

  // For MD-track services, the clinician is a doctor — relabel everywhere
  // ("Therapist" → "Doctor") so patients booking Psychiatry / DevPed / MD
  // don't get confused.
  const isDoctorDept = department === 'MD' || department === 'PSYCHIATRY' || department === 'DEVELOPMENTAL_PEDIATRICIAN'
  const clinicianWord = isDoctorDept ? 'doctor' : 'therapist'
  const ClinicianWord = isDoctorDept ? 'Doctor' : 'Therapist'
  const CLINICIAN_WORD = ClinicianWord.toUpperCase()

  const daysOfWeek = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const byDay = useMemo(() => {
    const map = new Map<string, AvailableSlot[]>()
    for (const s of slots) {
      const arr = map.get(s.date) ?? []; arr.push(s); map.set(s.date, arr)
    }
    for (const arr of map.values()) arr.sort((a, b) => a.startTime.localeCompare(b.startTime))
    return map
  }, [slots])

  function pickIndex(slot: AvailableSlot): number {
    return picks.findIndex((p) => p.staffId === slot.staffId && p.date === slot.date && p.startTime === slot.startTime)
  }

  function togglePick(slot: AvailableSlot) {
    setPicks((prev) => {
      const idx = prev.findIndex((p) => p.staffId === slot.staffId && p.date === slot.date && p.startTime === slot.startTime)
      if (idx !== -1) return prev.filter((_, i) => i !== idx)
      if (prev.length >= 3) return prev
      return [...prev, { staffId: slot.staffId, date: slot.date, startTime: slot.startTime, endTime: slot.endTime }]
    })
  }

  function reorder(i: number, dir: -1 | 1) {
    setPicks((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function clearPicks() { setPicks([]) }

  function proceed() {
    if (picks.length === 0 || !selectedTherapist) return
    const qs = new URLSearchParams({
      branch, department,
      therapistInitials: selectedTherapist.initials,
      therapistSex: selectedTherapist.sex ?? '',
      picks: JSON.stringify(picks),
    }).toString()
    router.push(`/book/confirm?${qs}`)
  }

  return (
    <div className="animate-fade-up">
      <StepHeader active={2} />

      <div className="card-static">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h1 className="text-[28px] text-[color:var(--deep-teal)] leading-tight">Pick your {clinicianWord} and slots</h1>
            <p className="text-sm text-[color:var(--mid-gray)] mt-1 flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-[color:var(--pale-teal)] text-[color:var(--deep-teal)] text-xs font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{branch}</span>
              <span className="px-2 py-0.5 rounded-md bg-[color:var(--pale-teal)] text-[color:var(--deep-teal)] text-xs font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{department}</span>
              <span className="text-[color:var(--mid-gray)]">Choose up to 3 possible time slots — the front desk confirms one.</span>
            </p>
          </div>
        </div>

        {err && <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800 mb-4">{err}</div>}

        {/* Clinician selector — labelled "Doctor" for MD-track services */}
        <div className="mb-6">
          <div className="label">{CLINICIAN_WORD}</div>
          {loadingTherapists ? (
            <div className="text-sm text-[color:var(--mid-gray)]">Loading {clinicianWord}s…</div>
          ) : therapists.length === 0 ? (
            <div className="text-sm text-[color:var(--mid-gray)] italic">No {clinicianWord}s available for this service yet.</div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {therapists.map((t) => {
                const active = selectedTherapist?.id === t.id
                const sexLabel = t.sex === 'M' ? '♂ Male' : t.sex === 'F' ? '♀ Female' : '— Unspecified'
                return (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedTherapist(t); setPicks([]) }}
                    className={`inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl border-[1.5px] transition-all ${
                      active
                        ? 'bg-gradient-to-br from-[color:var(--teal)] to-[color:var(--deep-teal)] border-transparent text-white shadow-[0_4px_14px_rgba(46,94,90,0.3)]'
                        : 'bg-white border-[color:var(--light-gray)] hover:border-[color:var(--bright-teal)]'
                    }`}
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-semibold ${active ? 'bg-white/20 text-white' : 'bg-[color:var(--pale-teal)] text-[color:var(--deep-teal)]'}`}>
                      {t.initials}
                    </span>
                    <span className="flex flex-col items-start leading-tight text-left">
                      {/* Job title is the headline (e.g. "Developmental Pediatrician")
                          when present — otherwise fall back to the dept-derived word
                          so we never repeat the initials we just rendered in the avatar. */}
                      <span className="text-[13px] font-semibold">
                        {t.jobTitle ?? ClinicianWord}
                      </span>
                      <span className={`text-[11px] ${active ? 'text-white/80' : 'text-[color:var(--mid-gray)]'}`}>
                        {sexLabel}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Weekly calendar — only when a therapist is selected */}
        {selectedTherapist && (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="label !mb-0">Week of {fmtRange(weekStart, addDays(weekStart, 6))}</div>
              <div className="flex items-center gap-1.5" style={{ fontFamily: 'var(--font-display)' }}>
                <button className="btn-secondary !py-1.5 !px-3 !text-[12.5px]" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</button>
                <button className="btn-secondary !py-1.5 !px-3 !text-[12.5px]" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</button>
                <button className="btn-secondary !py-1.5 !px-3 !text-[12.5px]" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
              </div>
            </div>

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
                      {loadingSlots && <div className="h-6 rounded bg-[color:var(--pale-teal)] animate-pulse"></div>}
                      {!loadingSlots && list.length === 0 && (
                        <div className="slot-empty">No slots</div>
                      )}
                      {list.map((s, idx) => {
                        const pIdx = pickIndex(s)
                        const isPicked = pIdx !== -1
                        return (
                          <button
                            key={`${s.startTime}-${idx}`}
                            onClick={() => togglePick(s)}
                            className={`slot-tile-min w-full ${isPicked ? 'slot-tile-picked' : ''}`}
                            style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}
                          >
                            <span className="slot-tile-time-min">{s.startTime}</span>
                            {isPicked && (
                              <span className={`pick-ribbon ${pIdx === 0 ? 'bg-emerald-600' : pIdx === 1 ? 'bg-amber-500' : 'bg-slate-500'}`}>
                                {pIdx === 0 ? '1st' : pIdx === 1 ? '2nd' : '3rd'}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Picks summary + CTA */}
        <div className="mt-6 rounded-2xl border border-[color:var(--light-gray)] bg-gradient-to-br from-white to-[color:var(--pale-teal)] p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="label !mb-0">Your choices ({picks.length}/3)</div>
            {picks.length > 0 && (
              <button className="text-[11px] text-[color:var(--mid-gray)] underline" onClick={clearPicks} style={{ fontFamily: 'var(--font-display)' }}>Clear</button>
            )}
          </div>
          {picks.length === 0 ? (
            <p className="text-sm text-[color:var(--mid-gray)] italic" style={{ fontFamily: 'var(--font-display)' }}>
              Click time slots above to add them. You can reorder your preferences.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {picks.map((p, i) => (
                <li key={`${p.date}-${p.startTime}`} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border border-[color:var(--light-gray)]">
                  <div className="flex items-center gap-2.5 text-sm">
                    <span className={`pick-ribbon static !ml-0 ${i === 0 ? 'bg-emerald-600' : i === 1 ? 'bg-amber-500' : 'bg-slate-500'}`}>
                      {i === 0 ? '1st' : i === 1 ? '2nd' : '3rd'}
                    </span>
                    <span style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
                      {p.date} · {p.startTime}–{p.endTime}
                    </span>
                  </div>
                  <div className="flex gap-1" style={{ fontFamily: 'var(--font-display)' }}>
                    <button disabled={i === 0} onClick={() => reorder(i, -1)} className="w-7 h-7 rounded border text-xs disabled:opacity-30">↑</button>
                    <button disabled={i === picks.length - 1} onClick={() => reorder(i, 1)} className="w-7 h-7 rounded border text-xs disabled:opacity-30">↓</button>
                    <button onClick={() => setPicks((prev) => prev.filter((_, k) => k !== i))} className="w-7 h-7 rounded border text-xs">✕</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-between items-center mt-6">
          <button className="btn-secondary" onClick={() => router.push('/book')}>← Change service</button>
          <button className="btn-cta" disabled={picks.length === 0} onClick={proceed}>
            Continue → Confirm ({picks.length} {picks.length === 1 ? 'choice' : 'choices'})
          </button>
        </div>

        <div className="flex items-center gap-2 mt-4 text-[11.5px] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
          <Legend color="bg-[color:var(--gold)]" label="Today" />
          <span className="mx-1">·</span>
          <Legend color="bg-emerald-600" label="1st choice" />
          <Legend color="bg-amber-500" label="2nd" />
          <Legend color="bg-slate-500" label="3rd" />
        </div>
      </div>

      <style jsx>{`
        .slot-tile-min {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          padding: 7px 10px;
          border-radius: 8px;
          border: 1.5px solid var(--light-gray);
          background: white;
          cursor: pointer;
          transition: all 0.15s ease-out;
          font-size: 13px;
          font-weight: 500;
          color: var(--charcoal);
          width: 100%;
          letter-spacing: 0.01em;
        }
        .slot-tile-min:hover {
          border-color: var(--teal);
          background: var(--pale-teal);
        }
        .slot-tile-time-min {
          font-weight: 500;
          color: var(--deep-teal);
          letter-spacing: 0;
        }
        .slot-tile-picked {
          border-color: var(--gold);
          background: linear-gradient(135deg, rgba(237, 104, 35, 0.07), rgba(255, 162, 53, 0.05));
          box-shadow: 0 2px 8px rgba(237, 104, 35, 0.15);
        }
        .pick-ribbon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 2px 7px;
          border-radius: 999px;
          font-family: var(--font-display);
          font-size: 9.5px;
          font-weight: 700;
          color: white;
          letter-spacing: 0.04em;
        }
        .slot-empty {
          font-family: var(--font-display);
          font-size: 11px;
          color: var(--mid-gray);
          font-style: italic;
          padding: 4px 0;
        }
      `}</style>
    </div>
  )
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
