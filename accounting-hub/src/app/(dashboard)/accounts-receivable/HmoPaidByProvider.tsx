'use client'

// "% paid per HMO" (Hannah 2026-11-19): one bar per HMO showing how much of what
// we billed it is already paid. Same basis as the % Settled card above it —
// sessions tagged to an HMO payment, plus the SCI (BGC) settlement counted only
// for the PDCs already deposited — so the rows add up to that card.

import { useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/utils'

export interface ProviderSettled {
  label: string
  billed: number
  paid: number
  sci: number
  sessions: number
  paidSessions: number
}

const PAID = '#16a34a'
const SCI_PAID = '#2a78d6'
const SCI_PENDING = 'repeating-linear-gradient(135deg, #2a78d6 0 2px, #c9dcf5 2px 5px)'
const UNPAID = 'var(--light-gray)'

type SortKey = 'billed' | 'pct'

const share = (v: number, of: number) => (of > 0 ? `${(v / of) * 100}%` : '0%')

// One stacked bar: paid by the HMO, BGC deposited, BGC still in PDCs; the grey
// track behind them is what is not yet paid.
function SettleBar({ r }: { r: { billed: number; paid: number; sciPaid: number; sciPending: number } }) {
  return (
    <div className="flex h-3 w-full rounded-full overflow-hidden" style={{ background: UNPAID }}>
      {r.paid > 0 && <div title={`Paid by the HMO: ${formatCurrency(r.paid)}`} style={{ width: share(r.paid, r.billed), background: PAID }} />}
      {r.sciPaid > 0.5 && <div title={`Paid by BGC (SCI settlement): ${formatCurrency(r.sciPaid)}`} style={{ width: share(r.sciPaid, r.billed), background: SCI_PAID }} />}
      {r.sciPending > 0.5 && <div title={`BGC, PDCs not yet deposited: ${formatCurrency(r.sciPending)}`} style={{ width: share(r.sciPending, r.billed), background: SCI_PENDING }} />}
    </div>
  )
}

// One HMO (or the total): phones get name + % on top, the bar, then the amounts;
// wider screens put the name left, the bar in the middle and the numbers right.
const ROW = "grid items-center gap-x-3 gap-y-1 [grid-template-columns:minmax(0,1fr)_auto] [grid-template-areas:'name_pct'_'bar_bar'_'amt_amt'] sm:[grid-template-columns:9rem_minmax(0,1fr)_18rem] sm:[grid-template-areas:'name_bar_pct'_'name_bar_amt']"

function Row({ label, strong, pct, settled, billed, unpaid, pdc, bar, title }: {
  label: string
  strong?: boolean
  pct: number
  settled: number
  billed: number
  /** Not paid and not covered by the BGC settlement. */
  unpaid: number
  /** Covered by BGC post-dated checks not yet deposited. */
  pdc: number
  bar: { billed: number; paid: number; sciPaid: number; sciPending: number }
  title?: string
}) {
  return (
    <div className={ROW} title={title}>
      <span className={`[grid-area:name] text-xs truncate ${strong ? 'font-semibold' : 'font-medium'}`} style={{ color: 'var(--charcoal)' }}>{label}</span>
      <div className="[grid-area:bar] min-w-0" role="img" aria-label={`${label}: ${pct.toFixed(1)}% paid, ${formatCurrency(unpaid + pdc)} not yet paid`}>
        <SettleBar r={bar} />
      </div>
      <span className="[grid-area:pct] text-right text-xs font-bold tabular-nums leading-tight"
        style={{ color: strong || pct >= 99.95 ? '#166534' : 'var(--charcoal)' }}>{pct.toFixed(1)}%</span>
      <span className="[grid-area:amt] sm:text-right text-[11px] tabular-nums leading-tight" style={{ color: 'var(--mid-gray)' }}>
        {formatCurrency(settled)} of {formatCurrency(billed)}
        {unpaid >= 0.5 && <span style={{ color: '#b91c1c' }}> · {formatCurrency(unpaid)} unpaid</span>}
        {pdc >= 0.5 && <span style={{ color: '#1d5fae' }}> · {formatCurrency(pdc)} in BGC PDCs</span>}
      </span>
    </div>
  )
}

export default function HmoPaidByProvider({ rows, sciPaidShare }: {
  rows: ProviderSettled[]
  /** Share of the SCI (BGC) settlement already deposited, 0–1. */
  sciPaidShare: number
}) {
  const [sort, setSort] = useState<SortKey>('billed')

  const data = useMemo(() => {
    const list = rows.filter(r => r.billed > 0).map(r => {
      const sciPaid = r.sci * sciPaidShare
      const sciPending = r.sci - sciPaid
      const unpaid = Math.max(0, r.billed - r.paid - r.sci)
      const settled = r.paid + sciPaid
      return { ...r, sciPaid, sciPending, unpaid, settled, pct: (settled / r.billed) * 100 }
    })
    return list.sort((a, b) => (sort === 'pct' ? b.pct - a.pct || b.billed - a.billed : b.billed - a.billed))
  }, [rows, sciPaidShare, sort])

  if (data.length === 0) return null

  const tot = data.reduce((t, r) => ({
    billed: t.billed + r.billed, paid: t.paid + r.paid, sciPaid: t.sciPaid + r.sciPaid,
    sciPending: t.sciPending + r.sciPending, unpaid: t.unpaid + r.unpaid,
  }), { billed: 0, paid: 0, sciPaid: 0, sciPending: 0, unpaid: 0 })
  const totPct = tot.billed > 0 ? ((tot.paid + tot.sciPaid) / tot.billed) * 100 : 0
  const hasSci = data.some(r => r.sci > 0)
  return (
    <div className="rounded-xl border p-4 min-w-0" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Payment Status by HMO</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>How much of each HMO&rsquo;s billed sessions is already paid</p>
        </div>
        <div className="flex items-center gap-1 text-xs" role="group" aria-label="Sort HMOs">
          <span style={{ color: 'var(--mid-gray)' }}>Sort:</span>
          {([['billed', 'Billed'], ['pct', '% paid']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setSort(k)} aria-pressed={sort === k}
              className="px-2 py-0.5 rounded-full border"
              style={sort === k
                ? { borderColor: 'var(--teal)', background: 'var(--pale-teal)', color: 'var(--deep-teal)', fontWeight: 600 }
                : { borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: PAID }} />Paid by the HMO</span>
        {hasSci && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: SCI_PAID }} />Paid by BGC (SCI settlement)</span>}
        {hasSci && tot.sciPending > 0.5 && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: SCI_PENDING }} />BGC, PDCs not yet deposited</span>}
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border" style={{ background: UNPAID, borderColor: '#cbd2d9' }} />Not yet paid</span>
      </div>

      <ul className="space-y-2.5">
        {data.map(r => (
          <li key={r.label}>
            <Row label={r.label} pct={r.pct} settled={r.settled} billed={r.billed} unpaid={r.unpaid} pdc={r.sciPending} bar={r}
              title={`${r.label}: ${formatCurrency(r.settled)} paid of ${formatCurrency(r.billed)} billed · ${r.paidSessions} of ${r.sessions} sessions settled`} />
          </li>
        ))}
      </ul>

      <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--light-gray)' }}>
        <Row label="All HMOs" strong pct={totPct} settled={tot.paid + tot.sciPaid} billed={tot.billed} unpaid={tot.unpaid} pdc={tot.sciPending} bar={tot} />
      </div>
    </div>
  )
}
