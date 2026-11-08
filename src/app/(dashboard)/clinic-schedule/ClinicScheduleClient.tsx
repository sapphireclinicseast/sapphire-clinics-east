'use client'

import { useState, useEffect, useRef } from 'react'
import { CalendarDays, LayoutGrid, Clock, Activity, CalendarClock, ArrowRightLeft, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import DepartmentView from './DepartmentView'
import DailyView from './DailyView'
import CalendarView from './CalendarView'
import StatusView from './StatusView'
import { localTodayStr, localTomorrowStr } from '@/lib/utils'
import { PillTabs, BTN_PRIMARY, BTN_SECONDARY, CONTROL, CONTROL_STYLE, LABEL, TEAL_HEX } from '../decking/ui'
import { CS_CSS } from './ui'

const tomorrowStr = localTomorrowStr
const todayStr = localTodayStr

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Transfer Dates Modal ──────────────────────────────────────────────────────
function TransferModal({
  onClose,
  onTransferred,
}: {
  onClose: () => void
  onTransferred: (toDate: string) => void
}) {
  const [fromDate, setFromDate] = useState(todayStr())
  const [toDate,   setToDate]   = useState(tomorrowStr())
  const [step,     setStep]     = useState<'form' | 'confirm' | 'done'>('form')
  const [loading,  setLoading]  = useState(false)
  const [count,    setCount]    = useState(0)
  const [error,    setError]    = useState('')

  async function handleTransfer() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/clinic-schedule/transfer-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromDate, toDate }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Transfer failed'); setLoading(false); return }
      setCount(data.transferred)
      setStep('done')
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const errorLine = error && (
    <p role="alert" className="flex items-start gap-1.5 text-xs mt-3 px-3 py-2 rounded-lg"
      style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
      <AlertTriangle size={13} className="flex-shrink-0 mt-px" />{error}
    </p>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="cs-transfer-title"
        className="w-full max-w-[420px] rounded-2xl overflow-hidden"
        style={{ background: '#fff', boxShadow: '0 24px 64px rgba(15,23,42,0.22)' }}>
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#FFF1E8', color: '#ED6823' }}>
              <ArrowRightLeft size={15} />
            </span>
            <p id="cs-transfer-title" className="text-sm font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
              Transfer All Patients
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="cs-btn w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
            style={{ color: 'var(--mid-gray)' }}>
            <X size={17} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {step === 'done' ? (
            <div className="text-center pt-1 pb-2">
              <span className="mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                <CheckCircle2 size={24} />
              </span>
              <p className="text-base font-bold mb-1" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                Transfer Complete
              </p>
              {count === 0 ? (
                <p className="text-[13px]" style={{ color: 'var(--mid-gray)' }}>
                  No schedules were found on {fmtDate(fromDate)} to transfer.
                </p>
              ) : (
                <p className="text-[13px] leading-relaxed" style={{ color: '#555' }}>
                  <strong>{count}</strong> schedule{count !== 1 ? 's' : ''} moved from<br />
                  <strong>{fmtDate(fromDate)}</strong> → <strong>{fmtDate(toDate)}</strong>
                </p>
              )}
              <button
                type="button"
                onClick={() => { onTransferred(toDate); onClose() }}
                className={`${BTN_PRIMARY} mt-5 px-5`}
                style={{ background: TEAL_HEX }}
              >
                View {fmtDate(toDate)}
              </button>
            </div>
          ) : step === 'confirm' ? (
            <div>
              <div className="rounded-xl px-4 py-3 mb-3 text-[13px] leading-relaxed" style={{ background: '#FFF7F1', border: '1px solid #FBD5BC', color: '#555' }}>
                This will move <strong>all schedules</strong> on<br />
                <strong style={{ color: '#C2410C' }}>{fmtDate(fromDate)}</strong><br />
                to<br />
                <strong style={{ color: '#C2410C' }}>{fmtDate(toDate)}</strong>.<br /><br />
                This cannot be undone automatically. Continue?
              </div>
              {errorLine}
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  disabled={loading}
                  className={`${BTN_SECONDARY} flex-1`}
                  style={CONTROL_STYLE}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleTransfer}
                  disabled={loading}
                  className={`${BTN_PRIMARY} flex-[2]`}
                  style={{ background: '#ED6823', cursor: loading ? 'default' : 'pointer' }}
                >
                  {loading ? 'Transferring…' : 'Yes, Transfer'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-[13px] mb-4 leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
                Move all scheduled sessions from one date to another.
              </p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <div className="min-w-0">
                  <label htmlFor="cs-transfer-from" className={LABEL} style={{ color: 'var(--mid-gray)' }}>
                    From Date
                  </label>
                  <input
                    id="cs-transfer-from"
                    type="date"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    className={`${CONTROL} w-full`}
                    style={CONTROL_STYLE}
                  />
                </div>
                <span className="h-9 flex items-center" style={{ color: '#ED6823' }} aria-hidden>
                  <ArrowRightLeft size={15} />
                </span>
                <div className="min-w-0">
                  <label htmlFor="cs-transfer-to" className={LABEL} style={{ color: 'var(--mid-gray)' }}>
                    To Date
                  </label>
                  <input
                    id="cs-transfer-to"
                    type="date"
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    className={`${CONTROL} w-full`}
                    style={CONTROL_STYLE}
                  />
                </div>
              </div>
              {errorLine}
              <button
                type="button"
                onClick={() => {
                  if (!fromDate || !toDate) { setError('Please select both dates'); return }
                  if (fromDate === toDate) { setError('From and To dates must be different'); return }
                  setError('')
                  setStep('confirm')
                }}
                className={`${BTN_PRIMARY} mt-5 w-full`}
                style={{ background: '#ED6823' }}
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const TABS = [
  { id: 'department', label: 'Department View', icon: LayoutGrid },
  { id: 'calendar',   label: 'Calendar View',   icon: CalendarDays },
  { id: 'daily',      label: 'Daily View',       icon: Clock },
  { id: 'status',     label: 'Status View',      icon: Activity },
] as const

type TabId = typeof TABS[number]['id']

export default function ClinicScheduleClient({ role }: { role: string }) {
  const [activeTab, setActiveTab] = useState<TabId>('department')
  const [selectedDate, setSelectedDateRaw] = useState(() => todayStr())
  const [showTransfer, setShowTransfer] = useState(false)

  // selectedDate's initial value is only computed once, at mount — a tab
  // left open across midnight (common for an always-on front-desk screen)
  // would otherwise silently keep showing yesterday's "today" until a hard
  // refresh, even though it still looks live. isDefaultDateRef tracks
  // whether the user has ever explicitly picked a date; while they haven't,
  // regaining focus/visibility re-derives "today" from the real clock.
  const isDefaultDateRef = useRef(true)

  function setSelectedDate(date: string) {
    isDefaultDateRef.current = false
    setSelectedDateRaw(date)
  }

  useEffect(() => {
    function resyncIfStillDefault() {
      if (!isDefaultDateRef.current) return
      const fresh = todayStr()
      setSelectedDateRaw(prev => (prev === fresh ? prev : fresh))
    }
    document.addEventListener('visibilitychange', resyncIfStillDefault)
    window.addEventListener('focus', resyncIfStillDefault)
    return () => {
      document.removeEventListener('visibilitychange', resyncIfStillDefault)
      window.removeEventListener('focus', resyncIfStillDefault)
    }
  }, [])

  return (
    <div className="max-w-[1400px] space-y-5 min-w-0">
      <style>{CS_CSS}</style>
      {showTransfer && (
        <TransferModal
          onClose={() => setShowTransfer(false)}
          onTransferred={(toDate) => setSelectedDate(toDate)}
        />
      )}

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
            Clinic Tools
          </p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Clinic Schedule
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Manage appointments and therapist schedules.
          </p>
        </div>
        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowTransfer(true)}
            className={BTN_SECONDARY}
            style={{ ...CONTROL_STYLE, color: '#C2410C', borderColor: '#F6C3A3' }}
          >
            <ArrowRightLeft size={15} />
            Transfer Dates
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(tomorrowStr())}
            className={BTN_PRIMARY}
            style={{ background: '#ED6823' }}
          >
            <CalendarClock size={15} />
            Schedule for Tomorrow
          </button>
        </div>
      </div>

      {/* ── View switcher ── */}
      <PillTabs
        label="Clinic schedule view"
        value={activeTab}
        onChange={id => setActiveTab(id as TabId)}
        tabs={TABS.map(({ id, label, icon: Icon }) => ({ id, label: <><Icon size={14} /> {label}</> }))}
      />

      {/* Tab Content */}
      {activeTab === 'department' && <DepartmentView role={role} selectedDate={selectedDate} onDateChange={setSelectedDate} />}
      {activeTab === 'calendar'   && <CalendarView role={role} />}
      {activeTab === 'daily'      && <DailyView role={role} selectedDate={selectedDate} onDateChange={setSelectedDate} />}
      {activeTab === 'status'     && <StatusView role={role} selectedDate={selectedDate} onDateChange={setSelectedDate} />}
    </div>
  )
}
