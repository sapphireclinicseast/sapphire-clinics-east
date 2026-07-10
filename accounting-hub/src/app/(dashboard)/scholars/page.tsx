'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { GraduationCap, Plus, Loader2, X, Eye, Trash2, Pencil, CalendarClock, Wifi, WifiOff, Landmark } from 'lucide-react'
import { ScanUpload } from '@/components/ScanUpload'

const peso = (n: number) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const mkLabel = (mk?: string | null) => { if (!mk || !/^\d{4}-\d{2}$/.test(mk)) return '—'; const [y, m] = mk.split('-').map(Number); return `${MONTHS[m - 1]} ${y}` }
const addMonths = (mk: string, d: number) => { const [y, m] = mk.split('-').map(Number); const i = y * 12 + (m - 1) + d; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}` }
const scheduleMonths = (start?: string | null, n?: number | null): string[] => { if (!start || !/^\d{4}-\d{2}$/.test(start) || !n || n < 1) return []; return Array.from({ length: Math.min(n, 600) }, (_, i) => addMonths(start, i)) }

interface Bank { id: string; accountNumber: string; accountTitle: string }
interface Acct { id: string; accountNumber: string; accountTitle: string }
const ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

export default function ScholarsPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role
  const [data, setData] = useState<{ scholars: any[]; matrix: any[]; filters: any; portalConnected: boolean; portalError: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [banks, setBanks] = useState<Bank[]>([])
  const [fundAccts, setFundAccts] = useState<Acct[]>([])
  const [reminders, setReminders] = useState<any[]>([])
  const [fAy, setFAy] = useState(''); const [fSchool, setFSchool] = useState(''); const [fType, setFType] = useState('')
  const [edit, setEdit] = useState<any | null>(null)
  const [recording, setRecording] = useState(false)
  const [fund, setFund] = useState<any | null>(null)
  const [topUp, setTopUp] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/scholars'); setData(r.ok ? await r.json() : null) } catch { setData(null) } finally { setLoading(false) }
  }, [])
  const loadFund = useCallback(async () => { try { const r = await fetch('/api/scholars/fund'); setFund(r.ok ? await r.json() : null) } catch { setFund(null) } }, [])
  useEffect(() => { load(); loadFund() }, [load, loadFund])
  useEffect(() => { fetch('/api/bank-accounts').then(r => r.ok ? r.json() : []).then(setBanks).catch(() => setBanks([])) }, [])
  useEffect(() => { fetch('/api/chart-of-accounts?accountType=EQUITY&pageSize=1000').then(r => r.ok ? r.json() : { data: [] }).then(j => setFundAccts(((j.data || j.items || j || []) as Acct[]).map(a => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle })))).catch(() => setFundAccts([])) }, [])
  useEffect(() => { fetch('/api/scholars/reminders').then(r => r.ok ? r.json() : { reminders: [] }).then(j => setReminders(j.reminders || [])).catch(() => setReminders([])) }, [data])

  if (status === 'loading') return <div className="p-8 text-gray-400"><Loader2 className="animate-spin inline" size={18} /></div>
  if (status === 'authenticated' && !ROLES.includes(role as string)) redirect('/dashboard')

  const scholars = data?.scholars || []
  const matrix = data?.matrix || []
  const filters = data?.filters || { academicYears: [], schools: [], types: [] }
  const rows = scholars.filter(s =>
    (!fAy || s.academicYear === fAy) &&
    (!fSchool || s.school === fSchool) &&
    (!fType || s.scholarshipType === fType))

  const sel = 'px-3 py-2 rounded-xl border text-sm bg-white'; const bc = { borderColor: 'var(--light-gray)' }

  return (
    <div className="p-6 md:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <GraduationCap size={24} style={{ color: 'var(--teal)' }} />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>Scholars</h1>
          {data && (data.portalConnected
            ? <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}><Wifi size={12} /> Live · scholarship portal</span>
            : <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#fee2e2', color: '#b91c1c' }} title={data.portalError || ''}><WifiOff size={12} /> Portal unreachable</span>)}
        </div>
        <button onClick={() => setRecording(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> Record Monthly Release</button>
      </div>

      {/* Near-due reminders */}
      {reminders.length > 0 && (
        <div className="rounded-2xl border p-4" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
          <div className="flex items-center gap-2 mb-2"><CalendarClock size={17} style={{ color: '#b45309' }} /><h2 className="text-sm font-bold" style={{ color: '#92400e' }}>Scholar remittances due soon</h2><span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>{reminders.length}</span></div>
          <div className="space-y-1.5">
            {reminders.map(r => (
              <div key={r.awardId} className="flex items-center justify-between gap-3 text-xs">
                <span style={{ color: 'var(--charcoal)' }}><strong>{r.name}</strong> · {r.label} · {peso(r.amount)}{r.school ? ` · ${r.school}` : ''}</span>
                <span className="px-2 py-0.5 rounded-full font-semibold whitespace-nowrap" style={r.daysUntil <= 0 ? { background: '#fee2e2', color: '#b91c1c' } : { background: '#fef3c7', color: '#92400e' }}>{r.daysUntil <= 0 ? 'Due now' : r.daysUntil === 1 ? 'Due tomorrow' : `Due in ${r.daysUntil} days`} · {r.nextDue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scholarship Fund status */}
      {fund?.fundAccount && (
        <div className="rounded-2xl border bg-white p-4 flex items-center justify-between flex-wrap gap-3" style={{ borderColor: 'var(--light-gray)' }}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2"><Landmark size={18} style={{ color: 'var(--teal)' }} /><span className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{fund.fundAccount.accountNumber} · Scholarship Fund</span></div>
            <div className="flex items-center gap-4 text-xs">
              <div><span style={{ color: 'var(--mid-gray)' }}>Appropriated</span> <span className="font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{peso(fund.appropriated)}</span></div>
              <div><span style={{ color: 'var(--mid-gray)' }}>Released</span> <span className="font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{peso(fund.released)}</span></div>
              <div><span style={{ color: 'var(--mid-gray)' }}>Remaining</span> <span className="font-mono font-bold" style={{ color: fund.balance < 0 ? '#b91c1c' : '#166534' }}>{peso(fund.balance)}</span>{fund.balance < 0 && <span className="ml-1 text-[10px]" style={{ color: '#b91c1c' }}>(over-released — top up)</span>}</div>
            </div>
          </div>
          <button onClick={() => setTopUp(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}><Plus size={13} /> Top up fund</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={fAy} onChange={e => setFAy(e.target.value)} className={sel} style={bc}><option value="">All A.Y.</option>{filters.academicYears.map((a: string) => <option key={a} value={a}>{a}</option>)}</select>
        <select value={fSchool} onChange={e => setFSchool(e.target.value)} className={sel} style={bc}><option value="">All schools</option>{filters.schools.map((a: string) => <option key={a} value={a}>{a}</option>)}</select>
        <select value={fType} onChange={e => setFType(e.target.value)} className={sel} style={bc}><option value="">All types</option>{filters.types.map((a: string) => <option key={a} value={a}>{a}</option>)}</select>
        {(fAy || fSchool || fType) && <button onClick={() => { setFAy(''); setFSchool(''); setFType('') }} className="text-xs font-semibold" style={{ color: 'var(--teal)' }}>Clear</button>}
        <span className="text-xs ml-auto" style={{ color: 'var(--mid-gray)' }}>{rows.length} scholar{rows.length === 1 ? '' : 's'}</span>
      </div>

      {/* Per-month completion matrix */}
      {matrix.length > 0 && (
        <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-xs"><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
            <th className="px-3 py-2.5 font-semibold whitespace-nowrap sticky left-0" style={{ background: 'var(--off-white)' }}>Release month →</th>
            {matrix.map((m: any) => <th key={m.monthKey} className="px-3 py-2.5 font-semibold text-center whitespace-nowrap">{m.label}</th>)}
          </tr></thead><tbody>
            <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
              <td className="px-3 py-2 font-semibold sticky left-0 bg-white" style={{ color: 'var(--charcoal)' }}>Scholars paid</td>
              {matrix.map((m: any) => {
                const full = m.due > 0 && m.paid >= m.due; const partial = m.paid > 0 && m.paid < m.due
                const bg = full ? '#dcfce7' : partial ? '#fef9c3' : '#f8fafc'; const col = full ? '#166534' : partial ? '#854d0e' : 'var(--mid-gray)'
                return <td key={m.monthKey} className="px-3 py-2 text-center font-semibold" style={{ background: bg, color: col }}>{m.due > 0 ? `${m.paid > 0 ? '✓ ' : ''}${m.paid}/${m.due}` : '—'}</td>
              })}
            </tr>
          </tbody></table>
        </div>
      )}

      {/* Scholars table */}
      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-xs"><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
          {['Name of Scholar', 'Type of Scholarship', 'Amount Awarded', 'Released Monthly', 'Start Month', 'Day', 'No. of Months', 'End Month', 'Signed RSA', ''].map(h => <th key={h} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}
        </tr></thead><tbody>
          {loading ? <tr><td colSpan={10} className="text-center py-12 text-gray-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
            : rows.map((s: any) => {
              const rsa = (s.signedRsaUrls || []) as string[]
              return (
                <tr key={s.portalScholarId} className="border-t hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--light-gray)' }} onClick={() => setEdit(s)}>
                  <td className="px-3 py-2">
                    <div className="font-semibold" style={{ color: 'var(--charcoal)' }}>{s.name}{!s.inPortal && <span className="ml-1 text-[10px]" style={{ color: '#b45309' }}>(not in portal)</span>}</div>
                    <div className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>{[s.school, s.academicYear].filter(Boolean).join(' · ') || '—'}</div>
                  </td>
                  <td className="px-3 py-2">{s.scholarshipType || <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-right font-mono">{s.amountAwarded ? peso(s.amountAwarded) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-right font-mono">{s.monthlyAmount ? peso(s.monthlyAmount) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{mkLabel(s.startMonth)}</td>
                  <td className="px-3 py-2 text-center">{s.releaseDay ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-center">{s.numberOfMonths ?? <span className="text-gray-300">—</span>}{s.numberOfMonths ? <span className="text-[10px] ml-1" style={{ color: '#166534' }}>({s.releasedCount}✓)</span> : null}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{mkLabel(s.endMonth)}</td>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>{rsa.length ? rsa.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-0.5 mr-1" style={{ color: 'var(--teal)' }}><Eye size={12} />{i + 1}</a>) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-right"><button onClick={e => { e.stopPropagation(); setEdit(s) }} className="p-1 rounded hover:bg-gray-100"><Pencil size={13} style={{ color: 'var(--teal)' }} /></button></td>
                </tr>
              )
            })}
          {!loading && rows.length === 0 && <tr><td colSpan={10} className="text-center py-12 text-gray-400">{scholars.length === 0 ? 'No approved scholars found in the portal yet.' : 'No scholars match the filters.'}</td></tr>}
        </tbody></table>
      </div>

      {edit && <EditScholarModal scholar={edit} banks={banks} fundAccts={fundAccts} types={filters.types} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); loadFund() }} />}
      {recording && <RecordReleaseModal scholars={scholars} banks={banks} fundAccts={fundAccts} onClose={() => setRecording(false)} onSaved={() => { setRecording(false); load(); loadFund() }} />}
      {topUp && <TopUpFundModal fund={fund} onClose={() => setTopUp(false)} onSaved={() => { setTopUp(false); loadFund() }} />}
    </div>
  )
}

function EditScholarModal({ scholar, banks, fundAccts, types, onClose, onSaved }: { scholar: any; banks: Bank[]; fundAccts: Acct[]; types: string[]; onClose: () => void; onSaved: () => void }) {
  const [ay, setAy] = useState(scholar.academicYear || '')
  const [type, setType] = useState(scholar.scholarshipType || '')
  const [awarded, setAwarded] = useState(String(scholar.amountAwarded || ''))
  const [monthly, setMonthly] = useState(String(scholar.monthlyAmount || ''))
  const [startMonth, setStartMonth] = useState(scholar.startMonth || '')
  const [day, setDay] = useState(String(scholar.releaseDay ?? ''))
  const [months, setMonths] = useState(String(scholar.numberOfMonths ?? ''))
  const [bankAccountId, setBank] = useState(scholar.bankAccountId || '')
  const [expenseAccountId, setExp] = useState(scholar.expenseAccountId || fundAccts.find(a => a.accountNumber === '6070')?.id || '')
  const [rsaUrls, setRsaUrls] = useState<string[]>(scholar.signedRsaUrls || [])
  const [busy, setBusy] = useState(false)
  const [releases, setReleases] = useState<any[]>([])
  const [emailBusy, setEmailBusy] = useState('')

  const reloadReleases = useCallback(async () => { if (!scholar.awardId) return; const j = await (await fetch(`/api/scholars/releases?awardId=${scholar.awardId}`)).json(); setReleases(j.releases || []) }, [scholar.awardId])
  useEffect(() => { reloadReleases() }, [reloadReleases])

  const endM = (startMonth && months && Number(months) > 0) ? addMonths(startMonth, Number(months) - 1) : null
  const save = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/scholars', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        portalScholarId: scholar.portalScholarId, scholarName: scholar.name, school: scholar.school, email: scholar.email,
        academicYear: ay, scholarshipType: type, amountAwarded: Number(awarded || 0), monthlyAmount: Number(monthly || 0),
        startMonth: startMonth || null, releaseDay: day === '' ? null : Number(day), numberOfMonths: months === '' ? null : Number(months),
        signedRsaUrls: rsaUrls, bankAccountId, expenseAccountId,
      }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onSaved()
    } finally { setBusy(false) }
  }
  const emailOne = async (rel: any) => {
    if (!confirm(`Email ${scholar.name} their stipend notice for ${rel.label} (${peso(rel.amount)})? Proof of deposit will be attached.`)) return
    setEmailBusy(rel.id)
    try { const res = await fetch('/api/scholars/releases', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rel.id, action: 'email' }) }); if (!res.ok) { alert((await res.json()).error || 'Email failed'); return } await reloadReleases() } finally { setEmailBusy('') }
  }
  const delRel = async (rel: any) => { if (!confirm(`Delete the ${rel.label} release (${peso(rel.amount)})? Its journal entry is reversed.`)) return; await fetch(`/api/scholars/releases?id=${rel.id}`, { method: 'DELETE' }); reloadReleases(); onSaved() }

  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'; const bc = { borderColor: 'var(--light-gray)' }; const mg = { color: 'var(--mid-gray)' }; const lbl = 'block text-xs font-semibold mb-1'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1"><h2 className="text-lg font-bold text-gray-900">{scholar.name}</h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>
        <p className="text-xs mb-4" style={mg}>{[scholar.school, scholar.program, scholar.email].filter(Boolean).join(' · ') || '—'}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <div><label className={lbl} style={mg}>Academic Year</label><input value={ay} onChange={e => setAy(e.target.value)} placeholder="2025-2026" className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Type of Scholarship</label><input list="schol-types" value={type} onChange={e => setType(e.target.value)} placeholder="e.g. UGAT Fellowship" className={inp} style={bc} /><datalist id="schol-types">{types.map(t => <option key={t} value={t} />)}</datalist></div>
          <div><label className={lbl} style={mg}>Amount Awarded (total)</label><input type="number" value={awarded} onChange={e => setAwarded(e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Amount Released Monthly</label><input type="number" value={monthly} onChange={e => setMonthly(e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Start Month</label><input type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Release Day (N)</label><input type="number" min={1} max={31} value={day} onChange={e => setDay(e.target.value)} placeholder="15" className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Number of Months</label><input type="number" min={0} value={months} onChange={e => setMonths(e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>End Month</label><input value={mkLabel(endM)} disabled className={inp} style={{ ...bc, background: 'var(--off-white)' }} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className={lbl} style={mg}>Scholarship Fund (DR) <span className="font-normal text-gray-400">· off P&amp;L</span></label><select value={expenseAccountId} onChange={e => setExp(e.target.value)} className={inp} style={bc}><option value="">— none —</option>{fundAccts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select></div>
          <div><label className={lbl} style={mg}>Bank paid from (CR)</label><select value={bankAccountId} onChange={e => setBank(e.target.value)} className={inp} style={bc}><option value="">— none —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select></div>
        </div>
        <div className="mb-4"><label className={lbl} style={mg}>Signed RSA <span className="font-normal text-gray-400">(1+, QR/PDF)</span></label><div className="flex flex-wrap items-center gap-2">{rsaUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="scholars" prefix={`RSA-${scholar.portalScholarId.slice(-6)}`} existingCount={rsaUrls.length} label="Add RSA" onUploaded={u => setRsaUrls(p => [...p, u])} /></div></div>
        <div className="flex items-center gap-2 mb-4">
          <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} Save scholar terms</button>
          {scholar.awardId && <button onClick={async () => { if (!confirm(`Remove ${scholar.name}'s award terms and all ${releases.length} recorded release(s)? Journal entries are reversed. The scholar stays in the portal.`)) return; await fetch(`/api/scholars?id=${scholar.awardId}`, { method: 'DELETE' }); onSaved() }} className="px-3 py-2.5 rounded-xl text-sm font-semibold border flex items-center gap-1.5" style={{ borderColor: '#fecaca', color: '#b91c1c' }}><Trash2 size={14} /> Remove terms</button>}
        </div>

        {scholar.awardId && releases.length > 0 && (
          <div>
            <h3 className="text-xs font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Recorded releases</h3>
            <div className="rounded-xl border overflow-auto" style={{ borderColor: 'var(--light-gray)' }}>
              <table className="w-full text-xs"><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>{['Month', 'Deposited', 'Amount', 'Emailed', ''].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead><tbody>
                {releases.map((rel: any) => (
                  <tr key={rel.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-1.5 font-semibold">{rel.label}</td>
                    <td className="px-3 py-1.5">{String(rel.date).slice(0, 10)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{peso(rel.amount)}</td>
                    <td className="px-3 py-1.5">{rel.emailedAt ? <span className="text-[10px]" style={{ color: '#166534' }}>✓ {String(rel.emailedAt).slice(0, 10)}</span> : '—'}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap"><button onClick={() => emailOne(rel)} disabled={emailBusy === rel.id} className="px-2 py-1 rounded text-[11px] font-semibold text-white disabled:opacity-50 mr-1" style={{ background: 'var(--teal)' }}>{emailBusy === rel.id ? '…' : 'Email'}</button><button onClick={() => delRel(rel)} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} className="text-red-400" /></button></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function RecordReleaseModal({ scholars, banks, fundAccts, onClose, onSaved }: { scholars: any[]; banks: Bank[]; fundAccts: Acct[]; onClose: () => void; onSaved: () => void }) {
  const now = new Date()
  const [monthKey, setMonthKey] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [bankAccountId, setBank] = useState('')
  const [expenseAccountId, setExp] = useState(fundAccts.find(a => a.accountNumber === '6070')?.id || '')
  const [proofUrls, setProofUrls] = useState<string[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  // Scholars scheduled for the selected month who have terms and haven't been paid yet.
  const eligible = scholars.filter(s => s.awardId && s.monthlyAmount > 0 && scheduleMonths(s.startMonth, s.numberOfMonths).includes(monthKey) && !(s.releasedMonths || []).includes(monthKey))
  useEffect(() => { setChecked(new Set(eligible.map(s => s.awardId))) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [monthKey, scholars])
  const toggle = (id: string) => setChecked(c => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n })
  const total = eligible.filter(s => checked.has(s.awardId)).reduce((sum, s) => sum + Number(s.monthlyAmount || 0), 0)

  const save = async () => {
    if (checked.size === 0) { alert('Tick at least one scholar.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/scholars/releases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monthKey, date, awardIds: [...checked], bankAccountId, expenseAccountId, proofOfDepositUrls: proofUrls }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onSaved()
    } finally { setBusy(false) }
  }
  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'; const bc = { borderColor: 'var(--light-gray)' }; const mg = { color: 'var(--mid-gray)' }; const lbl = 'block text-xs font-semibold mb-1'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-gray-900">Record Monthly Release · <span style={{ color: 'var(--teal)' }}>{mkLabel(monthKey)}</span></h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div><label className={lbl} style={mg}>Release month</label><input type="month" value={monthKey} onChange={e => setMonthKey(e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Deposit date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Scholarship Fund (DR)</label><select value={expenseAccountId} onChange={e => setExp(e.target.value)} className={inp} style={bc}><option value="">— per scholar —</option>{fundAccts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select></div>
          <div><label className={lbl} style={mg}>Bank (CR)</label><select value={bankAccountId} onChange={e => setBank(e.target.value)} className={inp} style={bc}><option value="">— per scholar —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select></div>
        </div>
        <div className="rounded-xl border overflow-auto mb-3" style={{ borderColor: 'var(--light-gray)', maxHeight: 320 }}>
          <table className="w-full text-xs"><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
            <th className="px-3 py-2 font-semibold"><input type="checkbox" checked={checked.size === eligible.length && eligible.length > 0} onChange={e => setChecked(e.target.checked ? new Set(eligible.map(s => s.awardId)) : new Set())} /></th>
            {['Scholar', 'Type', 'Monthly Stipend'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
          </tr></thead><tbody>
            {eligible.map(s => (
              <tr key={s.awardId} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-3 py-1.5"><input type="checkbox" checked={checked.has(s.awardId)} onChange={() => toggle(s.awardId)} /></td>
                <td className="px-3 py-1.5">{s.name}{!s.email && <span className="ml-1 text-[10px]" style={{ color: '#b91c1c' }}>(no email)</span>}</td>
                <td className="px-3 py-1.5">{s.scholarshipType || '—'}</td>
                <td className="px-3 py-1.5 text-right font-mono">{peso(s.monthlyAmount)}</td>
              </tr>
            ))}
            {eligible.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-gray-400">No scholars scheduled (and unpaid) for {mkLabel(monthKey)}.</td></tr>}
          </tbody></table>
        </div>
        <div className="flex items-center justify-between mb-3">
          <div><label className={lbl} style={mg}>Proof of deposit</label><div className="flex flex-wrap items-center gap-2">{proofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="scholars" prefix={`SCHOLREL-${monthKey}-PROOF`} existingCount={proofUrls.length} label="Add proof" onUploaded={u => setProofUrls(p => [...p, u])} /></div></div>
          <div className="text-right"><p className="text-[11px]" style={mg}>{checked.size} scholar{checked.size === 1 ? '' : 's'}</p><p className="text-lg font-bold font-mono" style={{ color: 'var(--charcoal)' }}>{peso(total)}</p></div>
        </div>
        <p className="text-[11px] mb-2" style={mg}>Each release posts DR Scholarship Fund (equity) / CR Bank — a drawdown of appropriated retained earnings, so it does <strong>not</strong> hit the income statement. Scholars without a fund/bank set (here or on their record) are recorded without a journal entry.</p>
        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} Record {mkLabel(monthKey)} release</button>
      </div>
    </div>
  )
}

function TopUpFundModal({ fund, onClose, onSaved }: { fund: any; onClose: () => void; onSaved: () => void }) {
  const eq: Acct[] = fund?.equityAccts || []
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [retainedAccountId, setRet] = useState(fund?.retainedAccount?.id || '')
  const [fundAccountId, setFundAcct] = useState(fund?.fundAccount?.id || '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const appropriations: any[] = fund?.appropriations || []
  const save = async () => {
    if (!(Number(amount) > 0)) { alert('Enter an amount.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/scholars/fund', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: Number(amount), date, retainedAccountId, fundAccountId, note }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onSaved()
    } finally { setBusy(false) }
  }
  const delAppr = async (a: any) => { if (!confirm(`Delete the ${String(a.date).slice(0, 10)} appropriation of ${peso(a.amount)}? Its journal entry is reversed.`)) return; await fetch(`/api/scholars/fund?id=${a.id}`, { method: 'DELETE' }); onSaved() }
  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'; const bc = { borderColor: 'var(--light-gray)' }; const mg = { color: 'var(--mid-gray)' }; const lbl = 'block text-xs font-semibold mb-1'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1"><h2 className="text-lg font-bold text-gray-900">Top up Scholarship Fund</h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>
        <p className="text-xs mb-4" style={mg}>Appropriates retained earnings into the fund: DR Retained Earnings / CR Scholarship Fund. Both are equity — this never touches the income statement.</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className={lbl} style={mg}>Amount</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Retained Earnings (DR)</label><select value={retainedAccountId} onChange={e => setRet(e.target.value)} className={inp} style={bc}><option value="">— none —</option>{eq.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select></div>
          <div><label className={lbl} style={mg}>Scholarship Fund (CR)</label><select value={fundAccountId} onChange={e => setFundAcct(e.target.value)} className={inp} style={bc}><option value="">— none —</option>{eq.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select></div>
        </div>
        <div className="mb-3"><label className={lbl} style={mg}>Note <span className="font-normal text-gray-400">(optional)</span></label><input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Board Res. 2026-01 · AY 2025-2026 scholarship budget" className={inp} style={bc} /></div>
        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2 mb-4" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} Record appropriation</button>
        {appropriations.length > 0 && (
          <div>
            <h3 className="text-xs font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Appropriations</h3>
            <div className="rounded-xl border overflow-auto" style={{ borderColor: 'var(--light-gray)' }}>
              <table className="w-full text-xs"><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>{['Date', 'Amount', 'Note', ''].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead><tbody>
                {appropriations.map((a: any) => (
                  <tr key={a.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-1.5">{String(a.date).slice(0, 10)}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold">{peso(a.amount)}</td>
                    <td className="px-3 py-1.5 truncate max-w-[180px]" style={mg}>{a.description}</td>
                    <td className="px-3 py-1.5 text-right"><button onClick={() => delAppr(a)} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} className="text-red-400" /></button></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
