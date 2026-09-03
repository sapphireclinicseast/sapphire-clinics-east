'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import {
  X, Upload, Download, Search, Plus, Trash2, Pencil, AlertCircle, FileText,
  Maximize2, Minimize2, ChevronDown, ChevronRight,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface ARWallet { id: string; patientName: string }

interface SubmissionOrder {
  id: string
  orderNumber: number
  transactionDate: string
  arCustomDate?: string | null
  patientName: string | null
  clinicianName?: string | null
  items: { name: string }[]
  payments: { amount: number | string }[]
}

interface Submission {
  id: string
  referenceNo?: string | null
  walletId: string
  submittedDate: string
  transmittalUrls: unknown
  documentUrls: unknown
  notes?: string | null
  createdAt: string
  createdBy: { name: string }
  wallet: { patientName: string }
  items: { orderId: string; order: SubmissionOrder }[]
}

// Sessions offered for tagging, fetched per provider.
interface TagOrder {
  id: string
  transactionDate: string
  arCustomDate?: string | null
  patientName: string | null
  clinicianName?: string | null
  items: { name: string }[]
  payments: { amount: number | string; walletId?: string | null }[]
  arPaymentItems: { paymentId: string }[]
}

const toNum = (v: unknown) => Number(v) || 0
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
const urlList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export default function SubmittedForSoa({ wallets, canWrite }: { wallets: ARWallet[]; canWrite: boolean }) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [listWallet, setListWallet] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // ── Form state ──
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formExpanded, setFormExpanded] = useState(false)
  const [fWallet, setFWallet] = useState('')
  const [fDate, setFDate] = useState(new Date().toISOString().split('T')[0])
  const [fNotes, setFNotes] = useState('')
  const [fTransmittal, setFTransmittal] = useState<string[]>([])
  const [fDocuments, setFDocuments] = useState<string[]>([])
  const [uploading, setUploading] = useState<'transmittal' | 'documents' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Tagging: the selected set is keyed by order id and survives every filter
  // change, so narrowing the list can never silently drop a ticked session.
  const [selected, setSelected] = useState<string[]>([])
  const [tagOrders, setTagOrders] = useState<TagOrder[]>([])
  const [tagLoading, setTagLoading] = useState(false)
  const [tagSearch, setTagSearch] = useState('')
  const [tagFrom, setTagFrom] = useState('')
  const [tagTo, setTagTo] = useState('')

  const fetchSubmissions = useCallback(async () => {
    setLoading(true)
    try {
      const qs = listWallet ? `?walletId=${listWallet}` : ''
      const res = await fetch(`/api/accounts-receivable/soa-submissions${qs}`)
      const data = await res.json()
      setSubmissions(data.submissions || [])
    } catch { setSubmissions([]) }
    finally { setLoading(false) }
  }, [listWallet])

  useEffect(() => { fetchSubmissions() }, [fetchSubmissions])

  // Sessions for the chosen provider only. Refetched when the provider changes;
  // the filters below are applied in the browser so ticks are never lost to a
  // network round-trip.
  useEffect(() => {
    if (!fWallet) { setTagOrders([]); return }
    let cancelled = false
    setTagLoading(true)
    fetch(`/api/accounts-receivable?type=HMO&walletId=${fWallet}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setTagOrders(d.orders || []) })
      .catch(() => { if (!cancelled) setTagOrders([]) })
      .finally(() => { if (!cancelled) setTagLoading(false) })
    return () => { cancelled = true }
  }, [fWallet])

  const resetForm = () => {
    setEditingId(null); setFWallet(''); setFDate(new Date().toISOString().split('T')[0])
    setFNotes(''); setFTransmittal([]); setFDocuments([]); setSelected([])
    setTagSearch(''); setTagFrom(''); setTagTo(''); setError(''); setFormExpanded(false)
  }

  const openNew = () => { resetForm(); setShowForm(true) }

  const openEdit = (s: Submission) => {
    resetForm()
    setEditingId(s.id)
    setFWallet(s.walletId)
    setFDate(new Date(s.submittedDate).toISOString().split('T')[0])
    setFNotes(s.notes || '')
    setFTransmittal(urlList(s.transmittalUrls))
    setFDocuments(urlList(s.documentUrls))
    setSelected(s.items.map(i => i.orderId))
    setShowForm(true)
  }

  const upload = async (file: File, target: 'transmittal' | 'documents') => {
    setUploading(target)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok && data.url) {
        if (target === 'transmittal') setFTransmittal(p => [...p, data.url])
        else setFDocuments(p => [...p, data.url])
      } else setError(data.error || 'Upload failed')
    } catch { setError('Upload failed') }
    finally { setUploading(null) }
  }

  const save = async () => {
    if (!fWallet) { setError('Choose an HMO provider'); return }
    if (!fDate) { setError('Date submitted is required'); return }
    setSaving(true); setError('')
    try {
      const body = {
        ...(editingId ? { id: editingId } : { walletId: fWallet }),
        submittedDate: fDate,
        transmittalUrls: fTransmittal,
        documentUrls: fDocuments,
        notes: fNotes,
        orderIds: selected,
      }
      const res = await fetch('/api/accounts-receivable/soa-submissions', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Save failed'); return }
      setShowForm(false); resetForm(); fetchSubmissions()
    } catch { setError('Save failed') }
    finally { setSaving(false) }
  }

  const remove = async (s: Submission) => {
    if (!confirm(`Delete the ${s.wallet.patientName} submission dated ${fmtDate(s.submittedDate)}?\n\nThe ${s.items.length} tagged session(s) stay in the system — only this submission record is removed.`)) return
    await fetch(`/api/accounts-receivable/soa-submissions?id=${s.id}`, { method: 'DELETE' })
    fetchSubmissions()
  }

  // ── Tag list filtering (view-only: never changes `selected`) ──
  const q = tagSearch.trim().toLowerCase()
  const amtQuery = q.replace(/[₱,\s]/g, '')
  const effDate = (o: TagOrder) => String(o.arCustomDate || o.transactionDate).slice(0, 10)
  const amountOf = (o: TagOrder) => o.payments.reduce((s, p) => s + toNum(p.amount), 0)

  const visible = tagOrders.filter(o => {
    const d = effDate(o)
    if (tagFrom && d < tagFrom) return false
    if (tagTo && d > tagTo) return false
    if (!q) return true
    const text = `${o.patientName || ''} ${o.items.map(i => i.name).join(' ')}`.toLowerCase()
    if (text.includes(q)) return true
    if (!amtQuery || !/^[\d.]+$/.test(amtQuery)) return false
    const a = amountOf(o)
    return String(a).includes(amtQuery) || a.toFixed(2).includes(amtQuery)
  })

  const filtersOn = !!(q || tagFrom || tagTo)
  const selectedTotal = tagOrders.filter(o => selected.includes(o.id)).reduce((s, o) => s + amountOf(o), 0)
  const hiddenSelected = selected.filter(id => !visible.some(o => o.id === id)).length

  const toggle = (id: string) =>
    setSelected(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))

  const FileRow = ({ urls, onRemove }: { urls: string[]; onRemove: (i: number) => void }) => (
    <>
      {urls.map((url, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs" style={{ borderColor: 'var(--teal)', background: '#f0fdfa' }}>
          <FileText size={12} style={{ color: 'var(--teal)', flexShrink: 0 }} />
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate underline" style={{ color: 'var(--teal)' }}>
            {url.split('/').pop()}
          </a>
          <a href={url} download className="p-0.5 rounded hover:bg-teal-100" title="Download">
            <Download size={12} style={{ color: 'var(--teal)' }} />
          </a>
          <button type="button" onClick={() => onRemove(i)} className="p-0.5 rounded hover:bg-red-50" title="Remove">
            <X size={12} style={{ color: '#dc2626' }} />
          </button>
        </div>
      ))}
    </>
  )

  const Uploader = ({ target, label }: { target: 'transmittal' | 'documents'; label: string }) => (
    <label className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed text-xs cursor-pointer hover:bg-gray-50 transition-colors"
      style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
      <Upload size={14} />
      {uploading === target ? 'Uploading…' : label}
      <input type="file" accept="image/*,.pdf" className="hidden" onChange={async e => {
        const f = e.target.files?.[0]
        if (f) await upload(f, target)
        e.target.value = ''
      }} />
    </label>
  )

  return (
    <div className="space-y-4">
      {/* Header + provider filter */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Filter by HMO</label>
          <select value={listWallet} onChange={e => setListWallet(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            <option value="">All providers</option>
            {wallets.map(w => <option key={w.id} value={w.id}>{w.patientName}</option>)}
          </select>
        </div>
        {canWrite && (
          <button onClick={openNew}
            className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ background: 'var(--teal)' }}>
            <Plus size={16} /> New Submission
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--mid-gray)' }}>Loading submissions…</p>
      ) : submissions.length === 0 ? (
        <div className="rounded-2xl border p-8 text-center" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
          <FileText size={28} className="mx-auto mb-2" style={{ color: 'var(--light-gray)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>No SOA submissions recorded yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
            Record a batch here once it has been transmitted to the provider, so unbilled sessions can be told apart from unpaid ones.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border overflow-x-auto" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                <th className="px-3 py-2.5 w-8" />
                <th className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap">Date</th>
                <th className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap">SOA Reference Number</th>
                <th className="px-3 py-2.5 text-xs font-semibold">HMO</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-right whitespace-nowrap">Amount</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {submissions.map(s => {
                const total = s.items.reduce((sum, i) => sum + i.order.payments.reduce((a, p) => a + toNum(p.amount), 0), 0)
                const open = expandedId === s.id
                return (
                  <Fragment key={s.id}>
                    <tr className="border-t hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--light-gray)' }}
                      onClick={() => setExpandedId(open ? null : s.id)}>
                      <td className="px-3 py-2.5">
                        {open ? <ChevronDown size={14} style={{ color: 'var(--mid-gray)' }} /> : <ChevronRight size={14} style={{ color: 'var(--mid-gray)' }} />}
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{fmtDate(s.submittedDate)}</td>
                      <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap" style={{ color: s.referenceNo ? 'var(--deep-teal)' : 'var(--mid-gray)' }}>
                        {s.referenceNo || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>
                        {s.wallet.patientName}
                        <span className="ml-2 font-normal" style={{ color: 'var(--mid-gray)' }}>{s.items.length} session{s.items.length !== 1 ? 's' : ''}</span>
                      </td>
                      <td className="px-3 py-2.5 text-sm font-semibold text-right whitespace-nowrap" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(total)}</td>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {urlList(s.transmittalUrls).length > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ background: '#f0fdfa', color: 'var(--teal)' }}>
                              {urlList(s.transmittalUrls).length} proof{urlList(s.transmittalUrls).length !== 1 ? 's' : ''}
                            </span>
                          )}
                          {canWrite && (
                            <>
                              <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-gray-100" title="Edit">
                                <Pencil size={13} style={{ color: 'var(--mid-gray)' }} />
                              </button>
                              <button onClick={() => remove(s)} className="p-1.5 rounded hover:bg-red-50" title="Delete">
                                <Trash2 size={13} style={{ color: '#dc2626' }} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-t" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                        <td colSpan={6} className="px-4 py-4">
                          <div className="space-y-3">
                            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Recorded by {s.createdBy.name}{s.notes ? <> · <span className="italic">{s.notes}</span></> : null}</p>
                            {(urlList(s.transmittalUrls).length > 0 || urlList(s.documentUrls).length > 0) && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {urlList(s.transmittalUrls).length > 0 && (
                                  <div>
                                    <p className="text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Proof of transmittal</p>
                                    <div className="space-y-1">
                                      {urlList(s.transmittalUrls).map((u, i) => (
                                        <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                                          className="block text-xs underline truncate" style={{ color: 'var(--teal)' }}>{u.split('/').pop()}</a>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {urlList(s.documentUrls).length > 0 && (
                                  <div>
                                    <p className="text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Scanned documents</p>
                                    <div className="space-y-1">
                                      {urlList(s.documentUrls).map((u, i) => (
                                        <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                                          className="block text-xs underline truncate" style={{ color: 'var(--teal)' }}>{u.split('/').pop()}</a>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="rounded-xl border overflow-hidden bg-white" style={{ borderColor: 'var(--light-gray)' }}>
                              {s.items.map(({ order: o }) => (
                                <div key={o.id} className="flex items-center gap-3 px-3 py-2 text-xs border-b last:border-b-0" style={{ borderColor: 'var(--light-gray)' }}>
                                  <span className="whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{fmtDate(o.arCustomDate || o.transactionDate)}</span>
                                  <span className="flex-1 truncate" style={{ color: 'var(--charcoal)' }}>
                                    {o.patientName} — {o.items.map(i => i.name).join(', ')}
                                  </span>
                                  <span className="whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{o.clinicianName || '—'}</span>
                                  <span className="font-medium whitespace-nowrap">{formatCurrency(o.payments.reduce((a, p) => a + toNum(p.amount), 0))}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}


      {/* ── Form modal ── */}
      {showForm && (
        <div className={`fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto ${formExpanded ? '' : 'pt-8'}`}>
          <div className={`bg-white p-6 shadow-xl w-full relative ${formExpanded ? 'max-w-none min-h-full rounded-none' : 'max-w-2xl mb-8 rounded-2xl'}`}>
            <button onClick={() => setFormExpanded(v => !v)}
              title={formExpanded ? 'Exit full screen' : 'Expand to full screen'}
              className="absolute top-4 right-12 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-gray-100 text-xs font-medium"
              style={{ color: 'var(--mid-gray)' }}>
              {formExpanded ? <><Minimize2 size={14} /> Collapse</> : <><Maximize2 size={14} /> Expand</>}
            </button>
            <button onClick={() => { setShowForm(false); resetForm() }} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
              <X size={18} style={{ color: 'var(--mid-gray)' }} />
            </button>

            <div className={formExpanded ? 'max-w-5xl mx-auto' : ''}>
              <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                <FileText size={20} className="inline" style={{ color: 'var(--teal)' }} />{' '}
                {editingId ? 'Edit SOA Submission' : 'New SOA Submission'}
              </h3>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>HMO Provider</label>
                    <select value={fWallet} disabled={!!editingId}
                      onChange={e => { setFWallet(e.target.value); setSelected([]) }}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none disabled:bg-gray-50"
                      style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">— Select —</option>
                      {wallets.map(w => <option key={w.id} value={w.id}>{w.patientName}</option>)}
                    </select>
                    {editingId && (
                      <p className="text-[10px] mt-1" style={{ color: 'var(--mid-gray)' }}>
                        Provider cannot change on an existing submission — delete and re-create instead.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Date Submitted</label>
                    <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                      Proof of Transmittal <span className="font-normal">({fTransmittal.length} file{fTransmittal.length !== 1 ? 's' : ''})</span>
                    </label>
                    <div className="space-y-1.5">
                      <FileRow urls={fTransmittal} onRemove={i => setFTransmittal(p => p.filter((_, x) => x !== i))} />
                      <Uploader target="transmittal" label={fTransmittal.length ? 'Add another file' : 'Upload (JPG, PNG, PDF — max 10MB)'} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                      Scanned Documents <span className="font-normal">({fDocuments.length} file{fDocuments.length !== 1 ? 's' : ''})</span>
                    </label>
                    <div className="space-y-1.5">
                      <FileRow urls={fDocuments} onRemove={i => setFDocuments(p => p.filter((_, x) => x !== i))} />
                      <Uploader target="documents" label={fDocuments.length ? 'Add another file' : 'Upload (JPG, PNG, PDF — max 10MB)'} />
                    </div>
                  </div>
                </div>

                {/* ── Tag sessions ── */}
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>
                    Tag Sessions Included
                  </label>
                  {!fWallet ? (
                    <p className="px-3 py-4 text-xs text-center rounded-xl border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                      Choose an HMO provider first — only that provider&apos;s sessions can be tagged.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <div className="relative flex-1 min-w-[160px]">
                          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
                          <input type="text" value={tagSearch} onChange={e => setTagSearch(e.target.value)}
                            placeholder="Search name, service, amount…"
                            className="w-full pl-8 pr-2 py-2 rounded-xl border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                        <input type="date" value={tagFrom} onChange={e => setTagFrom(e.target.value)} title="From date"
                          className="px-2 py-2 rounded-xl border text-xs outline-none"
                          style={{ borderColor: tagFrom ? 'var(--teal)' : 'var(--light-gray)' }} />
                        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
                        <input type="date" value={tagTo} onChange={e => setTagTo(e.target.value)} title="To date"
                          className="px-2 py-2 rounded-xl border text-xs outline-none"
                          style={{ borderColor: tagTo ? 'var(--teal)' : 'var(--light-gray)' }} />
                        {filtersOn && (
                          <button type="button" onClick={() => { setTagSearch(''); setTagFrom(''); setTagTo('') }}
                            title="Clear filters" className="p-1.5 rounded-lg hover:bg-gray-100">
                            <X size={14} style={{ color: 'var(--mid-gray)' }} />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <button type="button" onClick={() => setSelected(p => [...new Set([...p, ...visible.map(o => o.id)])])}
                          className="text-xs px-2.5 py-1 rounded-lg border font-medium" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                          Tick all shown ({visible.length})
                        </button>
                        <button type="button" onClick={() => setSelected(p => p.filter(id => !visible.some(o => o.id === id)))}
                          className="text-xs px-2.5 py-1 rounded-lg border font-medium" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                          Untick shown
                        </button>
                        {selected.length > 0 && (
                          <button type="button" onClick={() => setSelected([])}
                            className="text-xs px-2.5 py-1 rounded-lg border font-medium" style={{ borderColor: 'var(--light-gray)', color: '#dc2626' }}>
                            Clear all {selected.length}
                          </button>
                        )}
                      </div>

                      <div className={`rounded-xl border overflow-y-auto ${formExpanded ? 'max-h-[55vh]' : 'max-h-64'}`} style={{ borderColor: 'var(--light-gray)' }}>
                        {tagLoading ? (
                          <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--mid-gray)' }}>Loading sessions…</p>
                        ) : visible.length === 0 ? (
                          <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--mid-gray)' }}>
                            {tagOrders.length === 0 ? 'No sessions billed to this provider.' : 'No sessions match the current filters.'}
                          </p>
                        ) : visible.map(o => (
                          <label key={o.id} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 cursor-pointer border-b" style={{ borderColor: 'var(--light-gray)' }}>
                            <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} className="rounded" />
                            <span style={{ color: 'var(--mid-gray)' }}>{fmtDate(o.arCustomDate || o.transactionDate)}</span>
                            <span className="flex-1 truncate" style={{ color: 'var(--charcoal)' }}>
                              {o.patientName} — {o.items.map(i => i.name).join(', ')}
                            </span>
                            <span className="font-medium">{formatCurrency(amountOf(o))}</span>
                          </label>
                        ))}
                      </div>

                      <p className="text-xs mt-1.5" style={{ color: 'var(--mid-gray)' }}>
                        Showing {visible.length} of {tagOrders.length} sessions ·{' '}
                        <span className="font-semibold" style={{ color: 'var(--deep-teal)' }}>
                          {selected.length} tagged, {formatCurrency(selectedTotal)}
                        </span>
                        {hiddenSelected > 0 && ` · ${hiddenSelected} tagged session${hiddenSelected !== 1 ? 's are' : ' is'} hidden by the current filter and will still be saved`}
                      </p>
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Notes</label>
                  <textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--light-gray)' }} />
                </div>

                {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}

                <div className="flex gap-3 pt-2">
                  <button onClick={() => { setShowForm(false); resetForm() }}
                    className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                    style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                  <button onClick={save} disabled={saving}
                    className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                    style={{ background: 'var(--teal)' }}>
                    {saving ? 'Saving…' : editingId ? 'Update Submission' : 'Save Submission'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
