'use client'

import { useState } from 'react'
import { APP_FEE_PHP, PAYMONGO_FEES, computeSplit } from '@/lib/earnings'

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (n: number) => `${(n * 100).toLocaleString('en-PH', { maximumFractionDigits: 3 })}%`

// Shows the therapist exactly what they take home for a given rate, per payment
// method: rate − ₱20 app fee − PayMongo processing fee (which varies by method).
export default function NetCalculator({ defaultAmount }: { defaultAmount?: string }) {
  const [amt, setAmt] = useState(defaultAmount && Number(defaultAmount) > 0 ? String(defaultAmount) : '1500')
  const amount = Math.max(0, Number(amt) || 0)

  return (
    <section className="card">
      <h2 className="text-[16px] font-semibold">What you take home</h2>
      <p className="mb-3 mt-1 text-[12.5px] leading-relaxed text-[color:var(--slate)]">
        {APP_FEE_PHP > 0
          ? <>Nickel keeps a flat <b className="text-[color:var(--ink)]">₱{APP_FEE_PHP}</b> per session. On top of that, our payment channel partner <b className="text-[color:var(--ink)]">PayMongo</b> deducts a transaction fee that depends on how the patient pays. <b className="text-[color:var(--ink)]">You receive your rate net of both.</b> Enter a rate to see your net by payment method.</>
          : <><b className="text-[color:var(--ink)]">Nickel is currently free to use</b> — no app fee. Our payment channel partner <b className="text-[color:var(--ink)]">PayMongo</b> deducts only its transaction fee, which depends on how the patient pays. <b className="text-[color:var(--ink)]">You receive your full rate net of that fee.</b> Enter a rate to see your net by payment method.</>}
      </p>

      <div className="mb-3 max-w-[220px]">
        <div className="label">Try a rate (₱)</div>
        <input className="input" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="1500" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-[color:var(--line)]">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[color:var(--mist)] text-left text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
              <th className="px-3 py-2 font-semibold">Payment method</th>
              <th className="px-3 py-2 font-semibold">PayMongo fee</th>
              <th className="px-3 py-2 text-right font-semibold">App fee</th>
              <th className="px-3 py-2 text-right font-semibold">You receive</th>
            </tr>
          </thead>
          <tbody>
            {PAYMONGO_FEES.map((m) => {
              const s = computeSplit(amount, { method: m.key })
              return (
                <tr key={m.key} className="border-t border-[color:var(--line)]">
                  <td className="px-3 py-2.5 text-[color:var(--ink)]">{m.label}</td>
                  <td className="px-3 py-2.5 text-[color:var(--slate)]">{pct(m.pct)}{m.fixed ? ` ${m.higherOf ? 'or' : '+'} ₱${m.fixed.toFixed(2)}${m.higherOf ? ' (higher)' : ''}` : ''}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--slate)]">−{peso(s.appFee)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[color:var(--steel-deep,#1e4b7d)]">{peso(s.net)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px] text-[color:var(--muted)]">Fees shown are PayMongo&apos;s published rates and may change. The exact fee is whatever PayMongo charges on the actual payment; if a patient pays with wallet credit, no PayMongo fee applies to that portion.</p>
    </section>
  )
}
