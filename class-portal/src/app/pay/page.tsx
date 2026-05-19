'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getAuth, getUsers, getPaymentsForStudent, savePayment,
  levelLabel,
  type PaymentPlan, type PaymentRecord, type StoredUser,
} from '@/lib/session'

// Centavos (PHP × 100).
const TUITION_ANNUAL   = 80_000_00
const TUITION_BIANNUAL = 45_000_00
const TUITION_MONTHLY  =  9_500_00
const MISC_ANNUAL      =  5_000_00

const PLANS: Array<{
  plan: PaymentPlan; title: string; tuition: number; misc: number; period: string; deadline: string;
}> = [
  { plan: 'ANNUAL',   title: 'Annual',    tuition: TUITION_ANNUAL,   misc: MISC_ANNUAL, period: 'Annual SY 2026–2027', deadline: 'Every 5th of June (lump sum)' },
  { plan: 'BIANNUAL', title: 'Bi-annual', tuition: TUITION_BIANNUAL, misc: MISC_ANNUAL, period: 'First half SY 2026–2027', deadline: 'Every 5th of December' },
  { plan: 'MONTHLY',  title: 'Monthly',   tuition: TUITION_MONTHLY,  misc: 0,           period: thisMonthPeriod(),    deadline: 'Every 5th of the month' },
]

function thisMonthPeriod(): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const d = new Date()
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

