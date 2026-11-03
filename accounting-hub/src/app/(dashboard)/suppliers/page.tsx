'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Download, Loader2, Maximize2, Merge, Minimize2, Pencil, Plus, Search, Trash2, Truck, Upload, X } from 'lucide-react'
import { userBranchScope } from '@/lib/branch-scope'
import { useFocusTarget } from '@/lib/use-focus-target'
import { downloadPdf, downloadXlsx, type ExportFormat } from '@/lib/export'
import type { DirectoryRow } from '@/lib/supplier-directory'

// Suppliers — its own section under Expenses (Hannah, 2026-11-02). One list of
// everyone we buy from: the Expenses suppliers of every branch, the Inventory &
// Procurement suppliers and every Registered Name typed on an expense, with
// their contact details and what they supply us.
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const BRANCHES = [
  { value: 'SANDBOX_EAST', label: 'AHEA' },
  { value: 'SANDBOX_GREENHILLS', label: 'AHGH' },
  { value: 'VERDANA_STORE', label: 'VERDANA' },
  { value: 'AURA_INSTITUTE', label: 'AHI' },
]
const CONTACT_METHODS = ['WeChat', 'WhatsApp', 'Viber', 'Facebook', 'Telegram', 'SMS', 'Call', 'Email', 'Other']
const CURRENCIES = ['PHP', 'CNY', 'USD', 'EUR', 'JPY', 'KRW', 'SGD', 'HKD', 'GBP']
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const accountName = (t: string) => t.replace(/^\d+\s*/, '')

type ColKey = 'name' | 'tin' | 'branches' | 'address' | 'contactPerson' | 'contactNumber' | 'email' | 'reach' | 'foreign' | 'currency' | 'items' | 'validity'
const COLS: { key: ColKey; label: string; w: number }[] = [
  { key: 'name', label: 'Supplier', w: 220 },
  { key: 'tin', label: 'TIN', w: 130 },
  { key: 'branches', label: 'Branch', w: 90 },
  { key: 'address', label: 'Address', w: 200 },
  { key: 'contactPerson', label: 'Contact Person', w: 140 },
  { key: 'contactNumber', label: 'Contact Number', w: 130 },
  { key: 'email', label: 'Email', w: 180 },
  { key: 'reach', label: 'Reach Via', w: 120 },
  { key: 'foreign', label: 'Foreign', w: 80 },
  { key: 'currency', label: 'Currency', w: 80 },
  { key: 'items', label: 'Items / Services Provided', w: 300 },
  { key: 'validity', label: 'Validity', w: 80 },
]

// What they supply: typed in on the supplier, then what the books show.
function providedAuto(r: DirectoryRow) {
  const parts: string[] = []
  const p = r.provided
  if (p.assetCount) parts.push(`Assets: ${p.assets.slice(0, 4).join(', ')}${p.assetCount > 4 ? ` +${p.assetCount - 4}` : ''}`)
  if (p.inventoryCount) parts.push(`Inventory: ${p.inventory.slice(0, 4).join(', ')}${p.inventoryCount > 4 ? ` +${p.inventoryCount - 4}` : ''}`)
  if (p.accounts.length) parts.push(`Expenses: ${p.accounts.slice(0, 3).map(a => `${accountName(a.title)} ×${a.count}`).join(', ')}${p.accounts.length > 3 ? ` +${p.accounts.length - 3} more` : ''}`)
  return parts.join(' · ')
}
const reachOf = (r: DirectoryRow) => (r.contactMethod ? `${r.contactMethod}${r.contactHandle ? ` · ${r.contactHandle}` : ''}` : '')
const cellText = (r: DirectoryRow, k: ColKey): string => {
  switch (k) {
    case 'branches': return r.branches.join(', ')
    case 'reach': return reachOf(r)
    case 'foreign': return r.isForeign ? 'Foreign' : 'Local'
    case 'items': return [r.itemsProvided, providedAuto(r)].filter(Boolean).join(' · ')
    default: return String(r[k] ?? '')
  }
}

type Form = {
  name: string; tin: string; address: string; contactPerson: string; contactNumber: string; email: string
  contactMethod: string; contactHandle: string; isForeign: boolean; currency: string; defaultExchangeRate: string
  itemsProvided: string; notes: string
}
const blankForm: Form = { name: '', tin: '', address: '', contactPerson: '', contactNumber: '', email: '', contactMethod: '', contactHandle: '', isForeign: false, currency: 'PHP', defaultExchangeRate: '', itemsProvided: '', notes: '' }

