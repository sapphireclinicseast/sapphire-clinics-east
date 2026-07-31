'use client'

/**
 * Statutory benefit availments — maternity, sickness and ECC.
 *
 * When a staff member claims, the company pays her up front and SSS reimburses
 * months later. That advance is money the agency owes, not a cost, so it sits in
 * 1165 SSS/Statutory Benefits Receivable until the reimbursement lands. Only the
 * portion the company grants on top of the statutory benefit is an expense, and
 * that goes to 8340 Employee Benefit.
 *
 * These rows document and age the claims; they do not post. The cash moves
 * through the RFPs named in each row, so recording it here as well would count
 * the same money twice.
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, X, Save } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Availment {
  id: string
  branch: string
  employeeName: string
  benefitType: string
  periodFrom: string | null
  periodTo: string | null
  amountAdvanced: number
  companyShare: number
  datePaidToEmployee: string | null
  advanceRfpId: string | null
  reimbursedAmount: number
  reimbursedDate: string | null
  reimbursementRfpId: string | null
  notes: string | null
  outstanding: number
  status: 'ADVANCED' | 'PARTIAL' | 'REIMBURSED'
}
interface Totals { advanced: number; companyShare: number; reimbursed: number; outstanding: number }

const TYPES = [
  { value: 'MATERNITY', label: 'Maternity' },
  { value: 'SICKNESS', label: 'Sickness' },
  { value: 'ECC', label: 'ECC' },
  { value: 'OTHER', label: 'Other' },
]
const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  ADVANCED: { bg: '#fef3c7', fg: '#92400e', label: 'Awaiting SSS' },
  PARTIAL: { bg: '#dbeafe', fg: '#1e40af', label: 'Part reimbursed' },
  REIMBURSED: { bg: '#dcfce7', fg: '#166534', label: 'Reimbursed' },
}

const emptyForm = (branch: string) => ({
  id: '', branch, employeeName: '', benefitType: 'MATERNITY',
  periodFrom: '', periodTo: '', amountAdvanced: '', companyShare: '',
  datePaidToEmployee: '', advanceRfpId: '', reimbursedAmount: '', reimbursedDate: '',
  reimbursementRfpId: '', notes: '',
})

const dateOnly = (v: string | null) => (v ? String(v).slice(0, 10) : '')

/** How long the agency has been sitting on it — the reason to track this at all. */
function agingDays(paid: string | null) {
  if (!paid) return null
  const ms = Date.now() - new Date(paid).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

export default function Availments({ branch }: { branch: string }) {
  const [rows, setRows] = useState<Availment[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm(branch))

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/benefits/availments?branch=${encodeURIComponent(branch)}`)
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not load availments')
      const d = await r.json()
      setRows(d.availments || [])
      setTotals(d.totals || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load availments')
    } finally {
      setLoading(false)
    }
  }, [branch])

  useEffect(() => { load() }, [load])

  const edit = (a: Availment) => {
    setForm({
      id: a.id, branch: a.branch, employeeName: a.employeeName, benefitType: a.benefitType,
      periodFrom: dateOnly(a.periodFrom), periodTo: dateOnly(a.periodTo),
      amountAdvanced: String(a.amountAdvanced || ''), companyShare: String(a.companyShare || ''),
      datePaidToEmployee: dateOnly(a.datePaidToEmployee), advanceRfpId: a.advanceRfpId || '',
      reimbursedAmount: String(a.reimbursedAmount || ''), reimbursedDate: dateOnly(a.reimbursedDate),
      reimbursementRfpId: a.reimbursementRfpId || '', notes: a.notes || '',
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.employeeName.trim()) { setError('Who availed? A name is required.'); return }
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/benefits/availments', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, branch: form.branch || branch }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not save')
      setOpen(false); setForm(emptyForm(branch)); await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this availment record? The RFPs that moved the cash are not affected.')) return
    const r = await fetch(`/api/benefits/availments?id=${id}`, { method: 'DELETE' })
    if (r.ok) load()
    else setError('Could not remove that record')
  }

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>{label}</label>
      {children}
    </div>
  )
  const inputCls = 'w-full px-3 py-1.5 rounded-lg border text-xs'
  const inputStyle = { borderColor: 'var(--light-gray)' }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-xs max-w-2xl" style={{ color: 'var(--mid-gray)' }}>
          The company pays the benefit up front and SSS reimburses later, so what is advanced is
          money the agency owes — it sits in 1165 SSS/Statutory Benefits Receivable, not in expenses.
          Only the share the company grants on top is a cost, in 8340 Employee Benefit. These rows
          document and age the claims; the cash itself moves through the RFPs named below.
        </p>
        <button onClick={() => { setForm(emptyForm(branch)); setOpen(true) }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
          style={{ background: 'var(--teal)' }}>
          <Plus className="w-3.5 h-3.5" /> Record an availment
        </button>
      </div>

      {totals && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
          {[
            { label: 'Advanced for SSS', value: totals.advanced, hint: 'receivable raised' },
            { label: 'Reimbursed by SSS', value: totals.reimbursed, hint: 'received back' },
            { label: 'Still owed by SSS', value: totals.outstanding, hint: 'open receivable', accent: true },
            { label: 'Company share', value: totals.companyShare, hint: 'expensed to 8340' },
          ].map(c => (
            <div key={c.label} className="rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: '#fff' }}>
              <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--mid-gray)' }}>{c.label}</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: c.accent ? '#c2410c' : 'var(--charcoal)' }}>{formatCurrency(c.value)}</p>
              <p className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>{c.hint}</p>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#b91c1c' }}>{error}</p>}

      <div className="rounded-2xl border overflow-x-auto" style={{ borderColor: 'var(--light-gray)', background: '#fff' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--off-white)' }}>
              {['Employee', 'Benefit', 'Period', 'Paid to staff', 'Advanced', 'Company share', 'Reimbursed', 'Still owed', 'Waiting', 'Status', ''].map((h, i) => (
                <th key={h + i} className={`px-3 py-2 text-xs font-semibold ${i >= 4 && i <= 7 ? 'text-right' : 'text-left'}`}
                  style={{ color: 'var(--deep-teal)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} className="px-3 py-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>}
            {!loading && !rows.length && (
              <tr><td colSpan={11} className="px-3 py-6 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>
                No availments recorded for this branch yet.
              </td></tr>
            )}
            {rows.map((a, i) => {
              const st = STATUS_STYLE[a.status] || STATUS_STYLE.ADVANCED
              const days = a.status === 'REIMBURSED' ? null : agingDays(a.datePaidToEmployee)
              return (
                <tr key={a.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => edit(a)}
                  style={{ borderTop: i > 0 ? '1px solid var(--light-gray)' : undefined }}>
                  <td className="px-3 py-2 text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>
                    {a.employeeName}
                    {a.advanceRfpId && <span className="block text-[10px]" style={{ color: 'var(--teal)' }}>{a.advanceRfpId}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{TYPES.find(t => t.value === a.benefitType)?.label || a.benefitType}</td>
                  <td className="px-3 py-2 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                    {dateOnly(a.periodFrom) || '—'}{a.periodTo ? ` → ${dateOnly(a.periodTo)}` : ''}
                  </td>
                  <td className="px-3 py-2 text-[11px]">{dateOnly(a.datePaidToEmployee) || '—'}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums">{formatCurrency(a.amountAdvanced)}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(a.companyShare)}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums" style={{ color: '#166534' }}>{formatCurrency(a.reimbursedAmount)}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums font-semibold" style={{ color: a.outstanding > 0 ? '#c2410c' : 'var(--light-gray)' }}>
                    {formatCurrency(a.outstanding)}
                  </td>
                  <td className="px-3 py-2 text-[11px]" style={{ color: days !== null && days > 120 ? '#b91c1c' : 'var(--mid-gray)' }}>
                    {days === null ? '—' : `${days}d`}
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={e => { e.stopPropagation(); remove(a.id) }} title="Remove record">
                      <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--mid-gray)' }} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.4)' }}>
          <div className="rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ background: '#fff' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--light-gray)' }}>
              <h3 className="font-bold" style={{ color: 'var(--deep-teal)' }}>
                {form.id ? 'Edit availment' : 'Record an availment'}
              </h3>
              <button onClick={() => setOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
                <F label="Employee">
                  <input className={inputCls} style={inputStyle} value={form.employeeName}
                    onChange={e => setForm({ ...form, employeeName: e.target.value })} placeholder="Surname, Firstname" />
                </F>
                <F label="Benefit">
                  <select className={inputCls} style={inputStyle} value={form.benefitType}
                    onChange={e => setForm({ ...form, benefitType: e.target.value })}>
                    {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </F>
                <F label="Period from">
                  <input type="date" className={inputCls} style={inputStyle} value={form.periodFrom}
                    onChange={e => setForm({ ...form, periodFrom: e.target.value })} />
                </F>
                <F label="Period to">
                  <input type="date" className={inputCls} style={inputStyle} value={form.periodTo}
                    onChange={e => setForm({ ...form, periodTo: e.target.value })} />
                </F>
              </div>

              <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--deep-teal)' }}>
                  Advanced to the employee — raises the receivable in 1165
                </p>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
                  <F label="Amount advanced (SSS-funded)">
                    <input type="number" step="0.01" className={inputCls} style={inputStyle} value={form.amountAdvanced}
                      onChange={e => setForm({ ...form, amountAdvanced: e.target.value })} />
                  </F>
                  <F label="Company share (expense, 8340)">
                    <input type="number" step="0.01" className={inputCls} style={inputStyle} value={form.companyShare}
                      onChange={e => setForm({ ...form, companyShare: e.target.value })} />
                  </F>
                  <F label="Date paid to staff">
                    <input type="date" className={inputCls} style={inputStyle} value={form.datePaidToEmployee}
                      onChange={e => setForm({ ...form, datePaidToEmployee: e.target.value })} />
                  </F>
                  <F label="RFP that paid it">
                    <input className={inputCls} style={inputStyle} value={form.advanceRfpId}
                      onChange={e => setForm({ ...form, advanceRfpId: e.target.value })} placeholder="AHGH-RFP26-000013" />
                  </F>
                </div>
              </div>

              <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--deep-teal)' }}>
                  Reimbursed by SSS — clears the receivable
                </p>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
                  <F label="Amount reimbursed">
                    <input type="number" step="0.01" className={inputCls} style={inputStyle} value={form.reimbursedAmount}
                      onChange={e => setForm({ ...form, reimbursedAmount: e.target.value })} />
                  </F>
                  <F label="Date received">
                    <input type="date" className={inputCls} style={inputStyle} value={form.reimbursedDate}
                      onChange={e => setForm({ ...form, reimbursedDate: e.target.value })} />
                  </F>
                  <F label="RFP that received it">
                    <input className={inputCls} style={inputStyle} value={form.reimbursementRfpId}
                      onChange={e => setForm({ ...form, reimbursementRfpId: e.target.value })} placeholder="AHGH-RFP26-000012" />
                  </F>
                </div>
              </div>

              <F label="Notes">
                <textarea className={inputCls} style={inputStyle} rows={2} value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })} />
              </F>

              {error && <p className="text-xs" style={{ color: '#b91c1c' }}>{error}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl text-xs font-semibold border"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--teal)' }}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
