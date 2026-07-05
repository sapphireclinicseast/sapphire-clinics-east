'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { PieChart, Plus, Loader2, X, Eye, Trash2, Pencil } from 'lucide-react'
import { ScanUpload } from '@/components/ScanUpload'

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Bank { id: string; accountNumber: string; accountTitle: string }
interface Shareholder { id: string; shNumber: string; name: string; tin: string | null; birthdate: string | null; email: string | null; address: string | null }
interface CommonRow {
  id: string; shareholderId: string; shNumber: string; name: string; tin: string | null; birthdate: string | null; email: string | null; address: string | null
  dateAcquired: string; agreementType: string; assignedToShareholderId: string | null; agreementUrls: string[] | null
  stockCertNumber: string | null; proofOfDepositUrls: string[] | null; numberOfShares: number; pricePerShare: number
  totalCapitalization: number; equityStake: number; bankAccountId: string | null
  boughtBack: boolean; buybackPrice: number; buybackShares: number; buybackBankAccountId: string | null; buybackProofUrls: string[] | null
}
interface Figures { totalCapitalization: number; totalShares: number; treasuryShares: number }

export default function EquityPage() {
  const { data: session, status } = useSession()
  const [tab, setTab] = useState<'common' | 'preferred' | 'dividends'>('common')
  const [data, setData] = useState<{ rows: CommonRow[]; shareholders: Shareholder[]; figures: Figures } | null>(null)
  const [banks, setBanks] = useState<Bank[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<CommonRow | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/equity/common'); setData(r.ok ? await r.json() : null) }
    catch { setData(null) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { fetch('/api/bank-accounts').then(r => r.ok ? r.json() : []).then(setBanks).catch(() => setBanks([])) }, [])

  if (status === 'unauthenticated') redirect('/login')
  if (status === 'authenticated' && session?.user?.role !== 'ADMIN') {
    return <div className="p-8 text-center text-gray-500">Equity is restricted to the main administrator.</div>
  }

  const del = async (row: CommonRow) => {
    if (!confirm(`Delete ${row.shNumber} — ${row.name}'s common shares? Its journal entries are reversed.`)) return
    await fetch(`/api/equity/common?id=${row.id}`, { method: 'DELETE' }); load()
  }
  const bankLabel = (id: string | null) => { const b = banks.find(x => x.id === id); return b ? `${b.accountNumber} ${b.accountTitle}` : '—' }

  const fig = data?.figures
  return (
    <div className="p-6 max-w-screen-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <PieChart size={24} className="text-teal-600" />
        <h1 className="text-2xl font-semibold text-gray-900">Equity</h1>
      </div>

      {/* Top figures */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'var(--pale-teal)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>Total Capitalization</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--deep-teal)' }}>{peso(fig?.totalCapitalization || 0)}</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Total Number of Shares</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>{(fig?.totalShares || 0).toLocaleString('en-PH')}</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: '#fef2f2' }}>
          <p className="text-xs font-semibold" style={{ color: '#b91c1c' }}>Total Treasury Shares</p>
          <p className="text-2xl font-bold" style={{ color: '#b91c1c' }}>{(fig?.treasuryShares || 0).toLocaleString('en-PH')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        {([['common', 'Common Shares'], ['preferred', 'Preferred Shares'], ['dividends', 'Dividend Release History']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)} className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px"
            style={{ borderColor: tab === v ? 'var(--teal)' : 'transparent', color: tab === v ? 'var(--teal)' : 'var(--mid-gray)' }}>{label}</button>
        ))}
      </div>

      {tab === 'common' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> Add Common Shareholder</button>
          </div>
          <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs">
              <thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                {['SH #', 'Investor', 'Date Acq.', 'Stock Cert.', 'Shares', 'Price', 'Capitalization', '% Stake', 'Bank Debited', 'Bought back?', 'Proofs', ''].map(h => <th key={h} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={12} className="text-center py-10 text-gray-400"><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
                : (data?.rows || []).map(r => (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)', background: r.boughtBack ? '#fef2f2' : undefined }}>
                    <td className="px-3 py-2 font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{r.shNumber}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{r.name}{r.agreementType === 'DEED_OF_ASSIGNMENT' && <span className="ml-1 text-[10px] px-1 rounded" style={{ background: '#e0e7ff', color: '#3730a3' }}>Deed</span>}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{String(r.dateAcquired).slice(0, 10)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: 'var(--mid-gray)' }}>{r.stockCertNumber || '—'}</td>
                    <td className="px-3 py-2 text-right">{r.numberOfShares.toLocaleString('en-PH')}</td>
                    <td className="px-3 py-2 text-right">{peso(r.pricePerShare)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{peso(r.totalCapitalization)}</td>
                    <td className="px-3 py-2 text-right">{r.equityStake.toFixed(2)}%</td>
                    <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{bankLabel(r.bankAccountId)}</td>
                    <td className="px-3 py-2">{r.boughtBack ? <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#fee2e2', color: '#b91c1c' }}>Yes · {r.buybackShares.toLocaleString('en-PH')} @ {peso(r.buybackPrice)}</span> : 'No'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex gap-1.5">
                        {(r.proofOfDepositUrls || []).map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" title="Proof of deposit" style={{ color: 'var(--teal)' }}><Eye size={12} /></a>)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => setEdit(r)} className="p-1 rounded hover:bg-blue-50"><Pencil size={13} className="text-blue-500" /></button>
                      <button onClick={() => del(r)} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} className="text-red-400" /></button>
                    </td>
                  </tr>
                ))}
                {!loading && (data?.rows || []).length === 0 && <tr><td colSpan={12} className="text-center py-10 text-gray-400">No common shareholders yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'preferred' && <div className="rounded-2xl border p-8 text-center text-sm text-gray-400" style={{ borderColor: 'var(--light-gray)' }}>Preferred Shares — coming in the next update.</div>}
      {tab === 'dividends' && <div className="rounded-2xl border p-8 text-center text-sm text-gray-400" style={{ borderColor: 'var(--light-gray)' }}>Dividend Release History — coming in the next update.</div>}

      {(showAdd || edit) && <CommonModal row={edit} shareholders={data?.shareholders || []} banks={banks} onClose={() => { setShowAdd(false); setEdit(null) }} onSaved={() => { setShowAdd(false); setEdit(null); load() }} />}
    </div>
  )
}

function CommonModal({ row, shareholders, banks, onClose, onSaved }: { row: CommonRow | null; shareholders: Shareholder[]; banks: Bank[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    shareholderId: row?.shareholderId || '', name: row?.name || '', tin: row?.tin || '', birthdate: row?.birthdate ? String(row.birthdate).slice(0, 10) : '',
    email: row?.email || '', address: row?.address || '', dateAcquired: row?.dateAcquired ? String(row.dateAcquired).slice(0, 10) : new Date().toISOString().slice(0, 10),
    agreementType: row?.agreementType || 'SUBSCRIPTION', assignedToShareholderId: row?.assignedToShareholderId || '',
    stockCertNumber: row?.stockCertNumber || '', numberOfShares: row ? String(row.numberOfShares) : '', pricePerShare: row ? String(row.pricePerShare) : '',
    bankAccountId: row?.bankAccountId || '',
    boughtBack: row?.boughtBack || false, buybackPrice: row?.buybackPrice ? String(row.buybackPrice) : '', buybackShares: row?.buybackShares ? String(row.buybackShares) : '',
    buybackBankAccountId: row?.buybackBankAccountId || '',
  })
  const [agreementUrls, setAgreementUrls] = useState<string[]>(row?.agreementUrls || [])
  const [proofUrls, setProofUrls] = useState<string[]>(row?.proofOfDepositUrls || [])
  const [buybackProofUrls, setBuybackProofUrls] = useState<string[]>(row?.buybackProofUrls || [])
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: unknown) => setF(p => ({ ...p, [k]: v }))
  const n = (v: string) => Number(v) || 0
  const cap = n(f.numberOfShares) * n(f.pricePerShare)
  const prefix = f.stockCertNumber || f.name || 'SHARE'

  const pickShareholder = (id: string) => {
    const sh = shareholders.find(s => s.id === id)
    if (sh) setF(p => ({ ...p, shareholderId: id, name: sh.name, tin: sh.tin || '', birthdate: sh.birthdate ? String(sh.birthdate).slice(0, 10) : '', email: sh.email || '', address: sh.address || '' }))
    else setF(p => ({ ...p, shareholderId: '' }))
  }

  const save = async () => {
    if (!(n(f.numberOfShares) > 0) || !(n(f.pricePerShare) > 0)) { alert('Enter shares and price.'); return }
    if (!f.name.trim()) { alert('Investor name is required.'); return }
    setBusy(true)
    try {
      const body = { ...(row ? { id: row.id } : {}), ...f, numberOfShares: n(f.numberOfShares), pricePerShare: n(f.pricePerShare),
        buybackPrice: n(f.buybackPrice), buybackShares: n(f.buybackShares), agreementUrls, proofOfDepositUrls: proofUrls, buybackProofUrls }
      const r = await fetch('/api/equity/common', { method: row ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onSaved()
    } finally { setBusy(false) }
  }

  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'
  const lbl = 'block text-xs font-semibold mb-1'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-gray-900">{row ? `Edit ${row.shNumber}` : 'Add Common Shareholder'}</h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>

        {!row && (
          <div className="mb-3">
            <label className={lbl} style={{ color: 'var(--mid-gray)' }}>Existing shareholder <span className="font-normal text-gray-400">(pick to reuse their SH number, or leave blank for new)</span></label>
            <select value={f.shareholderId} onChange={e => pickShareholder(e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }}>
              <option value="">— New shareholder —</option>
              {shareholders.map(s => <option key={s.id} value={s.id}>{s.shNumber} — {s.name}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="col-span-2 sm:col-span-1"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Name of Investor</label><input value={f.name} onChange={e => set('name', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Date Acquired</label><input type="date" value={f.dateAcquired} onChange={e => set('dateAcquired', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>TIN Number</label><input value={f.tin} onChange={e => set('tin', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Birthdate</label><input type="date" value={f.birthdate} onChange={e => set('birthdate', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Email</label><input value={f.email} onChange={e => set('email', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></div>
          <div className="col-span-2 sm:col-span-3"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Complete Address</label><input value={f.address} onChange={e => set('address', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></div>

          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Agreement type</label>
            <select value={f.agreementType} onChange={e => set('agreementType', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }}>
              <option value="SUBSCRIPTION">Subscription Agreement</option><option value="DEED_OF_ASSIGNMENT">Deed of Assignment</option>
            </select>
          </div>
          {f.agreementType === 'DEED_OF_ASSIGNMENT' && (
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Assigned to shareholder</label>
              <select value={f.assignedToShareholderId} onChange={e => set('assignedToShareholderId', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }}>
                <option value="">— Select —</option>{shareholders.map(s => <option key={s.id} value={s.id}>{s.shNumber} — {s.name}</option>)}
              </select>
            </div>
          )}
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Stock Certificate No.</label><input value={f.stockCertNumber} onChange={e => set('stockCertNumber', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Number of Shares</label><input value={f.numberOfShares} onChange={e => set('numberOfShares', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={{ borderColor: 'var(--light-gray)' }} /></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Price per Share</label><input value={f.pricePerShare} onChange={e => set('pricePerShare', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={{ borderColor: 'var(--light-gray)' }} /></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Total Capitalization</label><div className="px-3 py-2 rounded-xl text-sm font-mono font-bold" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>{peso(cap)}</div></div>
          <div className="col-span-2 sm:col-span-3"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Bank account where the equity was debited</label>
            <select value={f.bankAccountId} onChange={e => set('bankAccountId', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }}>
              <option value="">— Not recorded (no journal entry) —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}
            </select>
            {f.bankAccountId && <p className="text-[11px] mt-1 font-mono" style={{ color: '#334155' }}>DR {banks.find(b => b.id === f.bankAccountId)?.accountTitle} {peso(cap)} / CR Common Share Capital {peso(cap)}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Subscription / Deed of Assignment</label>
            <div className="flex flex-wrap items-center gap-2">{agreementUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}
              <ScanUpload compact section="equity" prefix={`${prefix}-AGREEMENT`} existingCount={agreementUrls.length} label="Add" onUploaded={u => setAgreementUrls(p => [...p, u])} /></div>
          </div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Proof of deposit</label>
            <div className="flex flex-wrap items-center gap-2">{proofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}
              <ScanUpload compact section="equity" prefix={`${prefix}-DEPOSIT`} existingCount={proofUrls.length} label="Add" onUploaded={u => setProofUrls(p => [...p, u])} /></div>
          </div>
        </div>

        {/* Buyback */}
        <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
            <input type="checkbox" checked={f.boughtBack} onChange={e => set('boughtBack', e.target.checked)} /> Bought back? <span className="font-normal text-gray-400">(records to Treasury Shares)</span>
          </label>
          {f.boughtBack && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
              <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Price at Buyback</label><input value={f.buybackPrice} onChange={e => set('buybackPrice', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={{ borderColor: 'var(--light-gray)' }} /></div>
              <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Shares bought back</label><input value={f.buybackShares} onChange={e => set('buybackShares', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={{ borderColor: 'var(--light-gray)' }} /></div>
              <div className="col-span-2"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Bank account used to pay</label>
                <select value={f.buybackBankAccountId} onChange={e => set('buybackBankAccountId', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }}>
                  <option value="">— Select —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-4"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Proof of Buyback</label>
                <div className="flex flex-wrap items-center gap-2">{buybackProofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}
                  <ScanUpload compact section="equity" prefix={`${prefix}-BUYBACK`} existingCount={buybackProofUrls.length} label="Add" onUploaded={u => setBuybackProofUrls(p => [...p, u])} /></div>
                {n(f.buybackShares) > 0 && n(f.buybackPrice) > 0 && <p className="text-[11px] mt-1 font-mono" style={{ color: '#334155' }}>DR Treasury Shares {peso(n(f.buybackShares) * n(f.buybackPrice))} / CR {banks.find(b => b.id === f.buybackBankAccountId)?.accountTitle || 'Bank'} {peso(n(f.buybackShares) * n(f.buybackPrice))}</p>}
              </div>
            </div>
          )}
        </div>

        <button onClick={save} disabled={busy} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} {row ? 'Save changes' : 'Add shareholder'}</button>
      </div>
    </div>
  )
}
