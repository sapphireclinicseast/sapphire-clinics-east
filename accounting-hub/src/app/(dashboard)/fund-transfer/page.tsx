'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Repeat, Plus, Settings, Loader2, X, Eye, Upload, Pencil, Trash2 } from 'lucide-react'
import { SortFilterHead, applySortFilter } from '@/components/SortFilterHead'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Bank { id: string; accountNumber: string; accountTitle: string; currency: string }
interface Transfer { id: string; refNumber: string; date: string; fromAccountId: string; toAccountId: string; fromLabel: string; toLabel: string; amount: number; checkNumber: string | null; description: string | null; proofUrl: string | null }

export default function FundTransferPage() {
  const { data: session } = useSession()
  const canWrite = WRITE_ROLES.includes((session?.user?.role as string) || '')

  const [banks, setBanks] = useState<Bank[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Transfer | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [filters, setFilters] = useState<Record<string, string>>({})
  const toggleSort = (k: string) => setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  const cols = [
    { key: 'refNumber', label: 'Reference Number' }, { key: 'date', label: 'Date of Transaction' }, { key: 'fromLabel', label: 'From' },
    { key: 'toLabel', label: 'To' }, { key: 'amount', label: 'Amount' }, { key: 'checkNumber', label: 'Check Number' },
    { key: 'description', label: 'Description / Purpose' }, { key: 'proof', label: 'Proof', plain: true },
  ]
  const get = (t: Transfer, k: string): string | number =>
    k === 'amount' ? t.amount : k === 'proof' ? '' : ((t[k as keyof Transfer] as string | number) ?? '')
  const shown = applySortFilter(transfers, get, sort.key, sort.dir, filters)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [b, t] = await Promise.all([fetch('/api/bank-accounts'), fetch('/api/fund-transfers')])
      setBanks(b.ok ? await b.json() : [])
      setTransfers(t.ok ? await t.json() : [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const remove = async (t: Transfer) => { if (!confirm(`Delete ${t.refNumber}?`)) return; await fetch(`/api/fund-transfers?id=${t.id}`, { method: 'DELETE' }); await load() }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <Repeat size={22} style={{ color: 'var(--teal)' }} /> Fund Transfer
        </h1>
        <div className="flex items-center gap-2">
          {canWrite && <button onClick={() => { setEditing(null); setShowForm(true) }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> New Transfer</button>}
          {canWrite && <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}><Settings size={14} /> Settings</button>}
        </div>
      </div>

      {banks.length === 0 && !loading && (
        <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: '#fde68a', background: '#fffbeb', color: '#92400e' }}>
          No bank accounts yet. In <strong>Chart of Accounts</strong>, add/edit a Current-Asset account and tick <strong>&quot;Is this a bank account?&quot;</strong> to make it selectable here.
        </div>
      )}

      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-sm">
          <SortFilterHead cols={cols} sortKey={sort.key} sortDir={sort.dir} filters={filters} onToggleSort={toggleSort} onFilter={(k, v) => setFilters(f => ({ ...f, [k]: v }))} trailing={canWrite} />
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
            ) : shown.map(t => (
              <tr key={t.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{t.refNumber}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{t.date}</td>
                <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>{t.fromLabel}</td>
                <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--charcoal)' }}>{t.toLabel}</td>
                <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>₱{peso(t.amount)}</td>
                <td className="px-3 py-2.5 text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>{t.checkNumber || ''}</td>
                <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{t.description || ''}</td>
                <td className="px-3 py-2.5">{t.proofUrl && <a href={t.proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px]" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Eye size={12} /> View</a>}</td>
                {canWrite && (
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => { setEditing(t); setShowForm(true) }} className="p-1 rounded hover:bg-teal-50 mr-1"><Pencil size={13} style={{ color: 'var(--teal)' }} /></button>
                    <button onClick={() => remove(t)} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} style={{ color: '#dc2626' }} /></button>
                  </td>
                )}
              </tr>
            ))}
            {!loading && shown.length === 0 && <tr><td colSpan={9} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>{transfers.length === 0 ? 'No fund transfers yet.' : 'No transfers match the current filters.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && <TransferForm banks={banks} editing={editing} onClose={() => setShowForm(false)} onSaved={async () => { setShowForm(false); await load() }} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

function TransferForm({ banks, editing, onClose, onSaved }: { banks: Bank[]; editing: Transfer | null; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(editing?.date || new Date().toISOString().slice(0, 10))
  const [fromAccountId, setFrom] = useState(editing?.fromAccountId || '')
  const [toAccountId, setTo] = useState(editing?.toAccountId || '')
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [checkNumber, setCheckNumber] = useState(editing?.checkNumber || '')
  const [description, setDescription] = useState(editing?.description || '')
  const [proofUrl, setProofUrl] = useState(editing?.proofUrl || '')
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)

  const upload = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try { const fd = new FormData(); fd.append('file', file); const r = await fetch('/api/upload', { method: 'POST', body: fd }); if (r.ok) setProofUrl((await r.json()).url); else alert('Upload failed') } catch { alert('Upload failed') } finally { setUploading(false) }
  }
  const save = async () => {
    if (!date || !fromAccountId || !toAccountId) { alert('Date, From and To are required.'); return }
    if (fromAccountId === toAccountId) { alert('From and To must differ.'); return }
    if (!(Number(amount) > 0)) { alert('Enter a valid amount.'); return }
    setBusy(true)
    try {
      const body = { date, fromAccountId, toAccountId, amount: Number(amount), checkNumber, description, proofUrl }
      const res = editing
        ? await fetch('/api/fund-transfers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...body }) })
        : await fetch('/api/fund-transfers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { alert((await res.json()).error || 'Failed'); return }
      onSaved()
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{editing ? `Edit ${editing.refNumber}` : 'New Fund Transfer'}</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Date of Transaction</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>From (bank account)</label>
        <select value={fromAccountId} onChange={e => setFrom(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">Select account…</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}
        </select>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>To (bank account)</label>
        <select value={toAccountId} onChange={e => setTo(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }}>
          <option value="">Select account…</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}
        </select>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Amount</label>
        <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Check Number</label>
        <input value={checkNumber} onChange={e => setCheckNumber(e.target.value)} placeholder="Leading zeros preserved" className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Description / Purpose</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: 'var(--light-gray)' }} />
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Proof</label>
        <div className="flex items-center gap-2 mb-4">
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white cursor-pointer" style={{ background: 'var(--teal)' }}>
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {proofUrl ? 'Replace' : 'Upload'}
            <input type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv" onChange={e => { upload(e.target.files?.[0] || null); e.target.value = '' }} />
          </label>
          {proofUrl && <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--teal)' }}><Eye size={13} /> View</a>}
        </div>
        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : (editing ? 'Save changes' : 'Save transfer')}</button>
      </div>
    </div>
  )
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [nextSeq, setNextSeq] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { fetch('/api/fund-transfers/settings').then(r => r.ok ? r.json() : { nextSeq: 1 }).then(d => setNextSeq(String(d.nextSeq))).catch(() => {}) }, [])
  const save = async () => {
    const n = parseInt(nextSeq, 10); if (isNaN(n) || n < 1) { alert('Enter a valid number (≥ 1).'); return }
    setBusy(true)
    try { const r = await fetch('/api/fund-transfers/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nextSeq: n }) }); if (r.ok) onClose(); else alert((await r.json()).error || 'Failed') } finally { setBusy(false) }
  }
  const yy = new Date().getFullYear() % 100
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Fund Transfer Settings</h2><button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button></div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Next reference number</label>
        <p className="text-[11px] mb-2" style={{ color: 'var(--mid-gray)' }}>The next transfer will be numbered FT{yy}-{String(parseInt(nextSeq || '1', 10) || 1).padStart(6, '0')}.</p>
        <input value={nextSeq} onChange={e => setNextSeq(e.target.value.replace(/[^0-9]/g, ''))} className="w-full px-3 py-2 rounded-xl border text-sm font-mono mb-4" style={{ borderColor: 'var(--light-gray)' }} />
        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy ? <Loader2 size={15} className="inline animate-spin" /> : 'Save'}</button>
      </div>
    </div>
  )
}
