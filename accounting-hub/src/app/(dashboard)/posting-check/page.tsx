'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { ListChecks, Loader2, RefreshCw, ExternalLink } from 'lucide-react'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'

// Posting Check — every POS order compared with the books (lib/accounting/pos-gl-check).
// The nightly run (01:30) fixes what the app's own posting routines can settle;
// this page shows what is left for a person, what the next run will fix, and
// what the last run fixed.

interface Issue {
  orderId: string; orderNumber: string; branch: string; transactionDate: string; patientName: string | null
  netAmount: number; paid: number; kind: string; fixable: boolean; detail: string; gap: number; failure?: string
}
interface Run {
  runAt: string
  fixed: { orderId: string; orderNumber: string; branch: string; kind: string; amount: number }[]
  failed: { orderId: string; orderNumber: string; kind: string; reason: string }[]
}
interface Status { checkedAt: string; lastRun: Run | null; exceptions: Issue[]; pending: Issue[] }

const BRANCH: Record<string, string> = { SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills', VERDANA_STORE: 'Verdana', AURA_INSTITUTE: 'AHI' }
const KIND: Record<string, string> = {
  NOT_POSTED: 'Not in the books', NEVER_POSTED: 'Never posted', VOID_STILL_POSTED: 'Voided, still posted',
  PAYMENTS_DONT_MATCH: "Payments don't add up", POSTED_TWICE: 'Posted twice', OVER_CANCELLED: 'Cancelled too many times',
  LEFT_REOPENED: 'Left reopened',
}
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const orderHref = (id: string) => `/pos?tab=orders&focus=${encodeURIComponent(id)}`

export default function PostingCheckPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role || ''
  const canRun = role === 'ADMIN' || role === 'ACCOUNTANT'
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const fetchStatus = useCallback((fresh = false) =>
    fetch(`/api/posting-check${fresh ? '?fresh=1' : ''}`)
      .then(async r => ({ ok: r.ok, d: await r.json() }))
      .then(({ ok, d }) => {
        if (!ok) { setError(d.error || 'Could not load'); return }
        setStatus(d); setError(null)
      })
      .catch(() => setError('Could not load')), [])
  useEffect(() => { fetchStatus() }, [fetchStatus])

  const runNow = async () => {
    setRunning(true); setNote(null)
    try {
      const r = await fetch('/api/posting-check', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) setNote(d.error || 'The check failed')
      else setNote(`Check done: ${d.fixed.length} fixed${d.failed.length ? `, ${d.failed.length} could not be fixed` : ''}, ${d.exceptions} need${d.exceptions === 1 ? 's' : ''} a person.`)
      await fetchStatus(true)
    } catch { setNote('The check failed') }
    setRunning(false)
  }

  const loading = !status && !error
  const ex = status?.exceptions || []
  const pending = status?.pending || []
  const fixed = status?.lastRun?.fixed || []

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <ListChecks size={22} style={{ color: 'var(--teal)' }} /> Posting Check
          </h1>
          <p className="mt-1 text-[13px] max-w-2xl" style={{ color: 'var(--mid-gray)' }}>
            Every night at 1:30 AM the hub compares each 2026 POS order with the books. It re-posts completed orders missing from the books
            and cancels voided orders still in them. Anything that needs judgment is listed here and emailed — nothing is deleted or guessed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            {status?.lastRun ? `Last check ${when(status.lastRun.runAt)}` : status ? 'No check has run yet' : ''}
          </span>
          {canRun && (
            <button onClick={runNow} disabled={running} className={hrBtn.primary} style={{ background: 'var(--teal)' }}>
              {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Run check now
            </button>
          )}
        </div>
      </div>

      {note && <p className="text-[13px] px-3 py-2 rounded-lg border bg-white" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>{note}</p>}
      {error && <p className="text-[13px]" style={{ color: '#b91c1c' }}>{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Needs a person" value={String(ex.length)} loading={loading}
          sub={ex.length ? peso(ex.reduce((s, i) => s + i.gap, 0)) + ' off in the books' : 'Nothing to review'} tone={ex.length ? 'red' : 'zero'} />
        <StatCard label="Fixed tonight" value={String(pending.length)} loading={loading}
          sub={pending.length ? 'Will be fixed by the next check' : 'Nothing waiting'} tone={pending.length ? 'blue' : 'zero'} />
        <StatCard label="Fixed by the last check" value={String(fixed.length)} loading={loading}
          sub={fixed.length ? peso(fixed.reduce((s, f) => s + f.amount, 0)) + ' put right' : 'Nothing needed fixing'} tone={fixed.length ? 'green' : 'zero'} />
      </div>

      <Section title="Needs a person" empty="Every order agrees with the books." loading={loading} rows={ex} showFix />
      <Section title="Will be fixed by the next check" empty="Nothing waiting." loading={loading} rows={pending} />

      {fixed.length > 0 && (
        <div className="rounded-2xl border bg-white overflow-auto" style={{ borderColor: 'var(--light-gray)' }}>
          <p className="px-4 pt-3 pb-2 text-[12px] font-semibold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Fixed by the last check</p>
          <table className="w-full text-sm">
            <thead><tr style={{ background: 'var(--hr-head)' }}>
              {['Order', 'Branch', 'What was wrong', 'Amount'].map(h => <th key={h} className={`px-4 py-2 text-[11px] font-bold uppercase tracking-[.4px] ${h === 'Amount' ? 'text-right' : 'text-left'}`} style={{ color: 'var(--mid-gray)' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {fixed.map(f => (
                <tr key={`${f.kind}-${f.orderId}`} className="border-t" style={{ borderColor: 'var(--hr-line)' }}>
                  <td className="px-4 py-2 font-semibold"><a href={orderHref(f.orderId)} className="hover:underline" style={{ color: 'var(--teal)' }}>#{f.orderNumber}</a></td>
                  <td className="px-4 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{BRANCH[f.branch] || f.branch}</td>
                  <td className="px-4 py-2 text-xs">{KIND[f.kind] || f.kind} — {f.kind === 'VOID_STILL_POSTED' ? 'cancelled' : 're-posted'}</td>
                  <td className="px-4 py-2 text-right font-semibold">{peso(f.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Section({ title, empty, loading, rows, showFix }: { title: string; empty: string; loading: boolean; rows: Issue[]; showFix?: boolean }) {
  return (
    <div className="rounded-2xl border bg-white overflow-auto" style={{ borderColor: 'var(--light-gray)' }}>
      <p className="px-4 pt-3 pb-2 text-[12px] font-semibold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>{title}</p>
      {loading ? (
        <div className="px-4 pb-4 space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-5 rounded hr-shimmer" />)}</div>
      ) : rows.length === 0 ? (
        <p className="px-4 pb-4 text-[13px]" style={{ color: 'var(--mid-gray)' }}>{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--hr-head)' }}>
            {['Order', 'Branch', 'Date', 'Patient', 'Total', 'Issue'].map(h => <th key={h} className={`px-4 py-2 text-[11px] font-bold uppercase tracking-[.4px] ${h === 'Total' ? 'text-right' : 'text-left'}`} style={{ color: 'var(--mid-gray)' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(i => (
              <tr key={`${i.kind}-${i.orderId}`} className="border-t align-top" style={{ borderColor: 'var(--hr-line)' }}>
                <td className="px-4 py-2.5 font-semibold whitespace-nowrap">
                  <a href={orderHref(i.orderId)} className="inline-flex items-center gap-1 hover:underline" style={{ color: 'var(--teal)' }}>#{i.orderNumber} <ExternalLink size={11} /></a>
                </td>
                <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{BRANCH[i.branch] || i.branch}</td>
                <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{i.transactionDate}</td>
                <td className="px-4 py-2.5 text-xs">{i.patientName || '—'}</td>
                <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">{peso(i.netAmount)}</td>
                <td className="px-4 py-2.5 text-xs max-w-[34rem]">
                  <span className="inline-block mb-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={showFix ? { background: '#fef2f2', color: '#b91c1c' } : { background: '#eff6ff', color: '#1d4ed8' }}>{KIND[i.kind] || i.kind}</span>
                  <p style={{ color: 'var(--charcoal)' }}>{i.detail}</p>
                  {i.failure && <p className="mt-0.5" style={{ color: '#b45309' }}>{i.failure}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
