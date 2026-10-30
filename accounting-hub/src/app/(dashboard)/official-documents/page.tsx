'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { FolderLock, Plus, Search, Pencil, Trash2, X, Loader2, FileText, Download, Check } from 'lucide-react'
import { ScanUpload } from '@/components/ScanUpload'

interface OfficialDocument {
  id: string
  category: string
  title: string
  branch: string | null
  referenceNo: string | null
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
function expiryBadge(iso: string | null) {
  if (!iso) return null
  const days = Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(new Date().toISOString().slice(0, 10))) / 86_400_000)
  if (days < 0) return { text: `Expired ${-days} day${days === -1 ? '' : 's'} ago`, style: { background: '#fee2e2', color: '#b91c1c' } }
  if (days <= 30) return { text: days === 0 ? 'Expires today' : `Expires in ${days} day${days === 1 ? '' : 's'}`, style: { background: '#fef3c7', color: '#92400e' } }
  return { text: `Valid until ${iso.slice(0, 10)}`, style: { background: '#dcfce7', color: '#166534' } }
}

const EMPTY = { id: '', category: 'BUSINESS', title: '', branch: '', referenceNo: '', issuedDate: '', expiryDate: '', notes: '', fileUrls: [] as string[] }
type Form = typeof EMPTY

export default function OfficialDocumentsPage() {
  const { data: session } = useSession()
  const role = ((session?.user as { role?: string })?.role) || ''
  const canWrite = WRITE_ROLES.includes(role)
  const canDelete = DELETE_ROLES.includes(role)
  const [docs, setDocs] = useState<OfficialDocument[] | null>(null)
  const [tab, setTab] = useState('ALL')
  const [search, setSearch] = useState('')
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

  const counts = useMemo(() => {
    const m: Record<string, number> = { ALL: (docs || []).length }
    for (const d of docs || []) m[d.category] = (m[d.category] || 0) + 1
    return m
  }, [docs])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (docs || []).filter(d => (tab === 'ALL' || d.category === tab)
      && (!q || `${d.title} ${d.referenceNo || ''} ${d.notes || ''} ${BRANCH_LABEL[d.branch || ''] || ''}`.toLowerCase().includes(q)))
  }, [docs, tab, search])

  const save = async () => {
    if (!form || !form.title.trim()) { setError('Title is required'); return }
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/official-documents', {
        method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      if (!r.ok) { setError((await r.json()).error || 'Could not save'); return }
      setForm(null); load()
    } finally { setSaving(false) }
  }
  const remove = async (d: OfficialDocument) => {
    if (!confirm(`Delete "${d.title}"? The uploaded files stay on the server but are no longer listed.`)) return
    await fetch(`/api/official-documents?id=${encodeURIComponent(d.id)}`, { method: 'DELETE' })
    load()
  }

  const input = 'w-full px-3 py-2 rounded-xl border text-sm'
  const uploadPrefix = form ? `DOC-${form.category}-${(form.title || 'document').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)}` : 'DOC'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <FolderLock size={22} style={{ color: 'var(--teal)' }} /> Official Documents
        </h1>
        {canWrite && !form && (
          <button onClick={() => { setForm({ ...EMPTY, category: tab !== 'ALL' ? tab : 'BUSINESS' }); setError('') }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold" style={{ background: 'var(--teal)' }}>
            <Plus size={15} /> Add document
          </button>
        )}
      </div>
      <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
        The company&apos;s business, SEC, BIR and benefit-agency documents. Documents with an expiry date show in the bell 30 days before they lapse.
      </p>

      {/* Category tabs */}
      <div className="flex rounded-xl overflow-hidden border flex-wrap w-fit" style={{ borderColor: 'var(--light-gray)' }}>
        {[{ key: 'ALL', label: 'All' }, ...CATEGORIES].map(c => (
          <button key={c.key} onClick={() => setTab(c.key)} className="px-4 py-2 text-xs font-semibold transition-colors"
            style={tab === c.key ? { background: 'var(--deep-teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
            {c.label}{counts[c.key] ? ` (${counts[c.key]})` : ''}
          </button>
        ))}
      </div>

      {form && (
        <div className="rounded-2xl border bg-white p-5 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ borderColor: 'var(--light-gray)' }}>
          <h2 className="text-base font-bold sm:col-span-2" style={{ color: 'var(--charcoal)' }}>{form.id ? 'Edit document' : 'Add document'}</h2>
          <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Category
            <select className={input} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <span className="block mt-1 text-[11px]">{CATEGORIES.find(c => c.key === form.category)?.hint}</span>
          </label>
          <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Branch
            <select className={input} value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })}>
              {BRANCHES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          </label>
          <label className="text-xs sm:col-span-2" style={{ color: 'var(--mid-gray)' }}>Title
            <input className={input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. SEC Certificate of Incorporation" />
          </label>
          <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Reference / registration no.
            <input className={input} value={form.referenceNo} onChange={e => setForm({ ...form, referenceNo: e.target.value })} placeholder="e.g. 2024040147438-01" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Issued
              <input type="date" className={input} value={form.issuedDate} onChange={e => setForm({ ...form, issuedDate: e.target.value })} />
            </label>
            <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Expires (if any)
              <input type="date" className={input} value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
            </label>
          </div>
          <label className="text-xs sm:col-span-2" style={{ color: 'var(--mid-gray)' }}>Notes
            <input className={input} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Where the original is kept, who signed, etc." />
          </label>
          <div className="sm:col-span-2 space-y-1.5">
            <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Files ({form.fileUrls.length})</p>
            {form.fileUrls.map(url => (
              <div key={url} className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs" style={{ borderColor: 'var(--teal)', background: '#f0fdfa' }}>
                <FileText size={12} style={{ color: 'var(--teal)', flexShrink: 0 }} />
                <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate underline" style={{ color: 'var(--teal)' }}>{fileName(url)}</a>
                <button type="button" onClick={() => setForm({ ...form, fileUrls: form.fileUrls.filter(u => u !== url) })} className="p-0.5 rounded hover:bg-red-50" title="Remove">
                  <X size={12} style={{ color: '#dc2626' }} />
                </button>
              </div>
            ))}
            <ScanUpload section="official-documents" prefix={uploadPrefix} existingCount={form.fileUrls.length}
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" label={form.fileUrls.length ? 'Add another file' : 'Upload file'}
              onUploaded={url => setForm(f => (f ? { ...f, fileUrls: [...f.fileUrls, url] } : f))} />
            <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>PDF, image, Word or Excel — up to 10 MB per file.</p>
          </div>
          {error && <p className="text-xs text-red-600 sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--teal)' }}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
            </button>
            <button onClick={() => { setForm(null); setError('') }} className="px-4 py-2 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="p-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--light-gray)' }}>
          <Search size={15} style={{ color: 'var(--mid-gray)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, reference no., notes, branch…" className="flex-1 text-sm outline-none" />
        </div>
        {docs === null ? (
          <p className="p-6 text-xs flex items-center gap-2" style={{ color: 'var(--mid-gray)' }}><Loader2 size={13} className="animate-spin" /> Loading…</p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-xs text-center" style={{ color: 'var(--mid-gray)' }}>
            {docs.length ? 'No documents match.' : canWrite ? 'No documents yet — use "Add document" to upload the first one.' : 'No documents yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                  {['Document', 'Category', 'Branch', 'Issued', 'Validity', 'Files', 'Uploaded', ''].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(d => {
                  const badge = expiryBadge(d.expiryDate)
                  return (
                    <tr key={d.id} className="border-b align-top" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{d.title}</p>
                        {d.referenceNo && <p className="text-[11px] font-mono" style={{ color: 'var(--mid-gray)' }}>{d.referenceNo}</p>}
                        {d.notes && <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{d.notes}</p>}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{CATEGORY_LABEL[d.category] || d.category}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{BRANCH_LABEL[d.branch || ''] || d.branch}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{ymd(d.issuedDate) || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {badge ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={badge.style}>{badge.text}</span> : <span style={{ color: 'var(--mid-gray)' }}>No expiry</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="space-y-1">
                          {(d.fileUrls || []).map(url => (
                            <div key={url} className="flex items-center gap-1.5">
                              <a href={url} target="_blank" rel="noopener noreferrer" className="underline truncate max-w-[14rem]" style={{ color: 'var(--teal)' }}>{fileName(url)}</a>
                              <a href={url} download title="Download"><Download size={12} style={{ color: 'var(--teal)' }} /></a>
                            </div>
                          ))}
                          {!(d.fileUrls || []).length && <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{ymd(d.createdAt)}{d.uploadedByName ? ` · ${d.uploadedByName}` : ''}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          {canWrite && (
                            <button title="Edit" className="p-1.5 rounded-lg hover:bg-gray-100"
                              onClick={() => { setForm({ id: d.id, category: d.category, title: d.title, branch: d.branch || '', referenceNo: d.referenceNo || '', issuedDate: ymd(d.issuedDate), expiryDate: ymd(d.expiryDate), notes: d.notes || '', fileUrls: d.fileUrls || [] }); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                              <Pencil size={13} style={{ color: 'var(--mid-gray)' }} />
                            </button>
                          )}
                          {canDelete && (
                            <button title="Delete" onClick={() => remove(d)} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={13} className="text-red-500" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
