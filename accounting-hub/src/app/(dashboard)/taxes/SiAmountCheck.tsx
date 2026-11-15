'use client'

/**
 * The invoice amount, checked against payroll. Shows the differences earlier
 * invoices carried into these cutoffs, what this invoice should therefore say,
 * and — when it says something else — asks where the difference goes: the
 * invoice for a later cutoff the user picks, or just a flag.
 */

import { AlertTriangle, CheckCircle2, Flag } from 'lucide-react'
import {
  amountCheck, carriedInto, carryChoices, cutoffShort, describeAdjustment, expectedInvoice,
  type CutoffPay, type SiAdjustment,
} from '@/lib/payroll/si-coverage'

export interface AmountState {
  siNumber: string
  amount: string
  /** carried differences the user chose not to settle on this invoice */
  skipIds: string[]
  /** '' = first choice, a cutoff, or 'FLAG' = don't carry */
  target: string
  note: string
}
export const emptyAmount = (): AmountState => ({ siNumber: '', amount: '', skipIds: [], target: '', note: '' })

const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export interface AmountEval {
  ready: boolean
  invoice: number | null
  payroll: number
  expected: number
  result: 'match' | 'over' | 'under' | 'nopay' | 'empty'
  diff: number
  carried: SiAdjustment[]
  choices: string[]
  target: string | null
}

/** Everything the dialog needs to show and send, from the inputs. */
export function evaluateAmount(st: AmountState, cutoffs: string[], pay: Record<string, CutoffPay>, adjustments: SiAdjustment[], covered: Set<string>): AmountEval {
  const payroll = Math.round(cutoffs.reduce((s, cp) => s + (pay[cp]?.gross || 0), 0) * 100) / 100
  const carried = carriedInto(cutoffs, adjustments).filter(a => !st.skipIds.includes(a.id))
  const expected = expectedInvoice(payroll, carried)
  const last = [...cutoffs].sort().pop() || ''
  const choices = last ? carryChoices(last, covered) : []
  const raw = st.amount.replace(/,/g, '').trim()
  const invoice = raw === '' ? null : Number(raw)
  if (invoice === null || !Number.isFinite(invoice) || invoice < 0) {
    return { ready: false, invoice: null, payroll, expected, result: 'empty', diff: 0, carried, choices, target: null }
  }
  if (payroll === 0 && carried.length === 0) {
    return { ready: true, invoice, payroll, expected, result: 'nopay', diff: 0, carried, choices, target: null }
  }
  const { diff, result } = amountCheck(invoice, expected)
  const target = result === 'match' ? null : st.target === 'FLAG' ? null : (st.target || choices[0] || null)
  return { ready: true, invoice, payroll, expected, result, diff, carried, choices, target }
}

/** The request fields for si-submissions POST / PATCH. */
export function amountPayload(st: AmountState, ev: AmountEval) {
  if (!ev.ready || ev.invoice === null) return {}
  return {
    siNumber: st.siNumber.trim() || null,
    invoiceAmount: ev.invoice,
    skipAdjustmentIds: st.skipIds,
    ...(ev.result === 'over' || ev.result === 'under' ? { carry: { targetCutoff: ev.target, note: st.note.trim() || null } } : {}),
  }
}

