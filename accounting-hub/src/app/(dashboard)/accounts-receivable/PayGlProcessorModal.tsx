'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Upload, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { branchLabel } from '@/lib/branch'

/** One payable line, as Detailed GL sees it. */
export interface PayableLetter {
  caseId: string | null
  walletId: string | null
  name: string
  branch?: string | null
  soaAmount: number
  rate: number
  fee: number
  alreadyPaid: boolean
}

interface Account { id: string; accountNumber: string; accountTitle: string; accountType: string }

const BRANCHES = [
  { value: 'SANDBOX_EAST', label: 'East Branch' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
]

/**
 * Pay the GL processor for a batch of letters, raising the RFP that appears
 * under Expenses.
 *
 * Only letters with a computable fee are offered: the fee is SOA amount × rate,
 * and a letter missing either has nothing to pay yet. Letters already paid are
 * listed but locked, so it is visible that they were considered and skipped
 * rather than silently absent.
 */
export default function PayGlProcessorModal({
  letters, defaultBranch, onClose, onDone,
}: {
  letters: PayableLetter[]
  defaultBranch?: string
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const payable = useMemo(() => letters.filter(l => l.fee > 0 && !l.alreadyPaid), [letters])
  const blocked = useMemo(() => letters.filter(l => l.alreadyPaid), [letters])
  const incomplete = useMemo(() => letters.filter(l => l.fee <= 0 && !l.alreadyPaid), [letters])

  const [ticked, setTicked] = useState<string[]>([])
  const [branch, setBranch] = useState(defaultBranch && BRANCHES.some(b => b.value === defaultBranch) ? defaultBranch : '')
  const [remittedAt, setRemittedAt] = useState(new Date().toISOString().slice(0, 10))
  const [expenseAccountId, setExpenseAccountId] = useState('')
  const [payableTo, setPayableTo] = useState('GL Processor')
  const [proofUrl, setProofUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const keyOf = (l: PayableLetter) => l.caseId ?? `w:${l.walletId}`

  // Expense accounts only — the RFP has to land somewhere that reaches the
  // income statement, so a clearing account is not offered at all.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const all: Account[] = []
        for (let p = 1; p <= 20; p++) {
          const r = await fetch(`/api/chart-of-accounts?accountType=EXPENSE&page=${p}&pageSize=100`)
          if (!r.ok) break
          const d = await r.json()
          all.push(...(d.data || []))
          if (p >= (d.totalPages || 1)) break
        }
        if (!cancelled) setAccounts(all.filter(a => a.accountType === 'EXPENSE'))
      } catch { /* the select just stays empty; submit still validates server-side */ }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const total = payable.filter(l => ticked.includes(keyOf(l))).reduce((s, l) => s + l.fee, 0)
  const allTicked = payable.length > 0 && ticked.length === payable.length

  const upload = async (file: File) => {
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/upload', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Upload failed')
      setProofUrl(d.url || d.path || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally { setUploading(false) }
  }

  const submit = async () => {
    setBusy(true); setError('')
    try {
      const chosen = payable.filter(l => ticked.includes(keyOf(l)))
      const res = await fetch('/api/accounts-receivable/gl-processor-payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseIds: chosen.map(l => l.caseId).filter(Boolean),
          walletIds: chosen.filter(l => !l.caseId).map(l => l.walletId).filter(Boolean),
          branch, remittedAt, expenseAccountId, proofUrl, payableTo,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Failed (${res.status})`)
      onDone(`${d.refNumber} raised — ${formatCurrency(Number(d.grossTotal))} for ${d.count} letter${d.count === 1 ? '' : 's'}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to raise the payout')
    } finally { setBusy(false) }
  }

  const canSubmit = ticked.length > 0 && !!branch && !!remittedAt && !!expenseAccountId && !busy

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
      onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-3xl mt-8 mb-8 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-3 border-b"
          style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Pay GL Processor</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
              Raises an RFP under Expenses for the fee owed on the letters you tick.
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40">
            <X size={16} style={{ color: 'var(--mid-gray)' }} />
          </button>
        </div>

        {/* ── Which letters ───────────────────────────────────────── */}
        <div className="px-5 pt-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>
              Letters to pay for {payable.length > 0 && `(${ticked.length} of ${payable.length})`}
            </p>
            {payable.length > 0 && (
              <button
                onClick={() => setTicked(allTicked ? [] : payable.map(keyOf))}
                className="text-[11px] font-semibold" style={{ color: 'var(--teal)' }}>
                {allTicked ? 'Clear all' : 'Select all'}
              </button>
            )}
          </div>
          <div className="rounded-xl border overflow-auto" style={{ borderColor: 'var(--light-gray)', maxHeight: 240 }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="sticky top-0" style={{ background: 'var(--pale-teal)' }}>
                  <th className="w-8 px-2 py-1.5" />
                  <th className="px-2 py-1.5 text-left font-semibold" style={{ color: 'var(--deep-teal)' }}>Name</th>
                  <th className="px-2 py-1.5 text-left font-semibold" style={{ color: 'var(--deep-teal)' }}>Branch</th>
                  <th className="px-2 py-1.5 text-right font-semibold" style={{ color: 'var(--deep-teal)' }}>SOA</th>
                  <th className="px-2 py-1.5 text-right font-semibold" style={{ color: 'var(--deep-teal)' }}>Rate</th>
                  <th className="px-2 py-1.5 text-right font-semibold" style={{ color: 'var(--deep-teal)' }}>Fee</th>
                </tr>
              </thead>
              <tbody>
                {payable.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-6" style={{ color: 'var(--mid-gray)' }}>
                    Nothing to pay in the current view.
                  </td></tr>
                )}
                {payable.map(l => {
                  const k = keyOf(l)
                  const on = ticked.includes(k)
                  return (
                    <tr key={k} className="border-t cursor-pointer hover:bg-gray-50"
                      style={{ borderColor: 'var(--light-gray)', background: on ? '#f0fdfa' : undefined }}
                      onClick={() => setTicked(t => on ? t.filter(x => x !== k) : [...t, k])}>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={on} readOnly className="accent-teal-600 pointer-events-none" />
                      </td>
                      <td className="px-2 py-1.5">{l.name}</td>
                      <td className="px-2 py-1.5" style={{ color: 'var(--mid-gray)' }}>{branchLabel(l.branch) || '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(l.soaAmount)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{l.rate}%</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{formatCurrency(l.fee)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {(blocked.length > 0 || incomplete.length > 0) && (
            <div className="mt-2 space-y-1">
              {blocked.length > 0 && (
                <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                  {blocked.length} already paid and excluded: {blocked.slice(0, 4).map(l => l.name).join(', ')}
                  {blocked.length > 4 && ` +${blocked.length - 4} more`}
                </p>
              )}
              {incomplete.length > 0 && (
                <p className="text-[11px]" style={{ color: '#92400e' }}>
                  {incomplete.length} cannot be computed yet — each needs both an SOA amount and a rate:{' '}
                  {incomplete.slice(0, 4).map(l => l.name).join(', ')}
                  {incomplete.length > 4 && ` +${incomplete.length - 4} more`}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Payment details ─────────────────────────────────────── */}
        <div className="px-5 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Date remitted</label>
            <input type="date" value={remittedAt} onChange={e => setRemittedAt(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Branch paying</label>
            <select value={branch} onChange={e => setBranch(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
              <option value="">Select…</option>
              {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>Sets the RFP series the reference comes from.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Expense account</label>
            <select value={expenseAccountId} onChange={e => setExpenseAccountId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-white" style={{ borderColor: 'var(--light-gray)' }}>
              <option value="">Select an expense account…</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>
              ))}
            </select>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
              Expense accounts only. Clearing accounts are not offered — the fee has to reach the income statement.
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Payable to</label>
            <input value={payableTo} onChange={e => setPayableTo(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Proof of remittance</label>
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer hover:bg-gray-50"
              style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              <span className="truncate">
                {uploading ? 'Uploading…' : proofUrl ? 'Attached — replace' : 'Attach file'}
              </span>
              <input type="file" className="hidden" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
            </label>
            {proofUrl && (
              <a href={proofUrl} target="_blank" rel="noreferrer" className="text-[10px] underline mt-0.5 inline-block"
                style={{ color: 'var(--teal)' }}>View attached proof</a>
            )}
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-start gap-2 px-3 py-2 rounded-xl text-xs"
            style={{ background: '#fef2f2', color: '#dc2626' }}>
            <AlertCircle size={13} className="mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 px-5 py-3 mt-4 border-t"
          style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <div>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>Total to pay</p>
            <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(total)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={busy}
              className="px-4 py-2 rounded-xl text-sm font-medium border disabled:opacity-40"
              style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
            <button onClick={submit} disabled={!canSubmit}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--teal)' }}>
              {busy ? <><Loader2 size={14} className="animate-spin" /> Raising…</> : <><CheckCircle2 size={14} /> Raise RFP</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
