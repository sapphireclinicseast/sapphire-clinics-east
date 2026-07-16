'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, X } from 'lucide-react'
import { branchLabel } from '@/lib/branch'

export const REFERRER_TYPE_LABEL: Record<string, string> = { DOCTOR: 'Doctor', LAW_FIRM: 'Law Firm', PARTNER_SCHOOL: 'Partner School' }
const REFERRER_TYPES = ['DOCTOR', 'LAW_FIRM', 'PARTNER_SCHOOL'] as const

const typeBadgeStyle = (t?: string | null): React.CSSProperties => {
  if (t === 'LAW_FIRM') return { background: '#fef3c7', color: '#92400e' }
  if (t === 'PARTNER_SCHOOL') return { background: '#ede9fe', color: '#6d28d9' }
  return { background: 'var(--pale-teal)', color: 'var(--deep-teal)' }
}

export default function ReferrerSettingsPanel() {
  const [referrers, setReferrers] = useState<{ id: string; name: string; type?: string | null; affiliation?: string | null; specialization?: string | null; referralCount?: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', type: 'DOCTOR', affiliation: '', specialization: '' })
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ordersFor, setOrdersFor] = useState<{ id: string; name: string } | null>(null)
  const [orders, setOrders] = useState<{ id: string; orderNumber: number; date: string; patientName?: string | null; amount: number; branch: string }[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  const openOrders = async (r: { id: string; name: string }) => {
    setOrdersFor(r); setOrders([]); setOrdersLoading(true)
    try { const res = await fetch(`/api/referrers/orders?id=${r.id}`); setOrders(res.ok ? await res.json() : []) }
    catch { setOrders([]) }
    finally { setOrdersLoading(false) }
  }

  const fetchReferrers = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/referrers?all=true')
      const d = await r.json()
      setReferrers(Array.isArray(d) ? d : d.data || [])
    } catch { setReferrers([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchReferrers() }, [fetchReferrers])

  const filtered = referrers.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.affiliation?.toLowerCase().includes(search.toLowerCase()) ||
    r.specialization?.toLowerCase().includes(search.toLowerCase())
  )

  const openCreate = () => { setEditingId(null); setForm({ name: '', type: 'DOCTOR', affiliation: '', specialization: '' }); setError(''); setShowForm(true) }
  const openEdit = (r: typeof referrers[0]) => { setEditingId(r.id); setForm({ name: r.name, type: r.type || 'DOCTOR', affiliation: r.affiliation || '', specialization: r.specialization || '' }); setError(''); setShowForm(true) }

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    if (saving) return
    setError('')
    setSaving(true)
    try {
      const body = { id: editingId, name: form.name.trim(), type: form.type, affiliation: form.affiliation.trim() || null, specialization: form.specialization.trim() || null }
      const res = await fetch('/api/referrers', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) { setShowForm(false); fetchReferrers() }
      else { const d = await res.json(); setError(d.error || 'Failed to save') }
    } finally { setSaving(false) }
  }

  const deleteReferrer = async (id: string) => {
    if (!window.confirm('Remove this referrer?')) return
    await fetch(`/api/referrers?id=${id}`, { method: 'DELETE' })
    fetchReferrers()
  }

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError('')
    try {
      const text = await file.text()
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      const header = lines[0].toLowerCase()
      const hasHeader = header.includes('name') || header.includes('affiliation')
      const dataLines = hasHeader ? lines.slice(1) : lines
      let created = 0
      for (const line of dataLines) {
        const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''))
        if (!cols[0]) continue
        const t = cols[3] || ''
        const type = /school/i.test(t) ? 'PARTNER_SCHOOL' : /law/i.test(t) ? 'LAW_FIRM' : 'DOCTOR'
        const res = await fetch('/api/referrers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: cols[0], type, affiliation: cols[1] || null, specialization: cols[2] || null }),
        })
        if (res.ok) created++
      }
      alert(`Uploaded ${created} referrer(s).`)
      fetchReferrers()
    } catch { setError('Failed to parse CSV') }
    finally { setUploading(false); e.target.value = '' }
  }

  const downloadCsv = () => {
    const rows = [['Name', 'Type', 'Affiliation', 'Specialization'], ...referrers.map(r => [r.name, REFERRER_TYPE_LABEL[r.type || 'DOCTOR'] || 'Doctor', r.affiliation || '', r.specialization || ''])]
    const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'referrers.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  const downloadPdf = async () => {
    const { jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    doc.setFontSize(14); doc.text('Referrers', 14, 16)
    doc.setFontSize(8); doc.setTextColor(120); doc.text(`Generated ${new Date().toLocaleDateString('en-PH')}`, 14, 22); doc.setTextColor(0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    autoTable(doc as any, {
      startY: 28,
      head: [['#', 'Name', 'Type', 'Affiliation', 'Specialization']],
      body: referrers.map((r, i) => [i + 1, r.name, REFERRER_TYPE_LABEL[r.type || 'DOCTOR'] || 'Doctor', r.affiliation || '', r.specialization || '']),
      styles: { fontSize: 8 }, headStyles: { fillColor: [46, 94, 90] },
    })
    doc.save('referrers.pdf')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>Referrers</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>Manage referrers (doctors, law firms, and partner schools). Upload CSV (Name, Affiliation, Specialization, Type) or add individually.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadCsv} className="px-3 py-2 rounded-xl text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>CSV</button>
          <button onClick={downloadPdf} className="px-3 py-2 rounded-xl text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>PDF</button>
          <button onClick={() => {
            const csv = 'Name,Affiliation,Specialization,Type\nDr. Juan Dela Cruz,Manila Medical Center,Orthopedics,Doctor\nCruz & Associates Law Firm,Makati,,Law Firm\nSt. Marys School,Quezon City,,Partner School\n'
            const blob = new Blob([csv], { type: 'text/csv' })
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'referrer_template.csv'; a.click(); URL.revokeObjectURL(a.href)
          }} className="px-3 py-2 rounded-xl text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            Template
          </button>
          <label className="px-3 py-2 rounded-xl text-xs font-medium border cursor-pointer" style={{ borderColor: 'var(--light-gray)', color: uploading ? 'var(--mid-gray)' : 'var(--gold)' }}>
            {uploading ? 'Uploading...' : 'Upload CSV'}
            <input type="file" accept=".csv,.txt" onChange={handleCsvUpload} className="hidden" disabled={uploading} />
          </label>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
            <Plus size={14} /> Add Referrer
          </button>
        </div>
      </div>

      <div className="relative w-60">
        <Search size={14} className="absolute left-3 top-2.5" style={{ color: 'var(--mid-gray)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search referrers..."
          className="pl-9 pr-3 py-2 rounded-xl border text-sm outline-none w-full" style={{ borderColor: 'var(--light-gray)' }} />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {loading ? (
        <div className="py-12 text-center" style={{ color: 'var(--mid-gray)' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center" style={{ color: 'var(--mid-gray)' }}>No referrers found.</div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--pale-teal)' }}>
                {['Name', 'Type', 'Affiliation', 'Specialization', 'Count of Referrals', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>{r.name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={typeBadgeStyle(r.type)}>
                      {REFERRER_TYPE_LABEL[r.type || 'DOCTOR'] || 'Doctor'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.affiliation || '—'}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.specialization || '—'}</td>
                  <td className="px-4 py-3">
                    {(r.referralCount ?? 0) > 0 ? (
                      <button onClick={() => openOrders(r)} className="px-2.5 py-1 rounded-full text-xs font-semibold hover:underline" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }} title="View referred orders">
                        {r.referralCount}
                      </button>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil size={13} style={{ color: 'var(--teal)' }} /></button>
                      <button onClick={() => deleteReferrer(r.id)} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={13} className="text-red-400" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: 'white' }}>
            <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{editingId ? 'Edit Referrer' : 'Add Referrer'}</h3>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Classification</label>
              <div className="flex flex-wrap gap-2">
                {REFERRER_TYPES.map(t => (
                  <label key={t} className="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-sm flex-1 min-w-[9rem]"
                    style={form.type === t ? { borderColor: 'var(--teal)', background: 'var(--pale-teal)', color: 'var(--deep-teal)' } : { borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                    <input type="radio" name="referrerType" checked={form.type === t} onChange={() => setForm({ ...form, type: t })} />
                    {REFERRER_TYPE_LABEL[t]}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Affiliation</label>
              <input value={form.affiliation} onChange={e => setForm({ ...form, affiliation: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Specialization</label>
              <input value={form.specialization} onChange={e => setForm({ ...form, specialization: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl text-xs font-medium text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Referred-orders drill-down */}
      {ordersFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOrdersFor(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Referrals — {ordersFor.name}</h3>
              <button onClick={() => setOrdersFor(null)}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>Orders that named this referrer.</p>
            {ordersLoading ? (
              <div className="py-10 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>Loading…</div>
            ) : orders.length === 0 ? (
              <div className="py-10 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>No orders found.</div>
            ) : (
              <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--pale-teal)' }}>
                      {['Order #', 'Date', 'Patient', 'Amount', 'Branch'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--deep-teal)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                        <td className="px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>#{o.orderNumber}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{new Date(o.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{o.patientName || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--charcoal)' }}>₱{Number(o.amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{branchLabel(o.branch)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 text-right text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>{orders.length} order{orders.length === 1 ? '' : 's'}</div>
          </div>
        </div>
      )}
    </div>
  )
}
