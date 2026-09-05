'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useResizableColumns, ResizableColgroup, ColResizeHandle } from '@/components/useResizableColumns'
import { redirect } from 'next/navigation'
import { PieChart, Plus, Loader2, X, Eye, Trash2, Pencil } from 'lucide-react'
import { applySortFilter, type SortCol } from '@/components/SortFilterHead'

// Shares bought back or sold on to another holder are shown net, so sorting
// and filtering follow the figure on screen rather than the original subscription.
const netShares = (r: { numberOfShares: number; buybackShares?: number; boughtBack?: boolean; transferredShares?: number }) =>
  r.numberOfShares
  - (r.boughtBack && (r.buybackShares || 0) > 0 ? (r.buybackShares || 0) : 0)
  - (r.transferredShares || 0)

const COMMON_COLS: SortCol[] = [
  { key: 'shNumber', label: 'SH #' }, { key: 'name', label: 'Investor' },
  { key: 'shareClass', label: 'Class' }, { key: 'dateAcquired', label: 'Date Acq.' },
  { key: 'stockCertNumber', label: 'Stock Cert.' }, { key: 'shares', label: 'Shares' },
  { key: 'truePar', label: 'True Par (PHP)' }, { key: 'apic', label: 'APIC (PHP)' },
  { key: 'pricePerShare', label: 'Price/Share (PHP)' }, { key: 'capitalization', label: 'Capitalization' },
  { key: 'stakeCurrent', label: '% Stake (Current)' }, { key: 'stakeTotal', label: '% Stake (Total)' },
  { key: 'bank', label: 'Bank Debited' }, { key: 'boughtBack', label: 'Bought back?' },
  { key: 'validId', label: 'Valid ID' }, { key: 'proofs', label: 'Proofs' },
]
const COMMON_NUMERIC = ['dateAcquired', 'shares', 'truePar', 'apic', 'pricePerShare', 'capitalization', 'stakeCurrent', 'stakeTotal']

const PREFERRED_COLS: SortCol[] = [
  { key: 'shNumber', label: 'SH #' }, { key: 'name', label: 'Investor' },
  { key: 'shareClass', label: 'Class' }, { key: 'dateAcquired', label: 'Date' },
  { key: 'shares', label: 'Shares' }, { key: 'truePar', label: 'True Par (PHP)' },
  { key: 'apic', label: 'APIC (PHP)' }, { key: 'pricePerShare', label: 'Price/Share (PHP)' },
  { key: 'capitalization', label: 'Capitalization' }, { key: 'stake', label: '% Stake' },
  { key: 'interest', label: 'Interest' }, { key: 'maturity', label: 'Maturity' },
  { key: 'payout', label: 'Payout' }, { key: 'bank', label: 'Bank' }, { key: 'validId', label: 'Valid ID' },
]
const PREFERRED_NUMERIC = ['dateAcquired', 'shares', 'truePar', 'apic', 'pricePerShare', 'capitalization', 'stake', 'interest']
import { ScanUpload } from '@/components/ScanUpload'
import DownloadMenu from '@/components/ui/DownloadMenu'
import { downloadXlsx, downloadPdf } from '@/lib/export'

// Per-share values (par, APIC, price/share) can carry sub-centavo precision, so
// show up to 3 decimals; whole/2-decimal amounts still render with 2.
const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 3 })

interface Bank { id: string; accountNumber: string; accountTitle: string }
interface Shareholder { id: string; shNumber: string; name: string; tin: string | null; birthdate: string | null; email: string | null; address: string | null }
const COMMON_SHARE_CLASSES = [
  'Common – Voting – with Par',
  'Common – Voting – without Par',
  'Founders – Voting – with Par',
  'Founders – Voting – without Par',
]
const PREFERRED_SHARE_CLASSES = [
  'Preferred – Voting – with Par',
  'Preferred – Non-Voting – with Par',
  'Redeemable Preferred – Voting – with Par',
  'Redeemable Preferred – Non-Voting – with Par',
]

interface Buyback { id: string; date: string; shares: number; price: number; amount: number; bankAccountId: string | null; treasuryAccountId: string | null; proofUrls: string[] | null }
// A secondary sale out of a holding: shares sold to a current shareholder or an
// external party. The price is what the buyer privately paid the seller — it
// never passes through a company bank account.
interface Transfer { id: string; date: string; shares: number; price: number; amount: number; toShareholderId: string; toShNumber: string; toName: string; toCommonShareId: string | null; proofUrls: string[] | null }
// Consideration received for a holding — a cash deposit into a bank account, or
// non-cash consideration (e.g. equipment bought for the company) debited to an
// asset account. A holding may have many.
interface Deposit { id: string; date: string; amount: number; kind: 'CASH' | 'NON_CASH'; bankAccountId: string | null; assetAccountId: string | null; note: string | null; proofUrls: string[] | null }
interface CommonRow {
  id: string; shareholderId: string; shNumber: string; name: string; tin: string | null; birthdate: string | null; email: string | null; address: string | null
  dateAcquired: string; agreementType: string; assignedToShareholderId: string | null; agreementUrls: string[] | null
  stockCertNumber: string | null; proofOfDepositUrls: string[] | null; validIdUrls: string[] | null; shareClass: string | null; numberOfShares: number; truePar: number; apic: number; pricePerShare: number
  totalCapitalization: number; equityStake: number; equityStakeCurrent: number; equityStakeTotal: number; bankAccountId: string | null; equityAccountId: string | null
  soldFromTreasury: boolean
  rescinded: boolean
  boughtBack: boolean; buybackShares: number; buybacks: Buyback[]
  transferredShares: number; transfers: Transfer[]
  acquiredViaTransfer: boolean; transferFromName: string | null; transferFromShNumber: string | null
  retired: boolean
  receivableAccountId: string | null; deposits: Deposit[]; depositedAmount: number; unaccountedAmount: number
}
interface EquityAcct { id: string; accountNumber: string; accountTitle: string }
interface Figures { totalCapitalization: number; totalShares: number; treasuryShares: number; authorizedShares: number; authorizedCommonShares: number | null; authorizedFounderShares: number | null }

const EQUITY_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

