'use client'

/**
 * Staff Loans & Perks — the per-person subledger behind 1160 Due from Employees.
 *
 * Money the company put out for a staff member that comes back through payroll:
 * cash loans, BIR assistance, sponsored trainings, medical bills, SOS balances.
 * The release debits 1160; every per-cutoff deduction credits it back. An ACTIVE
 * loan with a standing per-cutoff amount surfaces automatically as a prefilled
 * deduction when that branch's payroll adjustments are prepared, and finalizing
 * the cutoff posts the ledger leg (Dr salary expense / Cr 1160) so this register,
 * the payslips and the financial statements all say the same thing.
 */

import { Fragment, useCallback, useEffect, useState } from 'react'
import { Plus, Loader2, X, ChevronDown, ChevronRight, Pencil } from 'lucide-react'
import { StatCard, hrBtn } from '@/components/ui/hr-look'
import { TH, ShimmerRows } from './hr-bits'

const peso = (n: number) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Stored branch codes predate the rebrand; never show them raw.
const BRANCH_LABEL: Record<string, string> = { SBEA: 'AHEA', SBGH: 'AHGH', VERDANA: 'VER' }
const branchLabel = (b: string | null | undefined) => (b ? BRANCH_LABEL[b] || b : '—')

const CATEGORIES = [
  ['LOAN', 'Cash Loan'], ['BIR_ASSISTANCE', 'BIR Assistance'], ['TRAINING', 'Training'],
  ['MEDICAL', 'Medical Bill'], ['SOS', 'SOS Program'], ['PERK', 'Perk / Other'],
  ['GOVCON', 'Govcon Catch-up'], // EE share of contributions the company advanced for an unpaid month (Benefits Payable → Record Govcon catch-up)
] as const

interface Deduction { id: string; cutoffPeriod: string; amount: number; source: string; journalEntryId: string | null }
interface Loan {
  id: string; employeeId: string | null; staffName: string; branch: string | null; category: string
  description: string | null; principal: number; dateReleased: string | null; chequeRef: string | null
  perCutoff: number; status: string; notes: string | null
  employee: { firstName: string; lastName: string; branch: string } | null
  deductions: Deduction[]; repaid: number; balance: number
}
interface Emp { id: string; firstName: string; lastName: string; branch: string }

