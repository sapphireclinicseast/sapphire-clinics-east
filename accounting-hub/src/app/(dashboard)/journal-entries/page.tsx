'use client'

// General Journal — the QuickBooks-style catch-all. When a transaction has no
// module of its own (or you are not yet sure how to classify it), enter it
// here as balanced debits and credits; it posts to the same ledger every
// report, drill-down and statement reads, so it flows everywhere at once.
import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { BookOpen, Plus, Loader2, Trash2, X, ChevronDown, ChevronRight } from 'lucide-react'

interface JLine { account: string; debit: number; credit: number; description: string | null }
interface JE { id: string; entryDate: string; description: string; refType: string; refId: string | null; branch: string; total: number; lines: JLine[] }
interface Coa { id: string; accountNumber: string; accountTitle: string }
interface DraftLine { accountId: string; accountLabel: string; q: string; debit: string; credit: string; description: string }

const peso = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const BRANCHES = ['ALL', 'SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA', 'VERDANA_STORE']
const blankLine = (): DraftLine => ({ accountId: '', accountLabel: '', q: '', debit: '', credit: '', description: '' })

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: 'Manual', POS_ORDER: 'POS', BANK_REC: 'Bank Rec', AR_PAYMENT: 'AR', AP_SETTLEMENT: 'AP',
  PAYROLL_CONSULTANT: 'Payroll', PAYROLL_EMPLOYEE: 'Payroll', QB_PAYROLL_IMPORT: 'QB import',
  QB_WHT_IMPORT: 'QB import', QB_LIAB_IMPORT: 'QB import', ASSET_PURCHASE: 'Assets',
}

