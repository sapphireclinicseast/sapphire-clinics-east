'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession } from '@/lib/session'
import { TELE_CATALOG, checkoutUrlFor, pwdNet, type TeleDept } from '@/lib/tele-services'
import { branchLabel } from '@/lib/branch-label'
import { BookingSteps } from '@/components/booking/BookingSteps'
import {
  PageHeader, DashCard, Banner, Tag, Icon,
  BTN_PRIMARY, BTN_SECONDARY, PRIMARY_STYLE, SECONDARY_STYLE, SUBTLE_BG, TR,
} from '@/components/hub/ui'

const DEPT_LABELS: Record<TeleDept, string> = {
  OT: 'Occupational Therapy',
  SLP: 'Speech-Language Pathology',
}

function peso(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`
}

export default function BookTeletherapyPage() {
  return (
    <Suspense fallback={<div className="text-sm" style={{ color: 'var(--mid-gray)' }}>Loading…</div>}>
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

  async function handleBookAndPay(item: { id: string; name: string }, dept: 'OT' | 'SLP') {
    const url = checkoutUrlFor(branch, dept, item.id)
    if (!url) return
    // Open a blank window synchronously (popup blockers require it inside the click
    // handler), then point it at the pay link once the tracking booking exists so the
    // payment carries ?ref=<bookingId>. That ref lands on the accounting-hub checkout
    // and lets the Decking Module verify the payment was recorded there — without it
    // there is no machine link between this booking and the PayMongo payment.
    // NOTE: cannot pass 'noopener' here — window.open would return null and we could
    // not navigate the tab; opener is severed by hand below instead.
    const w = window.open('about:blank', '_blank')
    let target = url
    const session = getSession()
    if (session?.token) {
      try {
        const r = await fetch('/api/booking-proxy/bookings-tele', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: session.token,
            branch,
            department: dept,
            serviceId: item.id,
            serviceName: item.name,
          }),
        })
        const j = await r.json().catch(() => ({}))
        if (r.ok && j.bookingId) {
          target = `${url}${url.includes('?') ? '&' : '?'}ref=${encodeURIComponent(j.bookingId)}`
        }
      } catch {} // non-fatal — payment proceeds unlinked; front desk records manually
    }
    if (w) {
      try { w.opener = null } catch {}
      w.location.href = target
    } else {
      // Popup was blocked before we could grab a handle — fall back to a fresh open.
      window.open(target, '_blank', 'noopener,noreferrer')
    }
  }

  const dept = (department === 'OT' || department === 'SLP') ? (department as TeleDept) : null
  const branchName = branchLabel(branch)

  if (!dept) {
    return (
      <div className="max-w-2xl mx-auto space-y-5 min-w-0 animate-fade-up">
        <DashCard title="Service not available online" icon={<Icon name="info" size={16} />}>
          <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>This service is booked through the front desk.</p>
          <button type="button" onClick={() => router.push('/book')} className={`${BTN_SECONDARY} mt-4`} style={SECONDARY_STYLE}>← Back to services</button>
        </DashCard>
      </div>
    )
  }

  const groups = TELE_CATALOG[dept]

  return (
    <div className="max-w-3xl mx-auto space-y-5 min-w-0 animate-fade-up">
      <BookingSteps steps={['Service', 'Payment']} active={2} />

      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-2 flex-wrap"><Tag tone="brand">Teletherapy</Tag>{branchName}</span>}
        title={DEPT_LABELS[dept]}
        description="Choose a service type below and proceed to secure payment. Sessions are delivered online."
        actions={
          <button type="button" onClick={() => router.push('/book')} className={BTN_SECONDARY} style={SECONDARY_STYLE}>← Back</button>
        }
      />

      {/* PWD / Senior voucher note */}
      <Banner tone="info">
        Prices show the regular rate and the net rate with a 20% PWD / Senior Citizen discount.
        A voucher is available with frontdesk for the PWD discount after validation of ID.
      </Banner>

      {groups.map((g) => (
        <DashCard key={g.label} title={g.label} flush>
          <ul>
            {g.items.map((item, idx) => {
              const url = checkoutUrlFor(branch, dept, item.id)
              const net = pwdNet(item.gross)
              return (
                <li
                  key={item.id}
                  className={`${TR} px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3`}
                  style={idx ? { borderTop: '1px solid var(--light-gray)' } : undefined}
                >
                  <div className="min-w-0 sm:flex-1">
                    <div className="text-sm font-semibold leading-snug sm:truncate" style={{ color: 'var(--charcoal)' }} title={item.name}>{item.name}</div>
                    {item.note && (
                      <div className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--mid-gray)' }}>{item.note}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="text-right leading-none" style={{ fontFamily: 'var(--font-display)' }}>
                      <div className="text-[9.5px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--mid-gray)' }}>Regular</div>
                      <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--charcoal)' }}>{peso(item.gross)}</div>
                    </div>
                    <div className="text-right leading-none rounded-lg px-2.5 py-1.5" style={{ fontFamily: 'var(--font-display)', background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                      <div className="text-[9.5px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--teal)' }}>PWD / Senior</div>
                      <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--deep-teal)' }}>{peso(net)}</div>
                    </div>

                    {url ? (
                      <button
                        type="button"
                        onClick={() => handleBookAndPay(item, dept)}
                        className={`${BTN_PRIMARY} shrink-0 ml-auto sm:ml-0`}
                        style={PRIMARY_STYLE}
                      >
                        Book &amp; Pay
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        title="Payment link coming soon"
                        className={`${BTN_PRIMARY} shrink-0 ml-auto sm:ml-0`}
                        style={PRIMARY_STYLE}
                      >
                        Coming soon
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </DashCard>
      ))}

      <p className="text-xs text-center" style={{ color: 'var(--mid-gray)' }}>
        After payment, the front desk will contact you to schedule your teletherapy session and send a secure meeting link.
      </p>
    </div>
  )
}