export default function StaffLoansTab() {
  const [loans, setLoans] = useState<Loan[]>([])
  const [emps, setEmps] = useState<Emp[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Loan | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPaid, setShowPaid] = useState(false)

  const [f, setF] = useState({
    staffName: '', employeeId: '', branch: 'SBEA', category: 'LOAN', description: '',
    principal: '', dateReleased: '', chequeRef: '', perCutoff: '', status: 'ACTIVE', notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [lr, er] = await Promise.all([fetch('/api/staff-loans'), fetch('/api/payroll/employees')])
      if (lr.ok) setLoans(await lr.json())
      if (er.ok) { const d = await er.json(); setEmps(Array.isArray(d) ? d : d.employees || []) }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const startNew = () => { setEditing(null); setF({ staffName: '', employeeId: '', branch: 'SBEA', category: 'LOAN', description: '', principal: '', dateReleased: '', chequeRef: '', perCutoff: '', status: 'ACTIVE', notes: '' }); setShowForm(true) }
  const startEdit = (l: Loan) => {
    setEditing(l)
    setF({ staffName: l.staffName, employeeId: l.employeeId || '', branch: l.branch || 'SBEA', category: l.category, description: l.description || '', principal: String(l.principal), dateReleased: l.dateReleased ? l.dateReleased.slice(0, 10) : '', chequeRef: l.chequeRef || '', perCutoff: String(l.perCutoff), status: l.status, notes: l.notes || '' })
    setShowForm(true)
  }

  const save = async () => {
    setSaving(true); setError('')
    try {
      const body: Record<string, unknown> = { ...f, principal: Number(f.principal) || 0, perCutoff: Number(f.perCutoff) || 0, employeeId: f.employeeId || null }
      if (editing) body.id = editing.id
      const r = await fetch('/api/staff-loans', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Save failed')
      setShowForm(false); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    setSaving(false)
  }

  const visible = loans.filter(l => showPaid || l.status === 'ACTIVE')
  const totOut = visible.reduce((s, l) => s + (l.status === 'ACTIVE' ? l.balance : 0), 0)
  const totPrincipal = visible.reduce((s, l) => s + Number(l.principal), 0)
  const totRepaid = visible.reduce((s, l) => s + l.repaid, 0)

  const settledN = loans.filter(l => l.status !== 'ACTIVE').length
  const statusPill = (st: string) => st === 'ACTIVE' ? { background: '#fef3c7', color: '#92400e' } : st === 'PAID' ? { background: '#dcfce7', color: '#166534' } : { background: '#f1f5f9', color: '#475569' }

  return (
    <div className="space-y-4">
      {/* Same three totals as before, over the rows shown (active only unless settled are shown) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard compact loading={loading} label="Outstanding" value={peso(totOut)} sub="still to be deducted (active)" tone={totOut > 0.005 ? 'amber' : 'zero'} />
        <StatCard compact loading={loading} label="Released" value={peso(totPrincipal)} sub={`${visible.length} loan${visible.length === 1 ? '' : 's'} / perk${visible.length === 1 ? '' : 's'} shown`} tone="zero" accent={visible.length ? { line: '#4A8073' } : undefined} />
        <StatCard compact loading={loading} label="Repaid via payroll" value={peso(totRepaid)} sub="deducted at cutoffs" tone={totRepaid > 0 ? 'green' : 'zero'} />
        <StatCard compact loading={loading} label="Settled" value={String(settledN)} sub={showPaid ? 'shown in the list · click to hide' : 'hidden · click to show'}
          tone={settledN ? 'blue' : 'zero'} active={showPaid} activeSub="shown in the list · click to hide" onClick={() => setShowPaid(v => !v)} />
      </div>

      <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
          <span className="text-xs min-w-0 flex-1 basis-64" style={{ color: 'var(--mid-gray)' }}>
            Releases debit <b>1160 Due from Employees</b>; each cutoff&apos;s deduction credits it back and is suggested automatically when preparing that branch&apos;s payroll adjustments.
          </span>
          <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border bg-white text-xs font-semibold cursor-pointer select-none whitespace-nowrap" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            <input type="checkbox" checked={showPaid} onChange={e => setShowPaid(e.target.checked)} className="w-3.5 h-3.5 accent-[#4A8073]" /> Show settled
          </label>
          <button onClick={startNew} className={hrBtn.primary} style={{ background: 'var(--teal)' }}>
            <Plus size={14} /> New staff loan / perk
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--hr-head)' }}>
                {['', 'Staff', 'Branch', 'Category', 'Description', 'Released', 'Cheque', 'Principal', 'Per cutoff', 'Repaid', 'Balance', 'Status', ''].map((h, i) => (
                  <th key={i} className={`${TH} ${i >= 7 && i <= 10 ? '!text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? <ShimmerRows cols={13} /> : visible.map(l => (
                <Fragment key={l.id}>
                  <tr className="border-t transition-colors hover:bg-[#fafcf6]" style={{ borderColor: 'var(--hr-line)' }}>
                    <td className="px-2 py-1.5" style={{ boxShadow: `inset 4px 0 0 ${l.status === 'ACTIVE' ? (l.balance > 0.005 ? '#d97706' : '#4A8073') : l.status === 'PAID' ? '#059669' : '#94a3b8'}` }}>
                      <button onClick={() => setOpen(o => { const n = new Set(o); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n })} aria-label={open.has(l.id) ? 'Hide deductions' : 'Show deductions'} className="p-1 rounded hover:bg-[var(--pale-teal)]">
                        {open.has(l.id) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 font-semibold" style={{ color: 'var(--charcoal)' }}>{l.staffName}</td>
                    <td className="px-3 py-1.5">{branchLabel(l.branch)}</td>
                    <td className="px-3 py-1.5">{(CATEGORIES.find(c => c[0] === l.category)?.[1]) || l.category}</td>
                    <td className="px-3 py-1.5" style={{ maxWidth: 220 }} title={l.description || ''}>{(l.description || '').slice(0, 60)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap font-mono" style={{ color: 'var(--mid-gray)' }}>{l.dateReleased ? l.dateReleased.slice(0, 10) : '—'}</td>
                    <td className="px-3 py-1.5">{l.chequeRef || '—'}</td>
                    <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap">{peso(Number(l.principal))}</td>
                    <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap">{Number(l.perCutoff) > 0 ? peso(Number(l.perCutoff)) : '—'}</td>
                    <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap">{peso(l.repaid)}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold whitespace-nowrap" style={{ color: l.balance > 0.005 ? 'var(--charcoal)' : 'var(--teal)' }}>{peso(l.balance)}</td>
                    <td className="px-3 py-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={statusPill(l.status)}>{l.status === 'ACTIVE' ? 'Active' : l.status === 'PAID' ? 'Paid' : l.status === 'WAIVED' ? 'Waived' : l.status}</span>
                    </td>
                    <td className="px-2 py-1.5"><button onClick={() => startEdit(l)} title="Edit" aria-label={`Edit ${l.staffName}`} className="p-1.5 rounded hover:bg-[var(--pale-teal)]"><Pencil size={12} style={{ color: 'var(--teal)' }} /></button></td>
                  </tr>
                  {open.has(l.id) && (
                    <tr>
                      <td colSpan={13} className="px-8 py-2" style={{ background: '#fcfdfa' }}>
                        {l.deductions.length === 0 ? (
                          <div className="text-[11px] italic" style={{ color: 'var(--mid-gray)' }}>No deductions recorded yet.</div>
                        ) : (
                          <table className="text-[11px]">
                            <thead><tr>{['Cutoff', 'Amount', 'Source', 'Ledger'].map(h => <th key={h} className="pr-6 pb-1 text-left font-semibold" style={{ color: 'var(--charcoal)' }}>{h}</th>)}</tr></thead>
                            <tbody>
                              {l.deductions.map(d => (
                                <tr key={d.id}>
                                  <td className="pr-6 py-0.5">{d.cutoffPeriod}</td>
                                  <td className="pr-6 py-0.5 tabular-nums">{peso(Number(d.amount))}</td>
                                  <td className="pr-6 py-0.5">{d.source === 'IMPORT' ? 'monitoring sheet' : d.source === 'PAYROLL' ? 'payroll cutoff' : 'manual'}</td>
                                  <td className="pr-6 py-0.5">{d.journalEntryId ? 'posted' : d.source === 'IMPORT' ? 'in 1160 opening / QB era' : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {l.notes && <div className="mt-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>{l.notes}</div>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!loading && visible.length === 0 && <tr><td colSpan={13} className="px-3 py-12 text-center text-[13px]" style={{ color: 'var(--mid-gray)' }}>{loans.length === 0 ? 'No staff loans recorded.' : 'No active staff loans — tick “Show settled” to see the rest.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="rounded-xl border shadow-xl bg-white p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{editing ? 'Edit' : 'New'} Staff Loan / Perk</h3>
              <button onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            {error && <div className="mb-2 text-xs text-red-600">{error}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-[11px] font-medium mb-1">Employee (links payroll suggestions)</label>
                <select value={f.employeeId} onChange={e => {
                  const emp = emps.find(x => x.id === e.target.value)
                  setF(v => ({ ...v, employeeId: e.target.value, staffName: emp ? `${emp.firstName} ${emp.lastName}` : v.staffName, branch: emp?.branch || v.branch }))
                }} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                  <option value="">— not linked (name only) —</option>
                  {emps.map(e2 => <option key={e2.id} value={e2.id}>{e2.firstName} {e2.lastName} ({branchLabel(e2.branch)})</option>)}
                </select>
              </div>
              <div><label className="block text-[11px] font-medium mb-1">Staff name</label>
                <input value={f.staffName} onChange={e => setF(v => ({ ...v, staffName: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></div>
              <div><label className="block text-[11px] font-medium mb-1">Branch</label>
                <select value={f.branch} onChange={e => setF(v => ({ ...v, branch: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                  {([['SBEA', 'AHEA — Aura Health East'], ['SBGH', 'AHGH — Aura Health Greenhills'], ['VERDANA', 'VER — Verdana']] as const).map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
                </select></div>
              <div><label className="block text-[11px] font-medium mb-1">Category</label>
                <select value={f.category} onChange={e => setF(v => ({ ...v, category: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                  {CATEGORIES.map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
                </select></div>
              <div><label className="block text-[11px] font-medium mb-1">Status</label>
                <select value={f.status} onChange={e => setF(v => ({ ...v, status: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                  {['ACTIVE', 'PAID', 'WAIVED'].map(st => <option key={st} value={st}>{st}</option>)}
                </select></div>
              <div><label className="block text-[11px] font-medium mb-1">Principal (₱)</label>
                <input type="number" value={f.principal} onChange={e => setF(v => ({ ...v, principal: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></div>
              <div><label className="block text-[11px] font-medium mb-1">Deduction per cutoff (₱)</label>
                <input type="number" value={f.perCutoff} onChange={e => setF(v => ({ ...v, perCutoff: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></div>
              <div><label className="block text-[11px] font-medium mb-1">Date released</label>
                <input type="date" value={f.dateReleased} onChange={e => setF(v => ({ ...v, dateReleased: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></div>
              <div><label className="block text-[11px] font-medium mb-1">Cheque no. (if released by cheque)</label>
                <input value={f.chequeRef} onChange={e => setF(v => ({ ...v, chequeRef: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></div>
              <div className="col-span-2"><label className="block text-[11px] font-medium mb-1">Description</label>
                <input value={f.description} onChange={e => setF(v => ({ ...v, description: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></div>
              <div className="col-span-2"><label className="block text-[11px] font-medium mb-1">Notes</label>
                <textarea value={f.notes} onChange={e => setF(v => ({ ...v, notes: e.target.value }))} rows={2} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} /></div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-3 py-2 rounded-lg text-xs border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
                {saving && <Loader2 size={12} className="animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