export default function JournalEntriesPage() {
  const { data: session } = useSession()
  const canWrite = WRITE_ROLES.includes((session?.user as { role?: string })?.role || '')
  const [entries, setEntries] = useState<JE[]>([])
  const [loading, setLoading] = useState(true)
  const [onlyManual, setOnlyManual] = useState(true)
  const [q, setQ] = useState('')
  const [coa, setCoa] = useState<Coa[]>([])
  const [showNew, setShowNew] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/journal-entries/recent?manual=${onlyManual}&q=${encodeURIComponent(q)}`)
      const d = await r.json()
      setEntries(d.entries || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [onlyManual])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetch('/api/chart-of-accounts?pageSize=1000').then(r => r.ok ? r.json() : { data: [] })
      .then(d => setCoa((d.data || []).map((a: Coa) => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle }))))
      .catch(() => {})
  }, [])

  const del = async (e: JE) => {
    if (!confirm(`Delete ${e.refId || 'this entry'} (₱${peso(e.total)})? It disappears from every ledger and statement.`)) return
    const r = await fetch(`/api/journal-entries?id=${e.id}`, { method: 'DELETE' })
    if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <BookOpen size={22} style={{ color: 'var(--teal)' }} /> General Journal
        </h1>
        {canWrite && (
          <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>
            <Plus size={15} /> New journal entry
          </button>
        )}
      </div>

      <p className="text-xs max-w-3xl" style={{ color: 'var(--mid-gray)' }}>
        Entries here post straight to the ledger that every report reads — the subsidiary ledgers, both Reports engines,
        and the drill-downs pick them up immediately. Use it for anything without a module of its own; if you are unsure
        of the classification, post it to the account of best judgment and re-edit later by deleting and re-entering.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--charcoal)' }}>
          <input type="checkbox" checked={onlyManual} onChange={e => setOnlyManual(e.target.checked)} />
          Manual entries only
        </label>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Search description or journal no. — Enter to search"
          className="px-3 py-2 rounded-xl border text-sm outline-none min-w-[280px]" style={{ borderColor: 'var(--light-gray)' }} />
      </div>

      {loading ? <div className="py-10 text-center"><Loader2 className="animate-spin inline" size={22} /></div> : entries.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--mid-gray)' }}>No entries found.</p>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                <th className="px-3 py-2 w-6"></th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Journal no.</th>
                <th className="px-3 py-2">Source</th><th className="px-3 py-2">Memo</th><th className="px-3 py-2">Branch</th>
                <th className="px-3 py-2 text-right">Amount</th>{canWrite && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <>
                  <tr key={e.id} className="border-t cursor-pointer hover:bg-gray-50" style={{ borderColor: 'var(--light-gray)' }}
                    onClick={() => setExpanded(x => ({ ...x, [e.id]: !x[e.id] }))}>
                    <td className="px-3 py-2">{expanded[e.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td className="px-3 py-2 tabular-nums">{e.entryDate}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.refId || '—'}</td>
                    <td className="px-3 py-2 text-xs">{SOURCE_LABEL[e.refType] || e.refType}</td>
                    <td className="px-3 py-2 max-w-md truncate" style={{ color: 'var(--charcoal)' }}>{e.description}</td>
                    <td className="px-3 py-2 text-xs">{e.branch}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">₱{peso(e.total)}</td>
                    {canWrite && (
                      <td className="px-3 py-2 text-right">
                        {e.refType === 'MANUAL' && <button onClick={ev => { ev.stopPropagation(); del(e) }} title="Delete this manual entry"><Trash2 size={14} style={{ color: 'var(--mid-gray)' }} /></button>}
                      </td>
                    )}
                  </tr>
                  {expanded[e.id] && (
                    <tr key={`${e.id}x`} className="border-t" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                      <td></td>
                      <td colSpan={canWrite ? 7 : 6} className="px-3 py-2">
                        <table className="text-xs w-full max-w-3xl">
                          <tbody>
                            {e.lines.map((l, i) => (
                              <tr key={i}>
                                <td className="pr-4 py-0.5">{l.account}</td>
                                <td className="pr-4 py-0.5 text-right tabular-nums" style={{ minWidth: 100 }}>{l.debit > 0 ? `₱${peso(l.debit)}` : ''}</td>
                                <td className="pr-4 py-0.5 text-right tabular-nums" style={{ minWidth: 100 }}>{l.credit > 0 ? `₱${peso(l.credit)}` : ''}</td>
                                <td className="py-0.5" style={{ color: 'var(--mid-gray)' }}>{l.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewEntryModal coa={coa} onClose={() => setShowNew(false)} onDone={async () => { setShowNew(false); await load() }} />}
    </div>
  )
}

function NewEntryModal({ coa, onClose, onDone }: { coa: Coa[]; onClose: () => void; onDone: () => void }) {
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10))
  const [branch, setBranch] = useState('ALL')
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([blankLine(), blankLine()])
  const [busy, setBusy] = useState(false)
  const upd = (i: number, patch: Partial<DraftLine>) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l))
  const totals = useMemo(() => ({
    dr: lines.reduce((s, l) => s + (Number(l.debit) || 0), 0),
    cr: lines.reduce((s, l) => s + (Number(l.credit) || 0), 0),
  }), [lines])
  const balanced = Math.abs(totals.dr - totals.cr) < 0.005 && totals.dr > 0
  const save = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/journal-entries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryDate, branch, memo, lines: lines.map(l => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, description: l.description })) }),
      })
      const d = await r.json()
      if (!r.ok) { alert(d.error || 'Failed'); return }
      alert(`Posted as ${d.refId}. It is on the ledger now.`)
      onDone()
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl p-5 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold" style={{ color: 'var(--charcoal)' }}>New journal entry</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex gap-2 mb-3 flex-wrap">
          <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Journal date<br />
            <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          </label>
          <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Branch<br />
            <select value={branch} onChange={e => setBranch(e.target.value)} className="px-2 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="flex-1 min-w-[240px] text-xs" style={{ color: 'var(--mid-gray)' }}>Memo<br />
            <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="What this entry records" className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
          </label>
        </div>

        <table className="w-full text-sm mb-2">
          <thead>
            <tr className="text-left text-xs" style={{ color: 'var(--mid-gray)' }}>
              <th className="py-1 w-8">#</th><th className="py-1">Account</th>
              <th className="py-1 text-right w-32">Debit (PHP)</th><th className="py-1 text-right w-32">Credit (PHP)</th>
              <th className="py-1">Description</th><th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const filtered = l.q && !l.accountId ? coa.filter(c => `${c.accountNumber} ${c.accountTitle}`.toLowerCase().includes(l.q.toLowerCase())).slice(0, 8) : []
              return (
                <tr key={i} className="border-t align-top" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="py-1.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{i + 1}</td>
                  <td className="py-1.5 pr-2 relative">
                    <input value={l.accountId ? l.accountLabel : l.q}
                      onChange={e => upd(i, { q: e.target.value, accountId: '', accountLabel: '' })}
                      placeholder="Search account…" className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    {filtered.length > 0 && (
                      <div className="absolute z-20 left-0 right-2 mt-1 rounded-xl border bg-white shadow-lg max-h-40 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                        {filtered.map(c => (
                          <button key={c.id} type="button" onClick={() => upd(i, { accountId: c.id, accountLabel: `${c.accountNumber} ${c.accountTitle}`, q: '' })}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">{c.accountNumber} {c.accountTitle}</button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 pr-2"><input type="number" value={l.debit} onChange={e => upd(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} className="w-full px-2 py-1.5 rounded-lg border text-sm text-right outline-none" style={{ borderColor: 'var(--light-gray)' }} /></td>
                  <td className="py-1.5 pr-2"><input type="number" value={l.credit} onChange={e => upd(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} className="w-full px-2 py-1.5 rounded-lg border text-sm text-right outline-none" style={{ borderColor: 'var(--light-gray)' }} /></td>
                  <td className="py-1.5 pr-2"><input value={l.description} onChange={e => upd(i, { description: e.target.value })} className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} /></td>
                  <td className="py-1.5">{lines.length > 2 && <button onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}><Trash2 size={13} style={{ color: 'var(--mid-gray)' }} /></button>}</td>
                </tr>
              )
            })}
            <tr className="border-t font-semibold" style={{ borderColor: 'var(--light-gray)' }}>
              <td></td><td className="py-2 text-right text-xs" style={{ color: 'var(--mid-gray)' }}>Total</td>
              <td className="py-2 pr-2 text-right tabular-nums">₱{peso(totals.dr)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">₱{peso(totals.cr)}</td>
              <td colSpan={2} className="py-2 text-xs" style={{ color: balanced ? '#15803d' : '#b45309' }}>
                {balanced ? 'Balanced' : totals.dr || totals.cr ? `Out of balance by ₱${peso(Math.abs(totals.dr - totals.cr))}` : ''}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="flex items-center justify-between">
          <button onClick={() => setLines(ls => [...ls, blankLine()])} className="px-3 py-1.5 rounded-xl text-xs border" style={{ borderColor: 'var(--light-gray)' }}>Add lines</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
            <button onClick={save} disabled={busy || !balanced} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: balanced ? 'var(--teal)' : 'var(--light-gray)' }}>
              {busy ? <Loader2 className="animate-spin inline" size={14} /> : 'Save & post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
