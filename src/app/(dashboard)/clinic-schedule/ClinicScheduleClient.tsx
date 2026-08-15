'use client'

import { useState, useEffect, useRef } from 'react'
import { CalendarDays, LayoutGrid, Clock, Activity, CalendarClock, ArrowRightLeft, X } from 'lucide-react'
import DepartmentView from './DepartmentView'
import DailyView from './DailyView'
import CalendarView from './CalendarView'
import StatusView from './StatusView'

function tomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

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

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: '#fff', borderRadius: '1rem',
        width: '100%', maxWidth: '420px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #ED6823, #F5A030)',
          padding: '1rem 1.25rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ArrowRightLeft size={16} color="#fff" />
            <p style={{ color: '#fff', fontWeight: 700, fontSize: '0.875rem', margin: 0 }}>
              Transfer All Patients
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '0.2rem' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem' }}>
          {step === 'done' ? (
            <div style={{ textAlign: 'center', padding: '0.5rem 0 1rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
              <p style={{ fontWeight: 700, fontSize: '1rem', color: '#1A1A1A', marginBottom: '0.35rem' }}>
                Transfer Complete
              </p>
              {count === 0 ? (
                <p style={{ fontSize: '0.82rem', color: '#888' }}>
                  No schedules were found on {fmtDate(fromDate)} to transfer.
                </p>
              ) : (
                <p style={{ fontSize: '0.82rem', color: '#555' }}>
                  <strong>{count}</strong> schedule{count !== 1 ? 's' : ''} moved from<br />
                  <strong>{fmtDate(fromDate)}</strong> → <strong>{fmtDate(toDate)}</strong>
                </p>
              )}
              <button
                onClick={() => { onTransferred(toDate); onClose() }}
                style={{
                  marginTop: '1.25rem', background: '#ED6823', color: '#fff',
                  border: 'none', borderRadius: '0.5rem', padding: '0.55rem 1.5rem',
                  fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                }}
              >
                View {fmtDate(toDate)}
              </button>
            </div>
          ) : step === 'confirm' ? (
            <div>
              <p style={{ fontSize: '0.85rem', color: '#555', marginBottom: '1rem', lineHeight: 1.6 }}>
                This will move <strong>all schedules</strong> on<br />
                <strong style={{ color: '#ED6823' }}>{fmtDate(fromDate)}</strong><br />
                to<br />
                <strong style={{ color: '#ED6823' }}>{fmtDate(toDate)}</strong>.<br /><br />
                This cannot be undone automatically. Continue?
              </p>
              {error && (
                <p style={{ fontSize: '0.78rem', color: '#DC2626', marginBottom: '0.75rem' }}>{error}</p>
              )}
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button
                  onClick={() => setStep('form')}
                  disabled={loading}
                  style={{
                    flex: 1, background: '#F5F5F5', color: '#555', border: 'none',
                    borderRadius: '0.5rem', padding: '0.55rem', fontWeight: 600,
                    fontSize: '0.82rem', cursor: 'pointer',
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleTransfer}
                  disabled={loading}
                  style={{
                    flex: 2, background: '#ED6823', color: '#fff', border: 'none',
                    borderRadius: '0.5rem', padding: '0.55rem', fontWeight: 600,
                    fontSize: '0.82rem', cursor: loading ? 'default' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? 'Transferring…' : 'Yes, Transfer'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '0.78rem', color: '#888', marginBottom: '1.1rem', lineHeight: 1.5 }}>
                Move all scheduled sessions from one date to another.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#555', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    From Date
                  </label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    style={{
                      width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
                      border: '1px solid #DDD', fontSize: '0.875rem', color: '#1A1A1A',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <ArrowRightLeft size={16} color="#ED6823" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#555', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    To Date
                  </label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    style={{
                      width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
                      border: '1px solid #DDD', fontSize: '0.875rem', color: '#1A1A1A',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
              {error && (
                <p style={{ fontSize: '0.78rem', color: '#DC2626', marginTop: '0.75rem' }}>{error}</p>
              )}
              <button
                onClick={() => {
                  if (!fromDate || !toDate) { setError('Please select both dates'); return }
                  if (fromDate === toDate) { setError('From and To dates must be different'); return }
                  setError('')
                  setStep('confirm')
                }}
                style={{
                  marginTop: '1.25rem', width: '100%',
                  background: '#ED6823', color: '#fff', border: 'none',
                  borderRadius: '0.5rem', padding: '0.6rem',
                  fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
                }}
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

function ComingSoonTab({ label }: { label: string }) {
  return (
    <div className="rounded-xl flex flex-col items-center justify-center py-24 gap-4"
      style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--pale-teal)' }}>
        <CalendarDays size={22} style={{ color: 'var(--teal)' }} />
      </div>
      <div className="text-center">
        <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Coming Soon</p>
        <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>{label} is under development.</p>
      </div>
    </div>
  )
}

export default function ClinicScheduleClient({ role }: { role: string }) {
  const [activeTab, setActiveTab] = useState<TabId>('department')
  const [selectedDate, setSelectedDateRaw] = useState(() => new Date().toISOString().split('T')[0])
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
    <div className="space-y-5">
      {showTransfer && (
        <TransferModal
          onClose={() => setShowTransfer(false)}
          onTransferred={(toDate) => setSelectedDate(toDate)}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
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
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flexShrink: 0 }}>
          <button
            onClick={() => setShowTransfer(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm"
            style={{ background: '#fff', color: '#ED6823', border: '1.5px solid #ED6823', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            <ArrowRightLeft size={16} />
            Transfer Dates
          </button>
          <button
            onClick={() => setSelectedDate(tomorrowStr())}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm"
            style={{ background: '#ED6823', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            <CalendarClock size={16} />
            Schedule for Tomorrow
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative"
            style={{
              color: activeTab === id ? 'var(--teal)' : 'var(--mid-gray)',
              borderBottom: activeTab === id ? '2px solid var(--teal)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'department' && <DepartmentView role={role} selectedDate={selectedDate} onDateChange={setSelectedDate} />}
      {activeTab === 'calendar'   && <CalendarView role={role} />}
      {activeTab === 'daily'      && <DailyView role={role} selectedDate={selectedDate} onDateChange={setSelectedDate} />}
      {activeTab === 'status'     && <StatusView role={role} selectedDate={selectedDate} onDateChange={setSelectedDate} />}
    </div>
  )
}