function fmt(cents: number): string {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function PayPage() {
  const router = useRouter()
  const [user, setUser] = useState<StoredUser | null>(null)
  const [selected, setSelected] = useState<PaymentPlan>('ANNUAL')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [history, setHistory] = useState<PaymentRecord[]>([])

  useEffect(() => {
    const auth = getAuth()
    if (!auth) { router.replace('/sign-in'); return }
    if (auth.role === 'ADMIN') { router.replace('/admin'); return }
    if (!auth.userId) { router.replace('/sign-in'); return }
    const u = getUsers().find(x => x.id === auth.userId) ?? null
    if (!u) { router.replace('/sign-in'); return }
    setUser(u)
    setHistory(getPaymentsForStudent(u.id))
  }, [router])

  const plan = useMemo(() => PLANS.find(p => p.plan === selected)!, [selected])

  async function handlePay() {
    if (!user) return
    setBusy(true); setErr(null)
    try {
      const paymentId = 'pmt_' + Math.random().toString(36).slice(2, 12)
      // Record a PENDING payment up-front so the admin sees it even if the
      // parent abandons checkout.
      const studentName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
      const record: PaymentRecord = {
        id: paymentId,
        studentId: user.id,
        studentEmail: user.email,
        plan: plan.plan,
        tuitionAmount: plan.tuition,
        miscAmount: plan.misc,
        period: plan.period,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      }
      savePayment(record)

      const res = await fetch('/api/pay/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: user.id,
          studentEmail: user.email,
          studentName,
          plan: plan.plan,
          paymentId,
          tuitionAmount: plan.tuition,
          miscAmount: plan.misc,
          period: plan.period,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error ?? `Checkout failed (${res.status})`)
      }
      const data = await res.json() as { checkoutId: string; checkoutUrl: string }
      savePayment({ ...record, paymongoCheckoutId: data.checkoutId, paymongoCheckoutUrl: data.checkoutUrl })
      window.location.assign(data.checkoutUrl)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  if (!user) return null

  const total = plan.tuition + plan.misc

  return (
    <div className="max-w-4xl mx-auto animate-fade-up space-y-6">
      {/* Top — tuition fee table */}
      <div className="card-static">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)]" style={{ fontFamily: 'var(--font-display)' }}>Tuition fee schedule</div>
            <h1 className="text-[24px] leading-tight text-[color:var(--deep-teal)]">{user.firstName} {user.lastName} · {user.level ? levelLabel(user.level) : ''}</h1>
          </div>
          <a href="/profile" className="btn-secondary">← Back to profile</a>
        </div>

        <div className="overflow-x-auto mt-4 rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--paper-2)' }}>
              <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                <th className="py-2 px-3">Item</th>
                <th className="py-2 px-3 text-right">Amount</th>
                <th className="py-2 px-3">Deadline</th>
              </tr>
            </thead>
            <tbody>
              <Row item="Annual Tuition" amount={fmt(TUITION_ANNUAL)} deadline="Every 5th of June" />
              <Row item="Bi-annual Payment" amount={fmt(TUITION_BIANNUAL) + ' / half'} deadline="Every 5th of December" />
              <Row item="Monthly Payment" amount={fmt(TUITION_MONTHLY) + ' / month'} deadline="Every 5th of the month" />
              <Row item="Miscellaneous" amount={fmt(MISC_ANNUAL) + ' / year'} deadline="With annual / bi-annual" />
              <Row item="Books" amount="May ask with front desk" deadline="—" />
              <Row item="Uniform" amount="May ask with front desk" deadline="—" />
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan picker + checkout summary */}
      <div className="card-static">
        <h2 className="text-[18px] leading-tight mb-3">Choose your payment plan</h2>
        <div className="grid sm:grid-cols-3 gap-2.5">
          {PLANS.map(p => (
            <button
              key={p.plan}
              type="button"
              onClick={() => setSelected(p.plan)}
              className={`level-tile ${selected === p.plan ? 'level-tile-active' : ''}`}
            >
              <span className="level-tile-title">{p.title}</span>
              <span className="level-tile-sub">{fmt(p.tuition)}{p.misc > 0 ? ` + ${fmt(p.misc)} misc` : ''}</span>
            </button>
          ))}
        </div>

        {err && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">
            {err}
          </div>
        )}

        <div className="mt-5 rounded-xl p-4 border" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
          <div className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--mid-gray)] font-semibold mb-2" style={{ fontFamily: 'var(--font-display)' }}>Checkout summary</div>
          <dl className="grid grid-cols-2 text-sm gap-y-1">
            <dt className="text-[color:var(--mid-gray)]">{plan.title} tuition</dt>
            <dd className="text-right font-mono">{fmt(plan.tuition)}</dd>
            {plan.misc > 0 && <>
              <dt className="text-[color:var(--mid-gray)]">Miscellaneous</dt>
              <dd className="text-right font-mono">{fmt(plan.misc)}</dd>
            </>}
            <dt className="text-[color:var(--narra)] font-bold pt-2 border-t mt-1" style={{ borderColor: 'var(--paper-3)' }}>Total to pay</dt>
            <dd className="text-right font-mono font-bold pt-2 border-t mt-1 text-[color:var(--narra)]" style={{ borderColor: 'var(--paper-3)' }}>{fmt(total)}</dd>
          </dl>
          <div className="text-[11.5px] text-[color:var(--mid-gray)] mt-3" style={{ fontFamily: 'var(--font-display)' }}>
            Period covered: <span className="font-semibold text-[color:var(--ink)]">{plan.period}</span> · Deadline: <span className="font-semibold text-[color:var(--ink)]">{plan.deadline}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePay}
          disabled={busy}
          className="btn-cta w-full mt-5"
        >
          {busy ? 'Opening secure checkout…' : `Proceed to PayMongo checkout — ${fmt(total)}`}
        </button>
        <p className="text-[11px] text-[color:var(--mid-gray)] text-center mt-2" style={{ fontFamily: 'var(--font-display)' }}>
          You will be redirected to PayMongo. Card, GCash, Maya, and GrabPay are supported.
        </p>
      </div>

      {/* Payment history */}
      {history.length > 0 && (
        <div className="card-static">
          <h2 className="text-[18px] leading-tight mb-3">Your payment history</h2>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Plan</th>
                  <th className="py-2 px-3">Period</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map(p => (
                  <tr key={p.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                    <td className="py-2.5 px-3 text-[12.5px]">{new Date(p.paidAt ?? p.createdAt).toLocaleDateString()}</td>
                    <td className="py-2.5 px-3">{p.plan}</td>
                    <td className="py-2.5 px-3 text-[12.5px]">{p.period}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{fmt(p.tuitionAmount + p.miscAmount)}</td>
                    <td className="py-2.5 px-3"><span className={`badge ${p.status === 'PAID' ? 'badge-paid' : 'badge-pending'}`}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ item, amount, deadline }: { item: string; amount: string; deadline: string }) {
  return (
    <tr className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
      <td className="py-2.5 px-3 font-semibold text-[color:var(--narra)]">{item}</td>
      <td className="py-2.5 px-3 text-right font-mono">{amount}</td>
      <td className="py-2.5 px-3 text-[12.5px] text-[color:var(--mid-gray)]">{deadline}</td>
    </tr>
  )
}
