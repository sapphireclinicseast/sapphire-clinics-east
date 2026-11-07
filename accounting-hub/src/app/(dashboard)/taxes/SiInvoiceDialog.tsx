'use client'

/**
 * One dialog for a consultant's Service Invoice: pick the cutoffs it covers
 * (half a month, a month, or several months), see the figures from finalized
 * payroll for exactly that range, then either record the received invoice or
 * send the consultant a reminder quoting the same figures.
 */

import { useMemo, useState } from 'react'
import { Loader2, X, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { ScanUpload } from '@/components/ScanUpload'
import {
  coverageKeys, cutoffShort, cutoffsBetween, describeCutoffs, isCovered, recentCutoffs, siFigures,
  type CutoffPay,
} from '@/lib/payroll/si-coverage'

export interface SiDialogConsultant {
  id: string
  name: string
  department: string
  email?: string | null
  phone?: string | null
}

const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The range the dialog opens on: what is not yet invoiced, else the latest paid month. */
function defaultRange(pay: Record<string, CutoffPay>, outstanding: string[], nowCutoff: string): [string, string] {
  if (outstanding.length) return [outstanding[0], outstanding[outstanding.length - 1]]
  const paid = Object.keys(pay).filter(cp => cp <= nowCutoff).sort()
  const last = paid[paid.length - 1] || nowCutoff
  const month = last.slice(0, 7)
  return [`${month}-1`, `${month}-2`]
}

export function SiInvoiceDialog({
  consultant, mode, pay, covered, outstanding, nowCutoff, onClose, onRecorded, onSent,
}: {
  consultant: SiDialogConsultant
  mode: 'upload' | 'EMAIL' | 'SMS'
  pay: Record<string, CutoffPay>
  covered: Set<string>
  /** cutoffs with finalized pay and no invoice yet, oldest first */
  outstanding: string[]
  nowCutoff: string
  onClose: () => void
  onRecorded: () => void
  onSent: (note: string) => void
}) {
  const [init] = useState(() => defaultRange(pay, outstanding, nowCutoff))
  const [from, setFrom] = useState(init[0])
  const [to, setTo] = useState(init[1])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 18 months of cutoffs, newest first.
  const choices = useMemo(() => recentCutoffs(nowCutoff.endsWith('-1') ? `${nowCutoff.slice(0, 7)}-2` : nowCutoff, 36), [nowCutoff])
  const range = useMemo(() => cutoffsBetween(from, to), [from, to])
  const fig = useMemo(() => siFigures(consultant.department, range, pay), [consultant.department, range, pay])
  const already = range.filter(cp => isCovered(cp, covered))
  const recentMonths = useMemo(() => {
    const months = [...new Set(Object.keys(pay).map(cp => cp.slice(0, 7)))].sort().reverse()
    return months.slice(0, 4)
  }, [pay])

  const pickMonth = (m: string) => { setFrom(`${m}-1`); setTo(`${m}-2`) }
  const setFromKeep = (v: string) => { setFrom(v); if (v > to) setTo(v) }
  const setToKeep = (v: string) => { setTo(v); if (v < from) setFrom(v) }

  const record = async (siUrl: string | null) => {
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/payroll/si-submissions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultantId: consultant.id, keys: coverageKeys(range), siUrl }),
      })
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'Failed to record the invoice'); setBusy(false); return }
      onRecorded()
    } catch { setError('Failed to record the invoice'); setBusy(false) }
  }

  const send = async () => {
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/payroll/si-reminder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultantId: consultant.id, cutoffPeriods: range, channel: mode }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'Failed to send the reminder'); setBusy(false); return }
      onSent(`${mode === 'SMS' ? 'SMS' : 'Email'} sent to ${d.to} for ${fig.periodLabels}`)
    } catch { setError('Failed to send the reminder'); setBusy(false) }
  }

  const title = mode === 'upload' ? 'Upload Service Invoice' : mode === 'SMS' ? 'SMS reminder' : 'Email reminder'
  const contact = mode === 'SMS' ? consultant.phone : mode === 'EMAIL' ? consultant.email : null
  const selectCls = 'px-3 py-2 rounded-xl border text-sm bg-white'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{title}</h2>
            <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
              {consultant.name}{contact ? ` · ${contact}` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* 1. Period */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--deep-teal)' }}>
              {mode === 'upload' ? 'What does this invoice cover?' : 'Which period should they invoice?'}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={from} onChange={e => setFromKeep(e.target.value)} className={selectCls} style={{ borderColor: 'var(--light-gray)' }}>
                {choices.map(cp => <option key={cp} value={cp}>{cutoffShort(cp)}</option>)}
              </select>
              <span className="text-sm" style={{ color: 'var(--mid-gray)' }}>to</span>
              <select value={to} onChange={e => setToKeep(e.target.value)} className={selectCls} style={{ borderColor: 'var(--light-gray)' }}>
                {choices.map(cp => <option key={cp} value={cp}>{cutoffShort(cp)}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {outstanding.length > 0 && (
                <button type="button" onClick={() => { setFrom(outstanding[0]); setTo(outstanding[outstanding.length - 1]) }}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold border" style={{ borderColor: '#f59e0b', color: '#92400e', background: '#fffbeb' }}>
                  Not yet invoiced
                </button>
              )}
              {recentMonths.map(m => (
                <button key={m} type="button" onClick={() => pickMonth(m)}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                  style={from === `${m}-1` && to === `${m}-2`
                    ? { borderColor: 'var(--teal)', background: 'var(--teal)', color: '#fff' }
                    : { borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                  {MON[parseInt(m.slice(5)) - 1]} {m.slice(0, 4)}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Figures for exactly that range */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Cutoff</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Gross fees</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">EWT</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Net</th>
                </tr>
              </thead>
              <tbody>
                {range.map(cp => {
                  const p = pay[cp]
                  const done = isCovered(cp, covered)
                  return (
                    <tr key={cp} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>
                        {cutoffShort(cp)}
                        {done && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#dcfce7', color: '#166534' }}>invoiced</span>}
                      </td>
                      {p ? (
                        <>
                          <td className="px-3 py-1.5 text-right font-mono">{peso(p.gross)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{peso(p.tax)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{peso(p.gross - p.tax)}</td>
                        </>
                      ) : (
                        <td colSpan={3} className="px-3 py-1.5 text-right text-xs italic" style={{ color: 'var(--mid-gray)' }}>no finalized payroll</td>
                      )}
                    </tr>
                  )
                })}
                <tr className="border-t font-bold" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                  <td className="px-3 py-2" style={{ color: 'var(--deep-teal)' }}>Total{fig.ewtRate ? ` · EWT ${fig.ewtRate}%` : ''}</td>
                  <td className="px-3 py-2 text-right font-mono">{peso(fig.gross)}</td>
                  <td className="px-3 py-2 text-right font-mono">{peso(fig.ewt)}</td>
                  <td className="px-3 py-2 text-right font-mono">{peso(fig.net)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {fig.paidCutoffs.length > 0 && (
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
              <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>Description:</span> {fig.description}
            </p>
          )}
          {fig.paidCutoffs.length === 0 && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: '#92400e' }}>
              <AlertTriangle size={13} /> No finalized payroll in this period{mode === 'upload' ? ', so there are no figures to check the invoice against.' : '.'}
            </p>
          )}
          {already.length > 0 && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: '#92400e' }}>
              <AlertTriangle size={13} /> Already covered by another invoice: {describeCutoffs(already)}.
            </p>
          )}
          {error && <p className="text-sm" style={{ color: '#b91c1c' }}>{error}</p>}

          {/* 3. Act */}
          {mode === 'upload' ? (
            <div className="space-y-2">
              {busy ? (
                <div className="py-4 text-center"><Loader2 size={18} className="animate-spin mx-auto" style={{ color: 'var(--teal)' }} /></div>
              ) : (
                <>
                  <ScanUpload section="consultant-si" prefix={`SI-${consultant.name.replace(/[^a-zA-Z0-9]/g, '-')}-${from}`}
                    accept="image/*,.pdf" label="Upload invoice" onUploaded={url => record(url)} />
                  <button onClick={() => record(null)} disabled={!range.length}
                    className="w-full py-2 rounded-xl text-xs font-semibold border disabled:opacity-40"
                    style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}
                    title="Record the invoice as received without keeping a copy">
                    <CheckCircle2 size={12} className="inline mr-1" /> Mark as received without a copy
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
              <button onClick={send} disabled={busy || !contact || fig.paidCutoffs.length === 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                {busy ? <Loader2 size={14} className="inline animate-spin" /> : `Send ${mode === 'SMS' ? 'SMS' : 'email'}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
