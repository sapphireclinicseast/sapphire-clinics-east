'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Download, Loader2, Maximize2, Merge, Minimize2, Pencil, Plus, Search, Trash2, Truck, Upload, X } from 'lucide-react'
import { userBranchScope } from '@/lib/branch-scope'
import { useFocusTarget } from '@/lib/use-focus-target'
import { downloadPdf, downloadXlsx, type ExportFormat } from '@/lib/export'
import type { DirectoryRow } from '@/lib/supplier-directory'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'

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
  // Quick filter from the "No contact details" card.
  const [noContact, setNoContact] = useState(false)
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
      if (noContact && (r.contactNumber || r.email || r.contactMethod)) return false
      if (q && !COLS.some(c => cellText(r, c.key).toLowerCase().includes(q)) && !r.names.some(n => n.toLowerCase().includes(q)) && !r.notes.toLowerCase().includes(q)) return false
      for (const [k, f] of Object.entries(colFilter)) {
        if (f?.trim() && !cellText(r, k as ColKey).toLowerCase().includes(f.trim().toLowerCase())) return false
      }
      return true
    })
    return list.sort((a, b) => cellText(a, sortKey).toLowerCase().localeCompare(cellText(b, sortKey).toLowerCase()) * (sortDir === 'asc' ? 1 : -1))
  }, [rows, showInactive, branchLabel, validity, origin, noContact, q, colFilter, sortKey, sortDir])
  // Card counts: this branch's list before the search and the other filters.
  const inBranch = useMemo(() => rows.filter(r => (showInactive || r.isActive) && (!branchLabel || !r.branches.length || r.branches.includes(branchLabel))), [rows, showInactive, branchLabel])
  const nInvalid = inBranch.filter(r => r.validity === 'Invalid').length
  const nForeign = inBranch.filter(r => r.isForeign).length
  const nNoContact = inBranch.filter(r => !r.contactNumber && !r.email && !r.contactMethod).length
  const anyFilter = !!(q || validity !== 'all' || origin !== 'all' || noContact || Object.values(colFilter).some(v => v?.trim()))
  const clearFilters = () => { setSearch(''); setValidity('all'); setOrigin('all'); setNoContact(false); setColFilter({}) }

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

  const { ghost: ghostBtn, primary: primaryBtn, outline: outlineBtn } = hrBtn
  const seg = (on: boolean) => (on ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' })
  return (
    <div className={expanded ? 'fixed inset-0 z-50 overflow-auto p-4 lg:p-6 space-y-4' : HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <Truck size={22} style={{ color: 'var(--teal)' }} /> Suppliers
          </h1>
          <p className="mt-1 text-[13px] max-w-2xl" style={{ color: 'var(--mid-gray)' }}>
            Everyone we buy from — Expenses, Inventory &amp; Procurement and Asset Management use this one list. Click a supplier to see what we bought from them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Branch">
          {branchChoices.map(b => (
            <button key={b.value} onClick={() => setBranch(b.value)} aria-pressed={branch === b.value}
              className="px-3.5 py-1.5 rounded-full border text-[13px] font-semibold whitespace-nowrap transition-colors"
              style={branch === b.value
                ? { background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff', fontFamily: 'var(--font-display)' }
                : { background: '#fff', borderColor: 'var(--light-gray)', color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>
              {b.label}
            </button>
          ))}
          <span className="w-px h-6 mx-1" style={{ background: 'var(--light-gray)' }} />
          <button onClick={() => setExpanded(v => !v)} className={ghostBtn} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            {expanded ? <><Minimize2 size={14} /> Collapse</> : <><Maximize2 size={14} /> Expand</>}
          </button>
        </div>
      </div>

      {/* Cards (also quick filters) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard loading={loading} label="Suppliers" value={inBranch.length.toLocaleString()}
          sub={`${(inBranch.length - nInvalid).toLocaleString()} valid · ${branchLabel || 'all branches'}`}
          accent={{ line: 'var(--teal)' }} active={validity === 'Valid'}
          onClick={() => setValidity(v => (v === 'Valid' ? 'all' : 'Valid'))} title="Show only the valid suppliers" />
        <StatCard loading={loading} label="Invalid" value={nInvalid.toLocaleString()} sub="Marked Invalid on expenses"
          tone={nInvalid ? 'amber' : 'zero'} active={validity === 'Invalid'}
          onClick={() => setValidity(v => (v === 'Invalid' ? 'all' : 'Invalid'))} title="Show only the invalid suppliers" />
        <StatCard loading={loading} label="Foreign" value={nForeign.toLocaleString()} sub="Marked as foreign suppliers"
          tone={nForeign ? 'blue' : 'zero'} active={origin === 'foreign'}
          onClick={() => setOrigin(o => (o === 'foreign' ? 'all' : 'foreign'))} title="Show only the foreign suppliers" />
        <StatCard loading={loading} label="No contact details" value={nNoContact.toLocaleString()} sub="No number, email or chat handle"
          tone={nNoContact ? 'red' : 'zero'} active={noContact}
          onClick={() => setNoContact(v => !v)} title="Show the suppliers we have no way to reach" />
      </div>

      {/* List card */}
      <section className="rounded-lg border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-3.5 pb-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              Supplier list <span className="ml-1 text-xs font-semibold" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-body)' }}>
                {loading ? '' : `${shown.length.toLocaleString()}${shown.length !== inBranch.length ? ` of ${inBranch.length.toLocaleString()}` : ''}`}
              </span>
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
              {canWrite ? 'Tick suppliers that are one company written several ways, then merge them.' : 'Click a supplier to see what we bought from them.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canWrite && picked.size > 0 && (
              <>
                <button onClick={openMerge} disabled={picked.size < 2} title={picked.size < 2 ? 'Tick at least two suppliers' : 'One supplier written several ways — keep one name'}
                  className={primaryBtn} style={{ background: '#7c3aed' }}>
                  <Merge size={15} /> Merge {picked.size} into one
                </button>
                <button onClick={() => setPicked(new Set())} className="px-2 h-9 text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Clear ticks</button>
              </>
            )}
            {canWrite && (
              <button onClick={() => openEdit('new')} className={primaryBtn} style={{ background: 'var(--teal)' }}><Plus size={15} /> Add supplier</button>
            )}
            {canWrite && (
              <button onClick={() => fileRef.current?.click()} disabled={importing} className={outlineBtn} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}
                title={branch === 'ALL' ? 'Adds/updates suppliers. Pick a branch first to also put them on that branch’s Expenses list.' : `Adds/updates suppliers and puts them on ${branchLabel}’s Expenses list`}>
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={15} />} Import CSV/Excel
              </button>
            )}
            <button onClick={downloadTemplate} className={outlineBtn} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}><Download size={15} /> Template</button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }} />
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-y" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
          <label className="flex items-center gap-1.5 h-9 px-3 w-full sm:w-72 rounded-lg border bg-white focus-within:border-[var(--teal)] focus-within:shadow-[0_0_0_3px_rgba(74,128,115,0.12)]"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--hr-faint)' }}>
            <Search size={15} className="flex-shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, contact, TIN, items…"
              className="flex-1 min-w-0 bg-transparent outline-none text-[13px]" style={{ color: 'var(--charcoal)' }} />
            {search && <button onClick={() => setSearch('')} title="Clear search"><X size={14} /></button>}
          </label>
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
            {([['all', 'Valid & invalid'], ['Valid', 'Valid'], ['Invalid', 'Invalid']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setValidity(v)} aria-pressed={validity === v} className="h-9 px-3 text-xs font-semibold whitespace-nowrap" style={seg(validity === v)}>{l}</button>
            ))}
          </div>
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
            {([['all', 'Local & foreign'], ['local', 'Local'], ['foreign', 'Foreign']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setOrigin(v)} aria-pressed={origin === v} className="h-9 px-3 text-xs font-semibold whitespace-nowrap" style={seg(origin === v)}>{l}</button>
            ))}
          </div>
          <button onClick={() => setShowInactive(v => !v)} aria-pressed={showInactive}
            className="h-8 px-3 rounded-full border text-xs font-semibold whitespace-nowrap"
            style={showInactive ? { background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff' } : { background: '#fff', borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            Show inactive
          </button>
          {anyFilter && (
            <button onClick={clearFilters} className="text-xs font-semibold hover:underline underline-offset-2" style={{ color: 'var(--teal)' }}>Clear filters</button>
          )}
        </div>

        <div className="overflow-auto" style={{ maxHeight: expanded ? 'calc(100vh - 300px)' : '66vh' }}>
        {loading ? (
          <div className="p-4 space-y-2" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-10 rounded-md hr-shimmer" />)}
          </div>
        ) : (
          <table className="text-xs w-full" style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: COLS.reduce((s, c) => s + c.w, 60) }}>
            <thead className="sticky top-0 z-20">
              <tr>
                {COLS.map((c, i) => (
                  <th key={c.key} className={`border-r border-b px-3 py-2 text-left align-top ${i === 0 ? 'sticky left-0 z-30' : ''}`}
                    style={{ color: 'var(--mid-gray)', borderColor: 'var(--hr-line)', borderBottomColor: 'var(--light-gray)', background: 'var(--hr-head)', minWidth: c.w, maxWidth: c.w + 80,
                      ...(i === 0 ? { boxShadow: '4px 0 6px -4px rgba(35,48,56,0.14)' } : {}) }}>
                    <button onClick={() => toggleSort(c.key)}
                      className="flex items-center gap-1 whitespace-nowrap text-[11px] font-bold uppercase tracking-[.5px] hover:text-[var(--teal)]"
                      style={sortKey === c.key ? { color: 'var(--teal)' } : undefined}>
                      {i === 0 && canWrite && (
                        <input type="checkbox" title="Tick all shown" className="mr-1 accent-[var(--teal)]" onClick={e => e.stopPropagation()}
                          checked={shown.length > 0 && shown.every(r => picked.has(r.key))}
                          onChange={e => setPicked(p => { const n = new Set(p); for (const r of shown) { if (e.target.checked) n.add(r.key); else n.delete(r.key) } return n })} />
                      )}
                      {c.label}
                      <span className="text-[10px]" style={{ opacity: sortKey === c.key ? 1 : 0.45 }}>{sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </button>
                    <input value={colFilter[c.key] || ''} onChange={e => setColFilter(f => ({ ...f, [c.key]: e.target.value }))} placeholder="Filter"
                      className="mt-1.5 w-full px-2 py-1 rounded-md border bg-white text-[11px] font-normal outline-none focus:border-[var(--teal)]"
                      style={{ borderColor: colFilter[c.key] ? 'var(--teal)' : 'var(--hr-line)', color: 'var(--charcoal)' }} />
                  </th>
                ))}
                <th className="border-b px-3 py-2" style={{ borderColor: 'var(--light-gray)', background: 'var(--hr-head)', minWidth: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => {
                const auto = providedAuto(r)
                const td = 'border-r border-b px-3 py-2.5 align-top'
                const line = { borderColor: 'var(--hr-line)' }
                return (
                  <tr key={r.key} onClick={() => openHistory(r)} className="group cursor-pointer" style={r.isActive ? undefined : { opacity: 0.55 }} title="See what we bought from this supplier">
                    <td className={`${td} sticky left-0 z-10 bg-white group-hover:bg-[#f3f8ea]`}
                      style={{ ...line, color: 'var(--charcoal)', fontWeight: 600, boxShadow: `4px 0 6px -4px rgba(35,48,56,0.14), inset 4px 0 0 ${r.validity === 'Invalid' ? '#d97706' : r.isForeign ? '#2563eb' : 'transparent'}` }}>
                      {canWrite && <input type="checkbox" className="mr-2 align-middle accent-[var(--teal)]" checked={picked.has(r.key)} onClick={e => e.stopPropagation()} onChange={() => togglePick(r.key)} title="Tick to merge" />}
                      {r.name}{!r.isActive && <span className="ml-1.5 px-1.5 py-px rounded text-[10px] font-semibold" style={{ background: '#f1f5f2', color: '#55616A' }}>Inactive</span>}
                    </td>
                    <td className={`${td} font-mono whitespace-nowrap group-hover:bg-[#fafbf7]`} style={{ ...line, color: 'var(--mid-gray)' }}>{r.tin || '—'}</td>
                    <td className={`${td} group-hover:bg-[#fafbf7]`} style={line}>
                      {r.branches.length
                        ? <span className="flex flex-wrap gap-1">{r.branches.map(b => <span key={b} className="px-1.5 py-px rounded text-[10.5px] font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>{b}</span>)}</span>
                        : <span style={{ color: 'var(--hr-faint)' }}>—</span>}
                    </td>
                    <td className={`${td} group-hover:bg-[#fafbf7]`} style={{ ...line, color: 'var(--mid-gray)' }}>{r.address || '—'}</td>
                    <td className={`${td} group-hover:bg-[#fafbf7]`} style={{ ...line, color: 'var(--charcoal)' }}>{r.contactPerson || '—'}</td>
                    <td className={`${td} whitespace-nowrap group-hover:bg-[#fafbf7]`} style={{ ...line, color: 'var(--charcoal)' }}>{r.contactNumber || '—'}</td>
                    <td className={`${td} break-all group-hover:bg-[#fafbf7]`} style={{ ...line, color: 'var(--charcoal)' }}>{r.email || '—'}</td>
                    <td className={`${td} group-hover:bg-[#fafbf7]`} style={line}>
                      {r.contactMethod ? <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>{reachOf(r)}</span> : <span style={{ color: 'var(--hr-faint)' }}>—</span>}
                    </td>
                    <td className={`${td} group-hover:bg-[#fafbf7]`} style={line}>
                      {r.isForeign ? <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#eff6ff', color: '#1d4ed8' }}>Foreign</span> : <span style={{ color: 'var(--mid-gray)' }}>Local</span>}
                    </td>
                    <td className={`${td} group-hover:bg-[#fafbf7]`} style={{ ...line, color: 'var(--mid-gray)' }}>{r.currency || 'PHP'}</td>
                    <td className={`${td} group-hover:bg-[#fafbf7]`} style={line}>
                      {r.itemsProvided && <div style={{ color: 'var(--charcoal)' }}>{r.itemsProvided}</div>}
                      {auto && <div className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{auto}</div>}
                      {!r.itemsProvided && !auto && <span style={{ color: 'var(--hr-faint)' }}>—</span>}
                    </td>
                    <td className={`${td} group-hover:bg-[#fafbf7]`} style={line}>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={r.validity === 'Invalid' ? { background: '#fef3c7', color: '#92400e' } : { background: '#dcfce7', color: '#166534' }}>{r.validity}</span>
                    </td>
                    <td className="border-b px-2 py-2 text-right whitespace-nowrap align-top group-hover:bg-[#fafbf7]" onClick={e => e.stopPropagation()} style={line}>
                      {canWrite && (r.isActive ? (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(r)} title="Edit supplier" className="p-1.5 rounded-lg hover:bg-[var(--pale-teal)]"><Pencil size={13} style={{ color: 'var(--teal)' }} /></button>
                          {(r.masterId || r.expenseIds.length > 0) && (
                            <button onClick={() => remove(r)} title="Take off the list" className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={13} style={{ color: '#dc2626' }} /></button>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => reactivate(r)} className="px-2 py-1 rounded-lg text-[11px] font-semibold border bg-white" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>Restore</button>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {!loading && shown.length === 0 && (
          <div className="sticky left-0 px-6 py-14 flex flex-col items-center text-center">
            <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>No suppliers match</p>
            <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>Nothing fits the search and filters{branchLabel ? ` for ${branchLabel}` : ''}.</p>
            {anyFilter && <button onClick={clearFilters} className={`${outlineBtn} mt-4`} style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>Clear filters</button>}
          </div>
        )}
        </div>

        {/* Export (the suppliers shown) */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t text-xs" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
          <span>Export the {shown.length.toLocaleString()} supplier{shown.length === 1 ? '' : 's'} shown</span>
          <span className="ml-auto" />
          <button onClick={() => exportList('xlsx')} className={ghostBtn} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            <Download size={14} style={{ color: '#166534' }} /> Excel
          </button>
          <button onClick={() => exportList('pdf')} className={ghostBtn} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            <Download size={14} style={{ color: '#b91c1c' }} /> PDF
          </button>
        </div>
      </section>

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
