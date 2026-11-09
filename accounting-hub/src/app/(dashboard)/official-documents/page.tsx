'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { FolderLock, Plus, Search, Pencil, Trash2, X, Loader2, FileText, Download, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { ScanUpload } from '@/components/ScanUpload'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'
import { docYear, NO_YEAR } from '@/lib/official-documents'

interface OfficialDocument {
  id: string
  category: string
  title: string
  branch: string | null
  referenceNo: string | null
  year: number | null
  issuedDate: string | null
  expiryDate: string | null
  fileUrls: string[]
  notes: string | null
  uploadedByName: string | null
  createdAt: string
  updatedAt: string
}

const CATEGORIES: { key: string; label: string; hint: string }[] = [
  { key: 'BUSINESS', label: 'Business', hint: "Mayor's/business permits, barangay clearance, DOH license, fire safety, leases" },
  { key: 'SEC', label: 'SEC', hint: 'Certificate of incorporation, AOI & by-laws, GIS, AFS, amendments' },
  { key: 'BIR', label: 'BIR', hint: 'COR (2303), ATP / invoice registration, books, filed returns' },
  { key: 'BENEFITS', label: 'SSS · PhilHealth · Pag-IBIG', hint: 'Employer registrations and certificates' },
  { key: 'OTHER', label: 'Other', hint: 'Anything else official' },
]
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.key, c.label]))
const BRANCHES: { key: string; label: string }[] = [
  { key: '', label: 'Company-wide' },
  { key: 'SANDBOX_EAST', label: 'AHEA (East)' },
  { key: 'SANDBOX_GREENHILLS', label: 'AHGH (Greenhills)' },
  { key: 'VERDANA_STORE', label: 'Verdana' },
  { key: 'AURA_INSTITUTE', label: 'AHI' },
]
const BRANCH_LABEL = Object.fromEntries(BRANCHES.map(b => [b.key, b.label]))
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const DELETE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

const ymd = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
const fileName = (url: string) => decodeURIComponent(url.split('/').pop() || url)
// One rule for the Validity pill, the row edge and the cards: past the date →
// expired; within 30 days → expiring; later → valid; no date → no expiry.
type ExpiryState = 'expired' | 'expiring' | 'valid' | 'none'
const EXPIRY_TONE: Record<ExpiryState, { line: string; bg: string; fg: string }> = {
  expired:  { line: '#dc2626', bg: '#fee2e2', fg: '#991b1b' },
  expiring: { line: '#d97706', bg: '#fef3c7', fg: '#92400e' },
  valid:    { line: '#059669', bg: '#dcfce7', fg: '#166534' },
  none:     { line: '#DDE6CC', bg: '#f1f5f2', fg: '#55616A' },
}
function daysLeft(iso: string) {
  return Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(new Date().toISOString().slice(0, 10))) / 86_400_000)
}
function expiryState(iso: string | null): ExpiryState {
  if (!iso) return 'none'
  const days = daysLeft(iso)
  return days < 0 ? 'expired' : days <= 30 ? 'expiring' : 'valid'
}
function expiryBadge(iso: string | null) {
  if (!iso) return null
  const days = daysLeft(iso)
  if (days < 0) return { text: `Expired ${-days} day${days === -1 ? '' : 's'} ago`, style: { background: EXPIRY_TONE.expired.bg, color: EXPIRY_TONE.expired.fg } }
  if (days <= 30) return { text: days === 0 ? 'Expires today' : `Expires in ${days} day${days === 1 ? '' : 's'}`, style: { background: EXPIRY_TONE.expiring.bg, color: EXPIRY_TONE.expiring.fg } }
  return { text: `Valid until ${iso.slice(0, 10)}`, style: { background: EXPIRY_TONE.valid.bg, color: EXPIRY_TONE.valid.fg } }
}
const TH = 'text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap'

const EMPTY = { id: '', category: 'BUSINESS', title: '', branch: '', referenceNo: '', year: String(new Date().getFullYear()), issuedDate: '', expiryDate: '', notes: '', fileUrls: [] as string[] }
type Form = typeof EMPTY

