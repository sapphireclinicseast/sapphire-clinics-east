'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Row { name: string; kind: string; amount: number; method: string; status: string; note?: string }
const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`
const badge: Record<string, string> = { 'would-pay': 'bg-sky-50 text-sky-700', paid: 'bg-emerald-50 text-emerald-700', 'pending-manual': 'bg-amber-100 text-amber-800', skipped: 'bg-slate-100 text-slate-600' }

export default function PayoutBatch() {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [csv, setCsv] = useState('')
  const [dry, setDry] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function run(dryRun: boolean) {
    if (!dryRun && !confirm('Run the payout batch? This allocates matured earnings into payouts and (where a rail is configured) sends them.')) return
    setBusy(dryRun ? 'preview' : 'run'); setErr(null)
    try {
      const r = await fetch(`/api/cron/payouts${dryRun ? '?dryRun=1' : ''}`)
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed')
      setRows(d.results); setCsv(d.csv ?? ''); setDry(dryRun)
      if (!dryRun) router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(null) }
  }

  function downloadCsv() {
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `nickel-payouts-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  }

  const total = rows?.filter((r) => r.status !== 'skipped').reduce((s, r) => s + r.amount, 0) ?? 0

  return (
    <div className="card mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[color:var(--ink)]">Rolling payout batch</h2>
          <p className="mt-0.5 text-[12px] text-[color:var(--slate)]">Pays each provider/doctor their <b>matured</b> earnings (completed sessions, held ~10 days for settlement + buffer). Anything a payment rail can’t auto-send is exported as a bank/PayMongo upload CSV.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => run(true)} disabled={!!busy} className="rounded-lg border border-[color:var(--line-2)] px-3.5 py-2 text-[13px] font-medium text-[color:var(--steel)] hover:bg-[color:var(--mist)] disabled:opacity-50">{busy === 'preview' ? 'Checking…' : 'Preview'}</button>
          <button onClick={() => run(false)} disabled={!!busy} className="btn-primary !px-4 !py-2 !text-[13px]">{busy === 'run' ? 'Running…' : 'Run payout batch'}</button>
        </div>
      </div>

      {err && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{err}</div>}

      {rows && (
        <div className="mt-3 rounded-xl border border-[color:var(--line)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--line)] px-3 py-2 text-[12.5px]">
            <span className="font-semibold text-[color:var(--ink)]">{dry ? 'Preview' : 'Batch result'} — {rows.length} recipient{rows.length === 1 ? '' : 's'} · {peso(total)}</span>
            {csv && <button onClick={downloadCsv} className="rounded-lg bg-[color:var(--steel)] px-3 py-1.5 font-semibold text-white hover:bg-[color:var(--steel-deep)]">Download upload CSV</button>}
          </div>
          {rows.length === 0 ? <p className="px-3 py-4 text-center text-[13px] text-[color:var(--slate)]">No matured payouts right now.</p> : (
            <div className="divide-y divide-[color:var(--line)]">
              {rows.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
                  <span className="font-medium text-[color:var(--ink)]">{r.name}</span>
                  <span className="text-[11px] text-[color:var(--muted)]">{r.method}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge[r.status] ?? 'bg-slate-100 text-slate-600'}`}>{r.status}{r.note ? ` · ${r.note}` : ''}</span>
                  <span className="ml-auto font-semibold tabular-nums">{peso(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
