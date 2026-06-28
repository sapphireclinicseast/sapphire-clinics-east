'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Settings, Loader2, Trash2, X } from 'lucide-react'

// ── Constants ──────────────────────────────────────────────────
const BRANCHES = [
  { code: 'AHEA', value: 'SANDBOX_EAST', label: 'AHEA' },
  { code: 'AHGH', value: 'SANDBOX_GREENHILLS', label: 'AHGH' },
  { code: 'VER', value: 'VERDANA_STORE', label: 'VERDANA' },
]
const DEPARTMENTS = ['ADMIN', 'PT', 'OT', 'SLP', 'SPED', 'PSYCH', 'MD', 'ORTHOSIS']
const PCF_STATUS = ['Unliquidated', 'For Replenishment', 'Cancelled', 'Missing']
const VATABLE = ['VAT', 'NV', 'Invalid', 'Cancelled']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

interface Entry {
  id: string
  branch: string
  pcvNumber: string
  pcvSeq: number
  requestor: string | null
  department: string | null
  pcfStatus: string | null
  date: string | null
  description: string | null
  vatable: string | null
  siNumber: string | null
  tinNumber: string | null
  registeredName: string | null
  registeredAddress: string | null
  grossAmount: string | number
  accountTitle: string | null
  referenceNumber: string | null
  reimbursementId: string | null
}

