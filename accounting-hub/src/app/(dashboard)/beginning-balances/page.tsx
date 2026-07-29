'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Loader2, Save, Calendar, Wand2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Row {
  accountId: string
  accountNumber: string
  accountTitle: string
  accountType: string
  subType: string | null
  normalBalance: string
  amount: number
  notes: string
  startDate: string
  isBankAccount: boolean
  hasRow: boolean
}

const TYPE_LABEL: Record<string, string> = {
  ASSET: 'Assets', LIABILITY: 'Liabilities', EQUITY: 'Equity',
  REVENUE: 'Revenue', EXPENSE: 'Expense',
}

export default function BeginningBalancesPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [edits, setEdits] = useState<Record<string, { amount: number; notes: string; startDate: string }>>({})
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/beginning-balances?year=${year}`)
      if (res.ok) {
        const data = await res.json()
        setRows(data.rows)
        setEdits({})
      }
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  const grouped = useMemo(() => {
    const out: Record<string, Row[]> = { ASSET: [], LIABILITY: [], EQUITY: [], REVENUE: [], EXPENSE: [] }
    const f = filter.trim().toLowerCase()
    for (const r of rows) {
      if (f && !`${r.accountNumber} ${r.accountTitle}`.toLowerCase().includes(f)) continue
      out[r.accountType]?.push(r)
    }
    return out
  }, [rows, filter])

  const trialBalance = useMemo(() => {
    let dr = 0, cr = 0
    for (const r of rows) {
      const amt = edits[r.accountId]?.amount ?? r.amount
      if (amt === 0) continue
      // Use normal balance to bucket: ASSET/EXPENSE = debit, LIABILITY/EQUITY/REVENUE = credit
      if (r.normalBalance === 'DEBIT') dr += amt
      else cr += amt
    }
    return { dr, cr, diff: dr - cr }
  }, [rows, edits])

  const patchEdit = (id: string, partial: Partial<{ amount: number; notes: string; startDate: string }>) => {
    setEdits(p => {
      const r = rows.find(x => x.accountId === id)
      const cur = p[id] ?? { amount: r?.amount ?? 0, notes: r?.notes ?? '', startDate: r?.startDate ?? '' }
      return { ...p, [id]: { ...cur, ...partial } }
    })
  }
  const setAmount = (id: string, amount: number) => patchEdit(id, { amount })
  const setNotes = (id: string, notes: string) => patchEdit(id, { notes })
  const setStartDate = (id: string, startDate: string) => patchEdit(id, { startDate })

  const save = async () => {
    const entries = Object.entries(edits).map(([accountId, v]) => ({ accountId, amount: v.amount, notes: v.notes, startDate: v.startDate || null }))
    if (!entries.length) return
    setSaving(true)
    try {
      const res = await fetch('/api/beginning-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, entries }),
      })
      if (res.ok) await load()
      else alert('Failed to save: ' + (await res.text()))
    } finally {
      setSaving(false)
    }
  }

  // Bank accounts whose uploaded statements carry a running balance can have
  // their opening figure read straight off the statement, rather than typed in
  // from the PDFs one account at a time.
  const [prefilling, setPrefilling] = useState(false)
  const prefillFromStatements = async () => {
    const asOf = prompt('Prefill bank balances as of which date?\n\nThe balance printed on each account\'s last statement line on or before this date is used.', `${year - 1}-12-31`)
    if (!asOf) return
    setPrefilling(true)
    try {
      const res = await fetch(`/api/bank-rec/balance-as-of?date=${encodeURIComponent(asOf)}`)
      const d = await res.json()
      if (!res.ok) { alert(d.error || 'Failed'); return }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const withData = (d.accounts || []).filter((a: any) => a.balance !== null)
      if (!withData.length) {
        alert(`No uploaded statement lines carry a running balance on or before ${asOf}.\n\nRe-upload the statements with the Balance column mapped in Bank Reconciliation, then try again.`)
        return
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lines = withData.map((a: any) =>
        `${a.accountNumber} ${a.accountTitle}: ${a.currency} ${a.balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
        + (a.asOf !== asOf ? `  (last line ${a.asOf})` : '')).join('\n')
      if (!confirm(`Fill these ${withData.length} bank account(s)?\n\n${lines}\n\nNothing is saved until you press Save.`)) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      withData.forEach((a: any) => setAmount(a.accountId, a.balance))
    } finally { setPrefilling(false) }
  }

  const dirtyCount = Object.keys(edits).length

  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Beginning Balances</h1>
          <p className="text-sm text-gray-600 mt-0.5">Opening balance per account for the fiscal year. Used by the Balance Sheet to reflect cumulative state.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">
            <Calendar size={14} className="text-gray-500" />
            <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="text-sm bg-transparent outline-none">
              {Array.from({ length: 5 }, (_, i) => currentYear - i).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <input type="text" placeholder="Filter accounts…" value={filter} onChange={e => setFilter(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200" />
          <button onClick={prefillFromStatements} disabled={prefilling} title="Read each bank account's balance off its uploaded statements"
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white disabled:opacity-50">
            {prefilling ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            Prefill bank balances
          </button>
          <button onClick={save} disabled={saving || dirtyCount === 0}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-teal-600 text-white disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
          </button>
        </div>
      </div>

      {/* Trial-balance footer */}
      <div className={`mb-3 px-4 py-2 rounded-lg text-sm flex items-center justify-between ${Math.abs(trialBalance.diff) < 0.01 ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>
        <span className="font-medium">Trial Balance Check {Math.abs(trialBalance.diff) < 0.01 ? '— Balanced' : '— Out of balance'}</span>
        <span className="font-mono text-xs">
          Debits {formatCurrency(trialBalance.dr)} &middot; Credits {formatCurrency(trialBalance.cr)} &middot; Diff {formatCurrency(trialBalance.diff)}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-teal-600" size={20} /></div>
      ) : (
        <div className="space-y-5">
          {(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const).map(t => (
            grouped[t].length === 0 ? null : (
              <div key={t} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <div className="px-4 py-2 bg-gray-50 font-semibold text-sm">{TYPE_LABEL[t]}</div>
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-gray-500">
                    <tr>
                      <th className="text-left px-4 py-2 w-32">Account #</th>
                      <th className="text-left px-4 py-2">Title</th>
                      <th className="text-right px-4 py-2 w-48">Opening Balance (PHP)</th>
                      <th className="text-left px-4 py-2 w-40">Start Date</th>
                      <th className="text-left px-4 py-2 w-72">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[t].map(r => {
                      const amt = edits[r.accountId]?.amount ?? r.amount
                      const notes = edits[r.accountId]?.notes ?? r.notes
                      const startDate = edits[r.accountId]?.startDate ?? r.startDate
                      const dirty = !!edits[r.accountId]
                      return (
                        <tr key={r.accountId} className={`border-t border-gray-100 ${dirty ? 'bg-amber-50' : ''}`}>
                          <td className="px-4 py-1.5 font-mono text-xs text-gray-600">{r.accountNumber}</td>
                          <td className="px-4 py-1.5">{r.accountTitle}{r.isBankAccount && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>BANK</span>}</td>
                          <td className="px-4 py-1.5 text-right">
                            <input type="number" step="0.01" value={amt}
                              onChange={e => setAmount(r.accountId, parseFloat(e.target.value) || 0)}
                              className="w-40 text-right font-mono text-xs px-2 py-1 border border-gray-200 rounded" />
                          </td>
                          <td className="px-4 py-1.5">
                            <input type="date" value={startDate} onChange={e => setStartDate(r.accountId, e.target.value)}
                              title="Bank reconciliation considers Hub entries on/after this date"
                              className="w-36 text-xs px-2 py-1 border border-gray-200 rounded" />
                          </td>
                          <td className="px-4 py-1.5">
                            <input type="text" value={notes} onChange={e => setNotes(r.accountId, e.target.value)}
                              className="w-full text-xs px-2 py-1 border border-gray-200 rounded" />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}
