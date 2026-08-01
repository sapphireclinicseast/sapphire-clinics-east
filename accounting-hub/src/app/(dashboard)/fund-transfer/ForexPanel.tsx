'use client'

// Fund Transfer → Foreign Exchange: buying foreign currency out of a peso
// account (or the reverse). It is an ordinary FundTransfer whose two sides are
// held in different currencies — `amount` leaves the source, `toAmount` lands in
// the destination — so the rate is derived rather than typed. Recording it here
// is what lets Bank Reconciliation identify BOTH bank lines on its own: each leg
// is offered against its own account on exact amount, within 5 days either way.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, X, Plus, Trash2, Eye, ArrowLeftRight, Pencil } from 'lucide-react'
import { ScanUpload } from '@/components/ScanUpload'

interface Bank { id: string; accountNumber: string; accountTitle: string; currency: string }
interface Fx {
  id: string; refNumber: string; date: string
  fromAccountId: string; toAccountId: string; fromLabel: string; toLabel: string
  amount: number; toAmount: number | null; exchangeRate: number | null
  description: string | null; proofUrls?: string[] | null
}

const money = (n: number, cur = '') =>
  `${cur ? cur + ' ' : ''}${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function ForexPanel({ banks, canWrite }: { banks: Bank[]; canWrite: boolean }) {
  const [rows, setRows] = useState<Fx[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Fx | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/fund-transfers')
      const all: Fx[] = r.ok ? await r.json() : []
      // Only the cross-currency ones belong here; plain transfers stay on their tab.
      setRows(all.filter(t => t.toAmount != null && t.toAmount > 0))
    } catch { setRows([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const curOf = (id: string) => banks.find(b => b.id === id)?.currency || 'PHP'

  const remove = async (t: Fx) => {
    if (!confirm(`Delete ${t.refNumber}? Any bank line matched to it will need re-matching.`)) return
    const r = await fetch(`/api/fund-transfers?id=${t.id}`, { method: 'DELETE' })
    if (!r.ok) { alert((await r.json()).error || 'Failed to delete'); return }
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
          Record a currency purchase between two bank accounts held in different currencies. The rate is computed from the two amounts,
          and Bank Reconciliation will identify both bank lines automatically once the amounts match, within 5 days either side.
        </p>
        {canWrite && (
          <button onClick={() => { setEditing(null); setShowForm(true) }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white shrink-0" style={{ background: 'var(--teal)' }}>
            <Plus size={15} /> New Exchange
          </button>
        )}
      </div>

      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--off-white)' }}>
              {['Reference', 'Date', 'Paid from', 'Amount paid', 'Received into', 'Amount received', 'Rate', 'Proof', ''].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>No currency exchanges recorded yet.</td></tr>
            ) : rows.map(t => (
              <tr key={t.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{t.refNumber}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{t.date}</td>
                <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>{t.fromLabel}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap" style={{ color: '#b91c1c' }}>{money(t.amount, curOf(t.fromAccountId))}</td>
                <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>{t.toLabel}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap" style={{ color: '#166534' }}>{money(t.toAmount || 0, curOf(t.toAccountId))}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap" style={{ color: 'var(--deep-teal)' }}>
                  {t.exchangeRate ? t.exchangeRate.toFixed(4) : '—'}
                </td>
                <td className="px-3 py-2.5">
                  {(t.proofUrls || []).map((u, i) => (
                    <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 mr-1.5" style={{ color: 'var(--teal)' }}><Eye size={12} />{(t.proofUrls || []).length > 1 ? i + 1 : ''}</a>
                  ))}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {canWrite && <button onClick={() => { setEditing(t); setShowForm(true) }} className="p-1 rounded hover:bg-gray-100 mr-1"><Pencil size={13} style={{ color: 'var(--mid-gray)' }} /></button>}
                  {canWrite && <button onClick={() => remove(t)} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} style={{ color: '#dc2626' }} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && <ForexForm banks={banks} editing={editing} onClose={() => setShowForm(false)} onSaved={async () => { setShowForm(false); await load() }} />}
    </div>
  )
}

function ForexForm({ banks, editing, onClose, onSaved }: { banks: Bank[]; editing: Fx | null; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(editing?.date || new Date().toISOString().slice(0, 10))
  const [fromAccountId, setFromAccountId] = useState(editing?.fromAccountId || '')
  const [toAccountId, setToAccountId] = useState(editing?.toAccountId || '')
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [toAmount, setToAmount] = useState(editing?.toAmount != null ? String(editing.toAmount) : '')
  const [description, setDescription] = useState(editing?.description || '')
  const [proofUrls, setProofUrls] = useState<string[]>(editing?.proofUrls || [])
  const [busy, setBusy] = useState(false)

  const fromCur = banks.find(b => b.id === fromAccountId)?.currency || ''
  const toCur = banks.find(b => b.id === toAccountId)?.currency || ''
  const sameCurrency = !!fromCur && !!toCur && fromCur === toCur

  // Rate is always derived — whichever side is keyed second completes the pair.
  const rate = useMemo(() => {
    const a = parseFloat(amount) || 0, b = parseFloat(toAmount) || 0
    return a > 0 && b > 0 ? a / b : 0
  }, [amount, toAmount])

  const save = async () => {
    if (!date || !fromAccountId || !toAccountId) { alert('Date, source and destination accounts are required.'); return }
    if (fromAccountId === toAccountId) { alert('Source and destination must be different accounts.'); return }
    if (sameCurrency) { alert('Both accounts are held in the same currency — use the Fund Transfers tab instead.'); return }
    if (!(parseFloat(amount) > 0) || !(parseFloat(toAmount) > 0)) { alert('Enter both the amount paid and the amount received.'); return }
    setBusy(true)
    try {
      const body = {
        ...(editing ? { id: editing.id } : {}),
        date, fromAccountId, toAccountId,
        amount: parseFloat(amount), toAmount: parseFloat(toAmount),
        description: description.trim() || null, proofUrls,
      }
      const r = await fetch('/api/fund-transfers', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) { alert((await r.json()).error || 'Failed to save'); return }
      onSaved()
    } finally { setBusy(false) }
  }

  const sel = 'w-full px-3 py-2 rounded-xl border text-sm outline-none'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
            <ArrowLeftRight size={18} style={{ color: 'var(--teal)' }} /> {editing ? `Edit ${editing.refNumber}` : 'Record Currency Exchange'}
          </h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>Enter what left the source account and what landed in the destination — the exchange rate is computed for you.</p>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${sel} mb-3`} style={{ borderColor: 'var(--light-gray)' }} />

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Paid from (source account)</label>
        <select value={fromAccountId} onChange={e => setFromAccountId(e.target.value)} className={`${sel} mb-3`} style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">— Select account —</option>
          {banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle} ({b.currency})</option>)}
        </select>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Amount paid{fromCur ? ` (${fromCur})` : ''}</label>
        <input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className={`${sel} mb-3 font-mono`} style={{ borderColor: 'var(--light-gray)' }} />

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Received into (destination account)</label>
        <select value={toAccountId} onChange={e => setToAccountId(e.target.value)} className={`${sel} mb-3`} style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">— Select account —</option>
          {banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle} ({b.currency})</option>)}
        </select>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Amount received{toCur ? ` (${toCur})` : ''}</label>
        <input type="number" min={0} step="0.01" value={toAmount} onChange={e => setToAmount(e.target.value)} placeholder="0.00" className={`${sel} mb-3 font-mono`} style={{ borderColor: 'var(--light-gray)' }} />

        {sameCurrency && (
          <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: '#fffbeb', color: '#92400e' }}>
            Both accounts are held in {fromCur}. There is no exchange to record — use the <strong>Fund Transfers</strong> tab.
          </p>
        )}

        <div className="rounded-xl border p-3 mb-4 flex items-center justify-between" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Exchange rate</span>
          <span className="text-sm font-bold font-mono" style={{ color: 'var(--deep-teal)' }}>
            {rate > 0 && !sameCurrency ? `${fromCur || 'PHP'} ${rate.toFixed(4)} per 1 ${toCur || 'unit'}` : '—'}
          </span>
        </div>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Description (optional)</label>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. CNY purchase for Shantou payment" className={`${sel} mb-3`} style={{ borderColor: 'var(--light-gray)' }} />

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Proof of exchange</label>
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {proofUrls.map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}><Eye size={12} /> Proof {i + 1}</a>
          ))}
          <ScanUpload section="fund-transfer" prefix={`FX-${date}`} existingCount={proofUrls.length}
            label={proofUrls.length ? 'Add another' : 'Upload or scan'} onUploaded={url => setProofUrls(p => [...p, url])} />
        </div>

        <button onClick={save} disabled={busy || sameCurrency} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
          {busy ? <Loader2 size={15} className="inline animate-spin" /> : (editing ? 'Save changes' : 'Record exchange')}
        </button>
      </div>
    </div>
  )
}