// ── Computed helpers ───────────────────────────────────────────
const digitsOnly = (s: string | null) => (s || '').replace(/\D/g, '')
const formatTin = (raw: string) => {
  const d = digitsOnly(raw).slice(0, 14)
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 14)].filter(Boolean).join('-')
}
const tinNumber2 = (tin: string | null) => {
  const d = digitsOnly(tin).slice(0, 9)
  return d.length === 9 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 9)}` : ''
}
const branchCodeOf = (tin: string | null) => digitsOnly(tin).slice(9, 14)
const num = (v: string | number | null) => Number(v) || 0
const netOfVat = (e: Entry) => (e.vatable === 'VAT' ? num(e.grossAmount) / 1.12 : num(e.grossAmount))
const vatAmount = (e: Entry) => num(e.grossAmount) - netOfVat(e)
const descForHub = (e: Entry) => (e.description ? `${e.pcvNumber}; ${e.description}` : e.pcvNumber)
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function PettyCashPage() {
  const { data: session } = useSession()
  const canWrite = WRITE_ROLES.includes((session?.user as { role?: string })?.role || '')

  const [branch, setBranch] = useState('SANDBOX_EAST')
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [coaOptions, setCoaOptions] = useState<string[]>([])
  const [requestors, setRequestors] = useState<string[]>([])
  const [nextPcvSeq, setNextPcvSeq] = useState<number>(1)
  const [showSettings, setShowSettings] = useState(false)

  const loadEntries = useCallback(async (br: string) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/petty-cash/entries?branch=${br}`)
      setEntries(r.ok ? await r.json() : [])
    } catch { setEntries([]) }
    setLoading(false)
  }, [])

  const loadSettings = useCallback(async (br: string) => {
    try {
      const r = await fetch(`/api/petty-cash/settings?branch=${br}`)
      if (r.ok) { const s = await r.json(); setRequestors(s.requestors || []); setNextPcvSeq(s.nextPcvSeq || 1) }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadEntries(branch); loadSettings(branch) }, [branch, loadEntries, loadSettings])

  useEffect(() => {
    fetch('/api/chart-of-accounts')
      .then(r => r.ok ? r.json() : [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => {
        const list = Array.isArray(d) ? d : (d.accounts || d.data || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setCoaOptions(list.map((a: any) => `${a.accountNumber} ${a.accountTitle}`))
      })
      .catch(() => setCoaOptions([]))
  }, [])

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const patchLocal = (id: string, patch: Partial<Entry>) =>
    setEntries(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)))

  const saveField = (id: string, patch: Partial<Entry>, debounce = true) => {
    patchLocal(id, patch)
    const doSave = async () => {
      try {
        await fetch('/api/petty-cash/entries', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...patch }),
        })
      } catch { /* ignore */ }
    }
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id])
    if (debounce) saveTimers.current[id] = setTimeout(doSave, 500)
    else doSave()
  }

  const addRow = async () => {
    setAdding(true)
    try {
      const r = await fetch('/api/petty-cash/entries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch }),
      })
      if (r.ok) { const e = await r.json(); setEntries(prev => [...prev, e]); setNextPcvSeq(s => s + 1) }
      else alert((await r.json()).error || 'Failed to add row')
    } catch { /* ignore */ }
    setAdding(false)
  }

  const deleteRow = async (id: string) => {
    if (!confirm('Delete this entry?')) return
    setEntries(prev => prev.filter(e => e.id !== id))
    try { await fetch(`/api/petty-cash/entries?id=${id}`, { method: 'DELETE' }) } catch { /* ignore */ }
  }

  const cellCls = 'w-full bg-transparent px-2 py-1.5 text-xs outline-none focus:bg-[var(--pale-teal)] rounded'
  const tdCls = 'border-r border-b align-top'
  const locked = (e: Entry) => !!e.reimbursementId || !canWrite
  const vatEditable = (e: Entry) => e.vatable === 'VAT' || e.vatable === 'NV'
  const totalGross = entries.reduce((s, e) => s + num(e.grossAmount), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Petty Cash
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
            {BRANCHES.map(b => (
              <button key={b.value} onClick={() => setBranch(b.value)}
                className="px-4 py-2 text-xs font-semibold transition-colors"
                style={branch === b.value
                  ? { background: 'var(--teal)', color: '#fff' }
                  : { background: '#fff', color: 'var(--mid-gray)' }}>
                {b.label}
              </button>
            ))}
          </div>
          <button onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            <Settings size={14} /> Settings
          </button>
        </div>
      </div>

      <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
        {entries.length} entries · Total Gross <strong style={{ color: 'var(--charcoal)' }}>₱{peso(totalGross)}</strong>
        {' · '}Next PCV #{nextPcvSeq}
      </p>

      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)', maxHeight: '70vh' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
        ) : (
          <table className="text-xs" style={{ borderCollapse: 'collapse', minWidth: 2400 }}>
            <thead className="sticky top-0 z-10">
              <tr style={{ background: 'var(--off-white)' }}>
                {['PCV Number', 'Requestor', 'Department', 'PCF Status', 'Date', 'Description', 'Description for Hub',
                  'Vatable', 'SI Number', 'TIN Number', 'TIN Number 2', 'Branch Code', 'Registered name',
                  'Registered Address', 'Gross Amount', 'Net of VAT', 'VAT Amount', 'Account Title', 'Reference Number', ''
                ].map((h, i) => (
                  <th key={i} className="border-r border-b px-2 py-2 text-left font-semibold whitespace-nowrap"
                    style={{ color: 'var(--charcoal)', borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const lk = locked(e)
                const ve = vatEditable(e)
                return (
                  <tr key={e.id} style={{ background: e.reimbursementId ? '#f8fafc' : '#fff' }}>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                      <span className="px-2 py-1.5 block whitespace-nowrap font-mono" style={{ color: 'var(--charcoal)' }}>{e.pcvNumber}</span>
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                      <select className={cellCls} value={e.requestor || ''} disabled={lk}
                        onChange={ev => saveField(e.id, { requestor: ev.target.value }, false)} style={{ minWidth: 160 }}>
                        <option value=""></option>
                        {requestors.map(r => <option key={r} value={r}>{r}</option>)}
                        {e.requestor && !requestors.includes(e.requestor) && <option value={e.requestor}>{e.requestor}</option>}
                      </select>
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                      <select className={cellCls} value={e.department || ''} disabled={lk}
                        onChange={ev => saveField(e.id, { department: ev.target.value }, false)}>
                        <option value=""></option>
                        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                      <select className={cellCls} value={e.pcfStatus || ''} disabled={lk}
                        onChange={ev => saveField(e.id, { pcfStatus: ev.target.value }, false)} style={{ minWidth: 140 }}>
                        <option value=""></option>
                        {PCF_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                      <input type="date" className={cellCls} disabled={lk}
                        value={e.date ? String(e.date).slice(0, 10) : ''}
                        onChange={ev => saveField(e.id, { date: ev.target.value }, false)} />
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                      <input className={cellCls} disabled={lk} value={e.description || ''} style={{ minWidth: 220 }}
                        onChange={ev => patchLocal(e.id, { description: ev.target.value })}
                        onBlur={ev => saveField(e.id, { description: ev.target.value }, false)} />
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: '#fafafa' }}>
                      <span className="px-2 py-1.5 block" style={{ color: 'var(--mid-gray)', minWidth: 240 }}>{descForHub(e)}</span>
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                      <select className={cellCls} value={e.vatable || ''} disabled={lk}
                        onChange={ev => {
                          const v = ev.target.value
                          const patch: Partial<Entry> = { vatable: v }
                          if (v !== 'VAT' && v !== 'NV') { patch.siNumber = null; patch.tinNumber = null }
                          saveField(e.id, patch, false)
                        }}>
                        <option value=""></option>
                        {VATABLE.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: ve ? '#fff' : '#f3f4f6' }}>
                      <input className={cellCls} disabled={lk || !ve} value={e.siNumber || ''} style={{ minWidth: 140 }}
                        onChange={ev => patchLocal(e.id, { siNumber: ev.target.value })}
                        onBlur={ev => saveField(e.id, { siNumber: ev.target.value }, false)} />
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: ve ? '#fff' : '#f3f4f6' }}>
                      <input className={cellCls} disabled={lk || !ve} value={e.tinNumber || ''} placeholder="XXX-XXX-XXX-XXXXX"
                        style={{ minWidth: 150 }}
                        onChange={ev => patchLocal(e.id, { tinNumber: formatTin(ev.target.value) })}
                        onBlur={ev => saveField(e.id, { tinNumber: formatTin(ev.target.value) }, false)} />
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: '#fafafa' }}>
                      <span className="px-2 py-1.5 block whitespace-nowrap font-mono" style={{ color: 'var(--mid-gray)' }}>{tinNumber2(e.tinNumber)}</span>
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: '#fafafa' }}>
                      <span className="px-2 py-1.5 block whitespace-nowrap font-mono" style={{ color: 'var(--mid-gray)' }}>{branchCodeOf(e.tinNumber)}</span>
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                      <input className={cellCls} disabled={lk} value={e.registeredName || ''} style={{ minWidth: 180 }}
                        onChange={ev => patchLocal(e.id, { registeredName: ev.target.value })}
                        onBlur={ev => saveField(e.id, { registeredName: ev.target.value }, false)} />
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                      <input className={cellCls} disabled={lk} value={e.registeredAddress || ''} style={{ minWidth: 220 }}
                        onChange={ev => patchLocal(e.id, { registeredAddress: ev.target.value })}
                        onBlur={ev => saveField(e.id, { registeredAddress: ev.target.value }, false)} />
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                      <input type="number" step="0.01" className={`${cellCls} text-right`} disabled={lk}
                        value={num(e.grossAmount) === 0 ? '' : String(e.grossAmount)} style={{ minWidth: 110 }}
                        onChange={ev => patchLocal(e.id, { grossAmount: ev.target.value })}
                        onBlur={ev => saveField(e.id, { grossAmount: Number(ev.target.value) || 0 }, false)} />
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: '#fafafa' }}>
                      <span className="px-2 py-1.5 block text-right" style={{ color: 'var(--mid-gray)' }}>{peso(netOfVat(e))}</span>
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)', background: '#fafafa' }}>
                      <span className="px-2 py-1.5 block text-right" style={{ color: 'var(--mid-gray)' }}>{peso(vatAmount(e))}</span>
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                      <select className={cellCls} value={e.accountTitle || ''} disabled={lk}
                        onChange={ev => saveField(e.id, { accountTitle: ev.target.value }, false)} style={{ minWidth: 200 }}>
                        <option value=""></option>
                        {coaOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        {e.accountTitle && !coaOptions.includes(e.accountTitle) && <option value={e.accountTitle}>{e.accountTitle}</option>}
                      </select>
                    </td>
                    <td className={tdCls} style={{ borderColor: 'var(--light-gray)' }}>
                      <input className={cellCls} disabled={lk} value={e.referenceNumber || ''} style={{ minWidth: 130 }}
                        onChange={ev => patchLocal(e.id, { referenceNumber: ev.target.value })}
                        onBlur={ev => saveField(e.id, { referenceNumber: ev.target.value }, false)} />
                    </td>
                    <td className="border-b px-1 text-center" style={{ borderColor: 'var(--light-gray)' }}>
                      {!lk && (
                        <button onClick={() => deleteRow(e.id)} title="Delete" className="p-1 rounded hover:bg-red-50">
                          <Trash2 size={13} style={{ color: '#dc2626' }} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {entries.length === 0 && (
                <tr><td colSpan={20} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}>
                  No entries yet. Click &quot;Add Row&quot; to start.
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {canWrite && (
        <button onClick={addRow} disabled={adding}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--teal)' }}>
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add Row
        </button>
      )}

      {showSettings && (
        <SettingsModal branch={branch} requestors={requestors} nextPcvSeq={nextPcvSeq} canWrite={canWrite}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => { setRequestors(s.requestors); setNextPcvSeq(s.nextPcvSeq) }} />
      )}
    </div>
  )
}

