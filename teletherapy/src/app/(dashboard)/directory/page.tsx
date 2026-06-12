'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Contact, Plus, Trash2, Loader2, X, Mail } from 'lucide-react'

interface DirectoryEntry {
  id: string
  departments: string[]
  email: string
  description: string | null
}

// StaffDepartment codes → friendly labels for display + tick-boxes.
const DEPT_LABELS: Record<string, string> = {
  OT: 'Occupational Therapy',
  PT: 'Physical Therapy',
  SLP: 'Speech-Language Pathology',
  SPED: 'Special Education',
  MD: 'Medical (MD)',
  PSYCHOLOGY: 'Psychology',
  ORTHOSIS: 'Orthosis',
  FRONT_DESK: 'Front Desk',
  ADMINISTRATION: 'Administration',
}
const DEPT_ORDER = ['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS', 'FRONT_DESK', 'ADMINISTRATION']

export default function DirectoryPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'

  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  // Create form state
  const [showForm, setShowForm] = useState(false)
  const [depts, setDepts] = useState<string[]>([])
  const [email, setEmail] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }

  async function load() {
    try {
      const res = await fetch('/api/directory')
      const data = await res.json()
      if (res.ok) setEntries(data.entries ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function toggleDept(d: string) {
    setDepts((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  }

  function resetForm() {
    setDepts([]); setEmail(''); setDescription(''); setShowForm(false)
  }

  async function create() {
    if (depts.length === 0) { flash('Select at least one department'); return }
    if (!email) { flash('Email is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departments: depts, email, description }),
      })
      const data = await res.json()
      if (res.ok) { flash('Directory entry added'); resetForm(); load() }
      else flash(data.error ?? 'Failed to create')
    } catch { flash('Failed to create') }
    setSaving(false)
  }

  async function remove(id: string) {
    if (!confirm('Remove this directory entry?')) return
    await fetch(`/api/directory?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    load()
  }

  const sortDepts = (ds: string[]) => [...ds].sort((a, b) => DEPT_ORDER.indexOf(a) - DEPT_ORDER.indexOf(b))

  return (
    <div className="max-w-5xl mx-auto">
      {toast && <div className="toast">{toast}</div>}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--narra), var(--moss))' }}>
            <Contact size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--charcoal)]" style={{ fontFamily: 'var(--font-display)' }}>Directory</h1>
            <p className="text-[13px] text-[var(--mid-gray)] mt-0.5">Department contacts across the clinic.</p>
          </div>
        </div>
        {isAdmin && !showForm && (
          <button onClick={() => setShowForm(true)} className="btn-primary !py-2 !px-4 !text-[13px] !rounded-lg shrink-0">
            <Plus size={15} /> Create
          </button>
        )}
      </div>

      {/* Admin: create form */}
      {isAdmin && showForm && (
        <div className="card-static mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[var(--charcoal)] text-[15px]" style={{ fontFamily: 'var(--font-display)' }}>New Directory Entry</h2>
            <button onClick={resetForm} className="p-1 text-[var(--mid-gray)] hover:text-[var(--charcoal)]"><X size={18} /></button>
          </div>

          {/* Department tick-boxes (multi-select) */}
          <label className="block text-[11px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">Department(s)</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {DEPT_ORDER.map((d) => {
              const on = depts.includes(d)
              return (
                <button key={d} type="button" onClick={() => toggleDept(d)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-[13px] transition-colors"
                  style={on
                    ? { background: 'var(--sage-tint)', borderColor: 'var(--moss)', color: 'var(--deep-teal)' }
                    : { background: '#fff', borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                  <span className="w-4 h-4 rounded flex items-center justify-center shrink-0 text-white text-[11px] font-bold"
                    style={{ background: on ? 'var(--moss)' : 'transparent', border: on ? 'none' : '1.5px solid var(--light-gray)' }}>
                    {on ? '✓' : ''}
                  </span>
                  {DEPT_LABELS[d] ?? d}
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@sapphireclinicseast.org" className="input text-[13px]" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. OT booking & inquiries" className="input text-[13px]" />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={create} disabled={saving || depts.length === 0 || !email}
              className="btn-primary !py-2 !px-5 !text-[13px] !rounded-lg">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add Entry
            </button>
            <button onClick={resetForm} className="btn-secondary !py-2 !px-5 !text-[13px] !rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card-static !p-0 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[var(--mid-gray)]"><Loader2 size={20} className="animate-spin mx-auto" /></div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center text-[var(--mid-gray)] text-[13px]">
            <Contact size={28} className="mx-auto mb-2 opacity-40" />
            No directory entries yet.{isAdmin ? ' Click “Create” to add one.' : ''}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-[var(--mid-gray)]" style={{ background: 'var(--off-white)' }}>
                  <th className="px-5 py-3 font-semibold">Department</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Description</th>
                  {isAdmin && <th className="px-5 py-3 font-semibold w-12"></th>}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-[var(--light-gray)] align-top">
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {sortDepts(e.departments).map((d) => (
                          <span key={d} className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider"
                            style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                            {DEPT_LABELS[d] ?? d}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <a href={`mailto:${e.email}`} className="text-[13px] font-medium text-[var(--teal)] hover:underline inline-flex items-center gap-1.5">
                        <Mail size={13} className="shrink-0" />{e.email}
                      </a>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-[var(--charcoal)]">{e.description || <span className="text-[var(--mid-gray)]">—</span>}</td>
                    {isAdmin && (
                      <td className="px-5 py-3">
                        <button onClick={() => remove(e.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors" title="Remove">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
