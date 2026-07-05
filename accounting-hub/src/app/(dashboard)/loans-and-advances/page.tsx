'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { Landmark, Plus, Loader2, X, Eye, Trash2, Pencil } from 'lucide-react'
import { ScanUpload } from '@/components/ScanUpload'

const ALLOWED = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Bank { id: string; accountNumber: string; accountTitle: string }
interface Acct { id: string; accountNumber: string; accountTitle: string; accountType: string }
interface SH { id: string; shNumber: string; name: string; email: string | null }
interface AdvanceRow {
  id: string; shareholderId: string | null; name: string; dateAcquired: string; advanceType: string; kindType: string | null
  principalAmount: number; hasInterest: boolean; interestMode: string | null; annualPct: number | null; termMonths: number | null
  monthlyAmortization: number | null; computedAnnualPct: number | null; totalInterest: number | null
  proofOfDepositUrls: string[] | null; bankAccountId: string | null; creditAccountId: string | null; interestExpenseAccountId: string | null
  payoutSchedule: string | null; payoutStartMonth: number | null; payoutStartYear: number | null; payoutDay: number | null
  pdcUrls: string[] | null; remarks: string | null
}

export default function LoansAndAdvancesPage() {
  const { data: session, status } = useSession()
  const [tab, setTab] = useState<'advances' | 'loans' | 'creditline' | 'history'>('advances')
  const [rows, setRows] = useState<AdvanceRow[]>([])
  const [shareholders, setShareholders] = useState<SH[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [accts, setAccts] = useState<Acct[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<AdvanceRow | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/loans/advances'); const j = r.ok ? await r.json() : null; setRows(j?.rows || []); setShareholders(j?.shareholders || []) }
    catch { setRows([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { fetch('/api/bank-accounts').then(r => r.ok ? r.json() : []).then(setBanks).catch(() => setBanks([])) }, [])
  useEffect(() => { fetch('/api/chart-of-accounts?pageSize=2000').then(r => r.ok ? r.json() : { data: [] }).then(j => setAccts(((j.data || j.items || j || []) as Acct[]).map(a => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle, accountType: a.accountType })))).catch(() => setAccts([])) }, [])

  if (status === 'unauthenticated') redirect('/login')
  if (status === 'authenticated' && !ALLOWED.includes(session?.user?.role as string)) {
    return <div className="p-8 text-center text-gray-500">Loans &amp; Advances is restricted to the admin, accountant, and bookkeeper.</div>
  }

  const del = async (r: AdvanceRow) => { if (!confirm(`Delete advance from ${r.name}? Its journal entry is reversed.`)) return; await fetch(`/api/loans/advances?id=${r.id}`, { method: 'DELETE' }); load() }
  const acctLabel = (id: string | null) => { const a = accts.find(x => x.id === id) || banks.find(x => x.id === id); return a ? `${a.accountNumber} ${a.accountTitle}` : '—' }

  return (
    <div className="p-6 max-w-screen-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Landmark size={24} className="text-teal-600" />
        <h1 className="text-2xl font-semibold text-gray-900">Loans &amp; Advances</h1>
      </div>

      <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        {([['advances', 'Advances'], ['loans', 'Loans'], ['creditline', 'Credit Line'], ['history', 'Payment History']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)} className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px"
            style={{ borderColor: tab === v ? 'var(--teal)' : 'transparent', color: tab === v ? 'var(--teal)' : 'var(--mid-gray)' }}>{label}</button>
        ))}
      </div>

      {tab === 'advances' && (
        <div className="space-y-3">
          <div className="flex justify-end"><button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> Add Advance</button></div>
          <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs">
              <thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                {['SH #', 'Name', 'Date', 'Type', 'Principal', 'Interest', 'Schedule', 'Bank Debited', 'Proofs', ''].map(h => <th key={h} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={10} className="text-center py-10 text-gray-400"><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
                : rows.map(r => {
                  const sh = shareholders.find(s => s.id === r.shareholderId)
                  return (
                    <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-3 py-2 font-mono">{sh?.shNumber || '—'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{r.name}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{String(r.dateAcquired).slice(0, 10)}</td>
                      <td className="px-3 py-2">{r.advanceType === 'KIND' ? `Kind${r.kindType ? ` · ${r.kindType}` : ''}` : 'Cash'}</td>
                      <td className="px-3 py-2 text-right font-semibold">{peso(r.principalAmount)}</td>
                      <td className="px-3 py-2 text-right">{r.hasInterest ? `${(r.computedAnnualPct || 0).toFixed(2)}% · ${peso(r.totalInterest || 0)}` : '—'}</td>
                      <td className="px-3 py-2">{r.payoutSchedule ? `${r.payoutSchedule.toLowerCase()}${r.payoutStartMonth ? ` from ${MONTHS[r.payoutStartMonth - 1]} ${r.payoutStartYear}` : ''}` : '—'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{acctLabel(r.bankAccountId)}</td>
                      <td className="px-3 py-2"><span className="inline-flex gap-1.5">{(r.proofOfDepositUrls || []).map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}><Eye size={12} /></a>)}</span></td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => setEdit(r)} className="p-1 rounded hover:bg-blue-50"><Pencil size={13} className="text-blue-500" /></button>
                        <button onClick={() => del(r)} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} className="text-red-400" /></button>
                      </td>
                    </tr>
                  )
                })}
                {!loading && rows.length === 0 && <tr><td colSpan={10} className="text-center py-10 text-gray-400">No advances yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'loans' && <div className="rounded-2xl border p-8 text-center text-sm text-gray-400" style={{ borderColor: 'var(--light-gray)' }}>Loans — coming in the next update.</div>}
      {tab === 'creditline' && <div className="rounded-2xl border p-8 text-center text-sm text-gray-400" style={{ borderColor: 'var(--light-gray)' }}>Credit Line — coming in the next update.</div>}
      {tab === 'history' && <div className="rounded-2xl border p-8 text-center text-sm text-gray-400" style={{ borderColor: 'var(--light-gray)' }}>Payment History — coming in the next update.</div>}

      {(showAdd || edit) && <AdvanceModal row={edit} shareholders={shareholders} banks={banks} accts={accts} onClose={() => { setShowAdd(false); setEdit(null) }} onSaved={() => { setShowAdd(false); setEdit(null); load() }} />}
    </div>
  )
}