function SettingsModal({ branch, requestors, nextPcvSeq, canWrite, onClose, onSaved }: {
  branch: string; requestors: string[]; nextPcvSeq: number; canWrite: boolean
  onClose: () => void; onSaved: (s: { requestors: string[]; nextPcvSeq: number }) => void
}) {
  const [startNum, setStartNum] = useState(String(nextPcvSeq))
  const [names, setNames] = useState<string[]>(requestors)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const branchLabel = BRANCHES.find(b => b.value === branch)?.label || branch

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch('/api/petty-cash/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, nextPcvSeq: parseInt(startNum, 10) || 1, requestors: names }),
      })
      if (r.ok) { const s = await r.json(); onSaved({ requestors: s.requestors, nextPcvSeq: s.nextPcvSeq }); onClose() }
      else alert((await r.json()).error || 'Failed to save')
    } catch { alert('Failed to save') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Petty Cash Settings — {branchLabel}</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Next PCV start number</label>
        <input type="number" min="1" value={startNum} onChange={e => setStartNum(e.target.value)} disabled={!canWrite}
          className="w-full px-3 py-2 rounded-xl border text-sm mb-1" style={{ borderColor: 'var(--light-gray)' }} />
        <p className="text-[11px] mb-4" style={{ color: 'var(--mid-gray)' }}>
          The next row added will be PCV{new Date().getFullYear() % 100}-{String(parseInt(startNum, 10) || 1).padStart(6, '0')}.
        </p>

        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Requestors ({names.length})</label>
        <div className="space-y-1 mb-2 max-h-52 overflow-auto">
          {names.map((n, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg px-3 py-1.5" style={{ background: 'var(--off-white)' }}>
              <span className="text-xs" style={{ color: 'var(--charcoal)' }}>{n}</span>
              {canWrite && <button onClick={() => setNames(names.filter((_, j) => j !== i))}><X size={13} style={{ color: '#dc2626' }} /></button>}
            </div>
          ))}
        </div>
        {canWrite && (
          <div className="flex gap-2 mb-4">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Add requestor name"
              onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { setNames([...names, newName.trim()]); setNewName('') } }}
              className="flex-1 px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
            <button onClick={() => { if (newName.trim()) { setNames([...names, newName.trim()]); setNewName('') } }}
              className="px-3 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>Add</button>
          </div>
        )}

        {canWrite && (
          <button onClick={save} disabled={saving}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        )}
      </div>
    </div>
  )
}
