'use client'

import { useCallback, useEffect, useState } from 'react'
import { Brain, Copy, Link2, Pencil, Plus, Trash2 } from 'lucide-react'

/**
 * Inventory → Psych Tests.
 *
 * The register of psychological test kits the clinics own, kept by the two
 * branch psych heads. They have no hub logins, so the list is edited through
 * a token-gated external page (/psych-tests/<token>) that writes to the same
 * rows — this panel is the hub's view of it, and the place the share link is
 * copied from. Every test records whether it was purchased as a HARD_COPY kit
 * or an ONLINE subscription/credit.
 */

interface PsychTest {
  id: string
  branch: string
  name: string
  format: string
  quantity: number | null
  supplier: string | null
  acquiredDate: string | null
  remarks: string | null
  updatedByName: string | null
  updatedAt: string
}

// Psych departments exist only at the two clinic branches.
const BRANCHES = [
  { value: 'SANDBOX_EAST', label: 'East Branch' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
]
const BRANCH_LABELS: Record<string, string> = Object.fromEntries(BRANCHES.map(b => [b.value, b.label]))

const FORMATS = [
  { value: 'HARD_COPY', label: 'Hard copy' },
  { value: 'ONLINE', label: 'Online' },
]
const FORMAT_BADGE: Record<string, { bg: string; color: string }> = {
  HARD_COPY: { bg: '#e6f2ef', color: '#0f766e' },
  ONLINE: { bg: '#f1ecf7', color: '#6d5192' },
}

const emptyForm = {
  id: '', branch: 'SANDBOX_EAST', name: '', format: 'HARD_COPY',
  quantity: '', supplier: '', acquiredDate: '', remarks: '',
}

export default function PsychTestsPanel({ canWrite }: { canWrite: boolean }) {
  const [tests, setTests] = useState<PsychTest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PsychTest | null>(null)
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/inventory/psych-tests${branchFilter ? `?branch=${encodeURIComponent(branchFilter)}` : ''}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to load')
      setTests(d.data || [])
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load psych tests')
    } finally {
      setLoading(false)
    }
  }, [branchFilter])

  useEffect(() => { load() }, [load])

  // The easy address, gated by the shared access code on the page itself.
  useEffect(() => { setShareUrl(`${window.location.origin}/psych-tests`) }, [])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${shareUrl} (access code: scei)`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard may be unavailable; the URL is visible to select */ }
  }

  const openCreate = () => { setForm({ ...emptyForm }); setShowModal(true) }
  const openEdit = (t: PsychTest) => {
    setForm({
      id: t.id, branch: t.branch, name: t.name, format: t.format,
      quantity: t.quantity == null ? '' : String(t.quantity),
      supplier: t.supplier || '',
      acquiredDate: t.acquiredDate ? t.acquiredDate.slice(0, 10) : '',
      remarks: t.remarks || '',
    })
    setShowModal(true)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const body = {
        ...(form.id ? { id: form.id } : {}),
        branch: form.branch, name: form.name.trim(), format: form.format,
        quantity: form.quantity === '' ? null : Number(form.quantity),
        supplier: form.supplier.trim() || null,
        acquiredDate: form.acquiredDate || null,
        remarks: form.remarks.trim() || null,
      }
      const r = await fetch('/api/inventory/psych-tests', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to save')
      setShowModal(false)
      load()
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    try {
      const r = await fetch(`/api/inventory/psych-tests?id=${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Failed to delete') }
      setDeleteTarget(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  const input = 'w-full px-3 py-2.5 rounded-xl border text-sm'
  const borderStyle = { borderColor: 'var(--light-gray)' }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Psych Tests</h2>
          <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
            Psychological test kits per branch, kept by the psych heads — each marked hard copy or online.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm" style={borderStyle}>
            <option value="">Both branches</option>
            {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
          {canWrite && (
            <button onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'var(--teal)' }}>
              <Plus size={15} /> Add Test
            </button>
          )}
        </div>
      </div>

      {canWrite && (
        <div className="rounded-2xl border px-4 py-3 flex items-center gap-3 flex-wrap"
          style={{ borderColor: '#cddcd6', background: '#f4f8f6' }}>
          <Link2 size={16} style={{ color: 'var(--teal)' }} />
          <div className="flex-1 min-w-[220px]">
            <p className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>
              External edit link for the psych heads · access code: <span style={{ color: 'var(--teal)' }}>scei</span>
            </p>
            <p className="text-xs break-all" style={{ color: 'var(--mid-gray)' }}>
              {shareUrl || '…'}
            </p>
          </div>
          <button onClick={copyLink} disabled={!shareUrl}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border disabled:opacity-50"
            style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
            <Copy size={13} /> {copied ? 'Copied!' : 'Copy link + code'}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#fef2f2', color: '#b91c1c' }}>{error}</div>
      )}

      <div className="rounded-2xl border overflow-hidden bg-white" style={borderStyle}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--off-white)' }}>
              <th className="text-left px-4 py-3 font-semibold">Test</th>
              <th className="text-left px-4 py-3 font-semibold">Branch</th>
              <th className="text-left px-4 py-3 font-semibold">Format</th>
              <th className="text-right px-4 py-3 font-semibold">Qty</th>
              <th className="text-left px-4 py-3 font-semibold">Supplier</th>
              <th className="text-left px-4 py-3 font-semibold">Remarks</th>
              <th className="text-left px-4 py-3 font-semibold">Last updated</th>
              {canWrite && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center" style={{ color: 'var(--mid-gray)' }}>Loading…</td></tr>
            )}
            {!loading && tests.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <Brain size={32} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--mid-gray)' }} />
                  <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
                    No psych tests recorded yet. Share the edit link with the psych heads, or add one here.
                  </p>
                </td>
              </tr>
            )}
            {tests.map(t => {
              const badge = FORMAT_BADGE[t.format] || FORMAT_BADGE.HARD_COPY
              return (
                <tr key={t.id} className="border-t hover:bg-gray-50/50" style={borderStyle}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>{t.name}</td>
                  <td className="px-4 py-3">{BRANCH_LABELS[t.branch] || t.branch}</td>
                  <td className="px-4 py-3">
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: badge.bg, color: badge.color }}>
                      {t.format === 'ONLINE' ? 'Online' : 'Hard copy'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{t.quantity ?? '—'}</td>
                  <td className="px-4 py-3">{t.supplier || '—'}</td>
                  <td className="px-4 py-3 max-w-[260px] truncate" title={t.remarks || ''}>{t.remarks || '—'}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                    {new Date(t.updatedAt).toLocaleDateString()}{t.updatedByName ? ` · ${t.updatedByName}` : ''}
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-gray-100" title="Edit">
                        <Pencil size={15} style={{ color: 'var(--mid-gray)' }} />
                      </button>
                      <button onClick={() => setDeleteTarget(t)} className="p-1.5 rounded-lg hover:bg-gray-100" title="Delete">
                        <Trash2 size={15} className="text-red-500" />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-bold mb-4" style={{ color: 'var(--charcoal)' }}>{form.id ? 'Edit Psych Test' : 'Add Psych Test'}</h3>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Test name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={input} style={borderStyle} placeholder="e.g. WISC-V Complete Kit" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Branch *</label>
                  <select value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
                    className={input} style={borderStyle}>
                    {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Purchased as *</label>
                  <select value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))}
                    className={input} style={borderStyle}>
                    {FORMATS.map(f2 => <option key={f2.value} value={f2.value}>{f2.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Quantity</label>
                  <input type="number" min="0" value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    className={input} style={borderStyle} placeholder="optional" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Date acquired</label>
                  <input type="date" value={form.acquiredDate}
                    onChange={e => setForm(f => ({ ...f, acquiredDate: e.target.value }))}
                    className={input} style={borderStyle} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Supplier / platform</label>
                <input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
                  className={input} style={borderStyle} placeholder="e.g. Pearson, WPS, online portal" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Remarks</label>
                <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                  className={input} style={borderStyle} rows={2} />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border" style={{ ...borderStyle, color: 'var(--mid-gray)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Delete this test?</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--mid-gray)' }}>
              <strong>{deleteTarget.name}</strong> ({BRANCH_LABELS[deleteTarget.branch] || deleteTarget.branch}) will be removed from the register.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold border" style={{ ...borderStyle, color: 'var(--mid-gray)' }}>
                Cancel
              </button>
              <button onClick={doDelete}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#dc2626' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
