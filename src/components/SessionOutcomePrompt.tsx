'use client'

import { useEffect, useState } from 'react'
import {
  CANCELLATION_TYPES, COVERAGE, COVERAGE_LABEL, INITIATORS, INITIATOR_LABEL,
  hasFreeAllowance, type Coverage, type Initiator,
} from '@/lib/cancellation-types'

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
 * one it was (`sourceStatus`). Both COUNT against the patient — Hannah,
 * 2026-11-18: "there are no reschedules. reschedules should be charged as
 * cancellations." A moved session is a session the patient called off.
 */
export default function SessionOutcomePrompt({ target, onClose }: {
  target: OutcomeTarget
  onClose: (logged: boolean) => void
}) {
  const isNoShow = target.status === 'NO_SHOW'
  const isReschedule = target.status === 'RESCHEDULED'

  // Who called it off. No default: the whole point is attribution, and a
  // pre-selected "Patient" would be answered by inertia on a busy morning —
  // which is how every therapist-initiated cancellation would end up on a
  // patient's fee record. The prompt is skippable, so insisting on a real
  // choice inside it costs nothing.
  const [initiatedBy, setInitiatedBy] = useState<Initiator | null>(null)

  // What paid for the session, pre-filled from the board below. A guarantee
  // letter has no free allowance, so this decides whether the cancellation is
  // chargeable from the first one.
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [coverageHint, setCoverageHint] = useState<string | null>(null)

  const [type, setType]       = useState<string>(CANCELLATION_TYPES[0])
  const [remarks, setRemarks] = useState('')
  const [waive, setWaive]           = useState(false)
  const [waiveReason, setWaiveReason] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // No patient on the session means nothing to attach a log to (blocked slots,
  // admin holds). Say so rather than showing a form that cannot submit.
  const canLog = !!target.patientId && !!target.branch

  // Ask the board how this patient is usually funded, so the common case is a
  // confirmation rather than a classification. A failure leaves it unset and
  // front desk pick — never a silent default, because the wrong value here
  // charges a guarantee letter that may not exist.
  useEffect(() => {
    if (!target.patientId) return
    const ctl = new AbortController()
    fetch(`/api/patient-relationship/coverage?patientId=${encodeURIComponent(target.patientId)}`,
      { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d?.suggested) return
        setCoverage(d.suggested)
        setCoverageHint(d.mixed
          ? `From the board (${d.reason}) — this patient has more than one payment type, so check it`
          : `From the board (${d.reason})`)
      })
      .catch(() => { /* leave it unset; the field is shown either way */ })
    return () => ctl.abort()
  }, [target.patientId])

  // The fee question only has an answer for a patient-initiated cancellation.
  // "How much notice did they give" means nothing when the clinic called it
  // off, and a reschedule is not a cancellation at all.
  const askFeeType = !isNoShow && !isReschedule && initiatedBy === 'PATIENT'

  // What paid for the session is asked whenever the LETTER could be charged:
  //   - a no-show, always — nobody rang and nobody came
  //   - anything the patient called off, cancelled or rescheduled alike. A
  //     rescheduled GL session is still an hour the letter bought and nobody
  //     attended, which is what the Accounting Hub bills for.
  // Never for a therapist-initiated one: the clinic moved it, so there is
  // nothing to bill the letter for.
  const askCoverage = isNoShow || initiatedBy === 'PATIENT'
  const glCharged = askCoverage && coverage === 'GL'

  async function save() {
    if (!canLog) return
    if (!isNoShow && !initiatedBy) {
      setError('Say who called this off — the patient, or the therapist.')
      return
    }
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
                // On a guarantee letter this is what makes the no-show
                // chargeable, so it has to reach the log.
                paymentType: coverage,
                remarks: remarks || null, scheduleId: target.scheduleId }
            : { patientId: target.patientId, branch: target.branch,
                // Only sent when it means something — the server stores a
                // plain label for the rest rather than a fee type.
                type: askFeeType ? type : null,
                initiatedBy,
                paymentType: coverage,
                remarks: remarks || null, scheduleId: target.scheduleId,
                // What this actually was. Both count against the patient now,
                // but the board, the fee flag and the history still need to
                // know which of the two happened.
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
              ? ' as a reschedule, which counts against the patient the same as a cancellation.'
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
              {/* Who called it off. First, because it decides what else is
                  worth asking: a cancellation the clinic caused has no notice
                  period to classify and never counts against the patient. */}
              {!isNoShow && (
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--charcoal)' }}>
                    Who called this off?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {INITIATORS.map(v => (
                      <button key={v} type="button" onClick={() => setInitiatedBy(v)}
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-left transition-colors"
                        style={initiatedBy === v
                          ? { background: 'var(--pale-teal)', color: 'var(--teal)', border: '1.5px solid var(--teal)' }
                          : { background: '#fff', color: 'var(--charcoal)', border: '1.5px solid var(--light-gray)' }}>
                        {INITIATOR_LABEL[v]}
                      </button>
                    ))}
                  </div>
                  {initiatedBy === 'THERAPIST' && (
                    <p className="mt-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                      Recorded, but never counted against the patient and never charged — the
                      clinic called it off. It is counted as a therapist-initiated cancellation
                      in Patient Relationship.
                    </p>
                  )}
                </div>
              )}

              {/* What paid for the session. Only for a cancellation the
                  patient called off: a therapist-initiated one is not charged
                  to anybody, and a reschedule has not spent a session. */}
              {askCoverage && (
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--charcoal)' }}>
                    How was this session paid for?
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {COVERAGE.map(v => (
                      <button key={v} type="button" onClick={() => setCoverage(v)}
                        className="rounded-lg px-2 py-2 text-sm font-semibold transition-colors"
                        style={coverage === v
                          ? { background: 'var(--pale-teal)', color: 'var(--teal)', border: '1.5px solid var(--teal)' }
                          : { background: '#fff', color: 'var(--charcoal)', border: '1.5px solid var(--light-gray)' }}>
                        {COVERAGE_LABEL[v]}
                      </button>
                    ))}
                  </div>
                  {coverageHint && (
                    <p className="mt-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>{coverageHint}</p>
                  )}
                  {glCharged && (
                    <p className="mt-1.5 text-[11px] rounded-lg px-2.5 py-2"
                      style={{ background: '#FFF7ED', color: '#9A3412', border: '1px solid #FED7AA' }}>
                      {isNoShow
                        ? 'A guarantee letter bought this hour and the clinician held it. Every GL no-show is charged to the letter — there is no allowance and nothing to waive.'
                        : isReschedule
                          ? 'A guarantee letter buys named sessions, and this one was held and not used. It is charged to the letter even though a reschedule never counts against the patient.'
                          : 'A guarantee letter has no two free cancellations — it buys named sessions, and this one has been spent. Charged from the first cancellation.'}
                      {' '}Flagged for the POS to collect against the letter.
                    </p>
                  )}
                </div>
              )}

              {askFeeType && (
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
              {askFeeType && (
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
