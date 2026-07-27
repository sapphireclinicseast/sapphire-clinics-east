'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession } from '@/lib/session'
import { TELE_CATALOG, checkoutUrlFor, pwdNet, type TeleDept } from '@/lib/tele-services'

const DEPT_LABELS: Record<TeleDept, string> = {
  OT: 'Occupational Therapy',
  SLP: 'Speech-Language Pathology',
}

function peso(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`
}

export default function BookTeletherapyPage() {
  return (
    <Suspense fallback={<div className="text-sm text-[color:var(--mid-gray)]">Loading…</div>}>
      <BookTeletherapyInner />
    </Suspense>
  )
}

function BookTeletherapyInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const branch = (sp.get('branch') as 'SBEA' | 'SBGH') ?? 'SBEA'
  const department = sp.get('department') ?? ''

  useEffect(() => { if (!getSession()) router.push('/') }, [router])

  function handleBookAndPay(item: { id: string; name: string }, dept: 'OT' | 'SLP') {
    const url = checkoutUrlFor(branch, dept, item.id)
    if (!url) return
    // Open payment window immediately (must be synchronous in the click handler)
    window.open(url, '_blank', 'noopener,noreferrer')
    // Fire-and-forget: create a tracking record in the ops hub so this booking
    // appears in the Decking Module for the front desk to confirm and schedule.
    const session = getSession()
    if (session?.token) {
      fetch('/api/booking-proxy/bookings-tele', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: session.token,
          branch,
          department: dept,
          serviceId: item.id,
          serviceName: item.name,
        }),
      }).catch(() => {}) // non-fatal — front desk can handle manually if this fails
    }
  }

  const dept = (department === 'OT' || department === 'SLP') ? (department as TeleDept) : null
  const branchName = branch === 'SBEA' ? 'East Branch' : 'Greenhills Branch'

  if (!dept) {
    return (
      <div className="animate-fade-up max-w-2xl">
        <div className="card-static">
          <h1 className="text-[24px] text-[color:var(--narra)]">Service not available online</h1>
          <p className="text-sm text-[color:var(--mid-gray)] mt-2">This service is booked through the front desk.</p>
          <button onClick={() => router.push('/book')} className="btn-secondary mt-5">← Back to services</button>
        </div>
      </div>
    )
  }

  const groups = TELE_CATALOG[dept]

  return (
    <div className="animate-fade-up max-w-3xl">
      <StepHeader active={2} />

      <div className="card-static">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-[color:var(--pale-teal)] text-[color:var(--teal)]">
                Teletherapy
              </span>
              <span className="text-[11px] uppercase tracking-[0.1em] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
                {branchName}
              </span>
            </div>
            <h1 className="text-[28px] leading-tight text-[color:var(--narra)]">{DEPT_LABELS[dept]}</h1>
            <p className="text-sm text-[color:var(--mid-gray)] mt-1">
              Choose a service type below and proceed to secure payment. Sessions are delivered online.
            </p>
          </div>
          <button onClick={() => router.push('/book')} className="btn-secondary shrink-0">← Back</button>
        </div>

        {/* PWD / Senior voucher note */}
        <div className="mt-5 flex items-start gap-2.5 text-[12px] text-[color:var(--mid-gray)] px-3.5 py-3 rounded-xl bg-[color:var(--paper-2)] border border-[color:var(--paper-3)]" style={{ fontFamily: 'var(--font-display)' }}>
          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[color:var(--moss)] shrink-0"></span>
          <span>
            Prices show the regular rate and the net rate with a 20% PWD / Senior Citizen discount.
            A voucher is available with frontdesk for the PWD discount after validation of ID.
          </span>
        </div>

        <div className="mt-6 space-y-7">
          {groups.map((g) => (
            <section key={g.label}>
              <div className="label !mb-2">{g.label}</div>
              <div className="flex flex-col gap-2.5">
                {g.items.map((item) => {
                  const url = checkoutUrlFor(branch, dept, item.id)
                  const net = pwdNet(item.gross)
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-[color:var(--paper-3)] bg-white px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 hover:border-[color:var(--sage)] hover:shadow-[0_4px_14px_rgba(27,63,56,0.06)] transition-all"
                    >
                      <div className="min-w-0 sm:flex-1">
                        <div className="text-[14px] font-semibold text-[color:var(--narra)] leading-tight sm:truncate" title={item.name}>{item.name}</div>
                        {item.note && (
                          <div className="text-[11px] text-[color:var(--mid-gray)] mt-0.5 leading-none" style={{ fontFamily: 'var(--font-display)' }}>{item.note}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="text-right leading-none" style={{ fontFamily: 'var(--font-display)' }}>
                          <div className="text-[9px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] mb-0.5">Regular</div>
                          <div className="text-[14px] font-semibold text-[color:var(--narra)] tabular-nums">{peso(item.gross)}</div>
                        </div>
                        <div className="text-right leading-none rounded-lg bg-[color:var(--paper-2)] px-2.5 py-1.5" style={{ fontFamily: 'var(--font-display)' }}>
                          <div className="text-[9px] uppercase tracking-[0.08em] text-[color:var(--moss)] mb-0.5">PWD / Senior</div>
                          <div className="text-[14px] font-semibold text-[color:var(--moss)] tabular-nums">{peso(net)}</div>
                        </div>

                        {url ? (
                          <button
                            onClick={() => handleBookAndPay(item, dept)}
                            className="btn-cta shrink-0 !px-4 !py-2 !text-[13px]"
                          >
                            Book &amp; Pay
                          </button>
                        ) : (
                          <button
                            disabled
                            title="Payment link coming soon"
                            className="btn-cta shrink-0 opacity-50 cursor-not-allowed !px-4 !py-2 !text-[13px]"
                          >
                            Coming soon
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-7 text-center" style={{ fontFamily: 'var(--font-display)' }}>
          After payment, the front desk will contact you to schedule your teletherapy session and send a secure meeting link.
        </p>
      </div>
    </div>
  )
}

function StepHeader({ active }: { active: 1 | 2 }) {
  const steps = ['Service', 'Payment']
  return (
    <div className="flex items-center gap-3 mb-6" style={{ fontFamily: 'var(--font-display)' }}>
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2
        const state = n === active ? 'active' : n < active ? 'done' : 'todo'
        return (
          <div key={label} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`step-dot ${state === 'active' ? 'step-dot-active' : state === 'done' ? 'step-dot-done' : ''}`}></span>
              <span className={`text-[11.5px] uppercase tracking-[0.12em] ${state === 'active' ? 'text-[color:var(--clay)] font-semibold' : state === 'done' ? 'text-[color:var(--moss)]' : 'text-[color:var(--mid-gray)]'}`}>
                {n}. {label}
              </span>
            </div>
            {i < steps.length - 1 && <span className="w-6 h-px bg-[color:var(--paper-3)]"></span>}
          </div>
        )
      })}
    </div>
  )
}