// Live IRR/amortization preview (mirrors the server helper).
function amortPreview(principal: number, mode: string, annualPct: number, monthly: number, months: number) {
  if (!(principal > 0) || !(months > 0)) return null
  const perMonthPrincipal = principal / months
  let interestPerMonth = 0, totalInterest = 0, amort = 0, effective = 0
  if (mode === 'MONTHLY_AMORT' && monthly > 0) { amort = monthly; interestPerMonth = monthly - perMonthPrincipal; totalInterest = interestPerMonth * months }
  else if (mode === 'ANNUAL_PCT' && annualPct > 0) { totalInterest = principal * (annualPct / 100) * (months / 12); interestPerMonth = totalInterest / months; amort = perMonthPrincipal + interestPerMonth }
  const flat = principal > 0 ? (totalInterest / principal / (months / 12)) * 100 : 0
  // effective annual (IRR) via bisection — shown as the true cost of funds
  if (amort > 0 && amort * months > principal) {
    const pv = (r: number) => r === 0 ? amort * months : amort * (1 - Math.pow(1 + r, -months)) / r
    let lo = 0, hi = 1
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (pv(mid) > principal) lo = mid; else hi = mid }
    effective = (Math.pow(1 + (lo + hi) / 2, 12) - 1) * 100
  }
  return { perMonthPrincipal, interestPerMonth, totalInterest, amort, flat, effective }
}

