'use client'

// Accounts Receivable → HMO → Payment History. Our HMO collections and the HMO
// PVs made out to doctors sit side by side as two matching cards (Hannah
// 2026-10-31): collapsed, each shows how much of its HMO orders is paid, the
// latest payments and its Record button; Expand opens the full table to check
// or add to.

import { useEffect, useState } from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export interface RecentPayment {
  id: string
  date: string
  ref: string
  who: string
  amount: number
  /** Amber dot — e.g. a payment still awaiting the HMO officer's check. */
  flagged?: boolean
}

const RECENT = 5

export default function PaymentsCard({
  title, icon, count, subtitle, paid, billed, paidCaption, recent, action, toolbar, children,
}: {
  title: string
  icon?: React.ReactNode
  count: string | number
  subtitle: string
  /** Numerator and denominator of "% Paid vs HMO Orders". */
  paid: number
  billed: number
  paidCaption: string
  /** Newest first; only the first few are shown while collapsed. */
  recent: RecentPayment[]
  /** The card's Record button — shown collapsed and expanded. */
  action?: React.ReactNode
  /** Search / filter controls, only worth the space once expanded. */
  toolbar?: React.ReactNode
  /** The full table, rendered only when expanded. */
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)

  // Escape closes, and the page behind must not scroll while the overlay is up.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [expanded])

  const pct = billed > 0 ? Math.min(100, (paid / billed) * 100) : 0
  const badge = (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>{count}</span>
  )
  const toggle = (
    <button
      onClick={() => setExpanded(v => !v)}
      title={expanded ? 'Back to the cards' : 'Open the full table'}
      className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border hover:bg-gray-50 shrink-0 bg-white"
      style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
      {expanded ? <><Minimize2 size={12} /> Collapse</> : <><Maximize2 size={12} /> Expand</>}
    </button>
  )

  if (expanded) {
    // z-40 keeps the Record / Edit payment modals (z-50) above the overlay.
    return (
      <div className="fixed inset-0 z-40 flex flex-col p-4 sm:p-6" style={{ background: 'rgba(15,23,42,0.55)' }}>
        <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full h-full overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b shrink-0"
            style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <div className="min-w-0">
              <p className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>{icon}{title}{badge}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                <span className="font-semibold" style={{ color: '#166534' }}>{pct.toFixed(1)}% paid vs HMO orders</span> · {paidCaption}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {toolbar}
              {action}
              {toggle}
              <button onClick={() => setExpanded(false)} className="p-1.5 rounded-lg hover:bg-gray-200" title="Close">
                <X size={16} style={{ color: 'var(--mid-gray)' }} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">{children}</div>
        </div>
      </div>
    )
  }

  const shown = recent.slice(0, RECENT)
  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-3 h-full" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>{icon}{title}{badge}</h3>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{subtitle}</p>
        </div>
        {toggle}
      </div>

      <div className="rounded-xl p-4 border" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
        <p className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>% Paid vs HMO Orders</p>
        <p className="text-xl font-bold" style={{ color: '#166534' }}>{pct.toFixed(1)}%</p>
        <div className="mt-2 rounded-full overflow-hidden h-2" style={{ background: 'var(--light-gray)' }}>
          <div style={{ width: `${pct}%`, background: '#16a34a', height: '100%', transition: 'width 0.4s' }} />
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>{paidCaption}</p>
      </div>

      <div className="flex-1">
        <p className="text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Latest</p>
        {shown.length === 0 ? (
          <p className="text-xs py-3" style={{ color: 'var(--mid-gray)' }}>Nothing recorded yet.</p>
        ) : (
          <div>
            {shown.map(r => (
              <div key={r.id} className="flex items-center gap-2 py-1.5 text-xs border-t first:border-t-0" style={{ borderColor: 'var(--light-gray)' }}>
                <span className="w-[84px] shrink-0 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{r.date}</span>
                <span className="w-[120px] shrink-0 truncate font-mono" style={{ color: 'var(--charcoal)' }} title={r.ref}>
                  {r.flagged && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ background: '#f59e0b' }} title="For review" />}
                  {r.ref || '—'}
                </span>
                <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--charcoal)' }} title={r.who}>{r.who}</span>
                <span className="shrink-0 font-medium whitespace-nowrap" style={{ color: '#166534' }}>{formatCurrency(r.amount)}</span>
              </div>
            ))}
          </div>
        )}
        {recent.length > shown.length && (
          <button onClick={() => setExpanded(true)} className="mt-1 text-[11px] font-semibold hover:underline" style={{ color: 'var(--teal)' }}>
            +{recent.length - shown.length} more — expand to see all
          </button>
        )}
      </div>

      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}