type History = {
  entries: { branch: string; date: string | null; pcvNumber: string; description: string; accountTitle: string; validity: string; gross: number; netVat: number }[]
  assets: { controlNumber: string; name: string; branch: string; quantity: number; total: number; date: string }[]
  inventory: { sku: string; name: string; branch: string; quantity: number }[]
}

export default function SuppliersPage() {
  return <Suspense fallback={null}><SuppliersInner /></Suspense>
}

function SuppliersInner() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role || ''
  const canWrite = WRITE_ROLES.includes(role)
  const scope = userBranchScope((session?.user as { branch?: string })?.branch)
  const [branch, setBranch] = useState<string>(scope.enum || 'ALL')
  useEffect(() => { if (scope.enum && branch !== scope.enum) setBranch(scope.enum) }, [scope.enum]) // eslint-disable-line react-hooks/exhaustive-deps

  const [rows, setRows] = useState<DirectoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [validity, setValidity] = useState<'all' | 'Valid' | 'Invalid'>('all')
  const [origin, setOrigin] = useState<'all' | 'local' | 'foreign'>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [sortKey, setSortKey] = useState<ColKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [colFilter, setColFilter] = useState<Partial<Record<ColKey, string>>>({})
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState<DirectoryRow | 'new' | null>(null)
  const [form, setForm] = useState<Form>(blankForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [historyFor, setHistoryFor] = useState<DirectoryRow | null>(null)
  const [history, setHistory] = useState<History | null>(null)
  const [importing, setImporting] = useState(false)
  // Merge: tick the rows that are one supplier written several ways, keep one name.
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [mergeOpen, setMergeOpen] = useState(false)
  const [keepKey, setKeepKey] = useState('')
  const [mergeName, setMergeName] = useState('')
  const [mergeBusy, setMergeBusy] = useState(false)
  const [mergeError, setMergeError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const { focus, done } = useFocusTarget()
  useEffect(() => { if (focus) { setSearch(focus); done() } }, [focus, done])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/suppliers/directory')
      const d = r.ok ? await r.json() : { suppliers: [] }
      setRows(d.suppliers || [])
    } catch { setRows([]) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const branchLabel = BRANCHES.find(b => b.value === branch)?.label
  const q = search.trim().toLowerCase()
  const shown = useMemo(() => {
    const list = rows.filter(r => {
      if (!showInactive && !r.isActive) return false
      // A branch shows the suppliers it used, plus company-wide ones not tied to any branch yet.
      if (branchLabel && r.branches.length && !r.branches.includes(branchLabel)) return false
      if (validity !== 'all' && r.validity !== validity) return false
      if (origin !== 'all' && r.isForeign !== (origin === 'foreign')) return false
      if (q && !COLS.some(c => cellText(r, c.key).toLowerCase().includes(q)) && !r.names.some(n => n.toLowerCase().includes(q)) && !r.notes.toLowerCase().includes(q)) return false
      for (const [k, f] of Object.entries(colFilter)) {
        if (f?.trim() && !cellText(r, k as ColKey).toLowerCase().includes(f.trim().toLowerCase())) return false
      }
      return true
    })
    return list.sort((a, b) => cellText(a, sortKey).toLowerCase().localeCompare(cellText(b, sortKey).toLowerCase()) * (sortDir === 'asc' ? 1 : -1))
  }, [rows, showInactive, branchLabel, validity, origin, q, colFilter, sortKey, sortDir])

  const toggleSort = (k: ColKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }

  const openEdit = (r: DirectoryRow | 'new') => {
    setError('')
    setEditing(r)
    setForm(r === 'new' ? blankForm : {
      name: r.name, tin: r.tin, address: r.address, contactPerson: r.contactPerson, contactNumber: r.contactNumber, email: r.email,
      contactMethod: r.contactMethod, contactHandle: r.contactHandle, isForeign: r.isForeign, currency: r.currency || 'PHP',
      defaultExchangeRate: r.defaultExchangeRate != null ? String(r.defaultExchangeRate) : '', itemsProvided: r.itemsProvided, notes: r.notes,
    })
  }
  const setF = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) { setError('Supplier name is required'); return }
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) { setError('That email address does not look right'); return }
    setSaving(true); setError('')
    const fields = { ...form, currency: form.isForeign ? form.currency : 'PHP', defaultExchangeRate: form.isForeign ? form.defaultExchangeRate : '' }
    try {
      const res = editing === 'new'
        ? await fetch('/api/suppliers/directory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch: branch === 'ALL' ? null : branch, rows: [fields] }) })
        : await fetch('/api/suppliers/directory', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: (editing as DirectoryRow).key, ...fields }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'Save failed'); return }
      setEditing(null)
      await load()
    } catch { setError('Save failed') } finally { setSaving(false) }
  }

  const remove = async (r: DirectoryRow) => {
    if (!confirm(`Take ${r.name} off the Suppliers list?\n\nAssets and inventory keep their link and past expense entries are not changed. Tick "Show inactive" to find it again.`)) return
    const res = await fetch(`/api/suppliers/directory?key=${encodeURIComponent(r.key)}`, { method: 'DELETE' })
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error || 'Failed to remove'); return }
    await load()
  }
  const reactivate = async (r: DirectoryRow) => {
    const res = await fetch('/api/suppliers/directory', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: r.key, name: r.name, isActive: true }) })
    if (res.ok) await load()
  }

  const togglePick = (key: string) => setPicked(p => { const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n })
  const pickedRows = rows.filter(r => picked.has(r.key))
  const openMerge = () => {
    // Suggest keeping the one with the most behind it (entries, then a saved record).
    const best = [...pickedRows].sort((a, b) => (b.entryCount - a.entryCount) || (Number(!!b.masterId) - Number(!!a.masterId)) || (b.name.length - a.name.length))[0]
    setKeepKey(best?.key || ''); setMergeName(''); setMergeError(''); setMergeOpen(true)
  }
  const doMerge = async () => {
    setMergeBusy(true); setMergeError('')
    try {
      const res = await fetch('/api/suppliers/directory/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: pickedRows.map(r => r.key), keepKey, name: mergeName.trim() || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMergeError(d.error || 'Merge failed'); return }
      setMergeOpen(false); setPicked(new Set())
      await load()
      alert(`Merged into ${d.name}: ${d.entries} expense entr${d.entries === 1 ? 'y' : 'ies'} renamed, ${d.expenseFolded} duplicate Expenses-list row(s) folded, ${d.mastersFolded} supplier record(s) folded, ${d.assetsMoved} asset(s) and ${d.itemsMoved} inventory item(s) moved.`)
    } catch { setMergeError('Merge failed') } finally { setMergeBusy(false) }
  }

  const openHistory = async (r: DirectoryRow) => {
    setHistoryFor(r); setHistory(null)
    try {
      const res = await fetch(`/api/suppliers/directory?history=${encodeURIComponent(r.key)}`)
      setHistory(res.ok ? await res.json() : { entries: [], assets: [], inventory: [] })
    } catch { setHistory({ entries: [], assets: [], inventory: [] }) }
  }

  const SHEET_HEADERS = ['Supplier Name', 'TIN', 'Address', 'Contact Person', 'Contact Number', 'Email', 'Reach Via', 'ID / Handle', 'Foreign (Yes/No)', 'Currency', 'Items / Services Provided', 'Notes']
  const downloadTemplate = async () => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([SHEET_HEADERS, ['SAMPLE VENDOR INC', '000-000-000-00000', 'SAMPLE ADDRESS, CITY', 'Juan Dela Cruz', '0917 000 0000', 'sales@sample.ph', 'Viber', '', 'No', 'PHP', 'Office supplies, printer ink', '']])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Suppliers')
    XLSX.writeFile(wb, 'suppliers-import-template.xlsx')
  }
  const importFile = async (file: File) => {
    setImporting(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer())
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      const map: Record<string, string> = {
        suppliername: 'name', supplier: 'name', name: 'name', registeredname: 'name', tin: 'tin', address: 'address', registeredaddress: 'address',
        contactperson: 'contactPerson', contactnumber: 'contactNumber', contact: 'contactNumber', email: 'email', reachvia: 'contactMethod',
        idhandle: 'contactHandle', handle: 'contactHandle', foreignyesno: 'isForeign', foreign: 'isForeign', currency: 'currency',
        itemsservicesprovided: 'itemsProvided', itemsprovided: 'itemsProvided', purpose: 'itemsProvided', notes: 'notes',
      }
      const out = json.map(raw => {
        const o: Record<string, string> = {}
        for (const k of Object.keys(raw)) { const f = map[k.toLowerCase().replace(/[^a-z0-9]/g, '')]; if (f) o[f] = String(raw[k]).trim() }
        return o
      }).filter(o => o.name)
      if (!out.length) { alert('No supplier rows found — use the template.'); return }
      const res = await fetch('/api/suppliers/directory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch: branch === 'ALL' ? null : branch, rows: out }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { alert(d.error || 'Import failed'); return }
      await load()
      alert(`Imported: ${d.created} new, ${d.updated} updated.${branch !== 'ALL' ? ` All are now on ${branchLabel}'s Expenses supplier list.` : ''}`)
    } catch { alert('Could not read the file. Use the template (.xlsx or .csv).') } finally { setImporting(false) }
  }

  const exportList = (fmt: ExportFormat) => {
    const headers = ['Supplier', 'TIN', 'Branch', 'Address', 'Contact Person', 'Contact Number', 'Email', 'Reach Via', 'Foreign', 'Currency', 'Items / Services Provided', 'Validity']
    const body = shown.map(r => COLS.map(c => cellText(r, c.key)))
    if (fmt === 'xlsx') downloadXlsx(`suppliers-${branchLabel || 'all'}`, [{ name: 'Suppliers', headers, rows: body }])
    else downloadPdf({ title: 'Suppliers', subtitle: `${branchLabel || 'All branches'} · ${body.length} supplier(s)`, headers, rows: body, landscape: true })
  }

  const inp = 'w-full px-3 py-2 rounded-xl border text-sm outline-none'
  const lbl = 'block text-xs font-semibold mb-1'
  const branchChoices = scope.enum ? BRANCHES.filter(b => b.value === scope.enum) : [{ value: 'ALL', label: 'All branches' }, ...BRANCHES]

  return (
    <div className={expanded ? 'fixed inset-0 z-50 overflow-auto p-6 space-y-4' : 'space-y-4'} style={expanded ? { background: 'var(--off-white)' } : undefined}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <Truck size={22} style={{ color: 'var(--teal)' }} /> Suppliers
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
            Everyone we buy from — Expenses, Inventory &amp; Procurement and Asset Management use this one list. Click a supplier to see what we bought from them.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
            {branchChoices.map(b => (
              <button key={b.value} onClick={() => setBranch(b.value)} className="px-4 py-2 text-xs font-semibold transition-colors"
                style={branch === b.value ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
                {b.label}
              </button>
            ))}
          </div>
          <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            {expanded ? <><Minimize2 size={14} /> Collapse</> : <><Maximize2 size={14} /> Expand</>}
          </button>
        </div>
      </div>

      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="flex items-end gap-3 flex-wrap flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, contact, TIN, items…"
              className="w-full pl-9 pr-8 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X size={15} style={{ color: 'var(--mid-gray)' }} /></button>}
          </div>
          <select value={validity} onChange={e => setValidity(e.target.value as typeof validity)} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="all">Valid &amp; Invalid</option><option value="Valid">Valid only</option><option value="Invalid">Invalid only</option>
          </select>
          <select value={origin} onChange={e => setOrigin(e.target.value as typeof origin)} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="all">Local &amp; foreign</option><option value="local">Local only</option><option value="foreign">Foreign only</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs font-semibold pb-2" style={{ color: 'var(--mid-gray)' }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show inactive
          </label>
          <span className="text-xs pb-2" style={{ color: 'var(--mid-gray)' }}>{shown.length} supplier(s)</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={downloadTemplate} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}><Download size={14} /> Template</button>
          <button onClick={() => exportList('xlsx')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: '#166534' }}><Download size={14} /> Excel</button>
          <button onClick={() => exportList('pdf')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: '#b91c1c' }}><Download size={14} /> PDF</button>
          {canWrite && (
            <button onClick={() => fileRef.current?.click()} disabled={importing} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}
              title={branch === 'ALL' ? 'Adds/updates suppliers. Pick a branch first to also put them on that branch’s Expenses list.' : `Adds/updates suppliers and puts them on ${branchLabel}’s Expenses list`}>
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Import CSV/Excel
            </button>
          )}
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }} />
          {canWrite && picked.size > 0 && (
            <>
              <button onClick={openMerge} disabled={picked.size < 2} title={picked.size < 2 ? 'Tick at least two suppliers' : 'One supplier written several ways — keep one name'}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#7c3aed' }}>
                <Merge size={15} /> Merge {picked.size} into one
              </button>
              <button onClick={() => setPicked(new Set())} className="px-2 py-2 text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Clear ticks</button>
            </>
          )}
          {canWrite && (
            <button onClick={() => openEdit('new')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> Add</button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)', maxHeight: expanded ? 'calc(100vh - 170px)' : '68vh' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
        ) : (
          <table className="text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: COLS.reduce((s, c) => s + c.w, 60) }}>
            <thead className="sticky top-0 z-20">
              <tr>
                {COLS.map((c, i) => (
                  <th key={c.key} className={`border-r border-b px-3 py-2 text-left font-semibold align-top ${i === 0 ? 'sticky left-0 z-30' : ''}`}
                    style={{ color: 'var(--charcoal)', borderColor: 'var(--light-gray)', background: 'var(--off-white)', minWidth: c.w, maxWidth: c.w + 80 }}>
                    <button onClick={() => toggleSort(c.key)} className="flex items-center gap-1 whitespace-nowrap">
                      {i === 0 && canWrite && (
                        <input type="checkbox" title="Tick all shown" className="mr-1" onClick={e => e.stopPropagation()}
                          checked={shown.length > 0 && shown.every(r => picked.has(r.key))}
                          onChange={e => setPicked(p => { const n = new Set(p); for (const r of shown) { if (e.target.checked) n.add(r.key); else n.delete(r.key) } return n })} />
                      )}
                      {c.label}
                      <span style={{ color: sortKey === c.key ? 'var(--teal)' : 'var(--light-gray)' }}>{sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </button>
                    <input value={colFilter[c.key] || ''} onChange={e => setColFilter(f => ({ ...f, [c.key]: e.target.value }))} placeholder="filter…"
                      className="mt-1 w-full px-2 py-1 rounded border text-[11px] font-normal" style={{ borderColor: 'var(--light-gray)' }} />
                  </th>
                ))}
                <th className="border-b px-3 py-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)', minWidth: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => {
                const auto = providedAuto(r)
                const td = 'border-r border-b px-3 py-2 align-top'
                return (
                  <tr key={r.key} onClick={() => openHistory(r)} className="cursor-pointer hover:bg-gray-50" style={r.isActive ? undefined : { opacity: 0.5 }} title="See what we bought from this supplier">
                    <td className={`${td} sticky left-0 z-10 bg-white`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)', fontWeight: 600 }}>
                      {canWrite && <input type="checkbox" className="mr-2 align-middle" checked={picked.has(r.key)} onClick={e => e.stopPropagation()} onChange={() => togglePick(r.key)} title="Tick to merge" />}
                      {r.name}{!r.isActive && <span className="ml-1 text-[10px] font-normal" style={{ color: 'var(--mid-gray)' }}>(inactive)</span>}
                    </td>
                    <td className={`${td} font-mono whitespace-nowrap`} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>{r.tin || '—'}</td>
                    <td className={td} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>{r.branches.join(', ') || '—'}</td>
                    <td className={td} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>{r.address || '—'}</td>
                    <td className={td} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>{r.contactPerson || '—'}</td>
                    <td className={`${td} whitespace-nowrap`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>{r.contactNumber || '—'}</td>
                    <td className={`${td} break-all`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>{r.email || '—'}</td>
                    <td className={td} style={{ borderColor: 'var(--light-gray)' }}>
                      {r.contactMethod ? <span className="px-2 py-0.5 rounded-md font-medium" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>{reachOf(r)}</span> : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                    </td>
                    <td className={td} style={{ borderColor: 'var(--light-gray)' }}>
                      {r.isForeign ? <span className="px-2 py-0.5 rounded-md font-medium" style={{ background: '#e0e7ff', color: '#3730a3' }}>Foreign</span> : <span style={{ color: 'var(--mid-gray)' }}>Local</span>}
                    </td>
                    <td className={td} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>{r.currency || 'PHP'}</td>
                    <td className={td} style={{ borderColor: 'var(--light-gray)' }}>
                      {r.itemsProvided && <div style={{ color: 'var(--charcoal)' }}>{r.itemsProvided}</div>}
                      {auto && <div className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{auto}</div>}
                      {!r.itemsProvided && !auto && <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                    </td>
                    <td className={td} style={{ borderColor: 'var(--light-gray)' }}>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={r.validity === 'Invalid' ? { background: '#fee2e2', color: '#b91c1c' } : { background: '#dcfce7', color: '#166534' }}>{r.validity}</span>
                    </td>
                    <td className="border-b px-2 py-2 text-right whitespace-nowrap align-top" onClick={e => e.stopPropagation()} style={{ borderColor: 'var(--light-gray)' }}>
                      {canWrite && (r.isActive ? (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(r)} title="Edit supplier" className="p-1 rounded hover:bg-gray-100"><Pencil size={13} style={{ color: 'var(--teal)' }} /></button>
                          {(r.masterId || r.expenseIds.length > 0) && (
                            <button onClick={() => remove(r)} title="Take off the list" className="p-1 rounded hover:bg-red-50"><Trash2 size={13} style={{ color: '#dc2626' }} /></button>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => reactivate(r)} className="px-2 py-1 rounded-lg text-[11px] font-semibold border" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>Restore</button>
                      ))}
                    </td>
                  </tr>
                )
              })}
              {shown.length === 0 && (
                <tr><td colSpan={COLS.length + 1} className="text-center py-10" style={{ color: 'var(--mid-gray)' }}>No suppliers match.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {mergeOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => !mergeBusy && setMergeOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}><Merge size={18} style={{ color: '#7c3aed' }} /> Merge {pickedRows.length} suppliers into one</h2>
              <button onClick={() => setMergeOpen(false)} disabled={mergeBusy}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>
              Pick the name to keep. Expense entries, each branch&apos;s Expenses supplier list, assets and inventory items under the other names all move to it,
              and contact details, TIN and address the kept one lacks are copied over.
            </p>
            <div className="space-y-1.5">
              {pickedRows.map(r => (
                <label key={r.key} className="flex items-start gap-2 rounded-xl border px-3 py-2 cursor-pointer" style={{ borderColor: keepKey === r.key ? '#7c3aed' : 'var(--light-gray)', background: keepKey === r.key ? '#f5f3ff' : '#fff' }}>
                  <input type="radio" name="keep" className="mt-1" checked={keepKey === r.key} onChange={() => setKeepKey(r.key)} />
                  <span className="text-sm">
                    <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{r.name}</span>
                    <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                      {[r.branches.join(', ') || 'no branch yet', `${r.entryCount} expense entr${r.entryCount === 1 ? 'y' : 'ies'}`, r.provided.assetCount ? `${r.provided.assetCount} asset(s)` : '', r.tin ? `TIN ${r.tin}` : '', r.contactNumber || r.email || ''].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <label className="block text-xs font-semibold mt-3 mb-1" style={{ color: 'var(--mid-gray)' }}>Or correct the kept name (optional)</label>
            <input value={mergeName} onChange={e => setMergeName(e.target.value.toUpperCase())} placeholder={pickedRows.find(r => r.key === keepKey)?.name || ''}
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
            <p className="text-[11px] mt-2" style={{ color: '#b45309' }}>Merging can&apos;t be undone from this page. The registered name on the merged expense entries changes to the kept name.</p>
            {mergeError && <p className="text-sm text-red-600 mt-2">{mergeError}</p>}
            <button onClick={doMerge} disabled={mergeBusy || !keepKey} className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: '#7c3aed' }}>
              {mergeBusy && <Loader2 size={14} className="animate-spin" />}Merge into {mergeName.trim() || pickedRows.find(r => r.key === keepKey)?.name || '…'}
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{editing === 'new' ? 'Add Supplier' : 'Edit Supplier'}</h2>
              <button onClick={() => setEditing(null)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={lbl} style={{ color: 'var(--mid-gray)' }}>Supplier (registered name)</label>
                <input value={form.name} onChange={e => setF('name', e.target.value.toUpperCase())} className={inp} style={{ borderColor: 'var(--light-gray)' }} />
                {editing !== 'new' && editing.names.length > 1 && (
                  <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>Also written as: {editing.names.filter(n => n.toUpperCase() !== form.name).join(' · ')}</p>
                )}
              </div>
              <div>
                <label className={lbl} style={{ color: 'var(--mid-gray)' }}>TIN</label>
                <input value={form.tin} onChange={e => setF('tin', e.target.value)} placeholder="XXX-XXX-XXX-XXXXX" className={`${inp} font-mono`} style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className={lbl} style={{ color: 'var(--mid-gray)' }}>Address</label>
                <input value={form.address} onChange={e => setF('address', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className={lbl} style={{ color: 'var(--mid-gray)' }}>Contact person</label>
                <input value={form.contactPerson} onChange={e => setF('contactPerson', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className={lbl} style={{ color: 'var(--mid-gray)' }}>Contact number</label>
                <input value={form.contactNumber} onChange={e => setF('contactNumber', e.target.value)} placeholder="0917 000 0000" className={inp} style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className={lbl} style={{ color: 'var(--mid-gray)' }}>Email</label>
                <input type="email" value={form.email} onChange={e => setF('email', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl} style={{ color: 'var(--mid-gray)' }}>Reach via</label>
                  <select value={form.contactMethod} onChange={e => setF('contactMethod', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }}>
                    <option value="">—</option>
                    {CONTACT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl} style={{ color: 'var(--mid-gray)' }}>ID / handle</label>
                  <input value={form.contactHandle} onChange={e => setF('contactHandle', e.target.value)} placeholder="optional" className={inp} style={{ borderColor: 'var(--light-gray)' }} />
                </div>
              </div>
              <div className="sm:col-span-2 flex items-end gap-3 flex-wrap">
                <label className="flex items-center gap-2 text-sm pb-2" style={{ color: 'var(--charcoal)' }}>
                  <input type="checkbox" checked={form.isForeign} onChange={e => setForm(f => ({ ...f, isForeign: e.target.checked, currency: e.target.checked ? (f.currency === 'PHP' ? 'CNY' : f.currency) : 'PHP' }))} /> Foreign supplier
                </label>
                {form.isForeign && (
                  <>
                    <div>
                      <label className={lbl} style={{ color: 'var(--mid-gray)' }}>Currency</label>
                      <select value={form.currency} onChange={e => setF('currency', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }}>
                        {CURRENCIES.filter(c => c !== 'PHP').map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl} style={{ color: 'var(--mid-gray)' }}>Usual exchange rate (₱ per 1 {form.currency})</label>
                      <input type="number" step="0.0001" value={form.defaultExchangeRate} onChange={e => setF('defaultExchangeRate', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                  </>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className={lbl} style={{ color: 'var(--mid-gray)' }}>Items / services they provide</label>
                <textarea value={form.itemsProvided} onChange={e => setF('itemsProvided', e.target.value)} rows={2} placeholder="e.g. Office supplies and printer ink; aircon cleaning"
                  className={`${inp} resize-y`} style={{ borderColor: 'var(--light-gray)' }} />
                {editing !== 'new' && providedAuto(editing) && (
                  <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>From the books: {providedAuto(editing)}</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className={lbl} style={{ color: 'var(--mid-gray)' }}>Notes (bank details, terms, …)</label>
                <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} rows={3} className={`${inp} resize-y`} style={{ borderColor: 'var(--light-gray)' }} />
              </div>
            </div>
            {editing === 'new' && branch !== 'ALL' && (
              <p className="text-[11px] mt-3" style={{ color: 'var(--mid-gray)' }}>Also goes on {branchLabel}&apos;s Expenses supplier list.</p>
            )}
            {editing !== 'new' && form.name !== editing.name && (
              <p className="text-[11px] mt-3" style={{ color: '#b45309' }}>Renaming changes the saved supplier only — expense entries already recorded keep the name they were entered with.</p>
            )}
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <button onClick={save} disabled={saving} className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>
              {saving && <Loader2 size={14} className="animate-spin" />}{editing === 'new' ? 'Add Supplier' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {historyFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setHistoryFor(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3 gap-3">
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>{historyFor.name}</h2>
                <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                  {[historyFor.contactPerson, historyFor.contactNumber, historyFor.email, reachOf(historyFor)].filter(Boolean).join(' · ') || 'No contact details yet'}
                </p>
                {historyFor.itemsProvided && <p className="text-xs mt-1" style={{ color: 'var(--charcoal)' }}>Provides: {historyFor.itemsProvided}</p>}
              </div>
              <div className="flex items-center gap-2">
                {canWrite && historyFor.isActive && (
                  <button onClick={() => { const r = historyFor; setHistoryFor(null); openEdit(r) }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}><Pencil size={12} /> Edit</button>
                )}
                <button onClick={() => setHistoryFor(null)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
              </div>
            </div>
            {!history ? (
              <div className="py-10 text-center"><Loader2 className="animate-spin inline" size={18} style={{ color: 'var(--teal)' }} /></div>
            ) : (
              <div className="overflow-auto space-y-4">
                {history.assets.length > 0 && (
                  <section>
                    <h3 className="text-xs font-bold mb-1" style={{ color: 'var(--dark-teal)' }}>Assets ({history.assets.length})</h3>
                    <table className="w-full text-xs">
                      <tbody>
                        {history.assets.map(a => (
                          <tr key={a.controlNumber + a.name} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                            <td className="px-2 py-1.5 font-mono whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{a.controlNumber}</td>
                            <td className="px-2 py-1.5" style={{ color: 'var(--charcoal)' }}>{a.name}{a.quantity > 1 ? ` ×${a.quantity}` : ''}</td>
                            <td className="px-2 py-1.5" style={{ color: 'var(--mid-gray)' }}>{a.branch}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{a.date}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{peso(a.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}
                {history.inventory.length > 0 && (
                  <section>
                    <h3 className="text-xs font-bold mb-1" style={{ color: 'var(--dark-teal)' }}>Inventory items ({history.inventory.length})</h3>
                    <table className="w-full text-xs">
                      <tbody>
                        {history.inventory.map(i => (
                          <tr key={i.sku + i.branch} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                            <td className="px-2 py-1.5 font-mono whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{i.sku}</td>
                            <td className="px-2 py-1.5" style={{ color: 'var(--charcoal)' }}>{i.name}</td>
                            <td className="px-2 py-1.5" style={{ color: 'var(--mid-gray)' }}>{i.branch}</td>
                            <td className="px-2 py-1.5 text-right" style={{ color: 'var(--mid-gray)' }}>{i.quantity} on hand</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}
                <section>
                  <h3 className="text-xs font-bold mb-1" style={{ color: 'var(--dark-teal)' }}>Expense entries ({history.entries.length})</h3>
                  {history.entries.length === 0 ? (
                    <p className="text-xs py-3" style={{ color: 'var(--mid-gray)' }}>No expense entries under this name.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead style={{ background: 'var(--off-white)' }}>
                        <tr>{['Date', 'Branch', 'PCV', 'Description', 'Account', 'Validity', 'Gross', 'Net of VAT'].map((h, i) => (
                          <th key={h} className={`px-2 py-1.5 font-semibold whitespace-nowrap ${i >= 6 ? 'text-right' : 'text-left'}`} style={{ color: 'var(--charcoal)' }}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {history.entries.map((t, i) => (
                          <tr key={i} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                            <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{t.date || '—'}</td>
                            <td className="px-2 py-1.5" style={{ color: 'var(--mid-gray)' }}>{t.branch}</td>
                            <td className="px-2 py-1.5 font-mono whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{t.pcvNumber}</td>
                            <td className="px-2 py-1.5" style={{ color: 'var(--charcoal)' }}>{t.description || '—'}</td>
                            <td className="px-2 py-1.5" style={{ color: 'var(--mid-gray)' }}>{accountName(t.accountTitle) || '—'}</td>
                            <td className="px-2 py-1.5">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={t.validity === 'Invalid' ? { background: '#fee2e2', color: '#b91c1c' } : { background: '#dcfce7', color: '#166534' }}>{t.validity || '—'}</span>
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">{peso(t.gross)}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{peso(t.netVat)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t font-semibold" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                          <td className="px-2 py-1.5" colSpan={6}>Total</td>
                          <td className="px-2 py-1.5 text-right font-mono">{peso(history.entries.reduce((s, t) => s + t.gross, 0))}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{peso(history.entries.reduce((s, t) => s + t.netVat, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
