'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getPaymentsForStudent, getFeeFor, hydrateFees,
  listPersonalVouchersFor,
  inferPaymentPlanFor,
  type StoredUser, type PaymentPlan, type FeeSchedule, type PersonalVoucher,
} from '@/lib/session'
import { CONTROL, CONTROL_STYLE, FOCUS, LABEL, LABEL_STYLE, SUBTLE_BG, Tag } from '@/components/hub/ui'

/** Show admin / branch-admin / frontdesk the balance a student owes
 *  when switching from one plan to another (e.g. MONTHLY → BIANNUAL).
 *  Accounts for:
 *    * new-plan tuition + misc (from the branch's fee schedule)
 *    * personal early-bird voucher discount (30% off tuition only —
 *      misc is not discounted, matching the /pay page rule)
 *    * cash already collected on the OLD plan (sum of PAID payments)
 *  Output: "Balance to collect: ₱X" — this is the amount the front
 *  desk types into the record-payment modal. No wiring into a
 *  recorded payment on this pass — the calculator is a helper so
 *  the frontdesk knows what number to enter.
 */
export default function PlanSwitchCalculator({ student }: { student: StoredUser }) {
  const currentPlan = inferPaymentPlanFor(student.id) ?? null
  const [targetPlan, setTargetPlan] = useState<PaymentPlan>(
    currentPlan === 'MONTHLY' ? 'BIANNUAL' : currentPlan === 'BIANNUAL' ? 'ANNUAL' : 'BIANNUAL'
  )
  const [fee, setFee] = useState<FeeSchedule | null>(null)
  const [vouchers, setVouchers] = useState<PersonalVoucher[]>([])
  const [applyVoucher, setApplyVoucher] = useState(true)

  useEffect(() => {
    if (student.branch) setFee(getFeeFor(student.branch))
    hydrateFees().then(() => { if (student.branch) setFee(getFeeFor(student.branch)) }).catch(() => { /* ignore */ })
    listPersonalVouchersFor(student.id).then(setVouchers).catch(() => { /* ignore */ })
  }, [student.id, student.branch])

  const bestVoucher = useMemo(() => {
    const now = Date.now()
    const active = vouchers.filter(v => v.enabled && new Date(v.validUntil).getTime() > now)
    if (active.length === 0) return null
    return active.reduce((a, b) => (b.discountPercent > a.discountPercent ? b : a))
  }, [vouchers])

  const alreadyPaidCentavos = useMemo(() => {
    return getPaymentsForStudent(student.id)
      .filter(p => p.status === 'PAID')
      .reduce((sum, p) => sum + p.tuitionAmount + p.miscAmount, 0)
  }, [student.id])

  const targetTuition = useMemo(() => {
    if (!fee) return 0
    if (targetPlan === 'ANNUAL')   return fee.tuitionAnnualCentavos
    if (targetPlan === 'BIANNUAL') return fee.tuitionBiannualCentavos
    return fee.tuitionMonthlyCentavos
  }, [fee, targetPlan])
  const targetMisc = useMemo(() => {
    if (!fee) return 0
    if (targetPlan === 'ANNUAL')   return fee.miscAnnualCentavos
    if (targetPlan === 'BIANNUAL') return fee.miscBiannualCentavos
    return fee.miscMonthlyCentavos
  }, [fee, targetPlan])

  const discountPct = applyVoucher && bestVoucher ? bestVoucher.discountPercent : 0
  const discountCentavos = Math.round((targetTuition * discountPct) / 100)
  const discountedTuition = Math.max(0, targetTuition - discountCentavos)
  const grossOnNewPlan = discountedTuition + targetMisc
  const balanceCentavos = Math.max(0, grossOnNewPlan - alreadyPaidCentavos)

  function fmt(cents: number): string {
    return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  const planLabel = (p: PaymentPlan) => p === 'ANNUAL' ? 'Annual' : p === 'BIANNUAL' ? 'Bi-annual' : 'Monthly'
  const targetPeriodHint =
    targetPlan === 'ANNUAL'   ? 'AY 2026–2027 (plan change credit)' :
    targetPlan === 'BIANNUAL' ? 'First half SY 2026–2027 (plan change credit)' :
                                'Next monthly installment (plan change credit)'

  // Display only: ledger rows of the breakdown table.
  const rowStyle = { borderTop: '1px solid var(--light-gray)' }
  const credit = { color: '#2F5A28' }

  return (
    <div className="rounded-xl p-4 min-w-0" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>Plan change</p>
          <h3 className="text-[14px] font-bold leading-tight tracking-normal mt-0.5" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Switch payment plan</h3>
        </div>
        <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>
          Current plan: <Tag tone="brand">{currentPlan ? planLabel(currentPlan) : '—'}</Tag>
        </div>
      </div>

      <div className="flex items-end gap-3 flex-wrap mb-3">
        <div>
          <label htmlFor={`plan-switch-${student.id}`} className={LABEL} style={LABEL_STYLE}>Switch to</label>
          <select
            id={`plan-switch-${student.id}`}
            className={`${CONTROL} min-w-[160px]`}
            value={targetPlan}
            onChange={e => setTargetPlan(e.target.value as PaymentPlan)}
            style={CONTROL_STYLE}
          >
            <option value="ANNUAL">Annual</option>
            <option value="BIANNUAL">Bi-annual</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </div>
        {bestVoucher && (
          <label className="inline-flex items-center gap-2 text-[12.5px] h-9 cursor-pointer" style={{ color: 'var(--charcoal)' }}>
            <input type="checkbox" className={`w-4 h-4 accent-[color:var(--deep-teal)] ${FOCUS}`} checked={applyVoucher} onChange={e => setApplyVoucher(e.target.checked)} />
            <span className="[overflow-wrap:anywhere]">Apply {bestVoucher.discountPercent}% voucher <span className="font-mono text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>({bestVoucher.code})</span></span>
          </label>
        )}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
        <table className="w-full text-[13px]">
          <caption className="sr-only">Balance to collect on the {planLabel(targetPlan)} plan</caption>
          <tbody>
            <tr>
              <th scope="row" className="py-2 px-3 text-left font-normal" style={{ color: 'var(--mid-gray)' }}>{planLabel(targetPlan)} tuition</th>
              <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">{fmt(targetTuition)}</td>
            </tr>
            {discountPct > 0 && (
              <tr style={rowStyle}>
                <th scope="row" className="py-2 px-3 text-left font-normal" style={{ color: 'var(--mid-gray)' }}>Less {discountPct}% voucher discount</th>
                <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap" style={credit}>−{fmt(discountCentavos)}</td>
              </tr>
            )}
            <tr style={rowStyle}>
              <th scope="row" className="py-2 px-3 text-left font-normal" style={{ color: 'var(--mid-gray)' }}>Miscellaneous fee (not discounted)</th>
              <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">+{fmt(targetMisc)}</td>
            </tr>
            <tr style={{ ...rowStyle, background: SUBTLE_BG }}>
              <th scope="row" className="py-2 px-3 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>Gross on new plan</th>
              <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap font-semibold">{fmt(grossOnNewPlan)}</td>
            </tr>
            <tr style={rowStyle}>
              <th scope="row" className="py-2 px-3 text-left font-normal" style={{ color: 'var(--mid-gray)' }}>Less already paid (current plan)</th>
              <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap" style={credit}>−{fmt(alreadyPaidCentavos)}</td>
            </tr>
            <tr style={{ ...rowStyle, background: 'var(--pale-teal)' }}>
              <th scope="row" className="py-2.5 px-3 text-left font-bold" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>Balance to collect</th>
              <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap font-bold text-[15px]" style={{ color: 'var(--deep-teal)', fontFamily: 'var(--font-display)' }}>{fmt(balanceCentavos)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] mt-3 leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
        To apply the change, open <span className="font-semibold">Admin → Payments → &ldquo;+ Record payment&rdquo;</span>. Pick <span className="font-semibold">{planLabel(targetPlan)}</span> as the plan, enter <span className="font-semibold">{fmt(balanceCentavos).replace('₱', '')}</span> as the amount, and use the period <span className="italic">{targetPeriodHint}</span>. The next payment recorded under the new plan flips the student&rsquo;s inferred plan going forward.
      </p>
    </div>
  )
}
