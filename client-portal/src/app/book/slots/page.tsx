'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession } from '@/lib/session'
import { branchLabel } from '@/lib/branch-label'
import { listTherapists, listAvailableSlots, type AvailableSlot, type Therapist, type SlotChoice } from '@/lib/api'
import { BookingSteps } from '@/components/booking/BookingSteps'
import {
  PAGE, PageHeader, DashCard, Banner, Tag, Avatar, Skeleton, Icon,
  BTN_PRIMARY, BTN_SECONDARY, BTN_SM, PRIMARY_STYLE, SECONDARY_STYLE, CONTROL_STYLE, SUBTLE_BG, FOCUS,
} from '@/components/hub/ui'

export default function BookSlotsPageWrapper() {
  return (
    <Suspense fallback={<div className="text-sm" style={{ color: 'var(--mid-gray)' }}>Loading…</div>}>
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
    // Phase-1 enabled depts — must mirror the SAME set in /book page.tsx.
    // SBEA's Developmental Pediatrician is intentionally offline-only for
    // now; the tile still shows, but tapping it routes to the contact panel.
    const ENABLED_SBEA = new Set(['PT', 'REHABILITATION_MEDICINE', 'OT', 'SLP'])
    const ENABLED_SBGH = new Set(['PT', 'OT', 'SLP'])
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
  // ("Therapist" → "Doctor") so patients booking Psychiatry / DevPed /
  // Rehabilitation Medicine / generic MD don't get confused.
  const isDoctorDept =
    department === 'MD' ||
    department === 'PSYCHIATRY' ||
    department === 'DEVELOPMENTAL_PEDIATRICIAN' ||
    department === 'REHABILITATION_MEDICINE'
  const clinicianWord = isDoctorDept ? 'doctor' : 'therapist'
  const ClinicianWord = isDoctorDept ? 'Doctor' : 'Therapist'

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
    <div className={`${PAGE} animate-fade-up`}>
      <BookingSteps steps={['Service', 'Slot', 'Confirm']} active={2} />

      <PageHeader
        eyebrow="Book an appointment"
        title={`Pick your ${clinicianWord} and slots`}
        description={
          <span className="flex items-center gap-2 flex-wrap">
            <Tag tone="brand">{branchLabel(branch)}</Tag>
            <Tag tone="brand">{department.replace(/_/g, ' ')}</Tag>
            <span>Choose up to 3 possible time slots — the front desk confirms one.</span>
          </span>
        }
      />

      {err && <Banner tone="error">{err}</Banner>}

      {/* Clinician selector — labelled "Doctor" for MD-track services */}
      <DashCard title={ClinicianWord} description={`Choose a ${clinicianWord} to see their open slots.`} icon={<Icon name="users" size={16} />}>
        {loadingTherapists ? (
          <div className="flex flex-wrap gap-2" role="status" aria-label={`Loading ${clinicianWord}s`}>
            {[0, 1, 2].map((n) => <Skeleton key={n} className="h-14 w-48 rounded-xl" />)}
          </div>
        ) : therapists.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No {clinicianWord}s available for this service yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {therapists.map((t) => {
              const active = selectedTherapist?.id === t.id
              const sexLabel = t.sex === 'M' ? '♂ Male' : t.sex === 'F' ? '♀ Female' : '— Unspecified'
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setSelectedTherapist(t); setPicks([]) }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors min-w-0 ${active ? '' : 'hover:bg-[color:var(--paper)]'} ${FOCUS}`}
                  style={active
                    ? { background: 'var(--moss-tint)', border: '1.5px solid var(--teal)' }
                    : { background: '#fff', border: '1.5px solid var(--light-gray)' }}
                >
                  <Avatar text={t.initials} size={38} />
                  <span className="flex flex-col items-start leading-tight min-w-0 flex-1">
                    {/* Job title is the headline (e.g. "Developmental Pediatrician")
                        when present — otherwise fall back to the dept-derived word
                        so we never repeat the initials we just rendered in the avatar. */}
                    <span className="text-[13px] font-semibold truncate max-w-full" style={{ fontFamily: 'var(--font-display)', color: active ? 'var(--deep-teal)' : 'var(--charcoal)' }}>
                      {t.jobTitle ?? ClinicianWord}
                    </span>
                    <span className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                      {sexLabel}
                    </span>
                    {!t.hasSchedule && (
                      <span className="mt-1"><Tag tone="warn">Schedule not yet set</Tag></span>
                    )}
                  </span>
                  <span aria-hidden className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{ border: `1.5px solid ${active ? 'var(--deep-teal)' : 'var(--light-gray)'}`, background: '#fff' }}>
                    {active && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--deep-teal)' }} />}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </DashCard>

      {/* Weekly calendar — only when a therapist is selected */}
      {selectedTherapist && (
        <DashCard
          title={`Week of ${fmtRange(weekStart, addDays(weekStart, 6))}`}
          description="Tap a time to add it to your choices; tap again to remove it."
          icon={<Icon name="calendar" size={16} />}
        >
          <div className="flex items-center gap-1.5 mb-4">
            <button type="button" className={BTN_SM} style={SECONDARY_STYLE} onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</button>
            <button type="button" className={BTN_SM} style={SECONDARY_STYLE} onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</button>
            <button type="button" className={BTN_SM} style={SECONDARY_STYLE} onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
          </div>

          {!selectedTherapist.hasSchedule && (
            <div className="mb-4">
              <Banner tone="warn">
                <strong>{selectedTherapist.jobTitle ?? selectedTherapist.initials}</strong> hasn&apos;t set up their schedule yet. Please pick another {clinicianWord}, or contact the clinic to request an appointment with them directly.
              </Banner>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            {daysOfWeek.map((d, i) => {
              const key = fmtYMD(d)
              const list = byDay.get(key) ?? []
              const today = isToday(d)
              return (
                <div key={key}
                  className={`rounded-xl p-2.5 min-w-0 animate-fade-up stagger-${Math.min(i+1,7)}`}
                  style={{ background: today ? 'var(--moss-tint)' : SUBTLE_BG, border: `1px solid ${today ? 'var(--sage)' : 'var(--light-gray)'}` }}>
                  <div className="flex items-center justify-between pb-2 mb-2 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--mid-gray)', borderBottom: '1px dashed var(--light-gray)' }}>
                    <span>{fmtWeekday(d)}</span>
                    <span style={today ? { color: 'var(--deep-teal)' } : undefined}>{fmtDay(d)}</span>
                  </div>
                  {today && (
                    <div className="-mt-1 mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', color: 'var(--deep-teal)' }}>Today</div>
                  )}
                  <div className="space-y-1.5">
                    {loadingSlots && <Skeleton className="h-8 rounded-lg" />}
                    {!loadingSlots && list.length === 0 && (
                      <div className="text-[11px] py-1" style={{ color: 'var(--mid-gray)' }}>No slots</div>
                    )}
                    {list.map((s, idx) => {
                      const pIdx = pickIndex(s)
                      const isPicked = pIdx !== -1
                      return (
                        <button
                          key={`${s.startTime}-${idx}`}
                          type="button"
                          aria-pressed={isPicked}
                          onClick={() => togglePick(s)}
                          className={`w-full h-9 px-2.5 flex items-center justify-between gap-1.5 rounded-lg text-[13px] font-semibold tabular-nums transition-colors ${isPicked ? '' : 'hover:bg-[color:var(--pale-teal)]'} ${FOCUS}`}
                          style={isPicked
                            ? { background: '#fff', border: '1.5px solid var(--teal)', color: 'var(--deep-teal)', boxShadow: '0 0 0 3px rgba(74,128,115,0.14)' }
                            : { ...CONTROL_STYLE, color: 'var(--deep-teal)' }}
                        >
                          <span>{s.startTime}</span>
                          {isPicked && <RankChip rank={pIdx} />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-4 text-[11px]" style={{ fontFamily: 'var(--font-display)', color: 'var(--mid-gray)' }}>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--moss-tint)', border: '1px solid var(--sage)' }} />Today</span>
            <span className="inline-flex items-center gap-1.5"><RankChip rank={0} /> 1st choice</span>
            <span className="inline-flex items-center gap-1.5"><RankChip rank={1} /> 2nd</span>
            <span className="inline-flex items-center gap-1.5"><RankChip rank={2} /> 3rd</span>
          </div>
        </DashCard>
      )}

      {/* Picks summary + CTA */}
      <DashCard
        title={`Your choices (${picks.length}/3)`}
        description="The front desk confirms one of these, in your order of preference."
        icon={<Icon name="clock" size={16} />}
        action={picks.length > 0 ? (
          <button type="button" className={BTN_SM} style={{ ...SECONDARY_STYLE, color: 'var(--mid-gray)' }} onClick={clearPicks}>Clear</button>
        ) : undefined}
      >
        {picks.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
            Click time slots above to add them. You can reorder your preferences.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {picks.map((p, i) => (
              <li key={`${p.date}-${p.startTime}`} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                <div className="flex items-center gap-2.5 text-sm min-w-0">
                  <RankChip rank={i} />
                  <span className="tabular-nums truncate" style={{ color: 'var(--charcoal)' }}>
                    {p.date} · {p.startTime}–{p.endTime}
                  </span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" disabled={i === 0} onClick={() => reorder(i, -1)} aria-label="Move up" className={`${BTN_SM} !w-8 !px-0`} style={SECONDARY_STYLE}>↑</button>
                  <button type="button" disabled={i === picks.length - 1} onClick={() => reorder(i, 1)} aria-label="Move down" className={`${BTN_SM} !w-8 !px-0`} style={SECONDARY_STYLE}>↓</button>
                  <button type="button" onClick={() => setPicks((prev) => prev.filter((_, k) => k !== i))} aria-label="Remove" className={`${BTN_SM} !w-8 !px-0`} style={SECONDARY_STYLE}><Icon name="x" size={14} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--light-gray)' }}>
          <button type="button" className={`${BTN_SECONDARY} max-sm:h-11`} style={SECONDARY_STYLE} onClick={() => router.push('/book')}>← Change service</button>
          <button type="button" className={`${BTN_PRIMARY} max-sm:h-11`} style={PRIMARY_STYLE} disabled={picks.length === 0} onClick={proceed}>
            Continue — Confirm ({picks.length} {picks.length === 1 ? 'choice' : 'choices'})
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </DashCard>
    </div>
  )
}

/** "1st" / "2nd" / "3rd" preference marker. The words carry the rank; the
 *  three shades just help the eye match a slot to its row below. */
function RankChip({ rank }: { rank: number }) {
  const bg = rank === 0 ? 'var(--deep-teal)' : rank === 1 ? 'var(--teal)' : 'var(--mid-gray)'
  return (
    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[9.5px] font-bold leading-none text-white"
      style={{ background: bg, fontFamily: 'var(--font-display)' }}>
      {rank === 0 ? '1st' : rank === 1 ? '2nd' : '3rd'}
    </span>
  )
}