export default function EquityPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role
  const isAdmin = role === 'ADMIN'
  const [tab, setTab] = useState<'common' | 'preferred' | 'dividends' | 'certificates'>('common')
  const commonTableRef = useRef<HTMLTableElement>(null)
  const commonRz = useResizableColumns('equity-common-list', commonTableRef)
  const [data, setData] = useState<{ rows: CommonRow[]; shareholders: Shareholder[]; figures: Figures } | null>(null)
  const [banks, setBanks] = useState<Bank[]>([])
  const [equityAccts, setEquityAccts] = useState<EquityAcct[]>([])
  const [assetAccts, setAssetAccts] = useState<EquityAcct[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<CommonRow | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editAuth, setEditAuth] = useState(false)
  const [authInput, setAuthInput] = useState('')
  const [authCommonInput, setAuthCommonInput] = useState('')
  const [authFounderInput, setAuthFounderInput] = useState('')
  const [savingAuth, setSavingAuth] = useState(false)

  const load = useCallback(async () => {
    // Common-shares data is admin-only; accountants/bookkeepers see the Preferred tab only.
    if (!isAdmin) { setLoading(false); return }
    setLoading(true)
    try { const r = await fetch('/api/equity/common'); setData(r.ok ? await r.json() : null) }
    catch { setData(null) } finally { setLoading(false) }
  }, [isAdmin])
  useEffect(() => { load() }, [load])
  useEffect(() => { fetch('/api/bank-accounts').then(r => r.ok ? r.json() : []).then(setBanks).catch(() => setBanks([])) }, [])
  useEffect(() => {
    fetch('/api/chart-of-accounts?accountType=EQUITY&pageSize=1000').then(r => r.ok ? r.json() : { data: [] })
      .then(j => setEquityAccts(((j.data || j.items || j || []) as EquityAcct[]).map(a => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle }))))
      .catch(() => setEquityAccts([]))
  }, [])
  // Assets serve two jobs here: what non-cash consideration is debited to (e.g.
  // equipment), and where an unpaid subscription balance sits (a receivable).
  useEffect(() => {
    fetch('/api/chart-of-accounts?accountType=ASSET&pageSize=1000').then(r => r.ok ? r.json() : { data: [] })
      .then(j => setAssetAccts(((j.data || j.items || j || []) as EquityAcct[]).map(a => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle }))))
      .catch(() => setAssetAccts([]))
  }, [])

  if (status === 'unauthenticated') redirect('/login')
  if (status === 'authenticated' && !EQUITY_ROLES.includes(role as string)) {
    return <div className="p-8 text-center text-gray-500">Equity is restricted to Admin, Accountant, and Bookkeeper roles.</div>
  }
  // Accountants/bookkeepers get Preferred Shares + Dividend Release History; the
  // Common Shares tab (and its figures) stays admin-only.
  const allowedTabs = isAdmin ? ['common', 'preferred', 'dividends', 'certificates'] : ['preferred', 'dividends']
  const effectiveTab = allowedTabs.includes(tab) ? tab : 'preferred'

  const del = async (row: CommonRow) => {
    if (!confirm(`Delete ${row.shNumber} — ${row.name}'s common shares? Its journal entries are reversed.`)) return
    await fetch(`/api/equity/common?id=${row.id}`, { method: 'DELETE' }); load()
  }
  const bankLabel = (id: string | null) => { const b = banks.find(x => x.id === id); return b ? `${b.accountNumber} ${b.accountTitle}` : '—' }

  const cs = useSortFilter('shNumber')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commonValue = (r: any, k: string): string | number => {
    switch (k) {
      case 'dateAcquired': return +new Date(String(r.dateAcquired).slice(0, 10))
      case 'shares': return netShares(r)
      case 'capitalization': return netShares(r) * r.pricePerShare
      case 'truePar': return r.truePar
      case 'apic': return r.apic
      case 'pricePerShare': return r.pricePerShare
      case 'stakeCurrent': return r.equityStakeCurrent
      case 'stakeTotal': return r.equityStakeTotal
      case 'bank': return bankLabel(r.bankAccountId)
      case 'boughtBack': return r.boughtBack ? `yes ${r.buybackShares}` : 'no'
      case 'validId': return (r.validIdUrls || []).length
      case 'proofs': return (r.proofOfDepositUrls || []).length
      default: return r[k] ?? ''
    }
  }
  // Filters match what is on screen: a date reads as its printed string, and an
  // amount as its formatted figure, so "5,008" and "2024-02" both work.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commonText = (r: any, k: string): string => {
    switch (k) {
      case 'dateAcquired': return String(r.dateAcquired).slice(0, 10)
      case 'shares': return netShares(r).toLocaleString('en-PH')
      case 'capitalization': return peso(netShares(r) * r.pricePerShare)
      case 'truePar': return peso(r.truePar)
      case 'apic': return peso(r.apic)
      case 'pricePerShare': return peso(r.pricePerShare)
      case 'stakeCurrent': return r.equityStakeCurrent.toFixed(3)
      case 'stakeTotal': return r.equityStakeTotal.toFixed(3)
      default: return String(commonValue(r, k))
    }
  }
  // Hide fully-retired holdings (all shares sold/bought back) and rescinded
  // ones from the registry view; remembered per browser.
  const [hideRetired, setHideRetired] = useState(false)
  useEffect(() => {
    try { setHideRetired(localStorage.getItem('equityHideRetired') === '1') } catch { /* ignore */ }
  }, [])
  const toggleHideRetired = () => setHideRetired(v => {
    try { localStorage.setItem('equityHideRetired', v ? '0' : '1') } catch { /* ignore */ }
    return !v
  })
  const commonRows = useMemo(
    () => applySortFilter(data?.rows || [], commonValue, cs.sortKey, cs.sortDir, cs.filters, commonText)
      .filter(r => !hideRetired || (!r.retired && !r.rescinded)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, cs.sortKey, cs.sortDir, cs.filters, banks, hideRetired],
  )
  // One line per person: holdings grouped by shareholder (in current sort
  // order); a click unfolds that person's full holding history.
  const groupedCommon = useMemo(() => {
    const m = new Map<string, typeof commonRows>()
    for (const r of commonRows) {
      if (!m.has(r.shareholderId)) m.set(r.shareholderId, [])
      m.get(r.shareholderId)!.push(r)
    }
    const groups = [...m.values()]
    // The summary lines show group AGGREGATES, so a header sort must order the
    // groups by those aggregates — ordering by each group's best row scrambles
    // the sums (a person with many small holdings sorts wrong).
    const key = cs.sortKey
    if (key) {
      const dir = cs.sortDir === 'asc' ? 1 : -1
      const aggOf = (g: typeof commonRows): number | string | null => {
        const live = g.filter(r => !r.rescinded)
        switch (key) {
          case 'shares': return live.reduce((s2, r) => s2 + netShares(r), 0)
          case 'capitalization': return live.reduce((s2, r) => s2 + netShares(r) * r.pricePerShare, 0)
          case 'stakeCurrent': return g.reduce((s2, r) => s2 + r.equityStakeCurrent, 0)
          case 'stakeTotal': return g.reduce((s2, r) => s2 + r.equityStakeTotal, 0)
          case 'dateAcquired': return Math.min(...g.map(r => +new Date(r.dateAcquired)))
          case 'truePar': return Math.max(...g.map(r => r.truePar || 0))
          case 'apic': return Math.max(...g.map(r => r.apic || 0))
          case 'pricePerShare': return Math.max(...g.map(r => r.pricePerShare || 0))
          case 'name': return (g[0].name || '').toLowerCase()
          case 'shNumber': return g[0].shNumber
          default: return null
        }
      }
      if (groups.length && aggOf(groups[0]) != null) {
        groups.sort((a, b) => {
          const va = aggOf(a), vb = aggOf(b)
          return (va! < vb! ? -1 : va! > vb! ? 1 : 0) * dir
        })
      }
    }
    return groups
  }, [commonRows, cs.sortKey, cs.sortDir])
  const [openShareholders, setOpenShareholders] = useState<Set<string>>(new Set())
  const toggleShareholder = (id: string) =>
    setOpenShareholders(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Export the common-shareholder list (net-of-buyback shares & capitalization) to Excel/PDF.
  const exportCommon = (format: 'xlsx' | 'pdf') => {
    const rows = data?.rows || []
    const num = (n: number) => n.toLocaleString('en-PH')
    const headers = ['SH #', 'Investor', 'Class', 'Source', 'Date Acquired', 'Stock Cert.', 'Net Shares', 'Bought Back', 'Buyback Date(s)', 'Sold', 'Sold To', 'True Par', 'APIC', 'Price/Share', 'Capitalization', '% Stake (Current)', '% Stake (Total)', 'Bank Debited']
    const body = rows.map(r => {
      const net = netShares(r)
      const buybackDates = (r.buybacks && r.buybacks.length)
        ? r.buybacks.map(b => `${String(b.date).slice(0, 10)} (${num(b.shares)})`).join('; ')
        : ''
      const soldTo = (r.transfers && r.transfers.length)
        ? r.transfers.map(t => `${String(t.date).slice(0, 10)}: ${num(t.shares)} → ${t.toName}`).join('; ')
        : ''
      return [
        r.shNumber, r.name, r.shareClass || '',
        r.acquiredViaTransfer ? `Bought from ${r.transferFromName || 'shareholder'}` : r.soldFromTreasury ? 'Purchase from Treasury' : 'Original Issuance',
        String(r.dateAcquired).slice(0, 10), r.stockCertNumber || '',
        num(net), r.buybackShares ? num(r.buybackShares) : '', buybackDates,
        r.transferredShares ? num(r.transferredShares) : '', soldTo,
        r.truePar, r.apic, r.pricePerShare,
        (net * r.pricePerShare), r.equityStakeCurrent.toFixed(3) + '%', r.equityStakeTotal.toFixed(3) + '%', bankLabel(r.bankAccountId),
      ]
    })
    const totalNet = rows.reduce((s, r) => s + netShares(r), 0)
    const totalCap = rows.reduce((s, r) => s + netShares(r) * r.pricePerShare, 0)
    const subtitle = `${rows.length} common shareholders · ${num(totalNet)} outstanding shares · ₱${totalCap.toLocaleString('en-PH', { minimumFractionDigits: 2 })} capitalization`
    if (format === 'xlsx') {
      downloadXlsx('Common-Shareholders', [{ name: 'Common Shareholders', headers, rows: body }])
    } else {
      downloadPdf({ title: 'Common Shareholders', subtitle, headers, rows: body, landscape: true })
    }
  }

  const saveAuth = async () => {
    const val = Math.round(Number(authInput.replace(/[, ]/g, '')))
    if (!Number.isFinite(val) || val < 0) { alert('Enter a valid number of authorized shares.'); return }
    const parseLimit = (s: string) => { const t = s.replace(/[, ]/g, '').trim(); if (t === '') return null; const n = Math.round(Number(t)); return Number.isFinite(n) && n >= 0 ? n : NaN }
    const common = parseLimit(authCommonInput), founder = parseLimit(authFounderInput)
    if (Number.isNaN(common) || Number.isNaN(founder)) { alert('Class limits must be blank or a non-negative number.'); return }
    if ((common || 0) + (founder || 0) > val && (common != null || founder != null)) {
      if (!confirm(`Common + Founder limits (${((common || 0) + (founder || 0)).toLocaleString('en-PH')}) exceed total authorized (${val.toLocaleString('en-PH')}). Save anyway?`)) return
    }
    setSavingAuth(true)
    try {
      const r = await fetch('/api/equity/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authorizedShares: val, authorizedCommonShares: common, authorizedFounderShares: founder }) })
      if (!r.ok) { alert('Failed to save authorized shares.'); return }
      setEditAuth(false); load()
    } finally { setSavingAuth(false) }
  }

  const fig = data?.figures
  // Outstanding (net-of-buyback) shares split by class group for the summary cards.
  const netOf = (r: CommonRow) => r.numberOfShares - (r.buybackShares || 0) - (r.transferredShares || 0)
  // Rescinded holdings are as if never issued — they count toward neither class.
  const foundersShares = (data?.rows || []).filter(r => !r.rescinded && (r.shareClass || '').toLowerCase().startsWith('founders')).reduce((s, r) => s + netOf(r), 0)
  const commonClassShares = (data?.rows || []).filter(r => !r.rescinded && (r.shareClass || '').toLowerCase().startsWith('common')).reduce((s, r) => s + netOf(r), 0)
  // Over-authorization alarms.
  const authTotal = fig?.authorizedShares ?? 20000000
  const authCommon = fig?.authorizedCommonShares ?? null
  const authFounder = fig?.authorizedFounderShares ?? null
  const overCommon = authCommon != null && commonClassShares > authCommon
  const overFounder = authFounder != null && foundersShares > authFounder
  const overTotal = (fig?.totalShares ?? 0) > authTotal
  return (
    <div className="p-6 max-w-screen-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <PieChart size={24} className="text-teal-600" />
        <h1 className="text-2xl font-semibold text-gray-900">Equity</h1>
      </div>

      {(overTotal || overCommon || overFounder) && (
        <div className="rounded-xl border p-3 text-sm flex items-start gap-2" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}>
          <span className="font-bold whitespace-nowrap">⚠ Over authorized:</span>
          <span>
            {overTotal && <>Outstanding shares {(fig?.totalShares || 0).toLocaleString('en-PH')} exceed total authorized {authTotal.toLocaleString('en-PH')}. </>}
            {overCommon && <>Common {commonClassShares.toLocaleString('en-PH')} exceeds its authorized limit {authCommon!.toLocaleString('en-PH')}. </>}
            {overFounder && <>Founders {foundersShares.toLocaleString('en-PH')} exceeds its authorized limit {authFounder!.toLocaleString('en-PH')}. </>}
          </span>
        </div>
      )}

      {/* Top figures — org-wide equity totals (admin only) */}
      {isAdmin && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'var(--pale-teal)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>Total Capitalization</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--deep-teal)' }}>{peso(fig?.totalCapitalization || 0)}</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Authorized Shares</p>
            {!editAuth && <button onClick={() => { setAuthInput(String(fig?.authorizedShares ?? 20000000)); setAuthCommonInput(fig?.authorizedCommonShares != null ? String(fig.authorizedCommonShares) : ''); setAuthFounderInput(fig?.authorizedFounderShares != null ? String(fig.authorizedFounderShares) : ''); setEditAuth(true) }} className="p-1 rounded hover:bg-gray-100" title="Edit authorized shares"><Pencil size={13} className="text-blue-500" /></button>}
          </div>
          {editAuth ? (
            <div className="space-y-1.5 mt-1">
              <div className="flex items-center gap-1.5">
                <input autoFocus value={authInput} onChange={e => setAuthInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveAuth(); if (e.key === 'Escape') setEditAuth(false) }} placeholder="Total authorized"
                  className="w-full px-2 py-1 rounded-lg border text-lg font-bold" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} inputMode="numeric" />
                <button onClick={saveAuth} disabled={savingAuth} className="px-2 py-1 rounded-lg text-white text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--teal)' }}>{savingAuth ? <Loader2 size={13} className="animate-spin" /> : 'Save'}</button>
                <button onClick={() => setEditAuth(false)} className="p-1 rounded hover:bg-gray-100"><X size={14} className="text-gray-400" /></button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] w-14 shrink-0" style={{ color: 'var(--mid-gray)' }}>Common</span>
                <input value={authCommonInput} onChange={e => setAuthCommonInput(e.target.value)} placeholder="no sub-limit" className="w-full px-2 py-1 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} inputMode="numeric" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] w-14 shrink-0" style={{ color: 'var(--mid-gray)' }}>Founders</span>
                <input value={authFounderInput} onChange={e => setAuthFounderInput(e.target.value)} placeholder="no sub-limit" className="w-full px-2 py-1 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} inputMode="numeric" />
              </div>
            </div>
          ) : (
            <>
              <p className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>{(fig?.authorizedShares ?? 20000000).toLocaleString('en-PH')}</p>
              {(fig?.authorizedCommonShares != null || fig?.authorizedFounderShares != null) && (
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                  Common: {fig?.authorizedCommonShares != null ? fig.authorizedCommonShares.toLocaleString('en-PH') : '—'} · Founders: {fig?.authorizedFounderShares != null ? fig.authorizedFounderShares.toLocaleString('en-PH') : '—'}
                </p>
              )}
            </>
          )}
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Total Number of Shares <span className="font-normal text-gray-400">(outstanding)</span></p>
          <p className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>{(fig?.totalShares || 0).toLocaleString('en-PH')}</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Total Common Shares <span className="font-normal text-gray-400">(outstanding)</span></p>
          <p className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>{commonClassShares.toLocaleString('en-PH')}</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Total Founders Shares <span className="font-normal text-gray-400">(outstanding)</span></p>
          <p className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>{foundersShares.toLocaleString('en-PH')}</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: '#fef2f2' }}>
          <p className="text-xs font-semibold" style={{ color: '#b91c1c' }}>Total Treasury Shares <span className="font-normal" style={{ color: '#d4a0a0' }}>(available for sale)</span></p>
          <p className="text-2xl font-bold" style={{ color: '#b91c1c' }}>{(fig?.treasuryShares || 0).toLocaleString('en-PH')}</p>
        </div>
      </div>
      )}

      {/* Tabs — accountants/bookkeepers only see Preferred Shares */}
      <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        {(isAdmin ? [['common', 'Common Shares'], ['preferred', 'Preferred Shares'], ['dividends', 'Dividend Release History'], ['certificates', 'Certificates']] : [['preferred', 'Preferred Shares'], ['dividends', 'Dividend Release History']]).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v as 'common' | 'preferred' | 'dividends' | 'certificates')} className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px"
            style={{ borderColor: effectiveTab === v ? 'var(--teal)' : 'transparent', color: effectiveTab === v ? 'var(--teal)' : 'var(--mid-gray)' }}>{label}</button>
        ))}
      </div>

      {effectiveTab === 'common' && (
        <div className="space-y-3">
          <div className="flex justify-end items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none" style={{ color: 'var(--mid-gray)' }}
              title="Hide holdings whose shares are all sold or bought back, and rescinded ones">
              <input type="checkbox" checked={hideRetired} onChange={toggleHideRetired} />
              Hide retired shareholders
            </label>
            <DownloadMenu onDownload={exportCommon} size="md" />
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> Add Common Shareholder</button>
          </div>
          <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            <table ref={commonTableRef} className="w-full text-xs" style={commonRz.tableStyle}>
              <ResizableColgroup rz={commonRz} />
              <SortHead cols={COMMON_COLS} sortKey={cs.sortKey} sortDir={cs.sortDir} filters={cs.filters}
                onToggleSort={k => cs.toggleSort(k, COMMON_NUMERIC)} onFilter={cs.setFilter} rz={commonRz} />
              <tbody>
                {loading ? <tr><td colSpan={17} className="text-center py-10 text-gray-400"><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
                : groupedCommon.map(g => {
                  const shId = g[0].shareholderId
                  const open = openShareholders.has(shId)
                  const liveRows = g.filter(r => !r.rescinded)
                  const totalNet = liveRows.reduce((s2, r) => s2 + netShares(r), 0)
                  const totalCap = liveRows.reduce((s2, r) => s2 + netShares(r) * r.pricePerShare, 0)
                  const stakeCur = g.reduce((s2, r) => s2 + r.equityStakeCurrent, 0)
                  const stakeTot = g.reduce((s2, r) => s2 + r.equityStakeTotal, 0)
                  const buybackTotal = g.reduce((s2, r) => s2 + (r.buybackShares || 0), 0)
                  const classes = [...new Set(g.map(r => r.shareClass).filter(Boolean))]
                  const dates = g.map(r => String(r.dateAcquired).slice(0, 10)).sort()
                  const rescindedCount = g.length - liveRows.length
                  return (
                  <Fragment key={shId}>
                  <tr className="border-t cursor-pointer hover:bg-gray-50" style={{ borderColor: 'var(--light-gray)', background: open ? 'var(--off-white)' : undefined }}
                    onClick={() => toggleShareholder(shId)}>
                    <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{open ? '▾' : '▸'} {g[0].shNumber}</td>
                    <td className="px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)', overflow: 'hidden', wordBreak: 'break-word' }}>
                      {g[0].name}
                      <span className="ml-1.5 font-normal text-[10px]" style={{ color: 'var(--mid-gray)' }}>{g.length} holding{g.length !== 1 ? 's' : ''}</span>
                      {rescindedCount > 0 && <span className="ml-1 text-[10px] px-1 rounded whitespace-nowrap font-semibold" style={{ background: '#e5e7eb', color: '#374151' }}>{rescindedCount} rescinded</span>}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--mid-gray)', overflow: 'hidden' }}>{classes.length === 1 ? classes[0] : classes.length ? `${classes.length} classes` : '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{dates.length > 1 ? `${dates[0]} …` : (dates[0] || '—')}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{g.filter(r => r.stockCertNumber).length || '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{totalNet.toLocaleString('en-PH')}</td>
                    <td className="px-3 py-2 text-right" style={{ color: 'var(--mid-gray)' }}>—</td>
                    <td className="px-3 py-2 text-right" style={{ color: 'var(--mid-gray)' }}>—</td>
                    <td className="px-3 py-2 text-right" style={{ color: 'var(--mid-gray)' }}>—</td>
                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{peso(totalCap)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{stakeCur.toFixed(3)}%</td>
                    <td className="px-3 py-2 text-right" style={{ color: 'var(--mid-gray)' }}>{stakeTot.toFixed(3)}%</td>
                    <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>—</td>
                    <td className="px-3 py-2">{buybackTotal > 0 ? <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#fee2e2', color: '#b91c1c' }}>Yes · {buybackTotal.toLocaleString('en-PH')}</span> : 'No'}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>—</td>
                    <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>—</td>
                    <td className="px-3 py-2 text-right text-[10px] whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{open ? 'Hide' : 'Details'}</td>
                  </tr>
                  {open && g.map(r => (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)', background: r.rescinded ? '#f3f4f6' : r.retired || r.boughtBack ? '#fef2f2' : '#fbfbfa', opacity: r.rescinded ? 0.6 : undefined }}>
                    <td className="px-3 py-2 font-mono" style={{ color: r.retired ? '#b91c1c' : 'var(--mid-gray)' }}>↳ {r.shNumber}</td>
                    <td className="px-3 py-2" style={{ color: r.retired ? '#b91c1c' : 'var(--charcoal)', overflow: 'hidden', wordBreak: 'break-word' }}>{r.name}{r.rescinded && <span className="ml-1 text-[10px] px-1 rounded whitespace-nowrap font-semibold" style={{ background: '#e5e7eb', color: '#374151' }} title="Mutually rescinded — treated as if never issued; excluded from every figure and from the financial statements">Rescinded</span>}{r.retired && !r.rescinded && <span className="ml-1 text-[10px] px-1 rounded whitespace-nowrap font-semibold" style={{ background: '#fee2e2', color: '#b91c1c' }} title="All shares in this holding have been sold or bought back">Retired</span>}{r.acquiredViaTransfer ? <span className="ml-1 text-[10px] px-1 rounded whitespace-nowrap" style={{ background: '#e0e7ff', color: '#3730a3' }} title={`Shares bought from ${r.transferFromShNumber || ''} ${r.transferFromName || 'another shareholder'} — no company cash involved`}>Bought from {r.transferFromName || 'transfer'}</span> : r.agreementType === 'DEED_OF_ASSIGNMENT' && <span className="ml-1 text-[10px] px-1 rounded whitespace-nowrap" style={{ background: '#e0e7ff', color: '#3730a3' }}>Deed</span>}{r.soldFromTreasury && <span className="ml-1 text-[10px] px-1 rounded whitespace-nowrap" style={{ background: '#fef3c7', color: '#92400e' }} title="Shares reissued from treasury (bought-back) stock">Treasury</span>}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{r.shareClass || '—'}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{String(r.dateAcquired).slice(0, 10)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: 'var(--mid-gray)' }}>{r.stockCertNumber || '—'}</td>
                    <td className="px-3 py-2 text-right" style={{ overflow: 'hidden' }}>{(r.buybackShares > 0 || (r.transferredShares || 0) > 0)
                      ? <><span className="whitespace-nowrap">{netShares(r).toLocaleString('en-PH')}</span><span className="block text-[10px] font-normal" style={{ color: 'var(--mid-gray)', wordBreak: 'break-word' }}>(Previously {r.numberOfShares.toLocaleString('en-PH')}{r.buybackShares > 0 ? ` — ${r.buybackShares.toLocaleString('en-PH')} bought back` : ''}{(r.transferredShares || 0) > 0 ? ` — ${r.transferredShares.toLocaleString('en-PH')} sold to ${[...new Set(r.transfers.map(t => t.toName))].join(', ')}` : ''})</span></>
                      : <span className="whitespace-nowrap">{r.numberOfShares.toLocaleString('en-PH')}</span>}</td>
                    <td className="px-3 py-2 text-right">{peso(r.truePar)}</td>
                    <td className="px-3 py-2 text-right">{peso(r.apic)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{peso(r.pricePerShare)}</td>
                    <td className="px-3 py-2 text-right font-semibold" style={{ overflow: 'hidden' }}>{(r.buybackShares > 0 || (r.transferredShares || 0) > 0)
                      ? <><span className="whitespace-nowrap">{peso(netShares(r) * r.pricePerShare)}</span><span className="block text-[10px] font-normal" style={{ color: 'var(--mid-gray)', wordBreak: 'break-word' }}>(Previously {peso(r.totalCapitalization)} but shares {r.buybackShares > 0 && (r.transferredShares || 0) > 0 ? 'bought back / sold' : r.buybackShares > 0 ? 'bought back' : 'sold'})</span></>
                      : <span className="whitespace-nowrap">{peso(r.totalCapitalization)}</span>}</td>
                    <td className="px-3 py-2 text-right">{r.equityStakeCurrent.toFixed(3)}%</td>
                    <td className="px-3 py-2 text-right" style={{ color: 'var(--mid-gray)' }}>{r.equityStakeTotal.toFixed(3)}%</td>
                    <td className="px-3 py-2" style={{ color: 'var(--mid-gray)', overflow: 'hidden', wordBreak: 'break-word' }} title={bankLabel(r.bankAccountId)}>{bankLabel(r.bankAccountId)}</td>
                    <td className="px-3 py-2" style={{ overflow: 'hidden' }}>{r.boughtBack ? <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#fee2e2', color: '#b91c1c', wordBreak: 'break-word', maxWidth: '100%' }} title={r.buybacks.map(b => `${String(b.date).slice(0, 10)}: ${b.shares.toLocaleString('en-PH')} @ ${peso(b.price)}`).join('\n')}>Yes · {r.buybackShares.toLocaleString('en-PH')}{r.buybacks.length > 1 ? ` (${r.buybacks.length}×)` : ''}</span> : 'No'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex gap-1.5">
                        {(r.validIdUrls || []).map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" title="Valid ID" style={{ color: 'var(--teal)' }}><Eye size={12} /></a>)}
                        {(!r.validIdUrls || r.validIdUrls.length === 0) && <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex gap-1.5">
                        {(r.proofOfDepositUrls || []).map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" title="Proof of deposit" style={{ color: 'var(--teal)' }}><Eye size={12} /></a>)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => setEdit(r)} className="p-1 rounded hover:bg-blue-50"><Pencil size={13} className="text-blue-500" /></button>
                      <button onClick={() => del(r)} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} className="text-red-400" /></button>
                    </td>
                  </tr>
                  ))}
                  </Fragment>
                  )
                })}
                {!loading && commonRows.length === 0 && (
                  <tr><td colSpan={17} className="text-center py-10 text-gray-400">
                    {(data?.rows || []).length === 0 ? 'No common shareholders yet.'
                      : <>No rows match these filters. <button onClick={() => cs.setFilters({})} className="underline" style={{ color: 'var(--teal)' }}>Clear filters</button></>}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Preferred shares are editable by admin, accountant, and bookkeeper. */}
      {effectiveTab === 'preferred' && <PreferredTab banks={banks} equityAccts={equityAccts} assetAccts={assetAccts} onChanged={load} canWrite />}
      {effectiveTab === 'dividends' && <DividendTab banks={banks} equityAccts={equityAccts} isAdmin={isAdmin} />}
      {effectiveTab === 'certificates' && <CertificatesTab />}

      {(showAdd || edit) && <CommonModal row={edit} rows={data?.rows || []} authCommon={authCommon} authFounder={authFounder} shareholders={data?.shareholders || []} banks={banks} equityAccts={equityAccts} assetAccts={assetAccts} onClose={() => { setShowAdd(false); setEdit(null) }} onReload={load} onSaved={() => { setShowAdd(false); setEdit(null); load() }} />}
    </div>
  )
}

function CommonModal({ row, rows, authCommon, authFounder, shareholders, banks, equityAccts, assetAccts, onClose, onReload, onSaved }: { row: CommonRow | null; rows: CommonRow[]; authCommon: number | null; authFounder: number | null; shareholders: Shareholder[]; banks: Bank[]; equityAccts: EquityAcct[]; assetAccts: EquityAcct[]; onClose: () => void; onReload: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    shareholderId: row?.shareholderId || '', name: row?.name || '', tin: row?.tin || '', birthdate: row?.birthdate ? String(row.birthdate).slice(0, 10) : '',
    email: row?.email || '', address: row?.address || '', dateAcquired: row?.dateAcquired ? String(row.dateAcquired).slice(0, 10) : new Date().toISOString().slice(0, 10),
    agreementType: row?.agreementType || 'SUBSCRIPTION', assignedToShareholderId: row?.assignedToShareholderId || '', shareClass: row?.shareClass || '',
    stockCertNumber: row?.stockCertNumber || '', numberOfShares: row ? String(row.numberOfShares) : '', truePar: row?.truePar != null ? String(row.truePar) : '', apic: row?.apic != null ? String(row.apic) : '',
    bankAccountId: row?.bankAccountId || '', equityAccountId: row?.equityAccountId || '', receivableAccountId: row?.receivableAccountId || '', soldFromTreasury: row?.soldFromTreasury || false, rescinded: row?.rescinded || false,
  })
  const [agreementUrls, setAgreementUrls] = useState<string[]>(row?.agreementUrls || [])
  const [proofUrls, setProofUrls] = useState<string[]>(row?.proofOfDepositUrls || [])
  const [validIdUrls, setValidIdUrls] = useState<string[]>(row?.validIdUrls || [])
  // Open the Sold Shares panel automatically when sales already exist.
  const [showSold, setShowSold] = useState((row?.transfers?.length || 0) > 0)
  const [busy, setBusy] = useState(false)
  // Next free certificate number for the chosen class's series (SCEIF for
  // Founders, SCEIC otherwise); gaps below the highest are not reused.
  const nextCertNo = useMemo(() => {
    const prefix = (f.shareClass || '').toUpperCase().startsWith('FOUNDERS') ? 'SCEIF' : 'SCEIC'
    let max = 0
    for (const r of rows) {
      const m = (r.stockCertNumber || '').toUpperCase().match(/^([A-Z]+)[-\s]?(\d+)$/)
      if (m && m[1] === prefix) max = Math.max(max, parseInt(m[2], 10))
    }
    return `${prefix}-${String(max + 1).padStart(4, '0')}`
  }, [rows, f.shareClass])
  const set = (k: string, v: unknown) => setF(p => ({ ...p, [k]: v }))
  const n = (v: string) => Number(v) || 0
  const pricePerShare = n(f.truePar) + n(f.apic)
  const cap = n(f.numberOfShares) * pricePerShare
  const prefix = f.stockCertNumber || f.name || 'SHARE'
  // Over-authorization check for the selected class group (excludes the row being edited).
  const cls = (f.shareClass || '').toLowerCase()
  const classGroup = cls.startsWith('founders') ? 'founders' : cls.startsWith('common') ? 'common' : null
  const classLimit = classGroup === 'founders' ? authFounder : classGroup === 'common' ? authCommon : null
  const existingClass = classGroup
    ? rows.filter(r => r.id !== row?.id && (r.shareClass || '').toLowerCase().startsWith(classGroup)).reduce((s, r) => s + (r.numberOfShares - (r.buybackShares || 0)), 0)
    : 0
  const projectedClass = existingClass + n(f.numberOfShares)
  const overLimit = classLimit != null && projectedClass > classLimit
  const limitLabel = classGroup === 'founders' ? 'Founders' : 'Common'

  // A holding with itemised deposits drives its own journal entry: the single
  // bank field no longer applies, and any shortfall needs a receivable account.
  const hasDeposits = !!row?.deposits?.length
  const depositTotal = (row?.deposits || []).reduce((s, d) => s + d.amount, 0)
  const unaccounted = hasDeposits ? Math.max(0, cap - depositTotal) : 0
  const receivableAccts = assetAccts

  const pickShareholder = (id: string) => {
    const sh = shareholders.find(s => s.id === id)
    if (sh) setF(p => ({ ...p, shareholderId: id, name: sh.name, tin: sh.tin || '', birthdate: sh.birthdate ? String(sh.birthdate).slice(0, 10) : '', email: sh.email || '', address: sh.address || '' }))
    else setF(p => ({ ...p, shareholderId: '' }))
  }

  const save = async () => {
    if (!(n(f.numberOfShares) > 0) || !(pricePerShare > 0)) { alert('Enter shares and True Par / APIC.'); return }
    if (!f.name.trim()) { alert('Investor name is required.'); return }
    if (overLimit) {
      if (!window.confirm(`⚠ This exceeds the authorized ${limitLabel} shares.\n\nAuthorized ${limitLabel}: ${classLimit!.toLocaleString('en-PH')}\nAfter this: ${projectedClass.toLocaleString('en-PH')} (over by ${(projectedClass - classLimit!).toLocaleString('en-PH')})\n\nSave anyway?`)) return
    }
    setBusy(true)
    try {
      const body = { ...(row ? { id: row.id } : {}), ...f, numberOfShares: n(f.numberOfShares), truePar: n(f.truePar), apic: n(f.apic), pricePerShare,
        agreementUrls, proofOfDepositUrls: proofUrls, validIdUrls }
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
        {overLimit && (
          <div className="mb-3 rounded-xl border p-2.5 text-xs" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}>
            ⚠ This will bring {limitLabel} shares to <b>{projectedClass.toLocaleString('en-PH')}</b>, exceeding the authorized {limitLabel} limit of <b>{classLimit!.toLocaleString('en-PH')}</b> (over by {(projectedClass - classLimit!).toLocaleString('en-PH')}).
          </div>
        )}

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

          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Class <span className="text-red-500">*</span></label>
            <select value={f.shareClass} onChange={e => set('shareClass', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }}>
              <option value="">— Select Type of Share —</option>
              {COMMON_SHARE_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
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
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Stock Certificate No.</label><input value={f.stockCertNumber} onChange={e => set('stockCertNumber', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} placeholder={nextCertNo} />
            {!f.stockCertNumber && nextCertNo && (
              <p className="mt-1 text-[10px]" style={{ color: 'var(--mid-gray)' }}>
                Next free in this series:{' '}
                <button type="button" onClick={() => set('stockCertNumber', nextCertNo)} className="font-mono font-semibold underline" style={{ color: 'var(--teal)' }}>{nextCertNo}</button>
              </p>
            )}
          </div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Number of Shares</label><input value={f.numberOfShares} onChange={e => set('numberOfShares', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={{ borderColor: 'var(--light-gray)' }} /></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>True Par (PHP)</label><input value={f.truePar} onChange={e => set('truePar', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={{ borderColor: 'var(--light-gray)' }} /></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>APIC (PHP)</label><input value={f.apic} onChange={e => set('apic', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={{ borderColor: 'var(--light-gray)' }} /></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Price/Share (PHP) <span className="font-normal text-gray-400">(par + APIC)</span></label><div className="px-3 py-2 rounded-xl text-sm font-mono font-bold" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>{peso(pricePerShare)}</div></div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Total Capitalization</label><div className="px-3 py-2 rounded-xl text-sm font-mono font-bold" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>{peso(cap)}</div></div>
          <div className="col-span-2 sm:col-span-1"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Bank account where the equity was debited</label>
            <select value={f.bankAccountId} onChange={e => set('bankAccountId', e.target.value)} disabled={hasDeposits} className={inp} style={{ borderColor: 'var(--light-gray)', background: hasDeposits ? 'var(--off-white)' : undefined }}>
              <option value="">— Not recorded —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}
            </select>
            {hasDeposits && <p className="text-[10px] mt-1" style={{ color: 'var(--mid-gray)' }}>Superseded by the itemised deposits below.</p>}
          </div>
          <div className="col-span-2 sm:col-span-2"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Equity account to credit <span className="font-normal text-gray-400">(from Chart of Accounts)</span></label>
            <select value={f.equityAccountId} onChange={e => set('equityAccountId', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }}>
              <option value="">— Select equity account —</option>{equityAccts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}
            </select>
          </div>
          {/* Unpaid balance needs somewhere to sit, or the entry cannot balance. */}
          {hasDeposits && unaccounted > 0.005 && (
            <div className="col-span-2 sm:col-span-3"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Subscription receivable account <span className="font-normal text-gray-400">(debited for the {peso(unaccounted)} not yet received)</span></label>
              <select value={f.receivableAccountId} onChange={e => set('receivableAccountId', e.target.value)} className={inp} style={{ borderColor: f.receivableAccountId ? 'var(--light-gray)' : '#fecaca' }}>
                <option value="">— Select —</option>{receivableAccts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}
              </select>
              {!f.receivableAccountId && <p className="text-[10px] mt-1" style={{ color: '#b91c1c' }}>Without this the issuance entry cannot balance, so none is posted.</p>}
            </div>
          )}
          {!hasDeposits && f.bankAccountId && f.equityAccountId && (
            <div className="col-span-2 sm:col-span-3"><p className="text-[11px] font-mono px-2 py-1.5 rounded" style={{ background: '#f8fafc', color: '#334155' }}>DR {banks.find(b => b.id === f.bankAccountId)?.accountTitle} {peso(cap)} &nbsp;/&nbsp; CR {equityAccts.find(a => a.id === f.equityAccountId)?.accountTitle} {peso(cap)}</p></div>
          )}
          {hasDeposits && f.equityAccountId && (
            <div className="col-span-2 sm:col-span-3"><div className="text-[11px] font-mono px-2 py-1.5 rounded" style={{ background: '#f8fafc', color: '#334155' }}>
              {(row!.deposits).map(d => {
                const acct = d.kind === 'NON_CASH' ? equityAccts.concat(receivableAccts).concat(assetAccts).find(a => a.id === d.assetAccountId) : banks.find(b => b.id === d.bankAccountId)
                return <div key={d.id}>DR {acct?.accountTitle || '(account not set)'} {peso(d.amount)}{d.note ? ` — ${d.note}` : ''}</div>
              })}
              {unaccounted > 0.005 && <div>DR {receivableAccts.find(a => a.id === f.receivableAccountId)?.accountTitle || '(receivable not set)'} {peso(unaccounted)}</div>}
              <div>CR {equityAccts.find(a => a.id === f.equityAccountId)?.accountTitle} {peso(cap)}</div>
            </div></div>
          )}
        </div>

        {/* Deposits (consideration received — may be several, cash or not) */}
        <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--light-gray)' }}>
          <p className="text-sm font-semibold text-gray-700 mb-1">Deposits received <span className="font-normal text-gray-400">(itemise when the subscription was paid across several deposits, or partly in kind)</span></p>
          {row ? (
            <DepositManager share={row} banks={banks} assetAccts={assetAccts} capitalization={cap} onChanged={onReload} />
          ) : (
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Save the shareholder first, then reopen this record to itemise deposits.</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Subscription / Deed of Assignment</label>
            <div className="flex flex-wrap items-center gap-2">{agreementUrls.map((u, i) => (
              <span key={u} className="text-xs inline-flex items-center gap-1 rounded-lg border px-2 py-1" style={{ borderColor: 'var(--light-gray)' }}>
                <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>
                <button type="button" onClick={() => setAgreementUrls(p => p.filter(x => x !== u))} title="Remove"><X size={11} className="text-red-400" /></button>
              </span>
            ))}
              <ScanUpload compact section="equity" prefix={`${prefix}-AGREEMENT`} existingCount={agreementUrls.length} label="Add" onUploaded={u => setAgreementUrls(p => [...p, u])} /></div>
          </div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Proof of deposit</label>
            <div className="flex flex-wrap items-center gap-2">{proofUrls.map((u, i) => (
              <span key={u} className="text-xs inline-flex items-center gap-1 rounded-lg border px-2 py-1" style={{ borderColor: 'var(--light-gray)' }}>
                <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>
                <button type="button" onClick={() => setProofUrls(p => p.filter(x => x !== u))} title="Remove"><X size={11} className="text-red-400" /></button>
              </span>
            ))}
              <ScanUpload compact section="equity" prefix={`${prefix}-DEPOSIT`} existingCount={proofUrls.length} label="Add" onUploaded={u => setProofUrls(p => [...p, u])} /></div>
          </div>
          <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Valid ID <span className="font-normal text-gray-400">(one or more; scan via QR)</span></label>
            <div className="flex flex-wrap items-center gap-2">{validIdUrls.map((u, i) => (
              <span key={u} className="text-xs inline-flex items-center gap-1 rounded-lg border px-2 py-1" style={{ borderColor: 'var(--light-gray)' }}>
                <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>
                <button type="button" onClick={() => setValidIdUrls(p => p.filter(x => x !== u))} title="Remove"><X size={11} className="text-red-400" /></button>
              </span>
            ))}
              <ScanUpload compact section="equity" prefix={`${prefix}-VALIDID`} existingCount={validIdUrls.length} label="Add" onUploaded={u => setValidIdUrls(p => [...p, u])} /></div>
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
          <input type="checkbox" checked={f.soldFromTreasury} onChange={e => set('soldFromTreasury', e.target.checked)} /> Sold share from Treasury Shares <span className="font-normal text-gray-400">(shares reissued from bought-back stock)</span>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: '#b91c1c' }}>
          <input type="checkbox" checked={f.rescinded} onChange={e => set('rescinded', e.target.checked)} /> Shares rescinded <span className="font-normal text-gray-400">(mutual rescission — as if never issued: the issuance entry is cancelled from the books, both legs, and the holding counts toward nothing)</span>
        </label>

        {/* Buybacks (multiple per shareholder) */}
        <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <p className="text-sm font-semibold text-gray-700 mb-1">Buybacks <span className="font-normal text-gray-400">(records to Treasury Shares)</span></p>
          {row ? (
            <BuybackManager share={row} banks={banks} equityAccts={equityAccts} onChanged={onReload} />
          ) : (
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Save the shareholder first, then reopen this record to add one or more buybacks.</p>
          )}
        </div>

        {/* Sold Shares — secondary sales to a current shareholder or an external
            party. Settled privately between the parties, so nothing touches a
            company bank account; the books only move the ownership. */}
        <label className="mt-4 flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
          <input type="checkbox" checked={showSold} onChange={e => setShowSold(e.target.checked)} /> Sold Shares <span className="font-normal text-gray-400">(sold to a current shareholder or an external party — settled privately, not through a company bank account)</span>
        </label>
        {showSold && (
          <div className="mt-2 rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            {row ? (
              <TransferManager share={row} shareholders={shareholders} equityAccts={equityAccts} onChanged={onReload} />
            ) : (
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Save the shareholder first, then reopen this record to record a sale.</p>
            )}
          </div>
        )}

        <button onClick={save} disabled={busy} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} {row ? 'Save changes' : 'Add shareholder'}</button>
      </div>
    </div>
  )
}

// Manages the deposits (consideration received) for one common shareholding:
// list existing with delete, plus an inline "add deposit" form. Unlike buybacks
// a deposit has no journal entry of its own — /api/equity/deposits re-posts the
// holding's single issuance entry, itemised one debit line per deposit.
function DepositManager({ share, banks, assetAccts, capitalization, onChanged, holding = 'common' }: { share: { id: string; deposits?: Deposit[]; stockCertNumber?: string | null; name?: string | null }; banks: Bank[]; assetAccts: EquityAcct[]; capitalization: number; onChanged: () => void; holding?: 'common' | 'preferred' }) {
  // Preferred shares are paid for exactly like common ones, so the same panel
  // serves both — only which id the API is given changes.
  const idParam = holding === 'preferred' ? 'preferredShareId' : 'commonShareId'
  const [list, setList] = useState<Deposit[]>(share.deposits || [])
  const blank = { date: new Date().toISOString().slice(0, 10), amount: '', kind: 'CASH' as 'CASH' | 'NON_CASH', bankAccountId: '', assetAccountId: '', note: '' }
  const [d, setD] = useState(blank)
  const [proofUrls, setProofUrls] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const n = (v: string) => Number(v) || 0
  const inp = 'w-full px-3 py-2 rounded-xl border text-sm outline-none'
  const lbl = 'block text-xs font-semibold mb-1'
  const set = (k: keyof typeof blank, v: string) => setD(p => ({ ...p, [k]: v }))

  const recorded = list.reduce((s, x) => s + x.amount, 0)
  const remaining = capitalization - recorded

  const refresh = async () => {
    try { const r = await fetch(`/api/equity/deposits?${idParam}=${share.id}`); if (r.ok) setList(await r.json()) } catch { /* keep */ }
  }

  const add = async () => {
    if (!(n(d.amount) > 0)) { alert('Enter the deposit amount.'); return }
    if (d.kind === 'CASH' && !d.bankAccountId) { alert('Choose the bank account the deposit landed in.'); return }
    if (d.kind === 'NON_CASH' && !d.assetAccountId) { alert('Choose the account the non-cash consideration is debited to.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/equity/deposits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [idParam]: share.id, date: d.date, amount: n(d.amount), kind: d.kind, bankAccountId: d.bankAccountId || null, assetAccountId: d.assetAccountId || null, note: d.note || null, proofUrls }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      setD(blank); setProofUrls([]); setAdding(false)
      await refresh(); onChanged()
    } finally { setBusy(false) }
  }

  const del = async (x: Deposit) => {
    if (!confirm(`Remove the ${String(x.date).slice(0, 10)} deposit of ${peso(x.amount)}? The issuance entry is re-posted without it.`)) return
    await fetch(`/api/equity/deposits?id=${x.id}`, { method: 'DELETE' })
    await refresh(); onChanged()
  }

  const acctLabel = (x: Deposit) => x.kind === 'NON_CASH'
    ? (assetAccts.find(a => a.id === x.assetAccountId)?.accountTitle || '(account not set)')
    : (banks.find(b => b.id === x.bankAccountId)?.accountTitle || '(bank not set)')

  return (
    <div>
      {list.length > 0 && (
        <div className="mb-2 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-xs">
            <thead><tr style={{ background: 'var(--off-white)' }}>
              <th className="px-2 py-1.5 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>Date</th>
              <th className="px-2 py-1.5 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>Debited to</th>
              <th className="px-2 py-1.5 text-right font-semibold" style={{ color: 'var(--mid-gray)' }}>Amount</th>
              <th className="px-2 py-1.5" />
            </tr></thead>
            <tbody>
              {list.map(x => (
                <tr key={x.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <td className="px-2 py-1.5 whitespace-nowrap">{String(x.date).slice(0, 10)}</td>
                  <td className="px-2 py-1.5">
                    {acctLabel(x)}
                    {x.kind === 'NON_CASH' && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>non-cash</span>}
                    {x.note && <span className="block text-[10px]" style={{ color: 'var(--mid-gray)' }}>{x.note}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{peso(x.amount)}</td>
                  <td className="px-2 py-1.5 text-right"><button type="button" onClick={() => del(x)} title="Remove" style={{ color: '#b91c1c' }}><Trash2 size={13} /></button></td>
                </tr>
              ))}
              <tr className="border-t font-semibold" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                <td className="px-2 py-1.5" colSpan={2}>Recorded of {peso(capitalization)}</td>
                <td className="px-2 py-1.5 text-right font-mono" style={{ color: Math.abs(remaining) < 0.005 ? 'var(--teal)' : '#b45309' }}>{peso(recorded)}</td>
                <td />
              </tr>
              {Math.abs(remaining) >= 0.005 && (
                <tr style={{ background: '#fffbeb' }}>
                  <td className="px-2 py-1.5 text-[11px]" colSpan={2} style={{ color: '#92400e' }}>Not yet accounted for</td>
                  <td className="px-2 py-1.5 text-right font-mono text-[11px]" style={{ color: '#92400e' }}>{peso(remaining)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} className="px-3 py-1.5 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>+ Add deposit</button>
      ) : (
        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Date</label><input type="date" value={d.date} onChange={e => set('date', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></div>
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Amount</label><input value={d.amount} onChange={e => set('amount', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={{ borderColor: 'var(--light-gray)' }} /></div>
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Kind</label>
              <select value={d.kind} onChange={e => set('kind', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }}>
                <option value="CASH">Cash deposit</option><option value="NON_CASH">Non-cash (e.g. equipment)</option>
              </select>
            </div>
            {d.kind === 'CASH' ? (
              <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Bank account</label>
                <select value={d.bankAccountId} onChange={e => set('bankAccountId', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }}><option value="">— Select —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select>
              </div>
            ) : (
              <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Debit to</label>
                <select value={d.assetAccountId} onChange={e => set('assetAccountId', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }}><option value="">— Select —</option>{assetAccts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select>
              </div>
            )}
            <div className="col-span-2 sm:col-span-4"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Note <span className="font-normal text-gray-400">(optional — shows on the journal line)</span></label><input value={d.note} onChange={e => set('note', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></div>
            <div className="col-span-2 sm:col-span-4"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Proof of deposit</label>
              <div className="flex flex-wrap items-center gap-2">{proofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}
                <ScanUpload compact section="equity" prefix={`${share.stockCertNumber || share.name}-DEPOSIT`} existingCount={proofUrls.length} label="Add" onUploaded={u => setProofUrls(p => [...p, u])} /></div>
            </div>
          </div>
          {n(d.amount) > 0 && <p className="text-[11px] mt-2 font-mono" style={{ color: '#334155' }}>DR {(d.kind === 'NON_CASH' ? assetAccts.find(a => a.id === d.assetAccountId)?.accountTitle : banks.find(b => b.id === d.bankAccountId)?.accountTitle) || '(select an account)'} {peso(n(d.amount))}</p>}
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={add} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50 flex items-center gap-1.5" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={13} className="animate-spin" />} Record deposit</button>
            <button type="button" onClick={() => { setAdding(false); setD(blank); setProofUrls([]) }} className="px-4 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Manages the list of buybacks for one common shareholding: list existing (with
// delete) + an inline "add buyback" form. Each add/delete hits /api/equity/buybacks
// and posts/reverses its own Treasury/Bank journal entry, then reloads the parent.
function BuybackManager({ share, banks, equityAccts, onChanged }: { share: CommonRow; banks: Bank[]; equityAccts: EquityAcct[]; onChanged: () => void }) {
  const [list, setList] = useState<Buyback[]>(share.buybacks || [])
  const [d, setD] = useState({ date: new Date().toISOString().slice(0, 10), shares: '', price: '', bankAccountId: '', treasuryAccountId: '' })
  const [proofUrls, setProofUrls] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const n = (v: string) => Number(v) || 0
  const inp = 'w-full px-3 py-2 rounded-xl border text-sm outline-none'
  const lbl = 'block text-xs font-semibold mb-1'
  const boughtBackTotal = list.reduce((s, b) => s + b.shares, 0)
  const remaining = share.numberOfShares - boughtBackTotal
  const set = (k: string, v: string) => setD(p => ({ ...p, [k]: v }))

  const refresh = async () => {
    try { const r = await fetch(`/api/equity/buybacks?commonShareId=${share.id}`); if (r.ok) setList(await r.json()) } catch { /* keep */ }
    onChanged()
  }
  const add = async () => {
    if (!(n(d.shares) > 0)) { alert('Enter shares bought back.'); return }
    if (!(n(d.price) > 0)) { alert('Enter the buyback price.'); return }
    if (n(d.shares) > remaining + 1e-9) { alert(`Only ${remaining.toLocaleString('en-PH')} shares remain to buy back.`); return }
    setBusy(true)
    try {
      const r = await fetch('/api/equity/buybacks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commonShareId: share.id, date: d.date, shares: n(d.shares), price: n(d.price), bankAccountId: d.bankAccountId || null, treasuryAccountId: d.treasuryAccountId || null, proofUrls }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      setD({ date: new Date().toISOString().slice(0, 10), shares: '', price: '', bankAccountId: '', treasuryAccountId: '' }); setProofUrls([]); setAdding(false)
      await refresh()
    } finally { setBusy(false) }
  }
  const del = async (b: Buyback) => {
    if (!confirm(`Delete the ${String(b.date).slice(0, 10)} buyback of ${b.shares.toLocaleString('en-PH')} shares @ ${peso(b.price)}? Its journal entry is reversed.`)) return
    await fetch(`/api/equity/buybacks?id=${b.id}`, { method: 'DELETE' })
    await refresh()
  }

  return (
    <div>
      <p className="text-[11px] mb-2" style={{ color: 'var(--mid-gray)' }}>Holds {share.numberOfShares.toLocaleString('en-PH')} · bought back {boughtBackTotal.toLocaleString('en-PH')} · <span style={{ color: remaining <= 0 ? '#b91c1c' : '#166534', fontWeight: 600 }}>{remaining.toLocaleString('en-PH')} remaining</span></p>
      {list.length > 0 && (
        <div className="rounded-xl border overflow-auto mb-2" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
          <table className="w-full text-xs"><thead><tr className="text-left" style={{ color: 'var(--mid-gray)' }}>{['Date', 'Shares', 'Price', 'Amount', 'Proof', ''].map(h => <th key={h} className="px-2.5 py-1.5 font-semibold">{h}</th>)}</tr></thead><tbody>
            {list.map(b => (
              <tr key={b.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-2.5 py-1.5">{String(b.date).slice(0, 10)}</td>
                <td className="px-2.5 py-1.5 font-mono">{b.shares.toLocaleString('en-PH')}</td>
                <td className="px-2.5 py-1.5 font-mono">{peso(b.price)}</td>
                <td className="px-2.5 py-1.5 font-mono font-semibold">{peso(b.amount)}</td>
                <td className="px-2.5 py-1.5">{(Array.isArray(b.proofUrls) ? b.proofUrls : []).map((u: string, i: number) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 mr-1" style={{ color: 'var(--teal)' }}><Eye size={11} />{i + 1}</a>)}</td>
                <td className="px-2.5 py-1.5 text-right"><button type="button" onClick={() => del(b)} className="p-1 rounded hover:bg-red-50"><Trash2 size={12} className="text-red-400" /></button></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
      {adding ? (
        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Date</label><input type="date" value={d.date} onChange={e => set('date', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></div>
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Shares bought back</label><input value={d.shares} onChange={e => set('shares', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={{ borderColor: 'var(--light-gray)' }} /></div>
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Price at buyback</label><input value={d.price} onChange={e => set('price', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={{ borderColor: 'var(--light-gray)' }} /></div>
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Bank account used to pay</label>
              <select value={d.bankAccountId} onChange={e => set('bankAccountId', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }}><option value="">— Select —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select>
            </div>
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Treasury account to debit <span className="font-normal text-gray-400">(CoA)</span></label>
              <select value={d.treasuryAccountId} onChange={e => set('treasuryAccountId', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }}><option value="">— Select equity account —</option>{equityAccts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select>
            </div>
            <div className="col-span-2 sm:col-span-4"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Proof of buyback</label>
              <div className="flex flex-wrap items-center gap-2">{proofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}
                <ScanUpload compact section="equity" prefix={`${share.stockCertNumber || share.name}-BUYBACK`} existingCount={proofUrls.length} label="Add" onUploaded={u => setProofUrls(p => [...p, u])} /></div>
            </div>
          </div>
          {n(d.shares) > 0 && n(d.price) > 0 && d.treasuryAccountId && d.bankAccountId && <p className="text-[11px] mt-2 font-mono" style={{ color: '#334155' }}>DR {equityAccts.find(a => a.id === d.treasuryAccountId)?.accountTitle} {peso(n(d.shares) * n(d.price))} / CR {banks.find(b => b.id === d.bankAccountId)?.accountTitle} {peso(n(d.shares) * n(d.price))}</p>}
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={add} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50 flex items-center gap-1.5" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={13} className="animate-spin" />} Record buyback</button>
            <button type="button" onClick={() => { setAdding(false); setProofUrls([]) }} className="px-4 py-2 rounded-xl text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
          </div>
        </div>
      ) : (
        remaining > 0
          ? <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}><Plus size={13} /> Add buyback</button>
          : <p className="text-[11px]" style={{ color: '#b91c1c' }}>All shares have been bought back.</p>
      )}
    </div>
  )
}

// Manages the secondary sales (share transfers) out of one common shareholding:
// list existing (with undo) + an inline "record sale" form. Each add/delete hits
// /api/equity/transfers, which moves the shares to the buyer — creating the
// buyer's holding (and, for an external party, the new shareholder record)
// automatically — and posts/reverses the net-zero equity memo entry. The sale
// price is settled privately between the parties and never through a company
// bank account, so no cash line is ever posted.
function TransferManager({ share, shareholders, equityAccts, onChanged }: { share: CommonRow; shareholders: Shareholder[]; equityAccts: EquityAcct[]; onChanged: () => void }) {
  const [list, setList] = useState<Transfer[]>(share.transfers || [])
  const blank = { date: new Date().toISOString().slice(0, 10), shares: '', price: '', buyerKind: 'CURRENT' as 'CURRENT' | 'EXTERNAL', buyerShareholderId: '', buyerName: '', buyerTin: '', buyerBirthdate: '', buyerEmail: '', buyerAddress: '' }
  const [d, setD] = useState(blank)
  const [proofUrls, setProofUrls] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const n = (v: string) => Number(v) || 0
  const inp = 'w-full px-3 py-2 rounded-xl border text-sm outline-none'
  const lbl = 'block text-xs font-semibold mb-1'
  const set = (k: keyof typeof blank, v: string) => setD(p => ({ ...p, [k]: v }))

  const buybackTotal = (share.buybacks || []).reduce((s, b) => s + b.shares, 0)
  const soldTotal = list.reduce((s, t) => s + t.shares, 0)
  const remaining = share.numberOfShares - buybackTotal - soldTotal
  // The buyer list excludes the seller — you cannot sell shares to yourself.
  const buyerOptions = shareholders.filter(s => s.id !== share.shareholderId)
  const buyerLabel = d.buyerKind === 'CURRENT'
    ? (buyerOptions.find(s => s.id === d.buyerShareholderId)?.name || '(select the buyer)')
    : (d.buyerName.trim() || '(enter the buyer\'s name)')
  // The journal moves BOOK value (par + APIC), never the private sale price.
  const bookValue = n(d.shares) * share.pricePerShare
  const equityLabel = equityAccts.find(a => a.id === share.equityAccountId)?.accountTitle || '(equity account not set on this holding)'

  const refresh = async () => {
    try { const r = await fetch(`/api/equity/transfers?commonShareId=${share.id}`); if (r.ok) setList(await r.json()) } catch { /* keep */ }
    onChanged()
  }
  const add = async () => {
    if (!(n(d.shares) > 0)) { alert('Enter the number of shares sold.'); return }
    if (!(n(d.price) > 0)) { alert('Enter the price per share it was sold for.'); return }
    if (n(d.shares) > remaining + 1e-9) { alert(`Only ${remaining.toLocaleString('en-PH')} shares remain to sell.`); return }
    if (d.buyerKind === 'CURRENT' && !d.buyerShareholderId) { alert('Pick the current shareholder who bought the shares.'); return }
    if (d.buyerKind === 'EXTERNAL' && !d.buyerName.trim()) { alert('Enter the external buyer\'s name.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/equity/transfers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        commonShareId: share.id, date: d.date, shares: n(d.shares), price: n(d.price), proofUrls,
        ...(d.buyerKind === 'CURRENT'
          ? { buyerShareholderId: d.buyerShareholderId }
          : { buyerName: d.buyerName, buyerTin: d.buyerTin, buyerBirthdate: d.buyerBirthdate || null, buyerEmail: d.buyerEmail, buyerAddress: d.buyerAddress }),
      }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      setD(blank); setProofUrls([]); setAdding(false)
      await refresh()
    } finally { setBusy(false) }
  }
  const del = async (t: Transfer) => {
    if (!confirm(`Undo the ${String(t.date).slice(0, 10)} sale of ${t.shares.toLocaleString('en-PH')} shares to ${t.toName}? The buyer's holding from this sale is removed and the equity memo entry reversed.`)) return
    const r = await fetch(`/api/equity/transfers?id=${t.id}`, { method: 'DELETE' })
    if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
    await refresh()
  }

  return (
    <div>
      <p className="text-[11px] mb-2" style={{ color: 'var(--mid-gray)' }}>Holds {share.numberOfShares.toLocaleString('en-PH')} · bought back {buybackTotal.toLocaleString('en-PH')} · sold {soldTotal.toLocaleString('en-PH')} · <span style={{ color: remaining <= 0 ? '#b91c1c' : '#166534', fontWeight: 600 }}>{remaining.toLocaleString('en-PH')} remaining</span></p>
      {remaining <= 0 && soldTotal > 0 && (
        <p className="text-[11px] mb-2 font-semibold" style={{ color: '#b91c1c' }}>All shares have been sold — this shareholder is retired from this holding.</p>
      )}
      {list.length > 0 && (
        <div className="rounded-xl border overflow-auto mb-2" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
          <table className="w-full text-xs"><thead><tr className="text-left" style={{ color: 'var(--mid-gray)' }}>{['Date', 'Sold to', 'Shares', 'Price/Share', 'Amount', 'Proof', ''].map(h => <th key={h} className="px-2.5 py-1.5 font-semibold">{h}</th>)}</tr></thead><tbody>
            {list.map(t => (
              <tr key={t.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-2.5 py-1.5 whitespace-nowrap">{String(t.date).slice(0, 10)}</td>
                <td className="px-2.5 py-1.5">{t.toShNumber} — {t.toName}</td>
                <td className="px-2.5 py-1.5 font-mono">{t.shares.toLocaleString('en-PH')}</td>
                <td className="px-2.5 py-1.5 font-mono">{peso(t.price)}</td>
                <td className="px-2.5 py-1.5 font-mono font-semibold">{peso(t.amount)}</td>
                <td className="px-2.5 py-1.5">{(Array.isArray(t.proofUrls) ? t.proofUrls : []).map((u: string, i: number) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 mr-1" style={{ color: 'var(--teal)' }}><Eye size={11} />{i + 1}</a>)}</td>
                <td className="px-2.5 py-1.5 text-right"><button type="button" onClick={() => del(t)} className="p-1 rounded hover:bg-red-50" title="Undo this sale"><Trash2 size={12} className="text-red-400" /></button></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
      {adding ? (
        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Sold to</label>
              <select value={d.buyerKind} onChange={e => set('buyerKind', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }}>
                <option value="CURRENT">Current shareholder</option><option value="EXTERNAL">External party</option>
              </select>
            </div>
            {d.buyerKind === 'CURRENT' ? (
              <div className="col-span-2 sm:col-span-3"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Buyer <span className="font-normal text-gray-400">(their holding is created automatically)</span></label>
                <select value={d.buyerShareholderId} onChange={e => set('buyerShareholderId', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }}>
                  <option value="">— Select shareholder —</option>{buyerOptions.map(s => <option key={s.id} value={s.id}>{s.shNumber} — {s.name}</option>)}
                </select>
              </div>
            ) : (
              <>
                <div className="col-span-2 sm:col-span-3"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Buyer&apos;s name <span className="font-normal text-gray-400">(a new shareholder entry is created for them)</span></label>
                  <input value={d.buyerName} onChange={e => set('buyerName', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>TIN Number</label><input value={d.buyerTin} onChange={e => set('buyerTin', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Birthdate</label><input type="date" value={d.buyerBirthdate} onChange={e => set('buyerBirthdate', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Email</label><input value={d.buyerEmail} onChange={e => set('buyerEmail', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></div>
                <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Complete Address</label><input value={d.buyerAddress} onChange={e => set('buyerAddress', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></div>
              </>
            )}
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Date of sale</label><input type="date" value={d.date} onChange={e => set('date', e.target.value)} className={inp} style={{ borderColor: 'var(--light-gray)' }} /></div>
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Shares sold</label><input value={d.shares} onChange={e => set('shares', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={{ borderColor: 'var(--light-gray)' }} /></div>
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Price/Share sold for <span className="font-normal text-gray-400">(paid seller ← buyer)</span></label><input value={d.price} onChange={e => set('price', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={{ borderColor: 'var(--light-gray)' }} /></div>
            <div><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Total sale price</label><div className="px-3 py-2 rounded-xl text-sm font-mono font-bold" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>{peso(n(d.shares) * n(d.price))}</div></div>
            <div className="col-span-2 sm:col-span-4"><label className={lbl} style={{ color: 'var(--mid-gray)' }}>Proof of sale <span className="font-normal text-gray-400">(deed of sale / proof of payment — upload or scan via QR)</span></label>
              <div className="flex flex-wrap items-center gap-2">{proofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}
                <ScanUpload compact section="equity" prefix={`${share.stockCertNumber || share.name}-SOLD`} existingCount={proofUrls.length} label="Add" onUploaded={u => setProofUrls(p => [...p, u])} /></div>
            </div>
          </div>
          {n(d.shares) > 0 && (
            <div className="text-[11px] mt-2 font-mono px-2 py-1.5 rounded" style={{ background: '#f8fafc', color: '#334155' }}>
              <div>DR {equityLabel} — Share capital, {share.name} {peso(bookValue)} &nbsp;/&nbsp; CR {equityLabel} — Share capital, {buyerLabel} {peso(bookValue)}</div>
              <div className="font-sans mt-0.5" style={{ color: 'var(--mid-gray)' }}>Net-zero within equity (book value: par + APIC). {n(d.price) > 0 && <>The {peso(n(d.shares) * n(d.price))} sale price is settled privately between the parties — no company bank account is touched.</>}</div>
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={add} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50 flex items-center gap-1.5" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={13} className="animate-spin" />} Record sale</button>
            <button type="button" onClick={() => { setAdding(false); setD(blank); setProofUrls([]) }} className="px-4 py-2 rounded-xl text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
          </div>
        </div>
      ) : (
        remaining > 0
          ? <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}><Plus size={13} /> Record sale</button>
          : soldTotal === 0 ? <p className="text-[11px]" style={{ color: '#b91c1c' }}>No shares remain to sell.</p> : null
      )}
    </div>
  )
}

// ── Preferred Shares ──────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
interface PrefRow {
  id: string; shareholderId: string; shNumber: string; name: string; tin: string | null; birthdate: string | null; email: string | null; address: string | null
  dateAcquired: string; agreementType: string; agreementUrls: string[] | null; stockCertNumber: string | null; proofOfDepositUrls: string[] | null; validIdUrls: string[] | null; shareClass: string | null
  numberOfShares: number; retiredShares: number; truePar: number; apic: number; pricePerShare: number; totalCapitalization: number; equityStake: number; bankAccountId: string | null; equityAccountId: string | null
  annualInterest: number | null; maturityYears: number | null; buybackPrice: number | null
  payoutSchedule: string | null; payoutStartMonth: number | null; payoutStartYear: number | null; payoutDay: number | null; pdcUrls: string[] | null
  deposits?: Deposit[]
}
interface PrefFigures { preferredCapitalization: number; preferredShares: number; retiredPreferredShares: number }

function PreferredTab({ banks, equityAccts, assetAccts = [], onChanged, canWrite = true }: { banks: Bank[]; equityAccts: EquityAcct[]; assetAccts?: EquityAcct[]; onChanged: () => void; canWrite?: boolean }) {
  const [rows, setRows] = useState<PrefRow[]>([])
  const [shareholders, setShareholders] = useState<Shareholder[]>([])
  const [fig, setFig] = useState<PrefFigures | null>(null)
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<PrefRow | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const load = useCallback(async () => { setLoading(true); try { const r = await fetch('/api/equity/preferred'); const j = r.ok ? await r.json() : null; setRows(j?.rows || []); setShareholders(j?.shareholders || []); setFig(j?.figures || null) } catch { setRows([]) } finally { setLoading(false) } }, [])
  useEffect(() => { load() }, [load])
  const del = async (r: PrefRow) => { if (!confirm(`Delete ${r.shNumber} — ${r.name}'s preferred shares?`)) return; await fetch(`/api/equity/preferred?id=${r.id}`, { method: 'DELETE' }); load(); onChanged() }
  const bankLabel = (id: string | null) => { const b = banks.find(x => x.id === id); return b ? `${b.accountNumber} ${b.accountTitle}` : '—' }

  const ps = useSortFilter('shNumber')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prefValue = (r: any, k: string): string | number => {
    switch (k) {
      case 'dateAcquired': return +new Date(String(r.dateAcquired).slice(0, 10))
      case 'shares': return r.numberOfShares
      case 'capitalization': return r.totalCapitalization
      case 'stake': return r.equityStake
      case 'interest': return r.annualInterest ?? -1
      case 'maturity': return r.maturityYears ?? -1
      case 'payout': return r.payoutSchedule || ''
      case 'bank': return bankLabel(r.bankAccountId)
      case 'validId': return (r.validIdUrls || []).length
      default: return r[k] ?? ''
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prefText = (r: any, k: string): string => {
    switch (k) {
      case 'dateAcquired': return String(r.dateAcquired).slice(0, 10)
      case 'shares': return r.numberOfShares.toLocaleString('en-PH')
      case 'capitalization': return peso(r.totalCapitalization)
      case 'truePar': return peso(r.truePar)
      case 'apic': return peso(r.apic)
      case 'pricePerShare': return peso(r.pricePerShare)
      case 'stake': return r.equityStake.toFixed(2)
      case 'interest': return r.annualInterest != null ? String(r.annualInterest) : ''
      default: return String(prefValue(r, k))
    }
  }
  const prefRows = useMemo(
    () => applySortFilter(rows, prefValue, ps.sortKey, ps.sortDir, ps.filters, prefText),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, ps.sortKey, ps.sortDir, ps.filters, banks],
  )
  const exportPreferred = (format: 'xlsx' | 'pdf') => {
    const num = (n: number) => n.toLocaleString('en-PH')
    const headers = ['SH #', 'Investor', 'Class', 'Date', 'Shares', 'True Par', 'APIC', 'Price/Share', 'Capitalization', '% Stake', 'Interest', 'Maturity', 'Payout', 'Bank']
    const body = rows.map(r => [
      r.shNumber, r.name, r.shareClass || '', String(r.dateAcquired).slice(0, 10),
      num(r.numberOfShares), r.truePar, r.apic, r.pricePerShare, r.totalCapitalization,
      r.equityStake.toFixed(3) + '%', r.annualInterest != null ? `${r.annualInterest}%` : '',
      r.maturityYears ? `${r.maturityYears}y${r.buybackPrice ? ` @ ₱${r.buybackPrice}` : ''}` : '',
      r.payoutSchedule ? `${r.payoutSchedule.toLowerCase()}${r.payoutStartMonth ? ` from ${MONTHS[r.payoutStartMonth - 1]} ${r.payoutStartYear}` : ''}` : '',
      bankLabel(r.bankAccountId),
    ])
    const totalShares = rows.reduce((s, r) => s + r.numberOfShares, 0)
    const totalCap = rows.reduce((s, r) => s + r.totalCapitalization, 0)
    const subtitle = `${rows.length} preferred shareholders · ${num(totalShares)} shares · ₱${totalCap.toLocaleString('en-PH', { minimumFractionDigits: 2 })} capitalization`
    if (format === 'xlsx') {
      downloadXlsx('Preferred-Shareholders', [{ name: 'Preferred Shareholders', headers, rows: body }])
    } else {
      downloadPdf({ title: 'Preferred Shareholders', subtitle, headers, rows: body, landscape: true })
    }
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'var(--pale-teal)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--deep-teal)' }}>Preferred Capitalization</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--deep-teal)' }}>{peso(fig?.preferredCapitalization || 0)}</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Total Preferred Shares</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>{(fig?.preferredShares || 0).toLocaleString('en-PH')}</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
          <p className="text-xs font-semibold" style={{ color: '#b91c1c' }}>Retired Preferred Shares</p>
          <p className="text-2xl font-bold" style={{ color: '#b91c1c' }}>{(fig?.retiredPreferredShares || 0).toLocaleString('en-PH')}</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <DownloadMenu onDownload={exportPreferred} size="md" />
        {canWrite && <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> Add Preferred Shareholder</button>}
      </div>
      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-xs">
          <SortHead cols={PREFERRED_COLS} sortKey={ps.sortKey} sortDir={ps.sortDir} filters={ps.filters}
            onToggleSort={k => ps.toggleSort(k, PREFERRED_NUMERIC)} onFilter={ps.setFilter} />
          <tbody>
          {loading ? <tr><td colSpan={16} className="text-center py-10 text-gray-400"><Loader2 size={16} className="inline animate-spin" /> Loading…</td></tr>
          : prefRows.map(r => (
            <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
              <td className="px-3 py-2 font-mono font-semibold">{r.shNumber}</td>
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{r.shareClass || '—'}</td>
              <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{String(r.dateAcquired).slice(0, 10)}</td>
              <td className="px-3 py-2 text-right">{r.numberOfShares.toLocaleString('en-PH')}</td>
              <td className="px-3 py-2 text-right">{peso(r.truePar)}</td>
              <td className="px-3 py-2 text-right">{peso(r.apic)}</td>
              <td className="px-3 py-2 text-right font-semibold">{peso(r.pricePerShare)}</td>
              <td className="px-3 py-2 text-right font-semibold">{peso(r.totalCapitalization)}</td>
              <td className="px-3 py-2 text-right">{r.equityStake.toFixed(2)}%</td>
              <td className="px-3 py-2 text-right">{r.annualInterest != null ? `${r.annualInterest}%` : '—'}</td>
              <td className="px-3 py-2">{r.maturityYears ? `${r.maturityYears}y${r.buybackPrice ? ` @ ${peso(r.buybackPrice)}` : ''}` : '—'}</td>
              <td className="px-3 py-2">{r.payoutSchedule ? `${r.payoutSchedule.toLowerCase()}${r.payoutStartMonth ? ` from ${MONTHS[r.payoutStartMonth - 1]} ${r.payoutStartYear}` : ''}` : '—'}</td>
              <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{bankLabel(r.bankAccountId)}</td>
              <td className="px-3 py-2"><span className="inline-flex gap-1.5">{(r.validIdUrls || []).map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" title="Valid ID" style={{ color: 'var(--teal)' }}><Eye size={12} /></a>)}{(!r.validIdUrls || r.validIdUrls.length === 0) && <span style={{ color: 'var(--mid-gray)' }}>—</span>}</span></td>
              <td className="px-3 py-2 text-right whitespace-nowrap">{canWrite && <><button onClick={() => setEdit(r)} className="p-1 rounded hover:bg-blue-50"><Pencil size={13} className="text-blue-500" /></button><button onClick={() => del(r)} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} className="text-red-400" /></button></>}</td>
            </tr>
          ))}
          {!loading && prefRows.length === 0 && (
            <tr><td colSpan={16} className="text-center py-10 text-gray-400">
              {rows.length === 0 ? 'No preferred shareholders yet.'
                : <>No rows match these filters. <button onClick={() => ps.setFilters({})} className="underline" style={{ color: 'var(--teal)' }}>Clear filters</button></>}
            </td></tr>
          )}
        </tbody></table>
      </div>
      {(showAdd || edit) && <PreferredModal row={edit} shareholders={shareholders} banks={banks} equityAccts={equityAccts} assetAccts={assetAccts} onClose={() => { setShowAdd(false); setEdit(null) }} onSaved={() => { setShowAdd(false); setEdit(null); load(); onChanged() }} />}
    </div>
  )
}

function PreferredModal({ row, shareholders, banks, equityAccts, assetAccts = [], onClose, onSaved }: { row: PrefRow | null; shareholders: Shareholder[]; banks: Bank[]; equityAccts: EquityAcct[]; assetAccts?: EquityAcct[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    shareholderId: row?.shareholderId || '', name: row?.name || '', tin: row?.tin || '', birthdate: row?.birthdate ? String(row.birthdate).slice(0, 10) : '', email: row?.email || '', address: row?.address || '',
    dateAcquired: row?.dateAcquired ? String(row.dateAcquired).slice(0, 10) : new Date().toISOString().slice(0, 10), agreementType: row?.agreementType || 'SUBSCRIPTION', stockCertNumber: row?.stockCertNumber || '', shareClass: row?.shareClass || '',
    numberOfShares: row ? String(row.numberOfShares) : '', retiredShares: row?.retiredShares ? String(row.retiredShares) : '', truePar: row?.truePar != null ? String(row.truePar) : '', apic: row?.apic != null ? String(row.apic) : '', bankAccountId: row?.bankAccountId || '', equityAccountId: row?.equityAccountId || '',
    annualInterest: row?.annualInterest != null ? String(row.annualInterest) : '', maturityYears: row?.maturityYears ? String(row.maturityYears) : '', buybackPrice: row?.buybackPrice != null ? String(row.buybackPrice) : '',
    payoutSchedule: row?.payoutSchedule || '', payoutStartMonth: row?.payoutStartMonth ? String(row.payoutStartMonth) : '', payoutStartYear: row?.payoutStartYear ? String(row.payoutStartYear) : '', payoutDay: row?.payoutDay ? String(row.payoutDay) : '',
  })
  const [agreementUrls, setAgreementUrls] = useState<string[]>(row?.agreementUrls || [])
  const [proofUrls, setProofUrls] = useState<string[]>(row?.proofOfDepositUrls || [])
  const [pdcUrls, setPdcUrls] = useState<string[]>(row?.pdcUrls || [])
  const [validIdUrls, setValidIdUrls] = useState<string[]>(row?.validIdUrls || [])
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: unknown) => setF(p => ({ ...p, [k]: v }))
  const n = (v: string) => Number(v) || 0
  const pricePerShare = n(f.truePar) + n(f.apic)
  const cap = n(f.numberOfShares) * pricePerShare
  const prefix = f.stockCertNumber || f.name || 'PREF'
  const pickSh = (id: string) => { const sh = shareholders.find(s => s.id === id); if (sh) setF(p => ({ ...p, shareholderId: id, name: sh.name, tin: sh.tin || '', birthdate: sh.birthdate ? String(sh.birthdate).slice(0, 10) : '', email: sh.email || '', address: sh.address || '' })); else set('shareholderId', '') }
  const save = async () => {
    if (!(n(f.numberOfShares) > 0) || !(pricePerShare > 0) || !f.name.trim()) { alert('Enter name, shares and True Par / APIC.'); return }
    setBusy(true)
    try {
      const body = { ...(row ? { id: row.id } : {}), ...f, numberOfShares: n(f.numberOfShares), retiredShares: n(f.retiredShares), truePar: n(f.truePar), apic: n(f.apic), pricePerShare, annualInterest: f.annualInterest ? n(f.annualInterest) : null, maturityYears: f.maturityYears ? Number(f.maturityYears) : null, buybackPrice: f.buybackPrice ? n(f.buybackPrice) : null, payoutStartMonth: f.payoutStartMonth ? Number(f.payoutStartMonth) : null, payoutStartYear: f.payoutStartYear ? Number(f.payoutStartYear) : null, payoutDay: f.payoutDay ? Number(f.payoutDay) : null, agreementUrls, proofOfDepositUrls: proofUrls, validIdUrls, pdcUrls }
      const r = await fetch('/api/equity/preferred', { method: row ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onSaved()
    } finally { setBusy(false) }
  }
  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'; const lbl = 'block text-xs font-semibold mb-1'; const bc = { borderColor: 'var(--light-gray)' }; const mg = { color: 'var(--mid-gray)' }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-gray-900">{row ? `Edit ${row.shNumber}` : 'Add Preferred Shareholder'}</h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>
        {!row && <div className="mb-3"><label className={lbl} style={mg}>Existing shareholder <span className="font-normal text-gray-400">(reuse their SH number)</span></label><select value={f.shareholderId} onChange={e => pickSh(e.target.value)} className={inp} style={bc}><option value="">— New shareholder —</option>{shareholders.map(s => <option key={s.id} value={s.id}>{s.shNumber} — {s.name}</option>)}</select></div>}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="col-span-2 sm:col-span-1"><label className={lbl} style={mg}>Name of Investor</label><input value={f.name} onChange={e => set('name', e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Date Acquired</label><input type="date" value={f.dateAcquired} onChange={e => set('dateAcquired', e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>TIN Number</label><input value={f.tin} onChange={e => set('tin', e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Birthdate</label><input type="date" value={f.birthdate} onChange={e => set('birthdate', e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Email</label><input value={f.email} onChange={e => set('email', e.target.value)} className={inp} style={bc} /></div>
          <div className="col-span-2 sm:col-span-3"><label className={lbl} style={mg}>Complete Address</label><input value={f.address} onChange={e => set('address', e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Class <span className="text-red-500">*</span></label><select value={f.shareClass} onChange={e => set('shareClass', e.target.value)} className={inp} style={bc}><option value="">— Select Type of Share —</option>{PREFERRED_SHARE_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className={lbl} style={mg}>Agreement type</label><select value={f.agreementType} onChange={e => set('agreementType', e.target.value)} className={inp} style={bc}><option value="SUBSCRIPTION">Subscription</option><option value="DEED_OF_ASSIGNMENT">Deed of Assignment</option></select></div>
          <div><label className={lbl} style={mg}>Stock Certificate No.</label><input value={f.stockCertNumber} onChange={e => set('stockCertNumber', e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Number of Shares</label><input value={f.numberOfShares} onChange={e => set('numberOfShares', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={mg}>Retired Shares <span className="font-normal text-gray-400">(redeemed)</span></label><input value={f.retiredShares} onChange={e => set('retiredShares', e.target.value)} inputMode="decimal" placeholder="0" className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={mg}>True Par (PHP)</label><input value={f.truePar} onChange={e => set('truePar', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={mg}>APIC (PHP)</label><input value={f.apic} onChange={e => set('apic', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={mg}>Price/Share (PHP) <span className="font-normal text-gray-400">(par + APIC)</span></label><div className="px-3 py-2 rounded-xl text-sm font-mono font-bold" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>{peso(pricePerShare)}</div></div>
          <div><label className={lbl} style={mg}>Total Capitalization</label><div className="px-3 py-2 rounded-xl text-sm font-mono font-bold" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>{peso(cap)}</div></div>
          <div><label className={lbl} style={mg}>Annual Interest %</label><input value={f.annualInterest} onChange={e => set('annualInterest', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={mg}>Maturity for buyback (years)</label><input value={f.maturityYears} onChange={e => set('maturityYears', e.target.value)} inputMode="numeric" className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={mg}>Price to buyback at maturity</label><input value={f.buybackPrice} onChange={e => set('buybackPrice', e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={mg}>Bank account debited</label><select value={f.bankAccountId} onChange={e => set('bankAccountId', e.target.value)} className={inp} style={bc}><option value="">— Not recorded —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select></div>
          <div className="col-span-2 sm:col-span-2"><label className={lbl} style={mg}>Equity account to credit <span className="font-normal text-gray-400">(CoA)</span></label><select value={f.equityAccountId} onChange={e => set('equityAccountId', e.target.value)} className={inp} style={bc}><option value="">— Select —</option>{equityAccts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select></div>
        </div>
        {f.bankAccountId && f.equityAccountId && <p className="text-[11px] mt-1 font-mono px-2 py-1 rounded" style={{ background: '#f8fafc', color: '#334155' }}>DR {banks.find(b => b.id === f.bankAccountId)?.accountTitle} {peso(cap)} / CR {equityAccts.find(a => a.id === f.equityAccountId)?.accountTitle} {peso(cap)}</p>}

        {/* Deposits — same as common shares: itemise when the subscription was
            paid across several deposits, so each one can be tagged in bank rec. */}
        <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--light-gray)' }}>
          <p className="text-sm font-semibold text-gray-700 mb-1">Deposits received <span className="font-normal text-gray-400">(itemise when the subscription was paid across several deposits, or partly in kind)</span></p>
          {row ? (
            <DepositManager share={row} banks={banks} assetAccts={assetAccts} capitalization={cap} onChanged={onSaved} holding="preferred" />
          ) : (
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Save the shareholder first, then reopen this record to itemise deposits.</p>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <div><label className={lbl} style={mg}>Payout Schedule</label><select value={f.payoutSchedule} onChange={e => set('payoutSchedule', e.target.value)} className={inp} style={bc}><option value="">—</option>{['ANNUALLY', 'BIANNUALLY', 'QUARTERLY', 'MONTHLY'].map(s => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}</select></div>
          <div><label className={lbl} style={mg}>Start month</label><select value={f.payoutStartMonth} onChange={e => set('payoutStartMonth', e.target.value)} className={inp} style={bc}><option value="">—</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
          <div><label className={lbl} style={mg}>Start year</label><input value={f.payoutStartYear} onChange={e => set('payoutStartYear', e.target.value)} inputMode="numeric" placeholder="2026" className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={mg}>Every nth (day)</label><input value={f.payoutDay} onChange={e => set('payoutDay', e.target.value)} inputMode="numeric" placeholder="30" className={inp + ' font-mono'} style={bc} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
          <div><label className={lbl} style={mg}>Subscription / Deed</label><div className="flex flex-wrap items-center gap-2">{agreementUrls.map((u, i) => (
            <span key={u} className="text-xs inline-flex items-center gap-1 rounded-lg border px-2 py-1" style={{ borderColor: 'var(--light-gray)' }}>
              <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>
              <button type="button" onClick={() => setAgreementUrls(p => p.filter(x => x !== u))} title="Remove"><X size={11} className="text-red-400" /></button>
            </span>
          ))}<ScanUpload compact section="equity" prefix={`${prefix}-AGREEMENT`} existingCount={agreementUrls.length} label="Add" onUploaded={u => setAgreementUrls(p => [...p, u])} /></div></div>
          <div><label className={lbl} style={mg}>Proof of deposit</label><div className="flex flex-wrap items-center gap-2">{proofUrls.map((u, i) => (
            <span key={u} className="text-xs inline-flex items-center gap-1 rounded-lg border px-2 py-1" style={{ borderColor: 'var(--light-gray)' }}>
              <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>
              <button type="button" onClick={() => setProofUrls(p => p.filter(x => x !== u))} title="Remove"><X size={11} className="text-red-400" /></button>
            </span>
          ))}<ScanUpload compact section="equity" prefix={`${prefix}-DEPOSIT`} existingCount={proofUrls.length} label="Add" onUploaded={u => setProofUrls(p => [...p, u])} /></div></div>
          <div><label className={lbl} style={mg}>Valid ID <span className="font-normal text-gray-400">(1+, QR)</span></label><div className="flex flex-wrap items-center gap-2">{validIdUrls.map((u, i) => (
            <span key={u} className="text-xs inline-flex items-center gap-1 rounded-lg border px-2 py-1" style={{ borderColor: 'var(--light-gray)' }}>
              <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>
              <button type="button" onClick={() => setValidIdUrls(p => p.filter(x => x !== u))} title="Remove"><X size={11} className="text-red-400" /></button>
            </span>
          ))}<ScanUpload compact section="equity" prefix={`${prefix}-VALIDID`} existingCount={validIdUrls.length} label="Add" onUploaded={u => setValidIdUrls(p => [...p, u])} /></div></div>
          <div><label className={lbl} style={mg}>PDCs</label><div className="flex flex-wrap items-center gap-2">{pdcUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="equity" prefix={`${prefix}-PDC`} existingCount={pdcUrls.length} label="Add" onUploaded={u => setPdcUrls(p => [...p, u])} /></div></div>
        </div>
        <button onClick={save} disabled={busy} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} {row ? 'Save changes' : 'Add preferred shareholder'}</button>
      </div>
    </div>
  )
}

// ── Dividend Release History ──────────────────────────────────
interface DivItem { id: string; shareholderId: string; shareholderName: string; shares: number; amount: number; emailedAt: string | null }
interface DivRelease { id: string; date: string; boardResolutionUrls: string[] | null; dividendAmount: number; dividendType: string; totalAmountPaid: number; status: string; bankAccountId: string | null; retainedAccountId: string | null; proofOfDepositUrls: string[] | null; items: DivItem[] }

function DividendTab({ banks, equityAccts, isAdmin }: { banks: Bank[]; equityAccts: EquityAcct[]; isAdmin: boolean }) {
  // Common dividends are an admin domain; accountants/bookkeepers see Preferred only.
  const [sub, setSub] = useState<'common' | 'preferred'>(isAdmin ? 'common' : 'preferred')
  const effSub = isAdmin ? sub : 'preferred'
  const [releases, setReleases] = useState<DivRelease[]>([])
  const [totalCommon, setTotalCommon] = useState(0)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<DivRelease | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const load = useCallback(async () => { if (!isAdmin) { setLoading(false); return } setLoading(true); try { const r = await fetch('/api/equity/dividends'); const j = r.ok ? await r.json() : null; setReleases(j?.releases || []); setTotalCommon(j?.totalCommonShares || 0) } catch { setReleases([]) } finally { setLoading(false) } }, [isAdmin])
  useEffect(() => { load() }, [load])
  const del = async (r: DivRelease) => { if (!confirm(`Delete the ${String(r.date).slice(0, 10)} dividend release? Its journal entry is reversed and the payout table removed.`)) return; await fetch(`/api/equity/dividends?id=${r.id}`, { method: 'DELETE' }); load() }
  return (
    <div className="space-y-3">
      {isAdmin && (
      <div className="flex items-center justify-between">
        <div className="flex gap-1">{(['common', 'preferred'] as const).map(v => <button key={v} onClick={() => setSub(v)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={sub === v ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>{v === 'common' ? 'Common' : 'Preferred'}</button>)}</div>
        {sub === 'common' && <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> Add Dividend Release</button>}
      </div>
      )}
      {effSub === 'common' ? (
        <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-xs"><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>{['Date', 'Type', 'Per Share', 'Total Paid', 'Status', 'Emailed', ''].map(h => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead><tbody>
            {loading ? <tr><td colSpan={7} className="text-center py-10 text-gray-400"><Loader2 size={16} className="inline animate-spin" /></td></tr>
            : releases.map(r => (
              <tr key={r.id} className="border-t hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--light-gray)' }} onClick={() => setOpen(r)}>
                <td className="px-3 py-2">{String(r.date).slice(0, 10)}</td>
                <td className="px-3 py-2">{r.dividendType === 'SPECIAL' ? 'Special' : 'Regular'}</td>
                <td className="px-3 py-2 text-right">{peso(r.dividendAmount)}</td>
                <td className="px-3 py-2 text-right font-semibold">{peso(r.totalAmountPaid)}</td>
                <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={r.status === 'FINALIZED' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef9c3', color: '#854d0e' }}>{r.status === 'FINALIZED' ? 'Finalized' : 'Draft'}</span></td>
                <td className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.items.filter(i => i.emailedAt).length}/{r.items.length}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap"><span className="mr-2 font-semibold" style={{ color: 'var(--teal)' }}>Open →</span><button onClick={(e) => { e.stopPropagation(); del(r) }} className="p-1 rounded hover:bg-red-50" title="Delete release"><Trash2 size={13} className="text-red-400" /></button></td>
              </tr>
            ))}
            {!loading && releases.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-gray-400">No dividend releases yet.</td></tr>}
          </tbody></table>
        </div>
      ) : <PreferredDividendSection banks={banks} equityAccts={equityAccts} />}
      {showAdd && <AddDividendModal onClose={() => setShowAdd(false)} onSaved={(id) => { setShowAdd(false); load().then(() => { }); fetch(`/api/equity/dividends`).then(r => r.json()).then(j => { const rel = (j.releases || []).find((x: DivRelease) => x.id === id); if (rel) setOpen(rel) }) }} />}
      {open && <DividendDetail release={open} banks={banks} equityAccts={equityAccts} totalCommon={totalCommon} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  )
}

function AddDividendModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [dividendAmount, setAmount] = useState('')
  const [dividendType, setType] = useState('REGULAR')
  const [boardUrls, setBoardUrls] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!(Number(dividendAmount) > 0)) { alert('Enter the dividend amount per share.'); return }
    setBusy(true)
    try { const r = await fetch('/api/equity/dividends', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, dividendAmount: Number(dividendAmount), dividendType, boardResolutionUrls: boardUrls }) }); if (!r.ok) { alert((await r.json()).error || 'Failed'); return } onSaved((await r.json()).id) } finally { setBusy(false) }
  }
  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'; const bc = { borderColor: 'var(--light-gray)' }; const mg = { color: 'var(--mid-gray)' }; const lbl = 'block text-xs font-semibold mb-1'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-gray-900">Add Dividend Release</h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>
        <div className="space-y-3">
          <div><label className={lbl} style={mg}>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Dividend Amount (per common share)</label><input value={dividendAmount} onChange={e => setAmount(e.target.value)} inputMode="decimal" className={inp + ' font-mono'} style={bc} /></div>
          <div><label className={lbl} style={mg}>Type of Dividend</label><select value={dividendType} onChange={e => setType(e.target.value)} className={inp} style={bc}><option value="REGULAR">Regular</option><option value="SPECIAL">Special</option></select></div>
          <div><label className={lbl} style={mg}>Proof of Board Resolution</label><div className="flex flex-wrap items-center gap-2">{boardUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="equity" prefix="DIVIDEND-BOARDRES" existingCount={boardUrls.length} label="Add" onUploaded={u => setBoardUrls(p => [...p, u])} /></div></div>
        </div>
        <button onClick={save} disabled={busy} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} Save Draft</button>
      </div>
    </div>
  )
}

function DividendDetail({ release, banks, equityAccts, totalCommon, onClose, onChanged }: { release: DivRelease; banks: Bank[]; equityAccts: EquityAcct[]; totalCommon: number; onClose: () => void; onChanged: () => void }) {
  const [r, setR] = useState<DivRelease>(release)
  const [bankAccountId, setBank] = useState(release.bankAccountId || '')
  const [retainedAccountId, setRet] = useState(release.retainedAccountId || '')
  const [proofUrls, setProofUrls] = useState<string[]>(release.proofOfDepositUrls || [])
  const [busy, setBusy] = useState<string>('')
  const finalized = r.status === 'FINALIZED'
  const reload = useCallback(async () => { const j = await (await fetch('/api/equity/dividends')).json(); const fresh = (j.releases || []).find((x: DivRelease) => x.id === r.id); if (fresh) { setR(fresh); setProofUrls(fresh.proofOfDepositUrls || []) } onChanged() }, [r.id, onChanged])
  const finalize = async () => {
    if (!bankAccountId || !retainedAccountId) { if (!confirm('No bank/retained-earnings account selected — finalize without posting a journal entry?')) return }
    if (!confirm('Finalize this dividend release? It builds the shareholder payout table and locks the amounts.')) return
    setBusy('finalize')
    try { const res = await fetch('/api/equity/dividends', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, action: 'finalize', bankAccountId, retainedAccountId }) }); if (!res.ok) { alert((await res.json()).error || 'Failed'); return } await reload() } finally { setBusy('') }
  }
  const saveProof = async (urls: string[]) => { setProofUrls(urls); await fetch('/api/equity/dividends', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, action: 'proof', proofOfDepositUrls: urls }) }); reload() }
  const emailOne = async (it: DivItem) => {
    if (!confirm(`Email ${it.shareholderName} their dividend notice (₱${it.amount.toLocaleString('en-PH')})? Proof of deposit will be attached.`)) return
    setBusy(it.id)
    try { const res = await fetch('/api/equity/dividends', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, action: 'email', itemId: it.id }) }); if (!res.ok) { alert((await res.json()).error || 'Email failed'); return } await reload() } finally { setBusy('') }
  }
  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'; const bc = { borderColor: 'var(--light-gray)' }; const mg = { color: 'var(--mid-gray)' }; const lbl = 'block text-xs font-semibold mb-1'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1"><h2 className="text-lg font-bold text-gray-900">Dividend Release · {String(r.date).slice(0, 10)} <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={finalized ? { background: '#dcfce7', color: '#166534' } : { background: '#fef9c3', color: '#854d0e' }}>{finalized ? 'Finalized' : 'Draft'}</span></h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>
        <p className="text-xs mb-3" style={mg}>{r.dividendType === 'SPECIAL' ? 'Special' : 'Regular'} · {peso(r.dividendAmount)}/share · {totalCommon.toLocaleString('en-PH')} common shares → total {peso(r.dividendAmount * (finalized ? 0 : totalCommon) + r.totalAmountPaid)}</p>
        {!finalized ? (
          <div className="rounded-xl border p-3 mb-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <p className="text-xs mb-2" style={mg}>Finalize to build the per-shareholder payout table and (optionally) post the journal entry.</p>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div><label className={lbl} style={mg}>Retained Earnings account (DR)</label><select value={retainedAccountId} onChange={e => setRet(e.target.value)} className={inp} style={bc}><option value="">— none —</option>{equityAccts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select></div>
              <div><label className={lbl} style={mg}>Bank account paid from (CR)</label><select value={bankAccountId} onChange={e => setBank(e.target.value)} className={inp} style={bc}><option value="">— none —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select></div>
            </div>
            <button onClick={finalize} disabled={busy === 'finalize'} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#166534' }}>{busy === 'finalize' ? 'Finalizing…' : 'Finalize Changes'}</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 flex-wrap"><span className="text-xs" style={mg}>Proof of deposit:</span>{proofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="equity" prefix={`DIVIDEND-${String(r.date).slice(0, 10)}-PROOF`} existingCount={proofUrls.length} label="Add proof" onUploaded={u => saveProof([...proofUrls, u])} /></div>
            <div className="rounded-xl border overflow-auto" style={{ borderColor: 'var(--light-gray)' }}>
              <table className="w-full text-xs"><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>{['Shareholder', 'Available Shares', 'Total Dividend Payout', 'Emailed', ''].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead><tbody>
                {r.items.map(it => (
                  <tr key={it.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-1.5">{it.shareholderName}</td>
                    <td className="px-3 py-1.5 text-right">{it.shares.toLocaleString('en-PH')}</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{peso(it.amount)}</td>
                    <td className="px-3 py-1.5">{it.emailedAt ? <span className="text-[10px]" style={{ color: '#166534' }}>✓ {String(it.emailedAt).slice(0, 10)}</span> : '—'}</td>
                    <td className="px-3 py-1.5 text-right"><button onClick={() => emailOne(it)} disabled={busy === it.id} className="px-2 py-1 rounded text-[11px] font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy === it.id ? '…' : 'Email'}</button></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Preferred Dividend Release ────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function PreferredDividendSection({ banks, equityAccts }: { banks: Bank[]; equityAccts: EquityAcct[] }) {
  const [data, setData] = useState<{ releases: any[]; shareholders: any[]; matrix: any[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [open, setOpen] = useState<any | null>(null)
  const [year, setYear] = useState(new Date().getUTCFullYear())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)
  const load = useCallback(async () => { setLoading(true); try { const r = await fetch('/api/equity/dividends-preferred'); setData(r.ok ? await r.json() : null) } catch { setData(null) } finally { setLoading(false) } }, [])
  useEffect(() => { load() }, [load])
  const del = async (r: any) => { if (!confirm(`Delete preferred dividend release ${r.periodLabel || ''}? Its journal entry is reversed.`)) return; await fetch(`/api/equity/dividends-preferred?id=${r.id}`, { method: 'DELETE' }); load() }
  const releases = data?.releases || []
  const shareholders = data?.shareholders || []

  // Build the shareholder × month projection for the selected year.
  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const cellKey = (sid: string, m: number) => `${sid}|${year}|${m}`
  const rows = shareholders.map((s: any) => {
    const cells: Record<number, any> = {}
    ;(s.periods || []).forEach((p: any) => { if (p.year === year) cells[p.month] = p })
    return { shareholderId: s.shareholderId, name: s.name, email: s.email, shares: s.shares, cells }
  }).filter((r: any) => Object.keys(r.cells).length > 0)
  const colTotal = (m: number) => rows.reduce((sum: number, r: any) => sum + (r.cells[m] ? Number(r.cells[m].amount) : 0), 0)
  const grandTotal = months.reduce((s, m) => s + colTotal(m), 0)
  const toggle = (sid: string, m: number) => setSelected(s => { const n = new Set(s); const k = cellKey(sid, m); n.has(k) ? n.delete(k) : n.add(k); return n })
  const selectedCells = rows.flatMap((r: any) => months.filter(m => r.cells[m] && !r.cells[m].paid && selected.has(cellKey(r.shareholderId, m))).map(m => ({ shareholderId: r.shareholderId, name: r.name, month: m, amount: Number(r.cells[m].amount), quarterKey: r.cells[m].quarterKey })))
  const selectedTotal = selectedCells.reduce((s: number, c: any) => s + c.amount, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}><Plus size={15} /> Record dividend manually</button>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setYear(y => y - 1)} className="px-2 py-1 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>◀</button>
          <span className="px-2 text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{year}</span>
          <button onClick={() => setYear(y => y + 1)} className="px-2 py-1 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>▶</button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="rounded-xl border p-3 flex items-center justify-between gap-3 sticky top-0 z-10" style={{ borderColor: 'var(--teal)', background: 'var(--pale-teal)' }}>
          <div className="text-sm" style={{ color: 'var(--deep-teal)' }}><strong>{selectedCells.length} dividend{selectedCells.length === 1 ? '' : 's'} selected</strong> · total <strong>{peso(selectedTotal)}</strong></div>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Clear</button>
            <button onClick={() => setBatchOpen(true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}>Record {selectedCells.length} selected</button>
          </div>
        </div>
      )}

      <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Projected preferred dividends by month. Tick the amounts you&apos;ll include in a payment, then <strong>Record selected</strong> — you can skip anyone. Green = already released.</p>

      {/* Shareholder × month projection matrix */}
      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-xs" style={{ minWidth: '900px' }}><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
          <th className="px-3 py-2.5 font-semibold whitespace-nowrap sticky left-0" style={{ background: 'var(--off-white)', minWidth: 200 }}>Shareholder</th>
          {months.map(m => <th key={m} className="px-2 py-2.5 font-semibold text-right whitespace-nowrap">{m}/{year}</th>)}
        </tr></thead><tbody>
          {loading ? <tr><td colSpan={13} className="text-center py-10 text-gray-400"><Loader2 size={16} className="inline animate-spin" /></td></tr>
            : rows.map((r: any) => (
              <tr key={r.shareholderId} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-3 py-2 sticky left-0 bg-white" style={{ color: 'var(--charcoal)' }}>{r.name}{!r.email && <span className="ml-1 text-[10px]" style={{ color: '#b91c1c' }}>(no email)</span>}</td>
                {months.map(m => {
                  const c = r.cells[m]
                  if (!c) return <td key={m} className="px-2 py-2 text-right text-gray-300">·</td>
                  const on = selected.has(cellKey(r.shareholderId, m))
                  return (
                    <td key={m} className="px-2 py-2 text-right whitespace-nowrap" style={{ background: c.paid ? '#dcfce7' : on ? 'var(--pale-teal)' : undefined }}>
                      <label className="inline-flex items-center gap-1 justify-end cursor-pointer" title={`${r.name} · ${c.quarterKey}`}>
                        {!c.paid && <input type="checkbox" checked={on} onChange={() => toggle(r.shareholderId, m)} />}
                        <span className="font-mono" style={{ color: c.paid ? '#166534' : 'var(--charcoal)' }}>{Number(c.amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{c.paid && ' ✓'}</span>
                      </label>
                    </td>
                  )
                })}
              </tr>
            ))}
          {!loading && rows.length === 0 && <tr><td colSpan={13} className="text-center py-10 text-gray-400">No projected preferred dividends in {year}. Set a payout schedule on the preferred shares, or change the year.</td></tr>}
        </tbody>
        {rows.length > 0 && <tfoot><tr className="border-t-2 font-bold" style={{ borderColor: 'var(--teal)', background: 'var(--off-white)' }}>
          <td className="px-3 py-2 sticky left-0" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>TOTAL <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>({peso(grandTotal)})</span></td>
          {months.map(m => { const t = colTotal(m); return <td key={m} className="px-2 py-2 text-right font-mono" style={{ color: t > 0 ? 'var(--deep-teal)' : 'var(--light-gray)' }}>{t > 0 ? t.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '·'}</td> })}
        </tr></tfoot>}
        </table>
      </div>

      {/* Recorded releases */}
      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-xs"><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>{['Date', 'Quarter', 'Shareholders', 'Total Paid', 'Emailed', ''].map(h => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead><tbody>
          {loading ? <tr><td colSpan={6} className="text-center py-10 text-gray-400"><Loader2 size={16} className="inline animate-spin" /></td></tr>
            : releases.map((r: any) => (
              <tr key={r.id} className="border-t hover:bg-gray-50" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-3 py-2 cursor-pointer" onClick={() => setOpen(r)}>{String(r.date).slice(0, 10)}</td>
                <td className="px-3 py-2 cursor-pointer" onClick={() => setOpen(r)}>{r.periodLabel}</td>
                <td className="px-3 py-2 text-right cursor-pointer" onClick={() => setOpen(r)}>{r.items.length}</td>
                <td className="px-3 py-2 text-right font-semibold cursor-pointer" onClick={() => setOpen(r)}>{peso(r.totalAmountPaid)}</td>
                <td className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.items.filter((i: any) => i.emailedAt).length}/{r.items.length}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap"><button onClick={() => setOpen(r)} className="text-[11px] font-semibold mr-2" style={{ color: 'var(--teal)' }}>Open →</button><button onClick={() => del(r)} className="p-1 rounded hover:bg-red-50"><Trash2 size={13} className="text-red-400" /></button></td>
              </tr>
            ))}
          {!loading && releases.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-gray-400">No dividends recorded yet.</td></tr>}
        </tbody></table>
      </div>

      {showAdd && <AddPreferredDividendModal shareholders={data?.shareholders || []} banks={banks} equityAccts={equityAccts} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load() }} />}
      {batchOpen && <BatchPreferredDividendModal cells={selectedCells} banks={banks} equityAccts={equityAccts} onClose={() => setBatchOpen(false)} onSaved={() => { setBatchOpen(false); setSelected(new Set()); load() }} />}
      {open && <PreferredDividendDetail release={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  )
}

// Record several ticked projected dividends at once. Cells are grouped by quarter into
// one release each (so the accounting quarter labels stay correct).
function BatchPreferredDividendModal({ cells, banks, equityAccts, onClose, onSaved }: { cells: any[]; banks: Bank[]; equityAccts: EquityAcct[]; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [bankAccountId, setBank] = useState('')
  const [expenseAccountId, setExp] = useState('')
  const [proofUrls, setProofUrls] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  // Group by quarter → { shareholderId: {name, amount} }.
  const groups = new Map<string, Map<string, { name: string; amount: number }>>()
  cells.forEach(c => {
    if (!groups.has(c.quarterKey)) groups.set(c.quarterKey, new Map())
    const g = groups.get(c.quarterKey)!
    const ex = g.get(c.shareholderId)
    g.set(c.shareholderId, { name: c.name, amount: (ex?.amount || 0) + c.amount })
  })
  const total = cells.reduce((s, c) => s + c.amount, 0)
  const labelOf = (qk: string) => { const [y, q] = qk.split('-Q'); return `Q${q} ${y}` }
  const save = async () => {
    setBusy(true)
    try {
      for (const [qk, g] of groups) {
        const shareholderIds = [...g.keys()]
        const amounts = Object.fromEntries([...g.entries()].map(([id, v]) => [id, v.amount]))
        const r = await fetch('/api/equity/dividends-preferred', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, quarterKey: qk, periodLabel: labelOf(qk), shareholderIds, amounts, bankAccountId, expenseAccountId, proofOfDepositUrls: proofUrls }) })
        if (!r.ok) { alert(`Failed on ${labelOf(qk)}: ${(await r.json()).error || 'error'}`); return }
      }
      onSaved()
    } finally { setBusy(false) }
  }
  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'; const bc = { borderColor: 'var(--light-gray)' }; const mg = { color: 'var(--mid-gray)' }; const lbl = 'block text-xs font-semibold mb-1'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-gray-900">Record {cells.length} Preferred Dividend{cells.length === 1 ? '' : 's'}</h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>
        <div className="rounded-xl border overflow-auto mb-3" style={{ borderColor: 'var(--light-gray)', maxHeight: 200 }}>
          <table className="w-full text-xs"><tbody>
            {[...groups.entries()].map(([qk, g]) => [...g.entries()].map(([id, v]) => <tr key={qk + id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}><td className="px-3 py-1.5">{v.name}</td><td className="px-3 py-1.5" style={mg}>{labelOf(qk)}</td><td className="px-3 py-1.5 text-right font-mono font-semibold">{peso(v.amount)}</td></tr>))}
          </tbody></table>
        </div>
        <div className="flex items-center justify-between mb-3"><span className="text-sm font-semibold" style={mg}>Total to release</span><span className="text-lg font-bold font-mono" style={{ color: 'var(--charcoal)' }}>{peso(total)}</span></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div><label className={lbl} style={mg}>Date paid</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Retained Earnings (DR)</label><select value={expenseAccountId} onChange={e => setExp(e.target.value)} className={inp} style={bc}><option value="">— none —</option>{equityAccts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select></div>
          <div><label className={lbl} style={mg}>Bank paid from (CR)</label><select value={bankAccountId} onChange={e => setBank(e.target.value)} className={inp} style={bc}><option value="">— none —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select></div>
        </div>
        <div className="mt-3"><label className={lbl} style={mg}>Proof of deposit <span className="font-normal text-gray-400">(applied to all)</span></label><div className="flex flex-wrap items-center gap-2">{proofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="equity" prefix="PREFDIV-BATCH-PROOF" existingCount={proofUrls.length} label="Add proof" onUploaded={u => setProofUrls(p => [...p, u])} /></div></div>
        {bankAccountId && expenseAccountId && total > 0 && <p className="text-[11px] mt-2 font-mono" style={{ color: '#334155' }}>DR {equityAccts.find(a => a.id === expenseAccountId)?.accountTitle} {peso(total)} / CR {banks.find(b => b.id === bankAccountId)?.accountTitle} {peso(total)}</p>}
        <button onClick={save} disabled={busy} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} Record {cells.length} dividend{cells.length === 1 ? '' : 's'} ({peso(total)})</button>
      </div>
    </div>
  )
}

function AddPreferredDividendModal({ shareholders, banks, equityAccts, onClose, onSaved }: { shareholders: any[]; banks: Bank[]; equityAccts: EquityAcct[]; onClose: () => void; onSaved: () => void }) {
  const now = new Date()
  const curY = now.getUTCFullYear(), curQ = Math.floor(now.getUTCMonth() / 3) + 1
  // Last calendar day of a given quarter → default payout date for that quarter.
  const qEndDate = (y: number, q: number) => new Date(Date.UTC(y, q * 3, 0)).toISOString().slice(0, 10)
  const [year, setYear] = useState(curY)
  const [quarter, setQuarter] = useState(curQ)
  const [date, setDate] = useState(qEndDate(curY, curQ))
  const [bankAccountId, setBank] = useState('')
  const [expenseAccountId, setExp] = useState('')
  const [checked, setChecked] = useState<Set<string>>(() => new Set(shareholders.map(s => s.shareholderId)))
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(shareholders.map(s => [s.shareholderId, String(s.quarterly || 0)])))
  const [proofUrls, setProofUrls] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const toggle = (id: string) => setChecked(c => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n })
  const amtOf = (id: string) => { const v = Number(amounts[id]); return isNaN(v) ? 0 : v }
  const total = shareholders.filter(s => checked.has(s.shareholderId)).reduce((s, x) => s + amtOf(x.shareholderId), 0)
  const qLabel = `Q${quarter} ${year}`, quarterKey = `${year}-Q${quarter}`
  const pickQuarter = (y: number, q: number) => { setYear(y); setQuarter(q); setDate(qEndDate(y, q)) }
  const years = Array.from({ length: 8 }, (_, i) => curY - i)
  const isPast = year < curY || (year === curY && quarter < curQ)
  const save = async () => {
    if (checked.size === 0) { alert('Tick at least one preferred shareholder.'); return }
    setBusy(true)
    try {
      const amts = Object.fromEntries([...checked].map(id => [id, amtOf(id)]))
      const r = await fetch('/api/equity/dividends-preferred', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, quarterKey, periodLabel: qLabel, shareholderIds: [...checked], amounts: amts, bankAccountId, expenseAccountId, proofOfDepositUrls: proofUrls }) })
      if (!r.ok) { alert((await r.json()).error || 'Failed'); return }
      onSaved()
    } finally { setBusy(false) }
  }
  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'; const bc = { borderColor: 'var(--light-gray)' }; const mg = { color: 'var(--mid-gray)' }; const lbl = 'block text-xs font-semibold mb-1'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1"><h2 className="text-lg font-bold text-gray-900">Add Preferred Dividend Release · <span style={{ color: 'var(--teal)' }}>{qLabel}</span>{isPast && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full align-middle" style={{ background: '#fef9c3', color: '#854d0e' }}>past quarter</span>}</h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>
        <p className="text-xs mb-4" style={mg}>Pick any quarter (including past ones) to backfill history. Amounts default to each shareholder&apos;s current quarterly dividend — edit them to match what was actually paid.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div><label className={lbl} style={mg}>Quarter</label><select value={quarter} onChange={e => pickQuarter(year, Number(e.target.value))} className={inp} style={bc}>{[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}</select></div>
          <div><label className={lbl} style={mg}>Year</label><select value={year} onChange={e => pickQuarter(Number(e.target.value), quarter)} className={inp} style={bc}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
          <div><label className={lbl} style={mg}>Payout date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} style={bc} /></div>
          <div><label className={lbl} style={mg}>Retained Earnings / interest (DR)</label><select value={expenseAccountId} onChange={e => setExp(e.target.value)} className={inp} style={bc}><option value="">— none —</option>{equityAccts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}</select></div>
          <div className="sm:col-span-4"><label className={lbl} style={mg}>Bank paid from (CR)</label><select value={bankAccountId} onChange={e => setBank(e.target.value)} className={inp} style={bc}><option value="">— none —</option>{banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber} — {b.accountTitle}</option>)}</select></div>
        </div>
        <div className="rounded-xl border overflow-auto mb-3" style={{ borderColor: 'var(--light-gray)', maxHeight: 320 }}>
          <table className="w-full text-xs"><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
            <th className="px-3 py-2 font-semibold"><input type="checkbox" checked={checked.size === shareholders.length && shareholders.length > 0} onChange={e => setChecked(e.target.checked ? new Set(shareholders.map(s => s.shareholderId)) : new Set())} /></th>
            {['Shareholder', 'Preferred Shares', 'Amount Paid'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
          </tr></thead><tbody>
            {shareholders.map(s => (
              <tr key={s.shareholderId} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-3 py-1.5"><input type="checkbox" checked={checked.has(s.shareholderId)} onChange={() => toggle(s.shareholderId)} /></td>
                <td className="px-3 py-1.5">{s.name}{!s.email && <span className="ml-1 text-[10px]" style={{ color: '#b91c1c' }}>(no email)</span>}</td>
                <td className="px-3 py-1.5 text-right">{Number(s.shares).toLocaleString('en-PH')}</td>
                <td className="px-3 py-1.5 text-right"><input value={amounts[s.shareholderId] ?? ''} onChange={e => setAmounts(a => ({ ...a, [s.shareholderId]: e.target.value }))} inputMode="decimal" disabled={!checked.has(s.shareholderId)} className="w-28 px-2 py-1 rounded-lg border text-xs text-right font-mono disabled:opacity-40" style={bc} /></td>
              </tr>
            ))}
            {shareholders.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-gray-400">No preferred shareholders.</td></tr>}
          </tbody></table>
        </div>
        <div className="flex items-center justify-between mb-3">
          <div><label className={lbl} style={mg}>Proof of deposit</label><div className="flex flex-wrap items-center gap-2">{proofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="equity" prefix={`PREFDIV-${quarterKey}-PROOF`} existingCount={proofUrls.length} label="Add proof" onUploaded={u => setProofUrls(p => [...p, u])} /></div></div>
          <div className="text-right"><p className="text-[11px]" style={mg}>{checked.size} shareholder{checked.size === 1 ? '' : 's'}</p><p className="text-lg font-bold font-mono" style={{ color: 'var(--charcoal)' }}>{peso(total)}</p></div>
        </div>
        {bankAccountId && expenseAccountId && total > 0 && <p className="text-[11px] mb-2 font-mono" style={{ color: '#334155' }}>DR {equityAccts.find(a => a.id === expenseAccountId)?.accountTitle} {peso(total)} / CR {banks.find(b => b.id === bankAccountId)?.accountTitle} {peso(total)}</p>}
        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} Record {qLabel} preferred dividend</button>
      </div>
    </div>
  )
}

function PreferredDividendDetail({ release, onClose, onChanged }: { release: any; onClose: () => void; onChanged: () => void }) {
  const [r, setR] = useState<any>(release)
  const [proofUrls, setProofUrls] = useState<string[]>(release.proofOfDepositUrls || [])
  const [busy, setBusy] = useState<string>('')
  const reload = useCallback(async () => { const j = await (await fetch('/api/equity/dividends-preferred')).json(); const fresh = (j.releases || []).find((x: any) => x.id === r.id); if (fresh) { setR(fresh); setProofUrls(fresh.proofOfDepositUrls || []) } onChanged() }, [r.id, onChanged])
  const saveProof = async (urls: string[]) => { setProofUrls(urls); await fetch('/api/equity/dividends-preferred', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, action: 'proof', proofOfDepositUrls: urls }) }); reload() }
  const emailOne = async (it: any) => {
    if (!confirm(`Email ${it.shareholderName} their preferred dividend notice (${peso(it.amount)})? Proof of deposit will be attached.`)) return
    setBusy(it.id)
    try { const res = await fetch('/api/equity/dividends-preferred', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, action: 'email', itemId: it.id }) }); if (!res.ok) { alert((await res.json()).error || 'Email failed'); return } await reload() } finally { setBusy('') }
  }
  const mg = { color: 'var(--mid-gray)' }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1"><h2 className="text-lg font-bold text-gray-900">Preferred Dividend · {r.periodLabel} <span className="text-xs font-normal" style={mg}>({String(r.date).slice(0, 10)})</span></h2><button onClick={onClose}><X size={18} className="text-gray-500" /></button></div>
        <p className="text-xs mb-3" style={mg}>{r.items.length} shareholder{r.items.length === 1 ? '' : 's'} · total {peso(r.totalAmountPaid)}</p>
        <div className="flex items-center gap-2 mb-3 flex-wrap"><span className="text-xs" style={mg}>Proof of deposit:</span>{proofUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--teal)' }}><Eye size={12} /> {i + 1}</a>)}<ScanUpload compact section="equity" prefix={`PREFDIV-${String(r.date).slice(0, 10)}-PROOF`} existingCount={proofUrls.length} label="Add proof" onUploaded={u => saveProof([...proofUrls, u])} /></div>
        <div className="rounded-xl border overflow-auto" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-xs"><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>{['Shareholder', 'Preferred Shares', 'Dividend Paid', 'Emailed', ''].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead><tbody>
            {r.items.map((it: any) => (
              <tr key={it.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-3 py-1.5">{it.shareholderName}</td>
                <td className="px-3 py-1.5 text-right">{Number(it.shares).toLocaleString('en-PH')}</td>
                <td className="px-3 py-1.5 text-right font-semibold">{peso(it.amount)}</td>
                <td className="px-3 py-1.5">{it.emailedAt ? <span className="text-[10px]" style={{ color: '#166534' }}>✓ {String(it.emailedAt).slice(0, 10)}</span> : '—'}</td>
                <td className="px-3 py-1.5 text-right"><button onClick={() => emailOne(it)} disabled={busy === it.id} className="px-2 py-1 rounded text-[11px] font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{busy === it.id ? '…' : 'Email'}</button></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>
    </div>
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */


// Sortable, filterable header. The shared SortFilterHead cannot be used on these
// tables: their columns are user-resizable, and the drag handle has to stay in
// the header cell. Same interaction, same helper doing the sorting.
type RzLike = { /* ResizableColgroup handle bag */ } | null
function SortHead({ cols, sortKey, sortDir, filters, onToggleSort, onFilter, rz, trailing = true }: {
  cols: SortCol[]; sortKey: string; sortDir: 'asc' | 'desc'; filters: Record<string, string>
  onToggleSort: (k: string) => void; onFilter: (k: string, v: string) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rz?: any; trailing?: boolean
}) {
  return (
    <thead>
      <tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
        {cols.map((c, i) => (
          <th key={c.key} className="px-3 py-2 font-semibold whitespace-nowrap relative align-top">
            <button onClick={() => onToggleSort(c.key)} className="flex items-center gap-1">
              {c.label}
              <span style={{ color: sortKey === c.key ? 'var(--teal)' : 'var(--light-gray)' }}>
                {sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
              </span>
            </button>
            <input value={filters[c.key] || ''} onChange={e => onFilter(c.key, e.target.value)} placeholder="filter…"
              className="mt-1 w-full min-w-[60px] px-1.5 py-0.5 rounded border text-[10px] font-normal"
              style={{ borderColor: 'var(--light-gray)' }} />
            {rz && <ColResizeHandle rz={rz} index={i} />}
          </th>
        ))}
        {trailing && <th className="px-3 py-2" />}
      </tr>
    </thead>
  )
}

// Shared sort/filter state for one table.
function useSortFilter(initialKey: string) {
  const [sortKey, setSortKey] = useState(initialKey)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const toggleSort = (k: string, numericKeys: string[] = []) => {
    if (k === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir(numericKeys.includes(k) ? 'desc' : 'asc') }
  }
  const setFilter = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }))
  const activeFilters = Object.values(filters).filter(Boolean).length
  return { sortKey, sortDir, filters, toggleSort, setFilter, setFilters, activeFilters }
}


/* ── Certificates registry: every stock certificate number, who holds it,
   how it got there, plus the skipped numbers and duplicates per series. ── */
interface CertRow {
  certNo: string; series: string; seq: number | null
  kind: 'COMMON' | 'PREFERRED'
  shNumber: string; holder: string
  shares: number; netShares: number
  shareClass: string | null; dateAcquired: string
  status: 'ACTIVE' | 'RETIRED' | 'RESCINDED'
  viaTransferFrom: string | null
}
interface CertSeries { code: string; label: string; count: number; maxSeq: number; missing: number[]; duplicates: number[]; nextNo: string; certs: CertRow[] }

function CertificatesTab() {
  const [data, setData] = useState<{ series: CertSeries[]; uncertifiedCommon: number; uncertifiedPreferred: number } | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch('/api/equity/certificates').then(r => r.json()).then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [])
  if (loading) return <p className="py-10 text-center text-sm text-gray-400"><Loader2 size={16} className="inline animate-spin" /> Loading certificates…</p>
  if (!data) return <p className="py-10 text-center text-sm text-gray-400">Could not load the certificate registry.</p>

  const fmtSeq = (code: string, q: number) => `${code}-${String(q).padStart(4, '0')}`
  const STATUS_STYLE: Record<CertRow['status'], { bg: string; fg: string }> = {
    ACTIVE: { bg: '#dcfce7', fg: '#166534' },
    RETIRED: { bg: '#fee2e2', fg: '#b91c1c' },
    RESCINDED: { bg: '#e5e7eb', fg: '#374151' },
  }
  return (
    <div className="space-y-6">
      {(data.uncertifiedCommon > 0 || data.uncertifiedPreferred > 0) && (
        <div className="rounded-xl border px-4 py-3 text-xs" style={{ borderColor: '#fed7aa', background: '#fff7ed', color: '#9a3412' }}>
          <strong>Holdings without a certificate number:</strong> {data.uncertifiedCommon} common/founders and {data.uncertifiedPreferred} preferred active holding{data.uncertifiedCommon + data.uncertifiedPreferred !== 1 ? 's' : ''} have no cert on record — set them on the holding (edit ✎) so this registry stays complete.
        </div>
      )}
      {data.series.map(sr => (
        <div key={sr.code} className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
          <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
            <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{sr.label}</h3>
            <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{sr.count} certificate{sr.count !== 1 ? 's' : ''} · highest {sr.code}-{String(sr.maxSeq).padStart(4, '0')}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-bold font-mono" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}
              title="Put this number on the next certificate issued in this series — skipped numbers below the highest are not reused">
              Next: {sr.nextNo}
            </span>
            {sr.duplicates.length > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: '#fee2e2', color: '#b91c1c' }}
                title="The same certificate number sits on more than one holding — one of them needs renumbering">
                Duplicates: {sr.duplicates.map(q => fmtSeq(sr.code, q)).join(', ')}
              </span>
            )}
            {sr.missing.length > 0 ? (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}
                title="Numbers never used below the highest issued — cancelled certs, or holdings missing their number">
                Skipped: {sr.missing.length > 12 ? `${sr.missing.slice(0, 12).map(q => fmtSeq(sr.code, q)).join(', ')} … +${sr.missing.length - 12} more` : sr.missing.map(q => fmtSeq(sr.code, q)).join(', ')}
              </span>
            ) : (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: '#dcfce7', color: '#166534' }}>No gaps</span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left" style={{ color: 'var(--mid-gray)' }}>
                <th className="px-4 py-2 font-semibold whitespace-nowrap">Cert No.</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">Holder</th>
                <th className="px-3 py-2 font-semibold">Class</th>
                <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Shares (net)</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">Date</th>
                <th className="px-3 py-2 font-semibold">How acquired</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr></thead>
              <tbody>
                {sr.certs.map((c, i) => {
                  const dup = c.seq != null && sr.duplicates.includes(c.seq)
                  const st = STATUS_STYLE[c.status]
                  return (
                    <tr key={c.certNo + c.shNumber + i} className="border-t" style={{ borderColor: 'var(--light-gray)', background: dup ? '#fef2f2' : undefined }}>
                      <td className="px-4 py-2 font-mono font-semibold whitespace-nowrap" style={{ color: dup ? '#b91c1c' : 'var(--deep-teal)' }}>
                        {c.certNo}{dup && <span className="ml-1 text-[10px] font-sans font-semibold" style={{ color: '#b91c1c' }}>duplicate</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--charcoal)' }}><span className="font-mono" style={{ color: 'var(--mid-gray)' }}>{c.shNumber}</span> {c.holder}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{c.shareClass || '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{c.netShares.toLocaleString('en-PH')}{c.netShares !== c.shares && <span className="block text-[10px]" style={{ color: 'var(--mid-gray)' }}>of {c.shares.toLocaleString('en-PH')}</span>}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{String(c.dateAcquired).slice(0, 10)}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{c.viaTransferFrom ? `Transfer from ${c.viaTransferFrom}` : 'Original issuance'}</td>
                      <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: st.bg, color: st.fg }}>{c.status.charAt(0) + c.status.slice(1).toLowerCase()}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
