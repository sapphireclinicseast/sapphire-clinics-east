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

import { useCallback, useEffect, useState } from 'react'
import { Plus, Loader2, X, ChevronDown, ChevronRight, Pencil } from 'lucide-react'

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

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs" style={{ color: 'var(--mid-gray)' }}>
          Releases debit <b>1160 Due from Employees</b>; each cutoff&apos;s deduction credits it back and is suggested automatically when preparing that branch&apos;s payroll adjustments.
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
            <input type="checkbox" checked={showPaid} onChange={e => setShowPaid(e.target.checked)} /> show settled
          </label>
          <button onClick={startNew} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
            <Plus size={13} /> New Staff Loan / Perk
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-3">
        {[['Outstanding', totOut], ['Released', totPrincipal], ['Repaid via payroll', totRepaid]].map(([label, v]) => (
          <div key={label as string} className="rounded-xl border px-4 py-2.5" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{label as string}</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{peso(v as number)}</div>
          </div>
        ))}
      </div>

      {loading ? <div className="py-10 text-center"><Loader2 className="animate-spin inline" size={18} /></div> : (
        <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--light-gray)', background: 'var(--off-white)' }}>
                {['', 'Staff', 'Branch', 'Category', 'Description', 'Released', 'Cheque', 'Principal', 'Per cutoff', 'Repaid', 'Balance', 'Status', ''].map((h, i) => (
                  <th key={i} className={`px-3 py-2 font-semibold ${i >= 7 && i <= 10 ? 'text-right' : 'text-left'}`} style={{ color: 'var(--charcoal)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(l => (
                <>
                  <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6' }} className="hover:bg-gray-50">
                    <td className="px-2 py-1.5">
                      <button onClick={() => setOpen(o => { const n = new Set(o); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n })}>
                        {open.has(l.id) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 font-medium" style={{ color: 'var(--charcoal)' }}>{l.staffName}</td>
                    <td className="px-3 py-1.5">{branchLabel(l.branch)}</td>
                    <td className="px-3 py-1.5">{(CATEGORIES.find(c => c[0] === l.category)?.[1]) || l.category}</td>
                    <td className="px-3 py-1.5" style={{ maxWidth: 220 }} title={l.description || ''}>{(l.description || '').slice(0, 60)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{l.dateReleased ? l.dateReleased.slice(0, 10) : '—'}</td>
                    <td className="px-3 py-1.5">{l.chequeRef || '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{peso(Number(l.principal))}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{Number(l.perCutoff) > 0 ? peso(Number(l.perCutoff)) : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{peso(l.repaid)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold" style={{ color: l.balance > 0.005 ? 'var(--charcoal)' : 'var(--teal)' }}>{peso(l.balance)}</td>
                    <td className="px-3 py-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{
                        background: l.status === 'ACTIVE' ? '#ecfdf5' : l.status === 'PAID' ? '#eff6ff' : '#f9fafb',
                        color: l.status === 'ACTIVE' ? '#047857' : l.status === 'PAID' ? '#1d4ed8' : '#6b7280',
                      }}>{l.status}</span>
                    </td>
                    <td className="px-2 py-1.5"><button onClick={() => startEdit(l)} title="Edit"><Pencil size={12} /></button></td>
                  </tr>
                  {open.has(l.id) && (
                    <tr key={`${l.id}-d`}>
                      <td colSpan={13} className="px-8 py-2" style={{ background: 'var(--off-white)' }}>
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
                </>
              ))}
              {visible.length === 0 && <tr><td colSpan={13} className="px-3 py-6 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>No staff loans recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="rounded-2xl bg-white p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto">
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