function AdvanceModal({ row, shareholders, banks, accts, onClose, onSaved }: { row: AdvanceRow | null; shareholders: SH[]; banks: Bank[]; accts: Acct[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    shareholderId: row?.shareholderId || '', name: row?.name || '', dateAcquired: row?.dateAcquired ? String(row.dateAcquired).slice(0, 10) : new Date().toISOString().slice(0, 10),
    advanceType: row?.advanceType || 'CASH', kindType: row?.kindType || '', principalAmount: row ? String(row.principalAmount) : '',
    hasInterest: row?.hasInterest || false, interestMode: row?.interestMode || 'ANNUAL_PCT', annualPct: row?.annualPct ? String(row.annualPct) : '', termMonths: row?.termMonths ? String(row.termMonths) : '',
    monthlyAmortization: row?.monthlyAmortization ? String(row.monthlyAmortization) : '',
    bankAccountId: row?.bankAccountId || '', creditAccountId: row?.creditAccountId || '', interestExpenseAccountId: row?.interestExpenseAccountId || '',
    payoutSchedule: row?.payoutSchedule || '', payoutStartMonth: row?.payoutStartMonth ? String(row.payoutStartMonth) : '', payoutStartYear: row?.payoutStartYear ? String(row.payoutStartYear) : '', payoutDay: row?.payoutDay ? String(row.payoutDay) : '',
    remarks: row?.remarks || '',
  })
  const [proofUrls, setProofUrls] = useState<string[]>(row?.proofOfDepositUrls || [])
  const [pdcUrls, setPdcUrls] = useState<string[]>(row?.pdcUrls || [])
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: unknown) => setF(p => ({ ...p, [k]: v }))
  const n = (v: string) => Number(v) || 0
  const prefix = (f.name || 'ADVANCE').replace(/\s+/g, '_')
  const prev = f.hasInterest ? amortPreview(n(f.principalAmount), f.interestMode, n(f.annualPct), n(f.monthlyAmortization), n(f.termMonths)) : null

  const pickSh = (id: string) => { const sh = shareholders.find(s => s.id === id); setF(p => ({ ...p, shareholderId: id, name: sh ? sh.name : p.name })) }
  const save = async () => {
    if (!f.name.trim() || !(n(f.principalAmount) > 0)) { alert('Enter name and principal amount.'); return }
    setBusy(true)
    try {
      const body = { ...(row ? { id: row.id } : {}), ...f, principalAmount: n(f.principalAmount),
        annualPct: f.annualPct ? n(f.annualPct) : null, termMonths: f.termMonths ? Number(f.termMonths) : null, monthlyAmortization: f.monthlyAmortization ? n(f.monthlyAmortization) : null,
        payoutStartMonth: f.payoutStartMonth ? Number(f.payoutStartMonth) : null, payoutStartYear: f.payoutStartYear ? Number(f.payoutStartYear) : null, payoutDay: f.payoutDay ? Number(f.payoutDay) : null,
        proofOfDepositUrls: proofUrls, pdcUrls }
      const r = await fetch('/api/loans/advances', { method: row ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onSaved()
    } finally { setBusy(false) }
  }

  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'
  const lbl = 'block text-xs font-semibold mb-1'
  const bc = { borderColor: 'var(--light-gray)' }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-gray-900">{row ? 'Edit Advance' : 'Add Advance'}</h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Shareholder</label>
            <select value={f.shareholderId} onChange={e => pickSh(e.target.value)} className={inp} style={bc}><option value="">— None / non-shareholder —</option>{shareholders.map(s => <option key={s.id} value={s.id}>{s.shNumber} — {s.name}</option>)}</select>
          </div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Name</label><input value={f.name} onChange={e => set('name', e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Date Acquired</label><input type="date" value={f.dateAcquired} onChange={e => set('dateAcquired', e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Type of Advance</label><select value={f.advanceType} onChange={e => set('advanceType', e.target.value)} className={inp} style={bc}><option value="CASH">Cash</option><option value="KIND">Kind</option></select></div>
          {f.advanceType === 'KIND' && <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>What kind?</label><input value={f.kindType} onChange={e => set('kindType', e.target.value)} className={inp} style={bc} /></div>}
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Principal Amount</label><input value={f.principalAmount} onChange={e => set('principalAmount', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
        </div>

        {/* Interest */}
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700"><input type="checkbox" checked={f.hasInterest} onChange={e => set('hasInterest', e.target.checked)} /> Has interest?</label>
          {f.hasInterest && (
            <div className="mt-2">
              <div className="flex gap-2 mb-2 text-xs">
                {(['ANNUAL_PCT', 'MONTHLY_AMORT'] as const).map(m => <button key={m} onClick={() => set('interestMode', m)} className="px-3 py-1.5 rounded-lg font-semibold" style={f.interestMode === m ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>{m === 'ANNUAL_PCT' ? 'Annual % + months' : 'Monthly amortization + months'}</button>)}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {f.interestMode === 'ANNUAL_PCT'
                  ? <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Annual %</label><input value={f.annualPct} onChange={e => set('annualPct', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
                  : <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Monthly amortization</label><input value={f.monthlyAmortization} onChange={e => set('monthlyAmortization', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>}
                <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>For how many months</label><input value={f.termMonths} onChange={e => set('termMonths', e.target.value)} inputMode="numeric" className={inp + ' font-mono'} style={bc} /></div>
              </div>
              {prev && <p className="text-[11px] mt-2 font-mono px-2 py-1.5 rounded" style={{ background: '#fff', color: '#334155' }}>≈ {prev.flat.toFixed(2)}% p.a. (flat) · true cost {prev.effective.toFixed(2)}% eff. · monthly {peso(prev.amort)} = principal {peso(prev.perMonthPrincipal)} + interest {peso(prev.interestPerMonth)} · total interest {peso(prev.totalInterest)}</p>}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Bank Account Debited</label><select value={f.bankAccountId} onChange={e => set('bankAccountId', e.target.value)} className={inp} style={bc}><option value="">— Not recorded —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Account to be Credited <span className="font-normal text-gray-400">(principal)</span></label><select value={f.creditAccountId} onChange={e => set('creditAccountId', e.target.value)} className={inp} style={bc}><option value="">— Select —</option>{accts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Account to be Expensed <span className="font-normal text-gray-400">(interest)</span></label><select value={f.interestExpenseAccountId} onChange={e => set('interestExpenseAccountId', e.target.value)} className={inp} style={bc}><option value="">— Select —</option>{accts.filter(a => a.accountType === 'EXPENSE').map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select></div>
        </div>
        {f.bankAccountId && f.creditAccountId && n(f.principalAmount) > 0 && <p className="text-[11px] mt-1 font-mono" style={{ color: '#334155' }}>Release: DR {banks.find(b => b.id === f.bankAccountId)?.accountTitle} {peso(n(f.principalAmount))} / CR {accts.find(a => a.id === f.creditAccountId)?.accountTitle} {peso(n(f.principalAmount))}</p>}

        {/* Payout schedule */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Payout Schedule</label><select value={f.payoutSchedule} onChange={e => set('payoutSchedule', e.target.value)} className={inp} style={bc}><option value="">—</option>{['ANNUALLY', 'BIANNUALLY', 'QUARTERLY', 'MONTHLY'].map(s => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}</select></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Start month</label><select value={f.payoutStartMonth} onChange={e => set('payoutStartMonth', e.target.value)} className={inp} style={bc}><option value="">—</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Start year</label><input value={f.payoutStartYear} onChange={e => set('payoutStartYear', e.target.value)} inputMode="numeric" placeholder="2026" className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Every nth (day)</label><input value={f.payoutDay} onChange={e => set('payoutDay', e.target.value)} inputMode="numeric" placeholder="30" className={inp + ' font-mono'} style={bc} /></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Proof of Deposit</label>
            <div className="flex flex-wrap items-center gap-2">{proofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="advance" prefix={`${prefix}-DEPOSIT`} existingCount={proofUrls.length} label="Add" onUploaded={u => setProofUrls(p => [...p, u])} /></div>
          </div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>PDCs</label>
            <div className="flex flex-wrap items-center gap-2">{pdcUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="advance" prefix={`${prefix}-PDC`} existingCount={pdcUrls.length} label="Add" onUploaded={u => setPdcUrls(p => [...p, u])} /></div>
          </div>
        </div>
        <div className="mt-3"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Remarks</label><input value={f.remarks} onChange={e => set('remarks', e.target.value)} className={inp} style={bc} /></div>

        <button onClick={save} disabled={busy} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} {row ? 'Save changes' : 'Add advance'}</button>
      </div>
    </div>
  )
}