export default function OfficialDocumentsPage() {
  const { data: session } = useSession()
  const role = ((session?.user as { role?: string })?.role) || ''
  const canWrite = WRITE_ROLES.includes(role)
  const canDelete = DELETE_ROLES.includes(role)
  const [docs, setDocs] = useState<OfficialDocument[] | null>(null)
  const [tab, setTab] = useState('ALL')
  const [search, setSearch] = useState('')
  // Branch filter (Hannah, 2026-11-03). Company-wide papers (SEC, BIR COR…) cover
  // every branch, so they stay listed under a branch unless unticked.
  const [branchFilter, setBranchFilter] = useState('ALL')
  const [withCompanyWide, setWithCompanyWide] = useState(true)
  // Quick filter from the cards (display only).
  const [expiryFilter, setExpiryFilter] = useState<ExpiryState | ''>('')
  const [openYears, setOpenYears] = useState<string[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    fetch('/api/official-documents')
      .then(r => (r.ok ? r.json() : { documents: [] }))
      .then(d => setDocs(d.documents || []))
      .catch(() => setDocs([]))
  }, [])
  useEffect(() => { load() }, [load])

  const inBranch = useCallback((d: OfficialDocument) => branchFilter === 'ALL' || (d.branch || '') === branchFilter
    || (withCompanyWide && branchFilter !== '' && !d.branch), [branchFilter, withCompanyWide])
  const branchCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const d of docs || []) m[d.branch || ''] = (m[d.branch || ''] || 0) + 1
    return m
  }, [docs])
  const counts = useMemo(() => {
    const list = (docs || []).filter(inBranch)
    const m: Record<string, number> = { ALL: list.length }
    for (const d of list) m[d.category] = (m[d.category] || 0) + 1
    return m
  }, [docs, inBranch])
  // Card counts: the documents in this branch view and category tab, by validity.
  const byExpiry = useMemo(() => {
    const m: Record<ExpiryState, number> = { expired: 0, expiring: 0, valid: 0, none: 0 }
    for (const d of docs || []) if (inBranch(d) && (tab === 'ALL' || d.category === tab)) m[expiryState(d.expiryDate)]++
    return m
  }, [docs, tab, inBranch])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (docs || []).filter(d => inBranch(d) && (tab === 'ALL' || d.category === tab)
      && (!expiryFilter || expiryState(d.expiryDate) === expiryFilter)
      && (!q || `${d.title} ${d.referenceNo || ''} ${d.notes || ''} ${BRANCH_LABEL[d.branch || ''] || ''}`.toLowerCase().includes(q)))
  }, [docs, tab, search, inBranch, expiryFilter])
  const businessYears = useMemo(() => {
    const m = new Map<string, OfficialDocument[]>()
    for (const d of shown) if (d.category === 'BUSINESS') m.set(docYear(d), [...(m.get(docYear(d)) || []), d])
    return [...m.entries()].sort(([a], [b]) => (a === NO_YEAR ? 1 : b === NO_YEAR ? -1 : b.localeCompare(a)))
  }, [shown])

  const save = async () => {
    if (!form || !form.title.trim()) { setError('Title is required'); return }
    const isBusiness = form.category === 'BUSINESS'
    if (isBusiness && !/^20\d{2}$/.test(form.year)) { setError('Enter the year this document belongs to, e.g. 2026'); return }
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/official-documents', {
        method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      if (!r.ok) { setError((await r.json()).error || 'Could not save'); return }
      // Open its year, so a document moved to another year is still in view.
      if (isBusiness) setOpenYears(y => (y.includes(form.year) ? y : [...y, form.year]))
      setForm(null); load()
    } finally { setSaving(false) }
  }
  const remove = async (d: OfficialDocument) => {
    if (!confirm(`Delete "${d.title}"? The uploaded files stay on the server but are no longer listed.`)) return
    await fetch(`/api/official-documents?id=${encodeURIComponent(d.id)}`, { method: 'DELETE' })
    load()
  }

  const input = 'mt-1 w-full h-9 px-3 rounded-lg border text-sm bg-white focus:outline-none focus:border-[var(--teal)]'
  const uploadPrefix = form ? `DOC-${form.category}-${(form.title || 'document').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)}` : 'DOC'

  const docRow = (d: OfficialDocument) => {
    const badge = expiryBadge(d.expiryDate)
    const tone = EXPIRY_TONE[expiryState(d.expiryDate)]
    return (
      <tr key={d.id} className="border-t align-top transition-colors hover:bg-[#fafcf6]" style={{ borderColor: 'var(--hr-line)' }}>
        <td className="px-3 py-2.5" style={{ boxShadow: `inset 4px 0 0 ${tone.line}` }}>
          <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{d.title}</p>
          {d.referenceNo && <p className="text-[11px] font-mono" style={{ color: 'var(--mid-gray)' }}>{d.referenceNo}</p>}
          {d.notes && <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{d.notes}</p>}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{CATEGORY_LABEL[d.category] || d.category}</td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={d.branch ? { background: '#EDF3D9', color: '#3C6A5F' } : { background: '#f1f5f2', color: '#55616A' }}>{BRANCH_LABEL[d.branch || ''] || d.branch}</span>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap font-mono" style={{ color: 'var(--mid-gray)' }}>{ymd(d.issuedDate) || '—'}</td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          {badge ? <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={badge.style}>{badge.text}</span> : <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: EXPIRY_TONE.none.bg, color: EXPIRY_TONE.none.fg }}>No expiry</span>}
        </td>
        <td className="px-3 py-2.5">
          <div className="space-y-1">
            {(d.fileUrls || []).map(url => (
              <div key={url} className="flex items-center gap-1.5">
                <FileText size={12} className="flex-none" style={{ color: 'var(--teal)' }} />
                <a href={url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline truncate max-w-[14rem]" style={{ color: 'var(--teal)' }}>{fileName(url)}</a>
                <a href={url} download title="Download" aria-label={`Download ${fileName(url)}`} className="p-0.5 rounded hover:bg-[var(--pale-teal)]"><Download size={12} style={{ color: 'var(--teal)' }} /></a>
              </div>
            ))}
            {!(d.fileUrls || []).length && <span style={{ color: 'var(--hr-faint)' }}>—</span>}
          </div>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}><span className="font-mono">{ymd(d.createdAt)}</span>{d.uploadedByName ? ` · ${d.uploadedByName}` : ''}</td>
        <td className="px-3 py-2.5">
          <div className="flex gap-1 justify-end">
            {canWrite && (
              <button title="Edit" aria-label={`Edit ${d.title}`} className="p-1.5 rounded-lg hover:bg-[var(--pale-teal)]"
                onClick={() => { const year = docYear(d); setForm({ id: d.id, category: d.category, title: d.title, branch: d.branch || '', referenceNo: d.referenceNo || '', year: year === NO_YEAR ? '' : year, issuedDate: ymd(d.issuedDate), expiryDate: ymd(d.expiryDate), notes: d.notes || '', fileUrls: d.fileUrls || [] }); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                <Pencil size={13} style={{ color: 'var(--teal)' }} />
              </button>
            )}
            {canDelete && (
              <button title="Delete" aria-label={`Delete ${d.title}`} onClick={() => remove(d)} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={13} className="text-red-500" /></button>
            )}
          </div>
        </td>
      </tr>
    )
  }

  const branchPills = [{ key: 'ALL', label: 'All branches', n: (docs || []).length }, ...BRANCHES.map(b => ({ key: b.key, label: b.label, n: branchCounts[b.key] || 0 }))]
  const viewTotal = byExpiry.expired + byExpiry.expiring + byExpiry.valid + byExpiry.none
  const toggleExpiry = (k: ExpiryState) => setExpiryFilter(f => (f === k ? '' : k))

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <FolderLock size={22} style={{ color: 'var(--teal)' }} /> Official Documents
          </h1>
          <p className="mt-1 text-[13px] max-w-3xl" style={{ color: 'var(--mid-gray)' }}>
            The company&apos;s business, SEC, BIR and benefit-agency documents. Documents with an expiry date show in the bell 30 days before they lapse, until a later year of the same document is filed.
          </p>
        </div>
        {canWrite && !form && (
          <button onClick={() => { setForm({ ...EMPTY, category: tab !== 'ALL' ? tab : 'BUSINESS' }); setError('') }}
            className={hrBtn.primary} style={{ background: 'var(--teal)' }}>
            <Plus size={15} /> Add document
          </button>
        )}
      </div>

      {/* Validity cards (this branch view and category) — click to show only those */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard loading={docs === null} label="Documents" value={viewTotal.toLocaleString('en-PH')}
          sub={`${byExpiry.none} with no expiry date`} tone="zero" accent={viewTotal ? { line: '#4A8073' } : undefined} />
        <StatCard loading={docs === null} label="Valid" value={byExpiry.valid.toLocaleString('en-PH')}
          sub="Expiry more than 30 days away" tone={byExpiry.valid ? 'green' : 'zero'}
          active={expiryFilter === 'valid'} onClick={() => toggleExpiry('valid')} />
        <StatCard loading={docs === null} label="Expiring within 30 days" value={byExpiry.expiring.toLocaleString('en-PH')}
          sub="Renew before they lapse" tone={byExpiry.expiring ? 'amber' : 'zero'}
          active={expiryFilter === 'expiring'} onClick={() => toggleExpiry('expiring')} />
        <StatCard loading={docs === null} label="Expired" value={byExpiry.expired.toLocaleString('en-PH')}
          sub="Past the expiry date on file" tone={byExpiry.expired ? 'red' : 'zero'}
          active={expiryFilter === 'expired'} onClick={() => toggleExpiry('expired')} />
      </div>

      {/* Category tabs */}
      <div className="border-b-2" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex items-end gap-1 -mb-[2px] max-w-full overflow-x-auto" role="tablist" aria-label="Document categories">
          {[{ key: 'ALL', label: 'All' }, ...CATEGORIES].map(c => (
            <button key={c.key} onClick={() => setTab(c.key)} role="tab" aria-selected={tab === c.key}
              className="px-4 py-2.5 text-[13px] font-semibold border-b-2 whitespace-nowrap transition-colors hover:text-[var(--teal)] flex items-center gap-1.5"
              style={{ fontFamily: 'var(--font-display)', borderColor: tab === c.key ? 'var(--teal)' : 'transparent', color: tab === c.key ? 'var(--teal)' : 'var(--mid-gray)' }}>
              {c.label}
              {!!counts[c.key] && <span className="px-1.5 rounded-full text-[11px] font-bold" style={{ background: tab === c.key ? 'var(--pale-teal)' : '#f1f5f2', color: tab === c.key ? 'var(--deep-teal)' : 'var(--mid-gray)' }}>{counts[c.key]}</span>}
            </button>
          ))}
        </div>
      </div>

      {form && (
        <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)', boxShadow: 'inset 4px 0 0 var(--teal)' }}>
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--light-gray)', background: '#fcfdfa' }}>
            <h2 className="text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{form.id ? 'Edit document' : 'Add document'}</h2>
            <button onClick={() => { setForm(null); setError('') }} aria-label="Close" className="p-1 rounded-md hover:bg-[var(--pale-teal)]"><X size={16} style={{ color: 'var(--mid-gray)' }} /></button>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Category
            <select className={`${input} normal-case tracking-normal font-normal`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <span className="block mt-1 text-[11px] font-normal normal-case tracking-normal">{CATEGORIES.find(c => c.key === form.category)?.hint}</span>
          </label>
          <div className={form.category === 'BUSINESS' ? 'grid grid-cols-2 gap-3' : ''}>
            <label className="text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Branch
              <select className={`${input} normal-case tracking-normal font-normal`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })}>
                {BRANCHES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </label>
            {form.category === 'BUSINESS' && (
              <label className="text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Year
                <input type="number" min={2000} max={2100} className={`${input} font-mono normal-case tracking-normal font-normal`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} />
                <span className="block mt-1 text-[11px] font-normal normal-case tracking-normal">The year it is listed under. Change it to move the document.</span>
              </label>
            )}
          </div>
          <label className="text-[11px] font-bold uppercase tracking-[.4px] sm:col-span-2" style={{ color: 'var(--mid-gray)' }}>Title
            <input className={`${input} normal-case tracking-normal font-normal`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. SEC Certificate of Incorporation" />
          </label>
          <label className="text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Reference / registration no.
            <input className={`${input} font-mono normal-case tracking-normal font-normal`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} value={form.referenceNo} onChange={e => setForm({ ...form, referenceNo: e.target.value })} placeholder="e.g. 2024040147438-01" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Issued
              <input type="date" className={`${input} normal-case tracking-normal font-normal`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} value={form.issuedDate} onChange={e => setForm({ ...form, issuedDate: e.target.value })} />
            </label>
            <label className="text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Expires (if any)
              <input type="date" className={`${input} normal-case tracking-normal font-normal`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
            </label>
          </div>
          <label className="text-[11px] font-bold uppercase tracking-[.4px] sm:col-span-2" style={{ color: 'var(--mid-gray)' }}>Notes
            <input className={`${input} normal-case tracking-normal font-normal`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Where the original is kept, who signed, etc." />
          </label>
          <div className="sm:col-span-2 space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Files ({form.fileUrls.length})</p>
            {form.fileUrls.map(url => (
              <div key={url} className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)', background: '#fcfdfa', boxShadow: 'inset 3px 0 0 var(--teal)' }}>
                <FileText size={12} style={{ color: 'var(--teal)', flexShrink: 0 }} />
                <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate underline-offset-2 hover:underline" style={{ color: 'var(--teal)' }}>{fileName(url)}</a>
                <button type="button" onClick={() => setForm({ ...form, fileUrls: form.fileUrls.filter(u => u !== url) })} className="p-0.5 rounded hover:bg-red-50" title="Remove" aria-label={`Remove ${fileName(url)}`}>
                  <X size={12} style={{ color: '#dc2626' }} />
                </button>
              </div>
            ))}
            <ScanUpload section="official-documents" prefix={uploadPrefix} existingCount={form.fileUrls.length}
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" label={form.fileUrls.length ? 'Add another file' : 'Upload file'}
              onUploaded={url => setForm(f => (f ? { ...f, fileUrls: [...f.fileUrls, url] } : f))} />
            <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>PDF, image, Word or Excel — up to 30 MB per file.</p>
          </div>
          {error && <div className="sm:col-span-2 px-3 py-2 rounded-lg border text-xs" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>{error}</div>}
          </div>
          <div className="flex flex-wrap gap-2 px-5 py-3 border-t" style={{ borderColor: 'var(--light-gray)', background: '#fcfdfa' }}>
            <button onClick={save} disabled={saving} className={hrBtn.primary} style={{ background: 'var(--teal)' }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
            </button>
            <button onClick={() => { setForm(null); setError('') }} className={hrBtn.outline} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--hr-faint)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, reference no., notes, branch…" aria-label="Search documents"
              className="w-full h-8 pl-8 pr-3 rounded-lg border text-xs bg-white focus:outline-none focus:border-[var(--teal)]" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          {expiryFilter && (
            <button onClick={() => setExpiryFilter('')} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold"
              style={{ background: EXPIRY_TONE[expiryFilter].bg, color: EXPIRY_TONE[expiryFilter].fg }}>
              {expiryFilter === 'expiring' ? 'Expiring within 30 days' : expiryFilter === 'valid' ? 'Valid' : expiryFilter === 'expired' ? 'Expired' : 'No expiry date'} <X size={12} />
            </button>
          )}
          {docs !== null && <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{shown.length} shown</span>}
        </div>
        {/* Branch filter (company-wide papers stay listed under a branch unless unticked) */}
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b" style={{ borderColor: 'var(--light-gray)' }}>
          {branchPills.map(b => (
            <button key={b.key || 'company'} onClick={() => setBranchFilter(b.key)} aria-pressed={branchFilter === b.key}
              className="px-3 py-1 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors"
              style={branchFilter === b.key
                ? { background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff' }
                : { background: '#fff', borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
              {b.label} <span className="font-mono opacity-80">{b.n}</span>
            </button>
          ))}
          {branchFilter !== 'ALL' && branchFilter !== '' && (
            <label className="ml-1 flex items-center gap-1.5 text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
              <input type="checkbox" checked={withCompanyWide} onChange={e => setWithCompanyWide(e.target.checked)} /> Include company-wide
            </label>
          )}
        </div>
        {docs === null ? (
          <div className="p-4 space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-6 rounded hr-shimmer" />)}</div>
        ) : shown.length === 0 ? (
          <p className="px-6 py-12 text-[13px] text-center" style={{ color: 'var(--mid-gray)' }}>
            {docs.length ? 'No documents match.' : canWrite ? <>No documents yet. Use <strong>Add document</strong> to upload the first one.</> : 'No documents yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto relative">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--hr-head)', color: 'var(--mid-gray)' }}>
                  {['Document', 'Category', 'Branch', 'Issued', 'Validity', 'Files', 'Uploaded', ''].map((h, i) => (
                    <th key={h || i} className={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {businessYears.map(([year, rows]) => {
                  // A search shows its matches without needing a click.
                  const open = !!search.trim() || openYears.includes(year)
                  return (
                    <Fragment key={year}>
                      <tr className="border-t" style={{ borderColor: 'var(--hr-line)', background: '#fcfdfa' }}>
                        <td colSpan={8} className="p-0">
                          <button type="button" aria-expanded={open}
                            onClick={() => setOpenYears(y => (y.includes(year) ? y.filter(v => v !== year) : [...y, year]))}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-left font-bold transition-colors hover:bg-[var(--pale-teal)]" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                            {open ? <ChevronDown size={15} style={{ color: 'var(--teal)' }} /> : <ChevronRight size={15} style={{ color: 'var(--teal)' }} />}
                            {tab === 'ALL' ? <>Business <span className="font-mono">{year}</span></> : <span className="font-mono">{year}</span>}
                            <span className="px-1.5 rounded-full text-[11px] font-bold" style={{ background: '#f1f5f2', color: 'var(--mid-gray)', fontFamily: 'var(--font-body)' }}>{rows.length} document{rows.length === 1 ? '' : 's'}</span>
                          </button>
                        </td>
                      </tr>
                      {open && rows.map(docRow)}
                    </Fragment>
                  )
                })}
                {shown.filter(d => d.category !== 'BUSINESS').map(docRow)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