export function SiAmountCheck({ st, setSt, ev, allCarriedIn }: {
  st: AmountState
  setSt: (fn: (s: AmountState) => AmountState) => void
  ev: AmountEval
  /** every OPEN difference aimed at these cutoffs, including any the user unticked */
  allCarriedIn: SiAdjustment[]
}) {
  const inputCls = 'w-full px-3 py-2 rounded-xl border text-sm bg-white'
  const mismatch = ev.result === 'over' || ev.result === 'under'
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>SI No.</label>
          <input value={st.siNumber} onChange={e => setSt(s => ({ ...s, siNumber: e.target.value }))} placeholder="0204"
            className={inputCls} style={{ borderColor: 'var(--light-gray)' }} />
        </div>
        <div className="col-span-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>
            Amount on the invoice (Total Sales, before EWT) *
          </label>
          <input value={st.amount} onChange={e => setSt(s => ({ ...s, amount: e.target.value }))} inputMode="decimal" placeholder="0.00"
            className={`${inputCls} font-mono text-right`} style={{ borderColor: ev.result === 'empty' ? '#f59e0b' : 'var(--light-gray)' }} />
        </div>
      </div>

      {allCarriedIn.length > 0 && (
        <div className="rounded-xl border p-3 space-y-1.5" style={{ borderColor: '#bfdbfe', background: '#eff6ff' }}>
          <p className="text-xs font-bold" style={{ color: '#1e3a8a' }}>Carried into these cutoffs from earlier invoices</p>
          {allCarriedIn.map(a => (
            <label key={a.id} className="flex items-start gap-2 text-xs" style={{ color: '#1e3a8a' }}>
              <input type="checkbox" className="mt-0.5" checked={!st.skipIds.includes(a.id)}
                onChange={e => setSt(s => ({ ...s, skipIds: e.target.checked ? s.skipIds.filter(x => x !== a.id) : [...s.skipIds, a.id] }))} />
              <span>
                <span className="font-semibold">{a.amount > 0 ? 'Less' : 'Add'} ₱{peso(Math.abs(a.amount))}</span> — {describeAdjustment(a)}
                {a.note ? <span className="block" style={{ color: '#475569' }}>{a.note}</span> : null}
              </span>
            </label>
          ))}
        </div>
      )}

      {ev.result !== 'empty' && ev.result !== 'nopay' && (
        <div className="text-xs rounded-xl px-3 py-2 flex items-center justify-between gap-3" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>
          <span>
            Payroll ₱<span className="font-mono">{peso(ev.payroll)}</span>
            {ev.carried.length > 0 && <> {ev.carried.reduce((s, a) => s + a.amount, 0) > 0 ? '−' : '+'} carried ₱<span className="font-mono">{peso(Math.abs(ev.carried.reduce((s, a) => s + a.amount, 0)))}</span></>}
          </span>
          <span className="font-semibold">Invoice should say ₱<span className="font-mono">{peso(ev.expected)}</span></span>
        </div>
      )}

      {ev.result === 'match' && (
        <p className="text-xs flex items-center gap-1.5 font-semibold" style={{ color: '#166534' }}>
          <CheckCircle2 size={14} /> Matches.
        </p>
      )}
      {ev.result === 'nopay' && (
        <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--mid-gray)' }}>
          No finalized payroll for these cutoffs — the amount is kept, nothing to compare it with.
        </p>
      )}
      {mismatch && (
        <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: '#fecaca', background: '#fef2f2' }}>
          <p className="text-sm font-bold flex items-center gap-1.5" style={{ color: '#991b1b' }}>
            <AlertTriangle size={15} />
            The invoice is ₱<span className="font-mono">{peso(Math.abs(ev.diff))}</span> {ev.result === 'over' ? 'more' : 'less'} than it should be.
          </p>
          <p className="text-xs" style={{ color: '#7f1d1d' }}>
            {ev.result === 'over'
              ? 'They invoiced more than payroll paid. Carrying it makes a later invoice that much smaller.'
              : 'They invoiced less than payroll paid. Carrying it makes a later invoice that much bigger.'}
          </p>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: '#7f1d1d' }}>Where does the difference go?</label>
            <select value={st.target || ev.choices[0] || 'FLAG'} onChange={e => setSt(s => ({ ...s, target: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border text-sm bg-white" style={{ borderColor: '#fecaca' }}>
              {ev.choices.map(cp => (
                <option key={cp} value={cp}>
                  Settle on the invoice for {cutoffShort(cp)} ({ev.result === 'over' ? 'less' : 'add'} ₱{peso(Math.abs(ev.diff))})
                </option>
              ))}
              <option value="FLAG">Don&apos;t carry it — just flag this invoice</option>
            </select>
          </div>
          <input value={st.note} onChange={e => setSt(s => ({ ...s, note: e.target.value }))} placeholder="Note (optional) — e.g. consultant to re-issue"
            className="w-full px-3 py-2 rounded-xl border text-xs bg-white" style={{ borderColor: '#fecaca' }} />
          {!ev.target && (
            <p className="text-[11px] flex items-center gap-1" style={{ color: '#7f1d1d' }}><Flag size={11} /> It stays flagged on this consultant until someone carries or drops it.</p>
          )}
        </div>
      )}
    </div>
  )
}
