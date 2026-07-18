'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getPaymentsForStudent, getFeeFor, hydrateFees,
  listPersonalVouchersFor,
  inferPaymentPlanFor,
  type StoredUser, type PaymentPlan, type FeeSchedule, type PersonalVoucher,
} from '@/lib/session'

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

  return (
    <div className="card-static">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>Plan change</div>
          <h2 className="text-[16px] leading-tight">Switch payment plan</h2>
        </div>
        <div className="text-[11.5px] text-[color:var(--mid-gray)]">
          Current plan: <span className="font-semibold text-[color:var(--narra)]">{currentPlan ? planLabel(currentPlan) : '—'}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <label className="text-[11.5px] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>Switch to</label>
        <select
          className="input text-[13px]"
          value={targetPlan}
          onChange={e => setTargetPlan(e.target.value as PaymentPlan)}
          style={{ maxWidth: 180 }}
        >
          <option value="ANNUAL">Annual</option>
          <option value="BIANNUAL">Bi-annual</option>
          <option value="MONTHLY">Monthly</option>
        </select>
        {bestVoucher && (
          <label className="inline-flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={applyVoucher} onChange={e => setApplyVoucher(e.target.checked)} />
            Apply {bestVoucher.discountPercent}% voucher <span className="font-mono text-[11.5px] text-[color:var(--mid-gray)]">({bestVoucher.code})</span>
          </label>
        )}
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--paper-3)' }}>
        <table className="w-full text-[13px]">
          <tbody>
            <tr className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
              <td className="py-1.5 px-3 text-[color:var(--mid-gray)]">{planLabel(targetPlan)} tuition</td>
              <td className="py-1.5 px-3 text-right tabular-nums">{fmt(targetTuition)}</td>
            </tr>
            {discountPct > 0 && (
              <tr className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                <td className="py-1.5 px-3 text-[color:var(--mid-gray)]">Less {discountPct}% voucher discount</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={{ color: '#059669' }}>−{fmt(discountCentavos)}</td>
              </tr>
            )}
            <tr className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
              <td className="py-1.5 px-3 text-[color:var(--mid-gray)]">Miscellaneous fee (not discounted)</td>
              <td className="py-1.5 px-3 text-right tabular-nums">+{fmt(targetMisc)}</td>
            </tr>
            <tr className="border-b" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
              <td className="py-1.5 px-3 font-semibold">Gross on new plan</td>
              <td className="py-1.5 px-3 text-right tabular-nums font-semibold">{fmt(grossOnNewPlan)}</td>
            </tr>
            <tr className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
              <td className="py-1.5 px-3 text-[color:var(--mid-gray)]">Less already paid (current plan)</td>
              <td className="py-1.5 px-3 text-right tabular-nums" style={{ color: '#059669' }}>−{fmt(alreadyPaidCentavos)}</td>
            </tr>
            <tr style={{ background: '#f0fdf4' }}>
              <td className="py-2 px-3 font-semibold text-[color:var(--deep-teal)]">Balance to collect</td>
              <td className="py-2 px-3 text-right tabular-nums font-bold text-[color:var(--deep-teal)] text-[15px]">{fmt(balanceCentavos)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-3 leading-relaxed">
        To apply the change, open <span className="font-semibold">Admin → Payments → &ldquo;+ Record payment&rdquo;</span>. Pick <span className="font-semibold">{planLabel(targetPlan)}</span> as the plan, enter <span className="font-semibold">{fmt(balanceCentavos).replace('₱', '')}</span> as the amount, and use the period <span className="italic">{targetPeriodHint}</span>. The next payment recorded under the new plan flips the student&rsquo;s inferred plan going forward.
      </p>
    </div>
  )
}
