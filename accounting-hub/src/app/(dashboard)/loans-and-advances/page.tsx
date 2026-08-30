'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { Landmark, Plus, Loader2, X, Eye, Trash2, Pencil } from 'lucide-react'
import { ScanUpload } from '@/components/ScanUpload'
import { useResizableColumns, ResizableColgroup, ColResizeHandle } from '@/components/useResizableColumns'
import StaffLoansTab from './StaffLoansTab'

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
  payoutSchedule: string | null; payoutStartMonth: number | null; payoutStartYear: number | null; payoutDay: number | null; payoutAmountPerPeriod: number | null; repaymentMode: string | null; principalPerPeriod: number | null; paymentBankAccountId: string | null
  pdcUrls: string[] | null; remarks: string | null
  branchAllocations: BranchAlloc[] | null
  paidPrincipal?: number
}

export default function LoansAndAdvancesPage() {
  const { data: session, status } = useSession()
  const [tab, setTab] = useState<'advances' | 'loans' | 'creditline' | 'staff' | 'history'>('advances')
  const advTableRef = useRef<HTMLTableElement>(null)
  const advRz = useResizableColumns('loans-advances-list', advTableRef)
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

      <NearDuePaymentsPopup onGoToHistory={() => setTab('history')} />

      <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        {([['advances', 'Advances'], ['loans', 'Loans'], ['creditline', 'Credit Line'], ['staff', 'Staff Loans & Perks'], ['history', 'Payment History']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)} className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px"
            style={{ borderColor: tab === v ? 'var(--teal)' : 'transparent', color: tab === v ? 'var(--teal)' : 'var(--mid-gray)' }}>{label}</button>
        ))}
      </div>

      {tab === 'advances' && (
        <div className="space-y-3">
          <div className="flex justify-end"><button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> Add Advance</button></div>
          <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            <table ref={advTableRef} className="w-full text-xs" style={advRz.tableStyle}>
              <ResizableColgroup rz={advRz} />
              <thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                {['SH #', 'Name', 'Date', 'Type', 'Principal', 'Branch', 'Interest', 'Schedule', 'Bank Debited', 'Proofs', ''].map((h, i) => <th key={h} className="px-3 py-2.5 font-semibold whitespace-nowrap relative">{h}<ColResizeHandle rz={advRz} index={i} /></th>)}
              </tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={11} className="text-center py-10 text-gray-400"><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
                : rows.map(r => {
                  const sh = shareholders.find(s => s.id === r.shareholderId)
                  return (
                    <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-3 py-2 font-mono">{sh?.shNumber || '—'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{r.name}{(r.paidPrincipal || 0) >= r.principalAmount - 0.005 && <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap" style={{ background: '#dcfce7', color: '#166534' }}>Fully paid ✓</span>}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{String(r.dateAcquired).slice(0, 10)}</td>
                      <td className="px-3 py-2">{r.advanceType === 'KIND' ? `Kind${r.kindType ? ` · ${r.kindType}` : ''}` : 'Cash'}</td>
                      <td className="px-3 py-2 text-right font-semibold">{peso(r.principalAmount)}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{(r.branchAllocations || []).length
                        ? (r.branchAllocations || []).map(a => (r.branchAllocations || []).length === 1 ? allocLabel(a.branch) : `${allocLabel(a.branch)} ${peso(a.amount)}`).join(' · ')
                        : 'Company-wide'}</td>
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

      {tab === 'loans' && <LoansTab shareholders={shareholders} banks={banks} accts={accts} />}
      {tab === 'creditline' && <CreditLineTab shareholders={shareholders} banks={banks} accts={accts} />}
      {tab === 'staff' && <StaffLoansTab />}
      {tab === 'history' && <PaymentHistoryTab banks={banks} accts={accts} />}

      {(showAdd || edit) && <AdvanceModal row={edit} shareholders={shareholders} banks={banks} accts={accts} onClose={() => { setShowAdd(false); setEdit(null) }} onSaved={() => { setShowAdd(false); setEdit(null); load() }} />}
    </div>
  )
}

// Payment-frequency helpers: the amortization "term" is expressed in the payout
// frequency's periods (months / quarters / half-years / years), converted to months
// (periods × step) for storage so the payment schedule generates one payment per period.
const SCHED_STEP: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, BIANNUALLY: 6, ANNUALLY: 12 }
const stepMonths = (s: string) => SCHED_STEP[s] || 1
const PERIOD_ADJ: Record<string, string> = { MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', BIANNUALLY: 'Biannual', ANNUALLY: 'Annual' }
const PERIOD_PLURAL: Record<string, string> = { MONTHLY: 'months', QUARTERLY: 'quarters', BIANNUALLY: 'half-years', ANNUALLY: 'years' }
const periodAdj = (s: string) => PERIOD_ADJ[s] || 'Monthly'
const periodPlural = (s: string) => PERIOD_PLURAL[s] || 'months'

// Live IRR/amortization preview (mirrors the server helper). "perPeriod" values are
// per payment period at the chosen frequency; step = months per period.
function amortPreview(principal: number, mode: string, annualPct: number, perPeriodAmort: number, numPeriods: number, step: number) {
  if (!(principal > 0) || !(numPeriods > 0)) return null
  const horizonMonths = numPeriods * step
  const perPeriodPrincipal = principal / numPeriods
  let interestPerPeriod = 0, totalInterest = 0, amort = 0, effective = 0
  if (mode === 'MONTHLY_AMORT' && perPeriodAmort > 0) { amort = perPeriodAmort; interestPerPeriod = perPeriodAmort - perPeriodPrincipal; totalInterest = interestPerPeriod * numPeriods }
  else if (mode === 'ANNUAL_PCT' && annualPct > 0) { totalInterest = principal * (annualPct / 100) * (horizonMonths / 12); interestPerPeriod = totalInterest / numPeriods; amort = perPeriodPrincipal + interestPerPeriod }
  const flat = horizonMonths > 0 ? (totalInterest / principal / (horizonMonths / 12)) * 100 : 0
  // effective annual (IRR) via bisection — shown as the true cost of funds
  if (amort > 0 && amort * numPeriods > principal) {
    const pv = (r: number) => r === 0 ? amort * numPeriods : amort * (1 - Math.pow(1 + r, -numPeriods)) / r
    let lo = 0, hi = 1
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (pv(mid) > principal) lo = mid; else hi = mid }
    effective = (Math.pow(1 + (lo + hi) / 2, 12 / step) - 1) * 100
  }
  return { perPeriodPrincipal, interestPerPeriod, totalInterest, amort, flat, effective }
}

function AdvanceModal({ row, shareholders, banks, accts, onClose, onSaved }: { row: AdvanceRow | null; shareholders: SH[]; banks: Bank[]; accts: Acct[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    shareholderId: row?.shareholderId || '', name: row?.name || '', dateAcquired: row?.dateAcquired ? String(row.dateAcquired).slice(0, 10) : new Date().toISOString().slice(0, 10),
    advanceType: row?.advanceType || 'CASH', kindType: row?.kindType || '', principalAmount: row ? String(row.principalAmount) : '',
    hasInterest: row?.hasInterest || false, interestMode: row?.interestMode || 'ANNUAL_PCT', annualPct: row?.annualPct ? String(row.annualPct) : '', termMonths: row?.termMonths ? String(row.termMonths / stepMonths(row?.payoutSchedule || '')) : '',
    monthlyAmortization: row?.monthlyAmortization ? String(row.monthlyAmortization) : '',
    bankAccountId: row?.bankAccountId || '', creditAccountId: row?.creditAccountId || '', interestExpenseAccountId: row?.interestExpenseAccountId || '',
    payoutSchedule: row?.payoutSchedule || '', payoutStartMonth: row?.payoutStartMonth ? String(row.payoutStartMonth) : '', payoutStartYear: row?.payoutStartYear ? String(row.payoutStartYear) : '', payoutDay: row?.payoutDay ? String(row.payoutDay) : '',
    payoutAmountPerPeriod: row?.payoutAmountPerPeriod != null ? String(row.payoutAmountPerPeriod) : '', repaymentMode: row?.repaymentMode || '',
    principalPerPeriod: row?.principalPerPeriod != null ? String(row.principalPerPeriod) : '', paymentBankAccountId: row?.paymentBankAccountId || '',
    remarks: row?.remarks || '',
  })
  const [proofUrls, setProofUrls] = useState<string[]>(row?.proofOfDepositUrls || [])
  const [pdcUrls, setPdcUrls] = useState<string[]>(row?.pdcUrls || [])
  const [busy, setBusy] = useState(false)
  // "Fully Paid" — settle whatever principal is still outstanding in one payment
  // (DR advances liability / CR bank) recorded as a PAID payout with its proof.
  const paidPrincipal = row?.paidPrincipal || 0
  const remaining = row ? Math.max(0, Math.round((row.principalAmount - paidPrincipal) * 100) / 100) : 0
  const settled = !!row && remaining <= 0.005
  const [fp, setFp] = useState({ on: false, paidDate: new Date().toISOString().slice(0, 10), bankAccountId: row?.paymentBankAccountId || row?.bankAccountId || '', memo: '' })
  const [fpProofs, setFpProofs] = useState<string[]>([])
  // Branch allocation: ticked branches → entered amount (a single tick takes the whole principal)
  const [allocs, setAllocs] = useState<Record<string, string>>(() => Object.fromEntries((row?.branchAllocations || []).map(a => [a.branch, String(a.amount)])))
  const toggleAlloc = (code: string) => setAllocs(p => { const q = { ...p }; if (code in q) delete q[code]; else q[code] = ''; return q })
  const set = (k: string, v: unknown) => setF(p => ({ ...p, [k]: v }))
  const n = (v: string) => Number(v) || 0
  const prefix = (f.name || 'ADVANCE').replace(/\s+/g, '_')
  const prev = f.hasInterest ? amortPreview(n(f.principalAmount), f.interestMode, n(f.annualPct), n(f.monthlyAmortization), n(f.termMonths), stepMonths(f.payoutSchedule)) : null

  const pickSh = (id: string) => { const sh = shareholders.find(s => s.id === id); setF(p => ({ ...p, shareholderId: id, name: sh ? sh.name : p.name })) }
  const allocBranches = Object.keys(allocs)
  const allocSum = allocBranches.reduce((sm, b2) => sm + n(allocs[b2]), 0)
  const allocBalanced = allocBranches.length <= 1 || Math.abs(allocSum - n(f.principalAmount)) <= 0.01

  const save = async () => {
    if (!f.name.trim() || !(n(f.principalAmount) > 0)) { alert('Enter name and principal amount.'); return }
    if (allocBranches.length > 1 && !allocBalanced) { alert('The branch allocation amounts must add up to the principal.'); return }
    if (fp.on && row && !settled && !fp.bankAccountId) { alert('Pick the bank account the settlement was paid from.'); return }
    setBusy(true)
    try {
      const body = { ...(row ? { id: row.id } : {}), ...f, principalAmount: n(f.principalAmount),
        annualPct: f.annualPct ? n(f.annualPct) : null, termMonths: f.termMonths ? Number(f.termMonths) * stepMonths(f.payoutSchedule) : null, monthlyAmortization: f.monthlyAmortization ? n(f.monthlyAmortization) : null,
        payoutStartMonth: f.payoutStartMonth ? Number(f.payoutStartMonth) : null, payoutStartYear: f.payoutStartYear ? Number(f.payoutStartYear) : null, payoutDay: f.payoutDay ? Number(f.payoutDay) : null,
        proofOfDepositUrls: proofUrls, pdcUrls,
        branchAllocations: allocBranches.map(b2 => ({ branch: b2, amount: allocBranches.length === 1 ? n(f.principalAmount) : n(allocs[b2]) })) }
      const r = await fetch('/api/loans/advances', { method: row ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      if (fp.on && row && !settled) {
        const rs = await fetch('/api/loans/advances/settle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, paidDate: fp.paidDate, bankAccountId: fp.bankAccountId, proofUrls: fpProofs, memo: fp.memo }) })
        if (!rs.ok) { alert((await rs.json()).error || 'The advance saved, but the settlement failed.'); return }
      }
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
                {(['ANNUAL_PCT', 'MONTHLY_AMORT'] as const).map(m => <button key={m} onClick={() => set('interestMode', m)} className="px-3 py-1.5 rounded-lg font-semibold" style={f.interestMode === m ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>{m === 'ANNUAL_PCT' ? `Annual % + ${periodPlural(f.payoutSchedule)}` : `${periodAdj(f.payoutSchedule)} amortization + ${periodPlural(f.payoutSchedule)}`}</button>)}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {f.interestMode === 'ANNUAL_PCT'
                  ? <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Annual %</label><input value={f.annualPct} onChange={e => set('annualPct', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
                  : <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>{periodAdj(f.payoutSchedule)} amortization</label><input value={f.monthlyAmortization} onChange={e => set('monthlyAmortization', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>}
                <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>For how many {periodPlural(f.payoutSchedule)}</label><input value={f.termMonths} onChange={e => set('termMonths', e.target.value)} inputMode="numeric" className={inp + ' font-mono'} style={bc} /></div>
              </div>
              {prev && <p className="text-[11px] mt-2 font-mono px-2 py-1.5 rounded" style={{ background: '#fff', color: '#334155' }}>≈ {prev.flat.toFixed(2)}% p.a. (flat) · true cost {prev.effective.toFixed(2)}% eff. · {periodAdj(f.payoutSchedule).toLowerCase()} {peso(prev.amort)} = principal {peso(prev.perPeriodPrincipal)} + interest {peso(prev.interestPerPeriod)} · total interest {peso(prev.totalInterest)}</p>}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Bank Account Debited <span className="font-normal text-gray-400">(release received here)</span></label><select value={f.bankAccountId} onChange={e => set('bankAccountId', e.target.value)} className={inp} style={bc}><option value="">— Not recorded —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Account to be Credited <span className="font-normal text-gray-400">(principal)</span></label><select value={f.creditAccountId} onChange={e => set('creditAccountId', e.target.value)} className={inp} style={bc}><option value="">— Select —</option>{accts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Account to be Expensed <span className="font-normal text-gray-400">(interest)</span></label><select value={f.interestExpenseAccountId} onChange={e => set('interestExpenseAccountId', e.target.value)} className={inp} style={bc}><option value="">— Select —</option>{accts.filter(a => a.accountType === 'EXPENSE').map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select></div>
        </div>
        {f.bankAccountId && f.creditAccountId && n(f.principalAmount) > 0 && <p className="text-[11px] mt-1 font-mono" style={{ color: '#334155' }}>Release: DR {banks.find(b => b.id === f.bankAccountId)?.accountTitle} {peso(n(f.principalAmount))} / CR {accts.find(a => a.id === f.creditAccountId)?.accountTitle} {peso(n(f.principalAmount))}</p>}

        {/* Payout schedule */}
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <p className="text-sm font-semibold text-gray-700 mb-2">Payment schedule <span className="font-normal text-gray-400">(drives the Payment History table)</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Frequency</label><select value={f.payoutSchedule} onChange={e => set('payoutSchedule', e.target.value)} className={inp} style={bc}><option value="">—</option>{['ANNUALLY', 'BIANNUALLY', 'QUARTERLY', 'MONTHLY'].map(s => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}</select></div>
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Start month</label><select value={f.payoutStartMonth} onChange={e => set('payoutStartMonth', e.target.value)} className={inp} style={bc}><option value="">—</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Start year</label><input value={f.payoutStartYear} onChange={e => set('payoutStartYear', e.target.value)} inputMode="numeric" placeholder="2026" className={inp + ' font-mono'} style={bc} /></div>
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Every nth (day)</label><input value={f.payoutDay} onChange={e => set('payoutDay', e.target.value)} inputMode="numeric" placeholder="30" className={inp + ' font-mono'} style={bc} /></div>
            {/* With interest the term lives in the interest box above; without it, capture it here so the schedule still generates. */}
            {!f.hasInterest && <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>For how many {periodPlural(f.payoutSchedule)}</label><input value={f.termMonths} onChange={e => set('termMonths', e.target.value)} inputMode="numeric" className={inp + ' font-mono'} style={bc} /></div>}
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Repayment</label><select value={f.repaymentMode} onChange={e => set('repaymentMode', e.target.value)} className={inp} style={bc}><option value="">Amortizing (default)</option><option value="AMORTIZING">Amortizing (principal + interest)</option><option value="INTEREST_ONLY">Interest-only (principal at maturity)</option></select></div>
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Amount per period <span className="font-normal text-gray-400">(optional)</span></label><input value={f.payoutAmountPerPeriod} onChange={e => set('payoutAmountPerPeriod', e.target.value)} inputMode="decimal" placeholder="auto" className={inp + ' font-mono'} style={bc} /></div>
            {f.repaymentMode !== 'INTEREST_ONLY' && <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Principal per period <span className="font-normal text-gray-400">(interest = rest)</span></label><input value={f.principalPerPeriod} onChange={e => set('principalPerPeriod', e.target.value)} inputMode="decimal" placeholder="auto" className={inp + ' font-mono'} style={bc} /></div>}
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Bank for payments <span className="font-normal text-gray-400">(credited)</span></label><select value={f.paymentBankAccountId} onChange={e => set('paymentBankAccountId', e.target.value)} className={inp} style={bc}><option value="">— same as debited —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select></div>
          </div>
          {(() => {
            const step = f.payoutSchedule === 'MONTHLY' ? 1 : f.payoutSchedule === 'QUARTERLY' ? 3 : f.payoutSchedule === 'BIANNUALLY' ? 6 : f.payoutSchedule === 'ANNUALLY' ? 12 : 0
            const per = n(f.payoutAmountPerPeriod)
            // f.termMonths holds PERIODS here (converted to months only on save);
            // no term → derive the count from the per-period amount, like the server.
            const count = n(f.termMonths) > 0 ? Math.max(1, Math.round(n(f.termMonths))) : per > 0 && n(f.principalAmount) > 0 ? Math.ceil(n(f.principalAmount) / per) : 0
            if (!step || !count) return null
            if (f.repaymentMode === 'INTEREST_ONLY') return <p className="text-[11px] mt-2 font-mono" style={{ color: '#334155' }}>{count} payment{count === 1 ? '' : 's'} of {per > 0 ? peso(per) : 'derived'} interest + {peso(n(f.principalAmount))} principal on the last</p>
            const prin = n(f.principalPerPeriod) > 0 ? n(f.principalPerPeriod) : !f.hasInterest && per > 0 ? per : n(f.principalAmount) / count
            const int = f.hasInterest && per > 0 ? Math.max(0, per - prin) : null
            return <p className="text-[11px] mt-2 font-mono" style={{ color: '#334155' }}>{count} payment{count === 1 ? '' : 's'} · principal {peso(prin)}{int != null ? ` + interest ${peso(int)} = ${peso(prin + int)} each` : f.hasInterest ? ' + interest (auto-derived)' : ' each (no interest)'}</p>
          })()}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Proof of Deposit</label>
            <div className="flex flex-wrap items-center gap-2">{proofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="advance" prefix={`${prefix}-DEPOSIT`} existingCount={proofUrls.length} label="Add" onUploaded={u => setProofUrls(p => [...p, u])} /></div>
          </div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>PDCs</label>
            <div className="flex flex-wrap items-center gap-2">{pdcUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="advance" prefix={`${prefix}-PDC`} existingCount={pdcUrls.length} label="Add" onUploaded={u => setPdcUrls(p => [...p, u])} /></div>
          </div>
        </div>

        {/* Fully Paid — settles the remaining principal in one payment and clears the advances liability */}
        {row && (
          <div className="mt-3 rounded-xl border p-3" style={settled ? { borderColor: '#bbf7d0', background: '#f0fdf4' } : { borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            {settled ? (
              <p className="text-sm font-semibold" style={{ color: '#166534' }}>✓ Fully paid — the recorded payments cover the whole principal ({peso(row.principalAmount)}).</p>
            ) : (
              <>
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700"><input type="checkbox" checked={fp.on} onChange={e => setFp(p => ({ ...p, on: e.target.checked }))} /> Fully Paid <span className="font-normal text-gray-400">— settle the remaining {peso(remaining)} and clear it from the advances liability</span></label>
                {fp.on && (
                  <div className="mt-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Date paid</label><input type="date" value={fp.paidDate} onChange={e => setFp(p => ({ ...p, paidDate: e.target.value }))} className={inp} style={bc} /></div>
                      <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Paid from bank <span className="font-normal text-gray-400">(credited — matches bank history)</span></label><select value={fp.bankAccountId} onChange={e => setFp(p => ({ ...p, bankAccountId: e.target.value }))} className={inp} style={bc}><option value="">— Select —</option>{banks.map(b2 => <option key={b2.id} value={b2.id}>{b2.accountNumber} — {b2.accountTitle}</option>)}</select></div>
                      <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Proof of payment</label>
                        <div className="flex flex-wrap items-center gap-2">{fpProofs.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="advance" prefix={`${prefix}-FULLYPAID`} existingCount={fpProofs.length} label="Add" onUploaded={u => setFpProofs(p => [...p, u])} /></div>
                      </div>
                      <div className="col-span-2 sm:col-span-3"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Memo <span className="font-normal text-gray-400">(optional — reads in the books)</span></label><input value={fp.memo} onChange={e => setFp(p => ({ ...p, memo: e.target.value }))} className={inp} style={bc} /></div>
                    </div>
                    {f.creditAccountId && fp.bankAccountId && <p className="text-[11px] mt-2 font-mono" style={{ color: '#334155' }}>On save: DR {accts.find(a2 => a2.id === f.creditAccountId)?.accountTitle} {peso(remaining)} / CR {banks.find(b2 => b2.id === fp.bankAccountId)?.accountTitle} {peso(remaining)}</p>}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {/* Branch allocation — where the interest expense is booked */}
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <p className="text-sm font-semibold text-gray-700">For which branch? <span className="font-normal text-gray-400">(the interest expense follows this on the branch income statements)</span></p>
          <div className="flex flex-wrap gap-4 mt-2">
            {ALLOC_BRANCHES.map(([code, label]) => (
              <label key={code} className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={code in allocs} onChange={() => toggleAlloc(code)} /> {label}
              </label>
            ))}
          </div>
          {allocBranches.length === 0 && <p className="text-[11px] mt-2" style={{ color: 'var(--mid-gray)' }}>None ticked — the advance stays company-wide (interest shows only in the All Branches view).</p>}
          {allocBranches.length === 1 && <p className="text-[11px] mt-2" style={{ color: 'var(--mid-gray)' }}>Whole advance on <strong>{allocLabel(allocBranches[0])}</strong> — its payments and interest are booked on that branch.</p>}
          {allocBranches.length > 1 && (
            <div className="mt-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {allocBranches.map(code => (
                  <div key={code}><label className="block text-[10px] font-semibold" style={{ color: 'var(--mid-gray)' }}>{allocLabel(code)} amount</label>
                    <input value={allocs[code]} onChange={e => setAllocs(pr => ({ ...pr, [code]: e.target.value }))} inputMode="decimal" placeholder="0.00" className="w-full px-2 py-1.5 rounded-lg border text-xs font-mono" style={bc} />
                  </div>
                ))}
              </div>
              <p className="text-[11px] mt-2 font-mono" style={{ color: allocBalanced ? '#334155' : '#b91c1c' }}>
                Allocated {peso(allocSum)} of {peso(n(f.principalAmount))}{allocBalanced ? ' \u2713' : ` — ${allocSum > n(f.principalAmount) ? 'over' : 'short'} by ${peso(Math.abs(n(f.principalAmount) - allocSum))}`}
              </p>
            </div>
          )}
        </div>
        <div className="mt-3"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Remarks</label><input value={f.remarks} onChange={e => set('remarks', e.target.value)} className={inp} style={bc} /></div>

        <button onClick={save} disabled={busy} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} {row ? 'Save changes' : 'Add advance'}</button>
      </div>
    </div>
  )
}

// ── Loans ─────────────────────────────────────────────────────
// Branch allocation: which branch(es) a loan funds — drives where the interest
// expense lands on the branch income statements.
const ALLOC_BRANCHES: [code: string, label: string][] = [
  ['SANDBOX_EAST', 'East'],
  ['SANDBOX_GREENHILLS', 'Greenhills'],
  ['VERDANA_STORE', 'Verdana'],
  ['AURA_INSTITUTE', 'Institute'],
]
const allocLabel = (code: string) => ALLOC_BRANCHES.find(([c]) => c === code)?.[1] || code
interface BranchAlloc { branch: string; amount: number }
interface LoanCharge { id?: string; date: string; description: string; registeredName: string; vatable: string; amount: string; siNumber: string; chargeAccountId: string; deductedFromDebit: boolean; proofUrls: string[] }
interface LoanRow {
  id: string; loanEntity: string; shareholderId: string | null; entityName: string | null; name: string; dateAcquired: string; loanType: string; kindType: string | null
  principalAmount: number; hasInterest: boolean; interestMode: string | null; annualPct: number | null; termMonths: number | null
  monthlyAmortization: number | null; computedAnnualPct: number | null; totalInterest: number | null; maturityDate: string | null
  proofOfDepositUrls: string[] | null; bankAccountId: string | null; creditAccountId: string | null; interestExpenseAccountId: string | null
  payoutSchedule: string | null; payoutStartMonth: number | null; payoutStartYear: number | null; payoutDay: number | null; payoutAmountPerPeriod: number | null; repaymentMode: string | null; principalPerPeriod: number | null; paymentBankAccountId: string | null
  loanAgreementUrls: string[] | null; pdcUrls: string[] | null; netAmountToDebit: number | null; remarks: string | null; fromCreditLineId: string | null
  branchAllocations: BranchAlloc[] | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  charges: any[]
}

function LoansTab({ shareholders, banks, accts }: { shareholders: SH[]; banks: Bank[]; accts: Acct[] }) {
  const [rows, setRows] = useState<LoanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<LoanRow | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const load = useCallback(async () => { setLoading(true); try { const r = await fetch('/api/loans/loans'); const j = r.ok ? await r.json() : null; setRows(j?.rows || []) } catch { setRows([]) } finally { setLoading(false) } }, [])
  useEffect(() => { load() }, [load])
  const del = async (r: LoanRow) => { if (!confirm(`Delete loan from ${r.name}? Its journal entry is reversed.`)) return; await fetch(`/api/loans/loans?id=${r.id}`, { method: 'DELETE' }); load() }
  const acctLabel = (id: string | null) => { const a = accts.find(x => x.id === id) || banks.find(x => x.id === id); return a ? `${a.accountNumber} ${a.accountTitle}` : '—' }
  const entityLabel = (r: LoanRow) => r.loanEntity === 'SHAREHOLDER' ? 'Shareholder' : r.loanEntity === 'BANK' ? 'Bank' : r.loanEntity === 'INDIVIDUAL' ? 'Individual' : 'Other'
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> Add Loan</button></div>
      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-xs"><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
          {['Entity', 'Name', 'Date', 'Type', 'Branches', 'Principal', 'Interest / Coupon', 'Net Debit', 'Schedule', 'Bank', 'Agreement', ''].map(h => <th key={h} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}
        </tr></thead><tbody>
          {loading ? <tr><td colSpan={12} className="text-center py-10 text-gray-400"><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
          : rows.map(r => (
            <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
              <td className="px-3 py-2">{entityLabel(r)}</td>
              <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{r.name}</td>
              <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{String(r.dateAcquired).slice(0, 10)}</td>
              <td className="px-3 py-2">{r.loanType === 'CORPORATE_BOND' ? 'Corp. Bond' : r.loanType === 'KIND' ? `Kind${r.kindType ? ` · ${r.kindType}` : ''}` : 'Cash'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{(r.branchAllocations || []).length
                ? (r.branchAllocations || []).map(a => (r.branchAllocations || []).length === 1 ? allocLabel(a.branch) : `${allocLabel(a.branch)} ${peso(a.amount)}`).join(' · ')
                : <span style={{ color: 'var(--mid-gray)' }}>Company-wide</span>}</td>
              <td className="px-3 py-2 text-right font-semibold">{peso(r.principalAmount)}</td>
              <td className="px-3 py-2 text-right">{r.loanType === 'CORPORATE_BOND' ? (r.annualPct != null ? `${r.annualPct}% coupon` : '—') : r.hasInterest ? `${(r.computedAnnualPct || 0).toFixed(2)}% · ${peso(r.totalInterest || 0)}` : '—'}</td>
              <td className="px-3 py-2 text-right">{r.netAmountToDebit != null ? peso(r.netAmountToDebit) : peso(r.principalAmount)}</td>
              <td className="px-3 py-2">{r.loanType === 'CORPORATE_BOND' ? (r.maturityDate ? `matures ${String(r.maturityDate).slice(0, 10)}` : '—') : r.payoutSchedule ? `${r.payoutSchedule.toLowerCase()}${r.payoutStartMonth ? ` from ${MONTHS[r.payoutStartMonth - 1]} ${r.payoutStartYear}` : ''}` : '—'}</td>
              <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{acctLabel(r.bankAccountId)}</td>
              <td className="px-3 py-2"><span className="inline-flex gap-1.5">{(r.loanAgreementUrls || []).map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}><Eye size={12} /></a>)}{(!r.loanAgreementUrls || r.loanAgreementUrls.length === 0) && <span style={{ color: 'var(--mid-gray)' }}>—</span>}</span></td>
              <td className="px-3 py-2 text-right whitespace-nowrap"><button onClick={() => setEdit(r)} className="p-1 rounded hover:bg-blue-50"><Pencil size={13} className="text-blue-500" /></button><button onClick={() => del(r)} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} className="text-red-400" /></button></td>
            </tr>
          ))}
          {!loading && rows.length === 0 && <tr><td colSpan={12} className="text-center py-10 text-gray-400">No loans yet.</td></tr>}
        </tbody></table>
      </div>
      {(showAdd || edit) && <LoanModal row={edit} shareholders={shareholders} banks={banks} accts={accts} onClose={() => { setShowAdd(false); setEdit(null) }} onSaved={() => { setShowAdd(false); setEdit(null); load() }} />}
    </div>
  )
}

function LoanModal({ row, shareholders, banks, accts, onClose, onSaved, preset }: { row: LoanRow | null; shareholders: SH[]; banks: Bank[]; accts: Acct[]; onClose: () => void; onSaved: () => void; preset?: { fromCreditLineId: string; entityName: string; annualPct: number | null } }) {
  const [f, setF] = useState({
    loanEntity: row?.loanEntity || (preset ? 'OTHER' : 'BANK'), shareholderId: row?.shareholderId || '', entityName: row?.entityName || preset?.entityName || '', name: row?.name || preset?.entityName || '',
    dateAcquired: row?.dateAcquired ? String(row.dateAcquired).slice(0, 10) : new Date().toISOString().slice(0, 10),
    loanType: row?.loanType || 'CASH', kindType: row?.kindType || '', principalAmount: row ? String(row.principalAmount) : '',
    hasInterest: row?.hasInterest ?? (preset ? (preset.annualPct != null && preset.annualPct > 0) : false), interestMode: row?.interestMode || 'ANNUAL_PCT', annualPct: row?.annualPct != null ? String(row.annualPct) : (preset?.annualPct != null ? String(preset.annualPct) : ''), termMonths: row?.termMonths ? String(row.termMonths / stepMonths(row?.payoutSchedule || '')) : '',
    monthlyAmortization: row?.monthlyAmortization ? String(row.monthlyAmortization) : '', maturityDate: row?.maturityDate ? String(row.maturityDate).slice(0, 10) : '',
    bankAccountId: row?.bankAccountId || '', creditAccountId: row?.creditAccountId || '', interestExpenseAccountId: row?.interestExpenseAccountId || '',
    payoutSchedule: row?.payoutSchedule || '', payoutStartMonth: row?.payoutStartMonth ? String(row.payoutStartMonth) : '', payoutStartYear: row?.payoutStartYear ? String(row.payoutStartYear) : '', payoutDay: row?.payoutDay ? String(row.payoutDay) : '',
    payoutAmountPerPeriod: row?.payoutAmountPerPeriod != null ? String(row.payoutAmountPerPeriod) : '', repaymentMode: row?.repaymentMode || '',
    principalPerPeriod: row?.principalPerPeriod != null ? String(row.principalPerPeriod) : '', paymentBankAccountId: row?.paymentBankAccountId || '',
    remarks: row?.remarks || '',
  })
  const [proofUrls, setProofUrls] = useState<string[]>(row?.proofOfDepositUrls || [])
  const [pdcUrls, setPdcUrls] = useState<string[]>(row?.pdcUrls || [])
  const [agreementUrls, setAgreementUrls] = useState<string[]>(row?.loanAgreementUrls || [])
  // Branch allocation: ticked branches → entered amount (single tick = full principal automatically)
  const [allocs, setAllocs] = useState<Record<string, string>>(() => Object.fromEntries((row?.branchAllocations || []).map(a => [a.branch, String(a.amount)])))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [charges, setCharges] = useState<LoanCharge[]>(() => (row?.charges || []).map((c: any) => ({ id: c.id, date: c.date ? String(c.date).slice(0, 10) : '', description: c.description || '', registeredName: c.registeredName || '', vatable: c.vatable || '', amount: c.amount != null ? String(c.amount) : '', siNumber: c.siNumber || '', chargeAccountId: c.chargeAccountId || '', deductedFromDebit: !!c.deductedFromDebit, proofUrls: c.proofUrls || [] })))
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: unknown) => setF(p => ({ ...p, [k]: v }))
  const n = (v: string) => Number(v) || 0
  const isBond = f.loanType === 'CORPORATE_BOND'
  const prefix = (f.name || f.entityName || 'LOAN').replace(/\s+/g, '_')
  const prev = !isBond && f.hasInterest ? amortPreview(n(f.principalAmount), f.interestMode, n(f.annualPct), n(f.monthlyAmortization), n(f.termMonths), stepMonths(f.payoutSchedule)) : null
  const deducted = charges.filter(c => c.deductedFromDebit).reduce((s, c) => s + n(c.amount), 0)
  const netDebit = Math.max(0, n(f.principalAmount) - deducted)
  const setCharge = (i: number, patch: Partial<LoanCharge>) => setCharges(cs => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c))
  const addCharge = () => setCharges(cs => [...cs, { date: f.dateAcquired, description: '', registeredName: '', vatable: '', amount: '', siNumber: '', chargeAccountId: '', deductedFromDebit: false, proofUrls: [] }])
  const removeCharge = (i: number) => setCharges(cs => cs.filter((_, idx) => idx !== i))

  const pickSh = (id: string) => { const sh = shareholders.find(s => s.id === id); setF(p => ({ ...p, shareholderId: id, name: sh ? sh.name : p.name })) }
  const allocBranches = Object.keys(allocs)
  const toggleAlloc = (code: string) => setAllocs(p => { const q = { ...p }; if (code in q) delete q[code]; else q[code] = ''; return q })
  const allocSum = allocBranches.reduce((s, b) => s + n(allocs[b]), 0)
  const allocBalanced = allocBranches.length <= 1 || Math.abs(allocSum - n(f.principalAmount)) <= 0.01
  const save = async () => {
    const nm = (f.loanEntity === 'SHAREHOLDER' ? f.name : f.entityName || f.name).trim()
    if (!nm || !(n(f.principalAmount) > 0)) { alert('Enter entity/name and principal amount.'); return }
    if (isBond && !f.maturityDate) { alert('Corporate bonds need a maturity date.'); return }
    if (allocBranches.length > 1 && !allocBalanced) { alert('The branch allocation amounts must add up to the principal.'); return }
    setBusy(true)
    try {
      const body = { ...(row ? { id: row.id } : {}), ...f, name: nm, principalAmount: n(f.principalAmount),
        annualPct: f.annualPct ? n(f.annualPct) : null, termMonths: f.termMonths ? Number(f.termMonths) * stepMonths(f.payoutSchedule) : null, monthlyAmortization: f.monthlyAmortization ? n(f.monthlyAmortization) : null,
        payoutStartMonth: f.payoutStartMonth ? Number(f.payoutStartMonth) : null, payoutStartYear: f.payoutStartYear ? Number(f.payoutStartYear) : null, payoutDay: f.payoutDay ? Number(f.payoutDay) : null,
        proofOfDepositUrls: proofUrls, pdcUrls, loanAgreementUrls: agreementUrls,
        fromCreditLineId: preset?.fromCreditLineId ?? row?.fromCreditLineId ?? null,
        branchAllocations: allocBranches.map(b2 => ({ branch: b2, amount: allocBranches.length === 1 ? n(f.principalAmount) : n(allocs[b2]) })),
        charges: charges.map(c => ({ ...c, amount: n(c.amount) })) }
      const r = await fetch('/api/loans/loans', { method: row ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onSaved()
    } finally { setBusy(false) }
  }

  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'
  const lbl = 'block text-xs font-semibold mb-1'
  const bc = { borderColor: 'var(--light-gray)' }
  const mg = { color: 'var(--mid-gray)' }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-gray-900">{row ? 'Edit Loan' : 'Add Loan'}</h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div><label className={lbl} style={mg}>Loan Entity</label><select value={f.loanEntity} onChange={e => set('loanEntity', e.target.value)} className={inp} style={bc}><option value="SHAREHOLDER">Shareholder</option><option value="BANK">Bank</option><option value="INDIVIDUAL">Individual (non-shareholder)</option><option value="OTHER">Other Financial Institution</option></select></div>
          {f.loanEntity === 'SHAREHOLDER'
            ? <div><label className={lbl} style={mg}>Shareholder</label><select value={f.shareholderId} onChange={e => pickSh(e.target.value)} className={inp} style={bc}><option value="">— Select —</option>{shareholders.map(s => <option key={s.id} value={s.id}>{s.shNumber} — {s.name}</option>)}</select></div>
            : <div><label className={lbl} style={mg}>Name of {f.loanEntity === 'BANK' ? 'Bank' : f.loanEntity === 'INDIVIDUAL' ? 'Individual' : 'Institution'}</label><input value={f.entityName} onChange={e => set('entityName', e.target.value)} className={inp} style={bc} /></div>}
          <div><label className={lbl} style={mg}>Date Acquired</label><input type="date" value={f.dateAcquired} onChange={e => set('dateAcquired', e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Type of Loan</label><select value={f.loanType} onChange={e => set('loanType', e.target.value)} className={inp} style={bc}><option value="CASH">Cash</option><option value="CORPORATE_BOND">Corporate Bond</option><option value="KIND">Kind</option></select></div>
          {f.loanType === 'KIND' && <div><label className={lbl} style={mg}>What kind?</label><input value={f.kindType} onChange={e => set('kindType', e.target.value)} className={inp} style={bc} /></div>}
          <div><label className={lbl} style={mg}>Principal Amount</label><input value={f.principalAmount} onChange={e => set('principalAmount', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
        </div>

        {/* Branch allocation — where the interest expense is booked */}
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <p className="text-sm font-semibold text-gray-700">For which branch? <span className="font-normal text-gray-400">(the interest expense follows this on the branch income statements)</span></p>
          <div className="flex flex-wrap gap-4 mt-2">
            {ALLOC_BRANCHES.map(([code, label]) => (
              <label key={code} className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={code in allocs} onChange={() => toggleAlloc(code)} /> {label}
              </label>
            ))}
          </div>
          {allocBranches.length === 0 && <p className="text-[11px] mt-2" style={mg}>None ticked — the loan stays company-wide (interest shows only in the All Branches view).</p>}
          {allocBranches.length === 1 && <p className="text-[11px] mt-2" style={mg}>Whole loan on <strong>{allocLabel(allocBranches[0])}</strong> — its payments and interest are booked on that branch.</p>}
          {allocBranches.length > 1 && (
            <div className="mt-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {allocBranches.map(code => (
                  <div key={code}><label className="block text-[10px] font-semibold" style={mg}>{allocLabel(code)} amount</label>
                    <input value={allocs[code]} onChange={e => setAllocs(p => ({ ...p, [code]: e.target.value }))} inputMode="decimal" placeholder="0.00" className="w-full px-2 py-1.5 rounded-lg border text-xs font-mono" style={bc} />
                  </div>
                ))}
              </div>
              <p className="text-[11px] mt-2 font-mono" style={{ color: allocBalanced ? '#334155' : '#b91c1c' }}>
                Allocated {peso(allocSum)} of {peso(n(f.principalAmount))}{allocBalanced ? ' ✓' : ` — ${allocSum > n(f.principalAmount) ? 'over' : 'short'} by ${peso(Math.abs(n(f.principalAmount) - allocSum))}`}
              </p>
            </div>
          )}
        </div>

        {/* Interest / bond terms */}
        {isBond ? (
          <div className="mt-3 rounded-xl border p-3 grid grid-cols-2 sm:grid-cols-3 gap-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <div><label className={lbl} style={mg}>Annual coupon %</label><input value={f.annualPct} onChange={e => set('annualPct', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
            <div><label className={lbl} style={mg}>Maturity date</label><input type="date" value={f.maturityDate} onChange={e => set('maturityDate', e.target.value)} className={inp} style={bc} /></div>
            <div className="col-span-2 sm:col-span-3 text-[11px]" style={{ color: 'var(--mid-gray)' }}>Only the annual interest is paid each period; the principal is repaid in full at maturity. A corporate bond can be issued to <strong>any lender</strong> — shareholder, bank, or a private individual — so set the <strong>Loan Entity</strong> above accordingly. Classify the principal under a <strong>Bonds Payable</strong> account in &ldquo;Account to be Credited&rdquo;.</div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700"><input type="checkbox" checked={f.hasInterest} onChange={e => set('hasInterest', e.target.checked)} /> Has interest?</label>
            {f.hasInterest && (
              <div className="mt-2">
                <div className="flex gap-2 mb-2 text-xs">{(['ANNUAL_PCT', 'MONTHLY_AMORT'] as const).map(m => <button key={m} onClick={() => set('interestMode', m)} className="px-3 py-1.5 rounded-lg font-semibold" style={f.interestMode === m ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>{m === 'ANNUAL_PCT' ? `Annual % + ${periodPlural(f.payoutSchedule)}` : `${periodAdj(f.payoutSchedule)} amortization + ${periodPlural(f.payoutSchedule)}`}</button>)}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {f.interestMode === 'ANNUAL_PCT'
                    ? <div><label className={lbl} style={mg}>Annual %</label><input value={f.annualPct} onChange={e => set('annualPct', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
                    : <div><label className={lbl} style={mg}>{periodAdj(f.payoutSchedule)} amortization</label><input value={f.monthlyAmortization} onChange={e => set('monthlyAmortization', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>}
                  <div><label className={lbl} style={mg}>For how many {periodPlural(f.payoutSchedule)}</label><input value={f.termMonths} onChange={e => set('termMonths', e.target.value)} inputMode="numeric" className={inp + ' font-mono'} style={bc} /></div>
                </div>
                {prev && <p className="text-[11px] mt-2 font-mono px-2 py-1.5 rounded" style={{ background: '#fff', color: '#334155' }}>≈ {prev.flat.toFixed(2)}% p.a. (flat) · true cost {prev.effective.toFixed(2)}% eff. · {periodAdj(f.payoutSchedule).toLowerCase()} {peso(prev.amort)} = principal {peso(prev.perPeriodPrincipal)} + interest {peso(prev.interestPerPeriod)} · total interest {peso(prev.totalInterest)}</p>}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <div><label className={lbl} style={mg}>Bank Account Debited <span className="font-normal text-gray-400">(release received here)</span></label><select value={f.bankAccountId} onChange={e => set('bankAccountId', e.target.value)} className={inp} style={bc}><option value="">— Not recorded —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select></div>
          <div><label className={lbl} style={mg}>Account to be Credited <span className="font-normal text-gray-400">(principal)</span></label><select value={f.creditAccountId} onChange={e => set('creditAccountId', e.target.value)} className={inp} style={bc}><option value="">— Select —</option>{accts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select></div>
          <div><label className={lbl} style={mg}>Account to be Expensed <span className="font-normal text-gray-400">(interest)</span></label><select value={f.interestExpenseAccountId} onChange={e => set('interestExpenseAccountId', e.target.value)} className={inp} style={bc}><option value="">— Select —</option>{accts.filter(a => a.accountType === 'EXPENSE').map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select></div>
        </div>
        {f.bankAccountId && f.creditAccountId && n(f.principalAmount) > 0 && <p className="text-[11px] mt-1 font-mono" style={{ color: '#334155' }}>Release: DR {banks.find(b => b.id === f.bankAccountId)?.accountTitle} {peso(n(f.principalAmount))} / CR {accts.find(a => a.id === f.creditAccountId)?.accountTitle} {peso(n(f.principalAmount))}</p>}

        {/* Payment schedule — drives the Payment History table (bonds + regular loans) */}
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <p className="text-sm font-semibold text-gray-700 mb-2">Payment schedule <span className="font-normal text-gray-400">(drives the Payment History table)</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><label className={lbl} style={mg}>Frequency</label><select value={f.payoutSchedule} onChange={e => set('payoutSchedule', e.target.value)} className={inp} style={bc}><option value="">—</option>{['ANNUALLY', 'BIANNUALLY', 'QUARTERLY', 'MONTHLY'].map(s => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}</select></div>
            <div><label className={lbl} style={mg}>Start month</label><select value={f.payoutStartMonth} onChange={e => set('payoutStartMonth', e.target.value)} className={inp} style={bc}><option value="">—</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
            <div><label className={lbl} style={mg}>Start year</label><input value={f.payoutStartYear} onChange={e => set('payoutStartYear', e.target.value)} inputMode="numeric" placeholder="2026" className={inp + ' font-mono'} style={bc} /></div>
            <div><label className={lbl} style={mg}>Every nth (day)</label><input value={f.payoutDay} onChange={e => set('payoutDay', e.target.value)} inputMode="numeric" placeholder="30" className={inp + ' font-mono'} style={bc} /></div>
            {isBond ? (
              <div><label className={lbl} style={mg}>Coupon per period <span className="font-normal text-gray-400">(interest; blank = from %)</span></label><input value={f.payoutAmountPerPeriod} onChange={e => set('payoutAmountPerPeriod', e.target.value)} inputMode="decimal" placeholder="auto" className={inp + ' font-mono'} style={bc} /></div>
            ) : (<>
              <div><label className={lbl} style={mg}>Repayment</label><select value={f.repaymentMode} onChange={e => set('repaymentMode', e.target.value)} className={inp} style={bc}><option value="">Amortizing (default)</option><option value="AMORTIZING">Amortizing (principal + interest)</option><option value="INTEREST_ONLY">Interest-only (principal at maturity)</option></select></div>
              <div><label className={lbl} style={mg}>Amount per period <span className="font-normal text-gray-400">(optional)</span></label><input value={f.payoutAmountPerPeriod} onChange={e => set('payoutAmountPerPeriod', e.target.value)} inputMode="decimal" placeholder="auto" className={inp + ' font-mono'} style={bc} /></div>
              {f.repaymentMode !== 'INTEREST_ONLY' && <div><label className={lbl} style={mg}>Principal per period <span className="font-normal text-gray-400">(interest = rest)</span></label><input value={f.principalPerPeriod} onChange={e => set('principalPerPeriod', e.target.value)} inputMode="decimal" placeholder="auto" className={inp + ' font-mono'} style={bc} /></div>}
              {/* With interest the term lives in the interest box above; without it, capture it here so the schedule still generates. */}
              {!f.hasInterest && <div><label className={lbl} style={mg}>For how many {periodPlural(f.payoutSchedule)}</label><input value={f.termMonths} onChange={e => set('termMonths', e.target.value)} inputMode="numeric" className={inp + ' font-mono'} style={bc} /></div>}
            </>)}
            <div><label className={lbl} style={mg}>Bank for payments <span className="font-normal text-gray-400">(credited)</span></label><select value={f.paymentBankAccountId} onChange={e => set('paymentBankAccountId', e.target.value)} className={inp} style={bc}><option value="">— same as debited —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select></div>
          </div>
          {(() => {
            const step = f.payoutSchedule === 'MONTHLY' ? 1 : f.payoutSchedule === 'QUARTERLY' ? 3 : f.payoutSchedule === 'BIANNUALLY' ? 6 : f.payoutSchedule === 'ANNUALLY' ? 12 : 0
            if (!step) return null
            if (isBond) {
              if (!n(f.payoutStartMonth) || !n(f.payoutStartYear) || !f.maturityDate) return null
              const mat = new Date(f.maturityDate)
              const months = (mat.getUTCFullYear() - n(f.payoutStartYear)) * 12 + (mat.getUTCMonth() + 1 - n(f.payoutStartMonth))
              const count = Math.max(1, Math.floor(months / step) + 1)
              const coupon = n(f.payoutAmountPerPeriod) > 0 ? n(f.payoutAmountPerPeriod) : n(f.principalAmount) * n(f.annualPct) / 100 * (step / 12)
              return <p className="text-[11px] mt-2 font-mono" style={{ color: '#334155' }}>{count} coupon payment{count === 1 ? '' : 's'} of {peso(coupon)} + {peso(n(f.principalAmount))} principal at maturity</p>
            }
            const per = n(f.payoutAmountPerPeriod)
            // f.termMonths holds PERIODS here (converted to months only on save);
            // no term → derive the count from the per-period amount, like the server.
            const count = n(f.termMonths) > 0 ? Math.max(1, Math.round(n(f.termMonths))) : per > 0 && n(f.principalAmount) > 0 ? Math.ceil(n(f.principalAmount) / per) : 0
            if (!count) return null
            if (f.repaymentMode === 'INTEREST_ONLY') return <p className="text-[11px] mt-2 font-mono" style={{ color: '#334155' }}>{count} payment{count === 1 ? '' : 's'} of {per > 0 ? peso(per) : 'derived'} interest + {peso(n(f.principalAmount))} principal on the last</p>
            const prin = n(f.principalPerPeriod) > 0 ? n(f.principalPerPeriod) : !f.hasInterest && per > 0 ? per : n(f.principalAmount) / count
            const int = f.hasInterest && per > 0 ? Math.max(0, per - prin) : null
            return <p className="text-[11px] mt-2 font-mono" style={{ color: '#334155' }}>{count} payment{count === 1 ? '' : 's'} · principal {peso(prin)}{int != null ? ` + interest ${peso(int)} = ${peso(prin + int)} each` : f.hasInterest ? ' + interest (auto-derived)' : ' each (no interest)'}</p>
          })()}
        </div>

        {/* One-time charges */}
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)' }}>
          <div className="flex items-center justify-between mb-2"><span className="text-sm font-semibold text-gray-700">Other one-time charges</span><button onClick={addCharge} className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}><Plus size={12} className="inline" /> Add charge</button></div>
          {charges.length === 0 ? <p className="text-[11px]" style={mg}>None. These become entries in the Expenses History.</p> : (
            <div className="space-y-2">
              {charges.map((c, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end rounded-lg p-2" style={{ background: 'var(--off-white)' }}>
                  <div><label className="block text-[10px] font-semibold" style={mg}>Date</label><input type="date" value={c.date} onChange={e => setCharge(i, { date: e.target.value })} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={bc} /></div>
                  <div className="col-span-2 sm:col-span-1"><label className="block text-[10px] font-semibold" style={mg}>Description</label><input value={c.description} onChange={e => setCharge(i, { description: e.target.value })} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={bc} /></div>
                  <div><label className="block text-[10px] font-semibold" style={mg}>Payee</label><input value={c.registeredName} onChange={e => setCharge(i, { registeredName: e.target.value })} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={bc} /></div>
                  <div><label className="block text-[10px] font-semibold" style={mg}>Amount</label><input value={c.amount} onChange={e => setCharge(i, { amount: e.target.value })} inputMode="decimal" className="w-full px-2 py-1.5 rounded-lg border text-xs font-mono" style={bc} /></div>
                  <div><label className="block text-[10px] font-semibold" style={mg}>Expense acct</label><select value={c.chargeAccountId} onChange={e => setCharge(i, { chargeAccountId: e.target.value })} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={bc}><option value="">—</option>{accts.filter(a => a.accountType === 'EXPENSE').map(a => <option key={a.id} value={a.id}>{a.accountNumber} {a.accountTitle}</option>)}</select></div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-1 text-[10px] font-semibold" style={mg}><input type="checkbox" checked={c.deductedFromDebit} onChange={e => setCharge(i, { deductedFromDebit: e.target.checked })} /> Deducted?</label>
                    <ScanUpload compact section="loan" prefix={`${prefix}-CHARGE${i + 1}`} existingCount={c.proofUrls.length} label="Proof" onUploaded={u => setCharge(i, { proofUrls: [...c.proofUrls, u] })} />
                    <button onClick={() => removeCharge(i)} className="p-1 rounded hover:bg-red-50"><Trash2 size={12} className="text-red-400" /></button>
                  </div>
                </div>
              ))}
              <p className="text-[11px] font-mono" style={{ color: '#334155' }}>Deducted from disbursement: {peso(deducted)} · <span className="font-bold">Net amount to be debited: {peso(netDebit)}</span></p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <div><label className={lbl} style={mg}>Loan Agreement</label><div className="flex flex-wrap items-center gap-2">{agreementUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="loan" prefix={`${prefix}-AGREEMENT`} existingCount={agreementUrls.length} label="Add" onUploaded={u => setAgreementUrls(p => [...p, u])} /></div></div>
          <div><label className={lbl} style={mg}>Proof of Deposit</label><div className="flex flex-wrap items-center gap-2">{proofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="loan" prefix={`${prefix}-DEPOSIT`} existingCount={proofUrls.length} label="Add" onUploaded={u => setProofUrls(p => [...p, u])} /></div></div>
          <div><label className={lbl} style={mg}>PDCs</label><div className="flex flex-wrap items-center gap-2">{pdcUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="loan" prefix={`${prefix}-PDC`} existingCount={pdcUrls.length} label="Add" onUploaded={u => setPdcUrls(p => [...p, u])} /></div></div>
        </div>
        <div className="mt-3"><label className={lbl} style={mg}>Remarks</label><input value={f.remarks} onChange={e => set('remarks', e.target.value)} className={inp} style={bc} /></div>

        <button onClick={save} disabled={busy} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} {row ? 'Save changes' : 'Add loan'}</button>
      </div>
    </div>
  )
}

// ── Credit Line ───────────────────────────────────────────────
interface DrawnLoan { id: string; name: string; principalAmount: number; creditAccountId: string | null }
interface CreditLineRow { id: string; entityName: string; amount: number; interestPct: number | null; utilized: boolean; settledAt: string | null; remarks: string | null; drawnLoans: DrawnLoan[]; drawnTotal: number }

function CreditLineTab({ shareholders, banks, accts }: { shareholders: SH[]; banks: Bank[]; accts: Acct[] }) {
  const [rows, setRows] = useState<CreditLineRow[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [drawFor, setDrawFor] = useState<CreditLineRow | null>(null)
  const [settleFor, setSettleFor] = useState<CreditLineRow | null>(null)
  const load = useCallback(async () => { setLoading(true); try { const r = await fetch('/api/loans/credit-lines'); const j = r.ok ? await r.json() : null; setRows(j?.rows || []) } catch { setRows([]) } finally { setLoading(false) } }, [])
  useEffect(() => { load() }, [load])
  const del = async (r: CreditLineRow) => { if (!confirm(`Delete credit line "${r.entityName}"? Drawn loans are kept but detached.`)) return; await fetch(`/api/loans/credit-lines?id=${r.id}`, { method: 'DELETE' }); load() }
  const markUtilized = async (r: CreditLineRow) => { await fetch('/api/loans/credit-lines', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, entityName: r.entityName, amount: r.amount, interestPct: r.interestPct, utilized: true, remarks: r.remarks }) }); load() }
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> Add Credit Line</button></div>
      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-xs"><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
          {['Entity', 'Available', 'Interest', 'Drawn', 'Remaining', 'Status', ''].map(h => <th key={h} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}
        </tr></thead><tbody>
          {loading ? <tr><td colSpan={7} className="text-center py-10 text-gray-400"><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
          : rows.map(r => (
            <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
              <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{r.entityName}</td>
              <td className="px-3 py-2 text-right font-semibold">{peso(r.amount)}</td>
              <td className="px-3 py-2 text-right">{r.interestPct != null ? `${r.interestPct}%` : '—'}</td>
              <td className="px-3 py-2 text-right">{peso(r.drawnTotal)}</td>
              <td className="px-3 py-2 text-right">{peso(Math.max(0, r.amount - r.drawnTotal))}</td>
              <td className="px-3 py-2">{r.settledAt ? <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#dcfce7', color: '#166534' }}>Settled</span> : r.utilized || r.drawnTotal > 0 ? <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#ffedd5', color: '#9a3412' }}>Utilized</span> : <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#f1f5f9', color: '#475569' }}>Open</span>}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {!r.settledAt && <button onClick={() => setDrawFor(r)} className="text-[11px] px-2 py-1 rounded-lg font-semibold mr-1" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>Utilize</button>}
                {!r.settledAt && r.drawnTotal > 0 && <button onClick={() => setSettleFor(r)} className="text-[11px] px-2 py-1 rounded-lg font-semibold mr-1" style={{ background: '#fef9c3', color: '#854d0e' }}>Paid full earlier</button>}
                <button onClick={() => del(r)} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} className="text-red-400" /></button>
              </td>
            </tr>
          ))}
          {!loading && rows.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-gray-400">No credit lines yet.</td></tr>}
        </tbody></table>
      </div>
      {addOpen && <CreditLineModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load() }} />}
      {drawFor && <LoanModal row={null} shareholders={shareholders} banks={banks} accts={accts} preset={{ fromCreditLineId: drawFor.id, entityName: drawFor.entityName, annualPct: drawFor.interestPct }} onClose={() => setDrawFor(null)} onSaved={() => { const cl = drawFor; setDrawFor(null); if (cl) markUtilized(cl); else load() }} />}
      {settleFor && <SettleCreditLineModal line={settleFor} banks={banks} accts={accts} onClose={() => setSettleFor(null)} onSaved={() => { setSettleFor(null); load() }} />}
    </div>
  )
}

function CreditLineModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ entityName: '', amount: '', interestPct: '', remarks: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: unknown) => setF(p => ({ ...p, [k]: v }))
  const n = (v: string) => Number(v) || 0
  const save = async () => {
    if (!f.entityName.trim() || !(n(f.amount) > 0)) { alert('Enter entity and amount.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/loans/credit-lines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityName: f.entityName, amount: n(f.amount), interestPct: f.interestPct ? n(f.interestPct) : null, remarks: f.remarks }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onSaved()
    } finally { setBusy(false) }
  }
  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'; const lbl = 'block text-xs font-semibold mb-1'; const bc = { borderColor: 'var(--light-gray)' }; const mg = { color: 'var(--mid-gray)' }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-gray-900">Add Credit Line</h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className={lbl} style={mg}>Credit Line Entity</label><input value={f.entityName} onChange={e => set('entityName', e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Amount (available)</label><input value={f.amount} onChange={e => set('amount', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={mg}>Interest (annual %)</label><input value={f.interestPct} onChange={e => set('interestPct', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
          <div className="col-span-2"><label className={lbl} style={mg}>Remarks</label><input value={f.remarks} onChange={e => set('remarks', e.target.value)} className={inp} style={bc} /></div>
        </div>
        <button onClick={save} disabled={busy} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} Add credit line</button>
      </div>
    </div>
  )
}

function SettleCreditLineModal({ line, banks, accts, onClose, onSaved }: { line: CreditLineRow; banks: Bank[]; accts: Acct[]; onClose: () => void; onSaved: () => void }) {
  const [balance, setBalance] = useState(String(line.drawnTotal || ''))
  const [balanceAccountId, setBalanceAccountId] = useState(line.drawnLoans[0]?.creditAccountId || '')
  const [bankAccountId, setBankAccountId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [charges, setCharges] = useState<{ description: string; amount: string; accountId: string }[]>([])
  const [proofUrls, setProofUrls] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const n = (v: string) => Number(v) || 0
  const chargeTotal = charges.reduce((s, c) => s + n(c.amount), 0)
  const total = n(balance) + chargeTotal
  const save = async () => {
    if (!(n(balance) > 0) || !balanceAccountId || !bankAccountId) { alert('Enter balance, liability account and bank account.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/loans/credit-lines', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: line.id, action: 'settle', entityName: line.entityName, date, balance: n(balance), balanceAccountId, bankAccountId, charges: charges.map(c => ({ ...c, amount: n(c.amount) })), proofUrls }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onSaved()
    } finally { setBusy(false) }
  }
  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'; const lbl = 'block text-xs font-semibold mb-1'; const bc = { borderColor: 'var(--light-gray)' }; const mg = { color: 'var(--mid-gray)' }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-gray-900">Pay Full Earlier — {line.entityName}</h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl} style={mg}>Outstanding balance</label><input value={balance} onChange={e => setBalance(e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={mg}>Date paid</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Loan liability account</label><select value={balanceAccountId} onChange={e => setBalanceAccountId(e.target.value)} className={inp} style={bc}><option value="">— Select —</option>{accts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select></div>
          <div><label className={lbl} style={mg}>Bank account credited</label><select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} className={inp} style={bc}><option value="">— Select —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select></div>
        </div>
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)' }}>
          <div className="flex items-center justify-between mb-2"><span className="text-sm font-semibold text-gray-700">Early-payment charges</span><button onClick={() => setCharges(cs => [...cs, { description: '', amount: '', accountId: '' }])} className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}><Plus size={12} className="inline" /> Add</button></div>
          {charges.map((c, i) => (
            <div key={i} className="grid grid-cols-6 gap-2 items-end mb-2">
              <div className="col-span-2"><input placeholder="Description" value={c.description} onChange={e => setCharges(cs => cs.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={bc} /></div>
              <div><input placeholder="Amount" value={c.amount} onChange={e => setCharges(cs => cs.map((x, idx) => idx === i ? { ...x, amount: e.target.value } : x))} inputMode="decimal" className="w-full px-2 py-1.5 rounded-lg border text-xs font-mono" style={bc} /></div>
              <div className="col-span-2"><select value={c.accountId} onChange={e => setCharges(cs => cs.map((x, idx) => idx === i ? { ...x, accountId: e.target.value } : x))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={bc}><option value="">Expense acct</option>{accts.filter(a => a.accountType === 'EXPENSE').map(a => <option key={a.id} value={a.id}>{a.accountNumber} {a.accountTitle}</option>)}</select></div>
              <button onClick={() => setCharges(cs => cs.filter((_, idx) => idx !== i))} className="p-1 rounded hover:bg-red-50"><Trash2 size={12} className="text-red-400" /></button>
            </div>
          ))}
        </div>
        <div className="mt-3"><label className={lbl} style={mg}>Proof of payment</label><div className="flex flex-wrap items-center gap-2">{proofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="loan" prefix={`${line.entityName.replace(/\s+/g, '_')}-SETTLE`} existingCount={proofUrls.length} label="Add" onUploaded={u => setProofUrls(p => [...p, u])} /></div></div>
        <p className="text-[11px] mt-2 font-mono" style={{ color: '#334155' }}>Total to pay: {peso(total)} = balance {peso(n(balance))} + charges {peso(chargeTotal)}</p>
        <button onClick={save} disabled={busy} className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} Record full early payment</button>
      </div>
    </div>
  )
}

// Popup that nags the accountant about loan/advance payments due within 3 days
// (or overdue), across both advances and loans. Mirrors the scholars near-due popup.
function NearDuePaymentsPopup({ onGoToHistory }: { onGoToHistory: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [due, setDue] = useState<any[]>([])
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/loans/payments?type=loans').then(r => r.ok ? r.json() : { rows: [] }).catch(() => ({ rows: [] })),
      fetch('/api/loans/payments?type=advances').then(r => r.ok ? r.json() : { rows: [] }).catch(() => ({ rows: [] })),
    ]).then(([l, a]) => {
      if (!alive) return
      const now = Date.now()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const soon = [...(l.rows || []), ...(a.rows || [])].filter((r: any) => {
        if (r.status === 'PAID') return false
        const diff = new Date(r.dueDate).getTime() - now
        return diff <= 3 * 864e5 && diff > -365 * 864e5 // due within 3 days, or overdue up to a year
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }).sort((x: any, y: any) => new Date(x.dueDate).getTime() - new Date(y.dueDate).getTime())
      setDue(soon)
    })
    return () => { alive = false }
  }, [])
  if (dismissed || due.length === 0) return null
  const now = Date.now()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDismissed(true)}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: '#9a3412' }}><Landmark size={18} /> Payments due soon</h2>
          <button onClick={() => setDismissed(true)}><X size={18} className="text-gray-500" /></button>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>{due.length} loan/advance payment{due.length === 1 ? ' is' : 's are'} due within 3 days or overdue. Please settle and record them.</p>
        <div className="rounded-xl border overflow-auto mb-4" style={{ borderColor: 'var(--light-gray)', maxHeight: 280 }}>
          <table className="w-full text-xs"><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>{['Name', 'Type', 'Due', 'Amount'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead><tbody>
            {due.map((r, i) => {
              const overdue = new Date(r.dueDate).getTime() < now
              return (
                <tr key={`${r.parentId}-${r.seq}-${i}`} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-3 py-1.5" style={{ color: 'var(--charcoal)' }}>{r.name}</td>
                  <td className="px-3 py-1.5" style={{ color: 'var(--mid-gray)' }}>{r.kind === 'loan' ? 'Loan' : 'Advance'}</td>
                  <td className="px-3 py-1.5" style={{ color: overdue ? '#b91c1c' : 'var(--mid-gray)', fontWeight: overdue ? 600 : 400 }}>{String(r.dueDate).slice(0, 10)}{overdue ? ' · overdue' : ''}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-semibold">{peso(r.amount)}</td>
                </tr>
              )
            })}
          </tbody></table>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setDismissed(true); onGoToHistory() }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>Go to Payment History</button>
          <button onClick={() => setDismissed(true)} className="px-4 py-2.5 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Dismiss</button>
        </div>
      </div>
    </div>
  )
}

// ── Payment History ───────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PayRow = any

function PaymentHistoryTab({ banks, accts }: { banks: Bank[]; accts: Acct[] }) {
  const [sub, setSub] = useState<'advances' | 'loans'>('advances')
  const [rows, setRows] = useState<PayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [recordFor, setRecordFor] = useState<PayRow | null>(null)
  const [year, setYear] = useState(new Date().getUTCFullYear())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)
  const load = useCallback(async () => { setLoading(true); try { const r = await fetch(`/api/loans/payments?type=${sub}`); const j = r.ok ? await r.json() : null; setRows(j?.rows || []) } catch { setRows([]) } finally { setLoading(false) } }, [sub])
  useEffect(() => { load(); setSelected(new Set()) }, [load])

  const now = Date.now()
  const soon = rows.filter(r => r.status !== 'PAID' && new Date(r.dueDate).getTime() - now < 14 * 864e5 && new Date(r.dueDate).getTime() - now > -60 * 864e5)

  // Years present across the schedule (for the year picker).
  const years = Array.from(new Set(rows.map(r => new Date(r.dueDate).getUTCFullYear()))).sort((a, b) => a - b)
  useEffect(() => { if (years.length && !years.includes(year)) setYear(years.includes(new Date().getUTCFullYear()) ? new Date().getUTCFullYear() : years[0]) }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build the payee × month matrix for the selected year.
  const byParent = new Map<string, { parentId: string; name: string; cells: Record<number, PayRow> }>()
  rows.forEach(o => {
    const d = new Date(o.dueDate)
    if (d.getUTCFullYear() !== year) return
    const m = d.getUTCMonth() + 1
    if (!byParent.has(o.parentId)) byParent.set(o.parentId, { parentId: o.parentId, name: o.name, cells: {} })
    byParent.get(o.parentId)!.cells[m] = o
  })
  const payees = [...byParent.values()].sort((a, b) => a.name.localeCompare(b.name))
  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const cellKey = (pid: string, m: number) => `${pid}|${m}`
  const colTotal = (m: number) => payees.reduce((s, p) => s + (p.cells[m] ? Number(p.cells[m].amount) : 0), 0)
  const grandTotal = months.reduce((s, m) => s + colTotal(m), 0)
  const selectedOccs = payees.flatMap(p => months.map(m => p.cells[m]).filter(o => o && o.status !== 'PAID' && selected.has(cellKey(o.parentId, new Date(o.dueDate).getUTCMonth() + 1))))
  const selectedTotal = selectedOccs.reduce((s, o) => s + Number(o.amount), 0)
  const toggle = (o: PayRow) => { const k = cellKey(o.parentId, new Date(o.dueDate).getUTCMonth() + 1); setSelected(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n }) }
  // Click a month header to select/deselect every pending (unpaid) cell in that column.
  const toggleColumn = (m: number) => {
    const keys = payees.map(p => p.cells[m]).filter(o => o && o.status !== 'PAID').map(o => cellKey(o.parentId, m))
    if (keys.length === 0) return
    setSelected(s => { const n = new Set(s); const allOn = keys.every(k => n.has(k)); keys.forEach(k => allOn ? n.delete(k) : n.add(k)); return n })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">{(['advances', 'loans'] as const).map(v => <button key={v} onClick={() => setSub(v)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={sub === v ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>{v === 'advances' ? 'Advances' : 'Loans'}</button>)}</div>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setYear(y => y - 1)} className="px-2 py-1 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>◀</button>
          <span className="px-2 text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{year}</span>
          <button onClick={() => setYear(y => y + 1)} className="px-2 py-1 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>▶</button>
        </div>
      </div>

      {soon.length > 0 && (
        <div className="rounded-xl border p-3 flex items-center justify-between gap-3" style={{ borderColor: '#fed7aa', background: '#fff7ed' }}>
          <div className="text-sm" style={{ color: '#9a3412' }}><strong>{soon.length} payment{soon.length === 1 ? '' : 's'} due soon.</strong> The nearest is <strong>{soon[0].name}</strong> on {String(soon[0].dueDate).slice(0, 10)} ({peso(soon[0].amount)}).</div>
          <button onClick={() => setRecordFor(soon[0])} className="whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>Record Payment</button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="rounded-xl border p-3 flex items-center justify-between gap-3 sticky top-0 z-10" style={{ borderColor: 'var(--teal)', background: 'var(--pale-teal)' }}>
          <div className="text-sm" style={{ color: 'var(--deep-teal)' }}><strong>{selectedOccs.length} payment{selectedOccs.length === 1 ? '' : 's'} selected</strong> · total <strong>{peso(selectedTotal)}</strong></div>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Clear</button>
            <button onClick={() => setBatchOpen(true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>Record {selectedOccs.length} selected payment{selectedOccs.length === 1 ? '' : 's'}</button>
          </div>
        </div>
      )}

      <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Tick the amounts you&apos;ll include in a payment, then <strong>Record selected</strong>. Green = already paid. Amounts come from each {sub === 'advances' ? 'advance' : 'loan'}&apos;s payment schedule.</p>

      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-xs" style={{ minWidth: '900px' }}><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
          <th className="px-3 py-2.5 font-semibold whitespace-nowrap sticky left-0" style={{ background: 'var(--off-white)', minWidth: 180 }}>Payee</th>
          {months.map(m => <th key={m} onClick={() => toggleColumn(m)} className="px-2 py-2.5 font-semibold text-right whitespace-nowrap cursor-pointer hover:underline" title="Select/deselect all pending in this month">{m}/{year}</th>)}
        </tr></thead><tbody>
          {loading ? <tr><td colSpan={13} className="text-center py-10 text-gray-400"><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
          : payees.map(p => (
            <tr key={p.parentId} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
              <td className="px-3 py-2 sticky left-0 bg-white" style={{ color: 'var(--charcoal)' }}>{p.name}</td>
              {months.map(m => {
                const o = p.cells[m]
                if (!o) return <td key={m} className="px-2 py-2 text-right text-gray-300">·</td>
                const paid = o.status === 'PAID'
                const k = cellKey(o.parentId, m)
                const on = selected.has(k)
                return (
                  <td key={m} className="px-2 py-2 text-right whitespace-nowrap" style={{ background: paid ? '#dcfce7' : on ? 'var(--pale-teal)' : undefined }}>
                    <label className="inline-flex items-center gap-1 justify-end cursor-pointer" title={`${p.name} · due ${String(o.dueDate).slice(0, 10)} · principal ${peso(o.principalPortion)} + interest ${peso(o.interestPortion)}`}>
                      {!paid && <input type="checkbox" checked={on} onChange={() => toggle(o)} />}
                      <span className="font-mono" style={{ color: paid ? '#166534' : 'var(--charcoal)' }}>{Number(o.amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{paid && ' ✓'}</span>
                    </label>
                  </td>
                )
              })}
            </tr>
          ))}
          {!loading && payees.length === 0 && <tr><td colSpan={13} className="text-center py-10 text-gray-400">No scheduled payments in {year}. Add a payment schedule on an {sub === 'advances' ? 'advance' : 'a loan'}, or change the year.</td></tr>}
        </tbody>
        {payees.length > 0 && <tfoot><tr className="border-t-2 font-bold" style={{ borderColor: 'var(--teal)', background: 'var(--off-white)' }}>
          <td className="px-3 py-2 sticky left-0" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>TOTAL <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>({peso(grandTotal)})</span></td>
          {months.map(m => { const t = colTotal(m); return <td key={m} className="px-2 py-2 text-right font-mono" style={{ color: t > 0 ? 'var(--deep-teal)' : 'var(--light-gray)' }}>{t > 0 ? t.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '·'}</td> })}
        </tr></tfoot>}
        </table>
      </div>
      {recordFor && <RecordPaymentModal occ={recordFor} banks={banks} accts={accts} onClose={() => setRecordFor(null)} onSaved={() => { setRecordFor(null); load() }} />}
      {batchOpen && <BatchRecordModal occs={selectedOccs} banks={banks} accts={accts} onClose={() => setBatchOpen(false)} onSaved={() => { setBatchOpen(false); setSelected(new Set()); load() }} />}
    </div>
  )
}

// Record several scheduled payments at once (one date + bank + proof for all ticked cells).
interface OtherExp { description: string; accountId: string; amount: string }
const cleanOtherExp = (rows: OtherExp[]) => rows.filter(e => e.accountId && (Number(e.amount) || 0) > 0).map(e => ({ accountId: e.accountId, description: e.description.trim(), amount: Number(e.amount) }))

// Reusable "other expenses on this transaction" editor (bank/wire fees, DST, etc.).
// These post to their expense account and add to the total cash out (CR bank).
function OtherExpensesSection({ rows, setRows, accts }: { rows: OtherExp[]; setRows: (r: OtherExp[]) => void; accts: Acct[] }) {
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const expAccts = accts.filter(a => a.accountType === 'EXPENSE')
  const upd = (i: number, patch: Partial<OtherExp>) => setRows(rows.map((x, idx) => idx === i ? { ...x, ...patch } : x))
  return (
    <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-700">Other expenses on this transaction <span className="font-normal text-gray-400">(bank/wire fees, DST…)</span></span>
        <button type="button" onClick={() => setRows([...rows, { description: '', accountId: '', amount: '' }])} className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}><Plus size={12} className="inline" /> Add</button>
      </div>
      {rows.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>None. Add charges paid as part of this transaction — each posts to its expense account and adds to the total cash out.</p> : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input value={r.description} onChange={e => upd(i, { description: e.target.value })} placeholder="Description" className="col-span-5 px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
              <select value={r.accountId} onChange={e => upd(i, { accountId: e.target.value })} className="col-span-4 px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}><option value="">— Expense account —</option>{expAccts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select>
              <input value={r.amount} onChange={e => upd(i, { amount: e.target.value })} inputMode="decimal" placeholder="0.00" className="col-span-2 px-2 py-1.5 rounded-lg border text-xs text-right font-mono" style={{ borderColor: 'var(--light-gray)' }} />
              <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} className="col-span-1 p-1 rounded hover:bg-red-50 flex justify-center"><Trash2 size={12} className="text-red-400" /></button>
            </div>
          ))}
          {total > 0 && <p className="text-[11px] font-mono text-right" style={{ color: '#334155' }}>Other expenses: {peso(total)}</p>}
        </div>
      )}
    </div>
  )
}

function BatchRecordModal({ occs, banks, accts, onClose, onSaved }: { occs: PayRow[]; banks: Bank[]; accts: Acct[]; onClose: () => void; onSaved: () => void }) {
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10))
  // Batches that backfill past months should date each payment at its own due
  // date — a single "today" across the whole schedule piles months of
  // amortization into one ledger month.
  const hasPastDues = occs.some(o => String(o.dueDate).slice(0, 10) < new Date().toISOString().slice(0, 10))
  const [useDueDates, setUseDueDates] = useState(hasPastDues)
  const [memo, setMemo] = useState('')
  const [bankAccountId, setBankAccountId] = useState(occs[0]?.paymentBankAccountId || occs[0]?.bankAccountId || '')
  const [proofUrls, setProofUrls] = useState<string[]>([])
  const [otherExp, setOtherExp] = useState<OtherExp[]>([])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const total = occs.reduce((s, o) => s + Number(o.amount), 0)
  const otherTotal = otherExp.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const save = async () => {
    if (!bankAccountId) { alert('Select the bank account.'); return }
    setBusy(true); setDone(0)
    try {
      // Other expenses apply once to the whole batch transaction — attach to the first payment.
      const cleaned = cleanOtherExp(otherExp)
      for (let i = 0; i < occs.length; i++) {
        const occ = occs[i]
        const r = await fetch('/api/loans/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: occ.kind, parentId: occ.parentId, dueDate: occ.dueDate, principalPortion: occ.principalPortion, interestPortion: occ.interestPortion, amount: occ.amount, paidDate: useDueDates ? String(occ.dueDate).slice(0, 10) : paidDate, bankAccountId, proofUrls, otherExpenses: i === 0 ? cleaned : [], memo }) })
        if (!r.ok) { alert(`Failed on ${occ.name} (${String(occ.dueDate).slice(0, 10)}): ${(await r.json()).error || 'error'}`); return }
        setDone(d => d + 1)
      }
      onSaved()
    } finally { setBusy(false) }
  }
  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'; const lbl = 'block text-xs font-semibold mb-1'; const bc = { borderColor: 'var(--light-gray)' }; const mg = { color: 'var(--mid-gray)' }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-gray-900">Record {occs.length} Payment{occs.length === 1 ? '' : 's'}</h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>
        <div className="rounded-xl border overflow-auto mb-3" style={{ borderColor: 'var(--light-gray)', maxHeight: 200 }}>
          <table className="w-full text-xs"><tbody>
            {occs.map((o, i) => <tr key={i} className="border-t" style={{ borderColor: 'var(--light-gray)' }}><td className="px-3 py-1.5">{o.name}</td><td className="px-3 py-1.5" style={mg}>{String(o.dueDate).slice(0, 10)}</td><td className="px-3 py-1.5 text-right font-mono font-semibold">{peso(o.amount)}</td></tr>)}
          </tbody></table>
        </div>
        <div className="flex items-center justify-between mb-3"><span className="text-sm font-semibold" style={mg}>Total to pay</span><span className="text-lg font-bold font-mono" style={{ color: 'var(--charcoal)' }}>{peso(total)}</span></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl} style={mg}>Date paid</label>
            <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} disabled={useDueDates} className={`${inp} disabled:opacity-50`} style={bc} />
            <label className="flex items-start gap-1.5 mt-1.5 text-[11px] cursor-pointer" style={mg}>
              <input type="checkbox" checked={useDueDates} onChange={e => setUseDueDates(e.target.checked)} className="mt-0.5" />
              <span>Date each payment at its own due date{hasPastDues ? ' (recommended — this batch includes past months)' : ''}</span>
            </label>
          </div>
          <div><label className={lbl} style={mg}>Bank account credited</label><select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} className={inp} style={bc}><option value="">— Select —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select></div>
          <div className="mt-2"><label className={lbl} style={mg}>Memo (optional)</label><textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} maxLength={500} placeholder="Description saved with this payment and shown in the books" className={inp} style={bc} /></div>
        </div>
        <div className="mt-3"><label className={lbl} style={mg}>Proof of deposit <span className="font-normal text-gray-400">(applied to all)</span></label><div className="flex flex-wrap items-center gap-2">{proofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="loan" prefix="BATCH-PAYMENT" existingCount={proofUrls.length} label="Add" onUploaded={u => setProofUrls(p => [...p, u])} /></div></div>
        <OtherExpensesSection rows={otherExp} setRows={setOtherExp} accts={accts} />
        {otherTotal > 0 && <div className="flex items-center justify-between mt-3"><span className="text-sm font-semibold" style={mg}>Total cash out</span><span className="text-lg font-bold font-mono" style={{ color: 'var(--charcoal)' }}>{peso(total + otherTotal)}</span></div>}
        <button onClick={save} disabled={busy} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} {busy ? `Recording ${done}/${occs.length}…` : `Record ${occs.length} payment${occs.length === 1 ? '' : 's'} (${peso(total + otherTotal)})`}</button>
      </div>
    </div>
  )
}

function RecordPaymentModal({ occ, banks, accts, onClose, onSaved }: { occ: PayRow; banks: Bank[]; accts: Acct[]; onClose: () => void; onSaved: () => void }) {
  // Past installments default to their due date (not today) so backfilled
  // payments land in the month they actually happened.
  const [paidDate, setPaidDate] = useState(() => {
    const due = String(occ.dueDate).slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    return due < today ? due : today
  })
  const [memo, setMemo] = useState('')
  const [bankAccountId, setBankAccountId] = useState(occ.paymentBankAccountId || occ.bankAccountId || '')
  const [proofUrls, setProofUrls] = useState<string[]>([])
  const [otherExp, setOtherExp] = useState<OtherExp[]>([])
  const [busy, setBusy] = useState(false)
  const otherTotal = otherExp.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const save = async () => {
    if (!bankAccountId) { alert('Select the bank account.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/loans/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: occ.kind, parentId: occ.parentId, dueDate: occ.dueDate, principalPortion: occ.principalPortion, interestPortion: occ.interestPortion, amount: occ.amount, paidDate, bankAccountId, proofUrls, otherExpenses: cleanOtherExp(otherExp), memo }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onSaved()
    } finally { setBusy(false) }
  }
  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'; const lbl = 'block text-xs font-semibold mb-1'; const bc = { borderColor: 'var(--light-gray)' }; const mg = { color: 'var(--mid-gray)' }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-gray-900">Record {occ.kind === 'advance' ? 'Advance' : 'Loan'} Payment</h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>
        <p className="text-xs mb-3" style={mg}>{occ.name} · due {String(occ.dueDate).slice(0, 10)} · {peso(occ.amount)} <span className="font-mono">(principal {peso(occ.principalPortion)} + interest {peso(occ.interestPortion)})</span></p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl} style={mg}>Date paid</label><input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Bank account credited</label><select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} className={inp} style={bc}><option value="">— Select —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select></div>
          <div className="mt-2"><label className={lbl} style={mg}>Memo (optional)</label><textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} maxLength={500} placeholder="Description saved with this payment and shown in the books" className={inp} style={bc} /></div>
        </div>
        <div className="mt-3"><label className={lbl} style={mg}>Proof of deposit</label><div className="flex flex-wrap items-center gap-2">{proofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="loan" prefix={`${(occ.name || 'PAY').replace(/\s+/g, '_')}-PAYMENT`} existingCount={proofUrls.length} label="Add" onUploaded={u => setProofUrls(p => [...p, u])} /></div></div>
        <OtherExpensesSection rows={otherExp} setRows={setOtherExp} accts={accts} />
        <p className="text-[11px] mt-2 font-mono" style={{ color: '#334155' }}>DR liability {peso(occ.principalPortion)} + DR interest {peso(occ.interestPortion)}{otherTotal > 0 ? ` + DR other ${peso(otherTotal)}` : ''} / CR bank {peso(occ.amount + otherTotal)}</p>
        <button onClick={save} disabled={busy} className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} Record payment{otherTotal > 0 ? ` (${peso(occ.amount + otherTotal)})` : ''}</button>
      </div>
    </div>
  )
}
