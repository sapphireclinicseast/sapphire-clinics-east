'use client'

import { useState } from 'react'

// Fee-bearing statuses. A cancellation's fee depends on how much notice was
// given, so the type has to be picked by whoever changed the status — nobody
// reconstructs "was this >24 hrs?" a week later from the Patient Relationship
// tab.
const CANCELLATION_TYPES = [
  'Cancellation >24 hrs (VALID)',
  'Cancellation >24 hrs (INVALID)',
  'Late Cancellation <24 hrs (VALID)',
  'Late Cancellation <24 hrs (INVALID)',
  'Retainer (VALID)',
  'Retainer (INVALID)',
]

export interface OutcomeTarget {
  scheduleId: string
  status: 'CANCELLED' | 'RESCHEDULED' | 'NO_SHOW'
  patientId: string | null
  patientName: string
  branch: string | null
}

/**
 * Prompt shown after a session is moved to Cancelled, Rescheduled or No-Show.
 *
 * The status change has ALREADY been saved by the time this opens. This only
 * asks whether it should also land in the Patient Relationship log, and that is
 * deliberately skippable: front desk changes statuses mid-conversation with a
 * patient at the counter, and a modal that must be completed would either block
 * them or get filled with junk to make it go away.
 *
 * Reschedules are offered the same types as cancellations, because the fee
 * policy keys off notice given — a same-day "can we move it?" costs the slot
 * either way. But a reschedule is NOT a cancellation and must not eat the
 * patient's allowance or push them toward slot removal, so the log records which
 * one it was (`sourceStatus`) and the counts leave reschedules out.
 */
export default function SessionOutcomePrompt({ target, onClose }: {
  target: OutcomeTarget
  onClose: (logged: boolean) => void
}) {
  const isNoShow = target.status === 'NO_SHOW'
  const [type, setType]       = useState(CANCELLATION_TYPES[0])
  const [remarks, setRemarks] = useState('')
  const [waive, setWaive]           = useState(false)
  const [waiveReason, setWaiveReason] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // No patient on the session means nothing to attach a log to (blocked slots,
  // admin holds). Say so rather than showing a form that cannot submit.
  const canLog = !!target.patientId && !!target.branch

  async function save() {
    if (!canLog) return
    // Without this the checkbox would be ignored server-side (a waiver needs a
    // reason) and the cancellation would count anyway — the opposite of what the
    // user just asked for, with no feedback saying so.
    if (waive && !waiveReason.trim()) {
      setError('Give a reason for not counting this cancellation.')
      return
    }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/patient-relationship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isNoShow
            ? { tab: 'noshow', patientId: target.patientId, branch: target.branch,
                remarks: remarks || null, scheduleId: target.scheduleId }
            : { patientId: target.patientId, branch: target.branch, type,
                remarks: remarks || null, scheduleId: target.scheduleId,
                // What this actually was. Reschedules are logged but never counted,
                // and without this they are indistinguishable from cancellations.
                sourceStatus: target.status,
                countsToward: waive ? false : true,
                excludeReason: waive ? waiveReason.trim() : null }
        ),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save log')
      onClose(true)
    } catch (e: any) {
      setError(e?.message || 'Failed to save log')
      setSaving(false)
    }
  }

  const heading = isNoShow ? 'Log this no-show?'
    : target.status === 'RESCHEDULED' ? 'Log this reschedule?' : 'Log this cancellation?'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.45)' }}
      onClick={() => !saving && onClose(false)}>
      <div className="rounded-xl w-full max-w-md" style={{ background: '#fff' }}
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <h3 className="font-bold" style={{ color: 'var(--charcoal)' }}>{heading}</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
            {target.patientName} — the status is already saved. This adds it to Patient Relationship
            {target.status === 'RESCHEDULED'
              ? ' as a reschedule. Reschedules are kept for history but are not counted against the patient.'
              : ' so the fee policy can be applied.'}
          </p>
        </div>

        <div className="px-5 py-4 space-y-3">
          {!canLog ? (
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
              This session has no patient attached, so there is nothing to log against. The status
              change was saved.
            </p>
          ) : (
            <>
              {!isNoShow && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>
                    Type
                  </label>
                  <select value={type} onChange={e => setType(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1.5px solid var(--light-gray)', background: '#fff' }}>
                    {CANCELLATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                    VALID means the reason is accepted and no fee applies. Notice given decides
                    &gt;24 hrs vs late.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>
                  Remarks {isNoShow ? '' : '(optional)'}
                </label>
                <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3}
                  placeholder={isNoShow ? 'What happened? e.g. no contact, phone unreachable'
                                        : 'Reason given by the patient'}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1.5px solid var(--light-gray)' }} />
              </div>

              {/* Not every cancellation is the patient's fault — a clinic closure or a
                  staff-side move should not eat their allowance. Offered here, at the
                  moment of logging, because that is when whoever knows the reason is
                  looking at it. Reschedules are excluded automatically and don't need
                  this, so it is only shown for actual cancellations. */}
              {!isNoShow && target.status !== 'RESCHEDULED' && (
                <div className="rounded-lg p-3" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={waive} className="mt-0.5"
                      onChange={e => { setWaive(e.target.checked); if (!e.target.checked) setWaiveReason('') }} />
                    <span className="text-xs" style={{ color: 'var(--charcoal)' }}>
                      <span style={{ fontWeight: 600 }}>Don&apos;t count this against the patient</span>
                      <span className="block mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                        Still recorded, but left out of the free allowance and the slot-removal
                        count. For clinic closures, staff-side changes, and similar.
                      </span>
                    </span>
                  </label>
                  {waive && (
                    <div className="mt-2">
                      <input type="text" value={waiveReason} onChange={e => setWaiveReason(e.target.value)}
                        placeholder="Why is it not being counted? (required)"
                        className="w-full rounded-lg px-3 py-2 text-sm"
                        style={{ border: '1.5px solid #FCA5A5' }} />
                      <p className="mt-1 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                        Shown on the patient&apos;s log so the decision can be traced later.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {error && <p className="text-xs" style={{ color: '#B91C1C' }}>{error}</p>}
            </>
          )}
        </div>

        <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid var(--light-gray)' }}>
          <button onClick={() => onClose(false)} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: '#F1F5F9', color: 'var(--mid-gray)' }}>
            {canLog ? 'Skip' : 'Close'}
          </button>
          {canLog && (
            <button onClick={save} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--teal)', color: '#fff', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save log'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
