'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarCheck, Pencil, Plus, Trash2, Check, X, Loader2 } from 'lucide-react'
import type { ComplianceDue } from '@/lib/compliance'

interface Deadline {
  id: string
  name: string
  category: string
  frequency: string
  dueMonth: number | null
  dueDay: number
  periodLagMonths: number
  leadDays: number
  notes: string | null
  isActive: boolean
  lastDoneDue: string | null
  lastDoneAt: string | null
  lastDoneBy: string | null
  due: ComplianceDue | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CATEGORY_LABEL: Record<string, string> = { BENEFITS: 'Benefits', GOVERNMENT: 'Government', OTHER: 'Other' }
const ordinal = (n: number) => (n === 31 ? 'last day' : `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`)
const schedule = (d: Deadline) =>
  d.frequency === 'MONTHLY' ? `Monthly, ${ordinal(d.dueDay)}${d.periodLagMonths ? ' of the following month' : ''}`
    : d.frequency === 'QUARTERLY' ? `Quarterly from ${MONTHS[(d.dueMonth || 1) - 1]}, ${ordinal(d.dueDay)}`
    : `Every ${MONTHS[(d.dueMonth || 1) - 1]} ${d.dueDay}`
const dueBadge = (n: number) =>
  n < 0 ? { background: '#fee2e2', color: '#b91c1c', text: `${-n} day${n === -1 ? '' : 's'} overdue` }
    : n <= 5 ? { background: '#fee2e2', color: '#b91c1c', text: n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : `Due in ${n} days` }
    : n <= 15 ? { background: '#fef3c7', color: '#92400e', text: `Due in ${n} days` }
    : { background: '#dcfce7', color: '#166534', text: `Due in ${n} days` }

const EMPTY = { id: '', name: '', category: 'GOVERNMENT', frequency: 'ANNUALLY', dueMonth: 1, dueDay: 15, periodLagMonths: 0, leadDays: 7, notes: '', isActive: true }
type Form = typeof EMPTY

export default function ComplianceCalendar({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<Deadline[] | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    fetch('/api/compliance-deadlines')
      .then(r => (r.ok ? r.json() : { deadlines: [] }))
      .then(d => setRows(d.deadlines || []))
      .catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!form || !form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/compliance-deadlines', {
        method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      if (!r.ok) { setError((await r.json()).error || 'Could not save'); return }
      setForm(null); load()
    } finally { setSaving(false) }
  }
  const markDone = async (d: Deadline) => {
    if (!d.due || !confirm(`Mark "${d.name}" due ${d.due.nextDue} as done?`)) return
    await fetch('/api/compliance-deadlines', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id, due: d.due.nextDue }) })
    load()
  }
  const remove = async (d: Deadline) => {
    if (!confirm(`Delete "${d.name}" from the compliance calendar?`)) return
    await fetch(`/api/compliance-deadlines?id=${encodeURIComponent(d.id)}`, { method: 'DELETE' })
    load()
  }

  const input = 'w-full px-3 py-2 rounded-xl border text-sm'
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-5" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
            <CalendarCheck size={18} style={{ color: 'var(--teal)' }} /> Compliance Calendar
          </h2>
          {canWrite && !form && (
            <button onClick={() => setForm({ ...EMPTY })} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-semibold" style={{ background: 'var(--teal)' }}>
              <Plus size={14} /> Add deadline
            </button>
          )}
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
          Benefit remittances and government filings. Each shows in the top-bar bell from its lead days before the due date until it is marked done. BIR tax deadlines are on the Guide &amp; Summary tab and in the bell already.
        </p>

        {form && (
          <div className="rounded-xl border p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <label className="text-xs sm:col-span-2" style={{ color: 'var(--mid-gray)' }}>Name
              <input className={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. SEC General Information Sheet" />
            </label>
            <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Category
              <select className={input} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>How often
              <select className={input} value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
                <option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUALLY">Annually</option>
              </select>
            </label>
            {form.frequency !== 'MONTHLY' && (
              <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>{form.frequency === 'ANNUALLY' ? 'Month due' : 'First due month'}
                <select className={input} value={form.dueMonth} onChange={e => setForm({ ...form, dueMonth: Number(e.target.value) })}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </label>
            )}
            <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Day due (31 = last day of the month)
              <input type="number" min={1} max={31} className={input} value={form.dueDay} onChange={e => setForm({ ...form, dueDay: Number(e.target.value) })} />
            </label>
            {form.frequency === 'MONTHLY' && (
              <label className="text-xs flex items-center gap-2 mt-5" style={{ color: 'var(--charcoal)' }}>
                <input type="checkbox" checked={form.periodLagMonths > 0} onChange={e => setForm({ ...form, periodLagMonths: e.target.checked ? 1 : 0 })} />
                Covers the previous month (e.g. September&apos;s contributions due in October)
              </label>
            )}
            <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Remind how many days before
              <input type="number" min={0} max={60} className={input} value={form.leadDays} onChange={e => setForm({ ...form, leadDays: Number(e.target.value) })} />
            </label>
            <label className="text-xs sm:col-span-2" style={{ color: 'var(--mid-gray)' }}>Notes
              <input className={input} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Where to file, who is responsible…" />
            </label>
            <label className="text-xs flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
              <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> Active
            </label>
            {error && <p className="text-xs text-red-600 sm:col-span-2">{error}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
              </button>
              <button onClick={() => { setForm(null); setError('') }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                <X size={13} /> Cancel
              </button>
            </div>
          </div>
        )}

        {rows === null ? (
          <p className="text-xs flex items-center gap-2" style={{ color: 'var(--mid-gray)' }}><Loader2 size={13} className="animate-spin" /> Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No deadlines yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--light-gray)' }}>
                  {['Deadline', 'Category', 'Schedule', 'Next due', 'Remind', 'Last done', ''].map(h => (
                    <th key={h} className="text-left px-2 py-2 font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(d => {
                  const b = d.due ? dueBadge(d.due.daysUntil) : null
                  return (
                    <tr key={d.id} className="border-b align-top" style={{ borderColor: 'var(--light-gray)', opacity: d.isActive ? 1 : 0.5 }}>
                      <td className="px-2 py-2">
                        <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{d.name}</p>
                        {d.notes && <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{d.notes}</p>}
                      </td>
                      <td className="px-2 py-2" style={{ color: 'var(--mid-gray)' }}>{CATEGORY_LABEL[d.category] || d.category}</td>
                      <td className="px-2 py-2" style={{ color: 'var(--mid-gray)' }}>{schedule(d)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {d.due && b ? (
                          <>
                            <span style={{ color: 'var(--charcoal)' }}>{d.due.nextDue}</span>
                            {d.due.periodLabel && <span className="block text-[10px]" style={{ color: 'var(--mid-gray)' }}>{d.due.periodLabel}</span>}
                            <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: b.background, color: b.color }}>{b.text}</span>
                          </>
                        ) : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                      </td>
                      <td className="px-2 py-2" style={{ color: 'var(--mid-gray)' }}>{d.leadDays} day{d.leadDays === 1 ? '' : 's'} before</td>
                      <td className="px-2 py-2" style={{ color: 'var(--mid-gray)' }}>{d.lastDoneDue ? `${d.lastDoneDue}${d.lastDoneBy ? ` · ${d.lastDoneBy}` : ''}` : '—'}</td>
                      <td className="px-2 py-2">
                        {canWrite && (
                          <div className="flex gap-1">
                            {d.due && (
                              <button onClick={() => markDone(d)} title="Mark this occurrence done" className="px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                                <Check size={12} /> Done
                              </button>
                            )}
                            <button onClick={() => setForm({ id: d.id, name: d.name, category: d.category, frequency: d.frequency, dueMonth: d.dueMonth || 1, dueDay: d.dueDay, periodLagMonths: d.periodLagMonths, leadDays: d.leadDays, notes: d.notes || '', isActive: d.isActive })}
                              title="Edit" className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil size={13} style={{ color: 'var(--mid-gray)' }} /></button>
                            <button onClick={() => remove(d)} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={13} className="text-red-500" /></button>
                          </div>
                        )}
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
