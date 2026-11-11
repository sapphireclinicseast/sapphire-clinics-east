'use client'

// Accounts Receivable → HMO Directory: who to call at each HMO and what our MOA
// with it says. Reference only; nothing here posts or changes a receivable. The
// renewal popup and the bell read the MOA date saved here.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ExternalLink, FileText, Loader2, Pencil, Search, Tag, X } from 'lucide-react'
import { ScanUpload } from '@/components/ScanUpload'
import { NameCombobox } from '@/components/NameCombobox'
import { formatCurrency } from '@/lib/utils'
import {
  ACCREDITABLE_BRANCHES, MD_PAYMENT_LABEL, MOA_ALERT_DAYS, SOA_SUBMISSION_LABEL, categoriesMatching, isLogoUrl, missingInfo, moaDaysLeft, moaNeedsRenewal, moaStatusText, priceListFiles,
  type AccreditableBranch, type MdPayment, type PriceListFile, type SoaSubmission,
} from '@/lib/hmo-directory'

// Red for an HMO whose card still has gaps (lib/hmo-directory missingInfo).
const MISSING_RED = '#B91C1C'
const MISSING_BG = '#FEF2F2'
const MISSING_BORDER = '#FCA5A5'

const CONTACTS = [
  { key: 'accreditation', title: 'Accreditation' },
  { key: 'submission', title: 'Submission' },
  { key: 'collection', title: 'Collection' },
] as const
type ContactKey = typeof CONTACTS[number]['key']
type ContactField = `${ContactKey}${'Name' | 'Email' | 'Number'}`

type Entry = Partial<Record<ContactField, string | null>> & {
  walletId: string
  hmoName: string
  paysClinicForMd: boolean
  accreditedBranches?: string[]
  moaValidUntil?: string | null
  moaNoEndDate?: boolean
  moaFileUrls?: string[]
  priceListFileUrls?: unknown[]
  mdPayment?: MdPayment | null
  soaSubmission?: SoaSubmission | null
  earlyDiscountPct?: number | null
  earlyDiscountDays?: number | null
  earlyDiscountNotes?: string | null
  loaApplicationUrl?: string | null
  serviceCategory?: string | null
  logoUrl?: string | null
  updatedByName?: string | null
  updatedAt?: string
}

type Category = { name: string; count: number }

type ScheduledPrice = { price: string | number; newPrice?: string | number | null; newPriceEffectiveDate?: string | null }
type ServicePrice = ScheduledPrice & {
  id: string
  name: string
  department: string
  branch: string
  branchPrices: (ScheduledPrice & { branch: string })[]
}

type Form = Record<ContactField, string> & {
  walletId: string
  hmoName: string
  accreditedBranches: string[]
  moaValidUntil: string
  moaNoEndDate: boolean
  moaFileUrls: string[]
  priceListFileUrls: PriceListFile[]
  mdPayment: MdPayment | null
  soaSubmission: SoaSubmission | ''
  earlyDiscountPct: string
  earlyDiscountDays: string
  earlyDiscountNotes: string
  loaApplicationUrl: string
  serviceCategory: string
  logoUrl: string
}

const BRANCH_LABEL: Record<string, string> = { SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills', VERDANA_STORE: 'Verdana', ALL: 'All branches' }
const API = '/api/accounts-receivable/hmo-directory'
const inputClass = 'w-full px-3 py-2 rounded-xl border text-sm'
const inputStyle = { borderColor: 'var(--light-gray)' }

const fileName = (url: string) => decodeURIComponent(url.split('/').pop() || url)
const ymd = (iso?: string | null) => (iso ? iso.slice(0, 10) : '')

function toForm(e: Entry): Form {
  const form = {
    walletId: e.walletId,
    hmoName: e.hmoName,
    accreditedBranches: e.accreditedBranches || [],
    moaValidUntil: ymd(e.moaValidUntil),
    moaNoEndDate: !!e.moaNoEndDate,
    moaFileUrls: e.moaFileUrls || [],
    priceListFileUrls: priceListFiles(e.priceListFileUrls),
    mdPayment: e.mdPayment || null,
    soaSubmission: e.soaSubmission || '',
    earlyDiscountPct: e.earlyDiscountPct != null ? String(e.earlyDiscountPct) : '',
    earlyDiscountDays: e.earlyDiscountDays != null ? String(e.earlyDiscountDays) : '',
    earlyDiscountNotes: e.earlyDiscountNotes || '',
    loaApplicationUrl: e.loaApplicationUrl || '',
    serviceCategory: e.serviceCategory || '',
    logoUrl: e.logoUrl || '',
  } as Form
  for (const c of CONTACTS) {
    for (const f of ['Name', 'Email', 'Number'] as const) form[`${c.key}${f}`] = e[`${c.key}${f}`] || ''
  }
  return form
}

// The HMO's logo on a white tile; nothing when none is saved.
function HmoLogo({ url, name, size }: { url?: string | null; name: string; size: 'row' | 'card' | 'form' }) {
  const box = size === 'row' ? 'h-8 w-28 px-1.5' : size === 'card' ? 'h-12 w-36 p-1.5' : 'h-16 w-44 p-2'
  if (!url) {
    if (size !== 'card') return null
    const initials = name.split(/[\s/&]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    return (
      <span aria-hidden className={`inline-flex flex-none items-center justify-center rounded-lg text-sm font-bold ${box}`} style={{ background: 'var(--pale-teal, #E6F4F2)', color: 'var(--teal)' }}>
        {initials}
      </span>
    )
  }
  return (
    <span className={`inline-flex flex-none items-center justify-center rounded-lg border bg-white ${box}`} style={{ borderColor: 'var(--light-gray)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- uploaded file served by /api/files, not a static asset */}
      <img src={url} alt={`${name} logo`} className="max-h-full max-w-full object-contain" />
    </span>
  )
}

function MoaBadge({ validUntil, noEndDate }: { validUntil?: string | null; noEndDate?: boolean }) {
  if (!validUntil && noEndDate) return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: '#dcfce7', color: '#166534' }}>MOA has no end date</span>
  if (!validUntil) return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>No MOA date</span>
  const days = moaDaysLeft(validUntil)
  const style = days < 0 ? { background: '#fee2e2', color: '#b91c1c' }
    : days <= MOA_ALERT_DAYS ? { background: '#fef3c7', color: '#92400e' }
    : { background: '#dcfce7', color: '#166534' }
  return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={style}>
      {moaNeedsRenewal(validUntil) ? `${moaStatusText(days)} (${ymd(validUntil)})` : `MOA valid until ${ymd(validUntil)}`}
    </span>
  )
}

function FileChips({ label, urls, missing }: { label: string; urls: string[]; missing: string }) {
  if (!urls.length) return <span className="text-xs font-medium" style={{ color: MISSING_RED }}>{missing}</span>
  return (
    <>
      {urls.map((u, i) => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer" title={fileName(u)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border"
          style={{ borderColor: 'var(--light-gray)', color: i === 0 ? 'var(--teal)' : 'var(--mid-gray)' }}>
          <FileText size={12} /> {i === 0 ? label : `Older ${label}`}
        </a>
      ))}
    </>
  )
}

// Price lists by branch: the newest for each branch first, older copies after.
function PriceListChips({ files }: { files: PriceListFile[] }) {
  if (!files.length) return <span className="text-xs font-medium" style={{ color: MISSING_RED }}>No price list</span>
  const groups: { label: string; files: PriceListFile[] }[] = [
    ...ACCREDITABLE_BRANCHES.map(b => ({ label: `Price list · ${b.label}`, files: files.filter(f => f.branch === b.value) })),
    { label: 'Price list', files: files.filter(f => !f.branch) },
  ]
  return (
    <>
      {groups.flatMap(g => g.files.map((f, i) => (
        <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" title={fileName(f.url)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border"
          style={{ borderColor: 'var(--light-gray)', color: i === 0 ? 'var(--teal)' : 'var(--mid-gray)' }}>
          <FileText size={12} /> {i === 0 ? g.label : `Older ${g.label.charAt(0).toLowerCase()}${g.label.slice(1)}`}
        </a>
      )))}
    </>
  )
}

function ContactCard({ title, name, email, number, extra }: { title: string; name?: string | null; email?: string | null; number?: string | null; extra?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>{title}</p>
      {!name && !email && !number ? (
        <p className="text-xs font-medium" style={{ color: MISSING_RED }}>No contact yet</p>
      ) : (
        <div className="text-xs space-y-0.5" style={{ color: 'var(--charcoal)' }}>
          {name && <p className="font-medium truncate">{name}</p>}
          {email && <p className="truncate"><a href={`mailto:${email}`} style={{ color: 'var(--teal)' }}>{email}</a></p>}
          {number && <p className="truncate">{number}</p>}
        </div>
      )}
      {extra}
    </div>
  )
}

function PriceCell({ row }: { row: ScheduledPrice }) {
  const scheduled = row.newPrice != null && Number(row.newPrice) > 0
  return (
    <>
      <span>{formatCurrency(Number(row.price))}</span>
      {scheduled && (
        <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>
          {formatCurrency(Number(row.newPrice))}{row.newPriceEffectiveDate ? ` from ${ymd(row.newPriceEffectiveDate)}` : ' scheduled'}
        </span>
      )}
    </>
  )
}

function ServicePrices({ category }: { category: string }) {
  const [rows, setRows] = useState<ServicePrice[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    setRows(null); setFailed(false)
    fetch(`${API}?category=${encodeURIComponent(category)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then(d => { if (alive) setRows(d.services || []) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [category])

  if (failed) return <p className="text-xs py-2" style={{ color: '#b91c1c' }}>Could not load the prices. Try again.</p>
  if (!rows) return <p className="text-xs py-2 flex items-center gap-2" style={{ color: 'var(--mid-gray)' }}><Loader2 size={13} className="animate-spin" /> Loading prices…</p>
  if (!rows.length) return <p className="text-xs py-2" style={{ color: 'var(--mid-gray)' }}>No active services under {category}.</p>
  return (
    <div className="mt-2 rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: '#F7F9FA' }}>
            {['Service', 'Department', 'Branch', 'Price'].map(h => (
              <th key={h} className={`px-3 py-2 font-semibold whitespace-nowrap ${h === 'Price' ? 'text-right' : 'text-left'}`} style={{ color: 'var(--dark-gray)', borderBottom: '1px solid var(--light-gray)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(s => (
            <tr key={s.id} style={{ borderBottom: '1px solid var(--light-gray)' }}>
              <td className="px-3 py-1.5" style={{ color: 'var(--charcoal)' }}>{s.name}</td>
              <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{s.department}</td>
              <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{BRANCH_LABEL[s.branch] || s.branch}</td>
              <td className="px-3 py-1.5 text-right whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>
                {s.branchPrices.length ? s.branchPrices.map(bp => (
                  <div key={bp.branch}><span style={{ color: 'var(--mid-gray)' }}>{BRANCH_LABEL[bp.branch] || bp.branch}: </span><PriceCell row={bp} /></div>
                )) : <PriceCell row={s} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PdfField({ label, hint, prefix, urls, onChange, onRejected, upload = true }: {
  label: string; hint?: string; prefix: string; urls: string[]; onChange: (urls: string[]) => void; onRejected: () => void; upload?: boolean
}) {
  // Uploads can resolve one after another, so each one adds to the latest list.
  const latest = useRef(urls)
  latest.current = urls
  return (
    <div>
      <p className="text-sm font-medium mb-1" style={{ color: 'var(--charcoal)' }}>{label}</p>
      {hint && <p className="text-[11px] mb-1.5" style={{ color: 'var(--mid-gray)' }}>{hint}</p>}
      {upload && (
      <ScanUpload prefix={prefix} section="hmo-directory" existingCount={urls.length} accept=".pdf,application/pdf" label="Upload PDF" compact qr={false}
        onUploaded={u => {
          if (!/\.pdf$/i.test(u)) { onRejected(); return }
          latest.current = [u, ...latest.current]
          onChange(latest.current)
        }} />
      )}
      {urls.length > 0 && (
        <ul className="mt-2 space-y-1">
          {urls.map(u => (
            <li key={u} className="flex items-center justify-between gap-2 text-xs rounded-lg px-2 py-1" style={{ background: 'var(--off-white)' }}>
              <a href={u} target="_blank" rel="noopener noreferrer" className="truncate" style={{ color: 'var(--teal)' }}>{fileName(u)}</a>
              <button type="button" aria-label={`Remove ${fileName(u)}`} onClick={() => onChange(urls.filter(x => x !== u))}><X size={13} style={{ color: 'var(--mid-gray)' }} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function HmoDirectoryTab({ canEdit, focusWalletId = '' }: { canEdit: boolean; focusWalletId?: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [renewalOnly, setRenewalOnly] = useState(false)
  const [missingOnly, setMissingOnly] = useState(false)
  // The HMO whose card was clicked: its full details open in a popup (Hannah 11/11:
  // cards three across, with the logo and accreditation contact; details on click).
  const [detailsId, setDetailsId] = useState<string | null>(null)
  // A row's prices open in a popup (Hannah 11/11: the inline list was too long).
  const [pricesFor, setPricesFor] = useState<{ hmoName: string; category: string } | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const focusedOnce = useRef(false)

  const load = useCallback(() => {
    return fetch(API)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then(d => { setEntries(d.entries || []); setCategories(d.categories || []); setLoadError('') })
      .catch(() => { setEntries(e => e || []); setLoadError('Could not load the directory. Refresh to try again.') })
  }, [])
  useEffect(() => { load() }, [load])

  // Arriving from the renewal popup or the bell: open that HMO's form.
  useEffect(() => {
    if (!focusWalletId || !entries || !canEdit || focusedOnce.current) return
    const match = entries.find(e => e.walletId === focusWalletId)
    if (!match) return
    focusedOnce.current = true
    setDetailsId(match.walletId)
    setFormError('')
    setForm(toForm(match))
  }, [focusWalletId, entries, canEdit])

  const renewalCount = useMemo(() => (entries || []).filter(e => moaNeedsRenewal(e.moaValidUntil)).length, [entries])
  const missingByWallet = useMemo(() => new Map((entries || []).map(e => [e.walletId, missingInfo(e)])), [entries])
  const missingCount = useMemo(() => [...missingByWallet.values()].filter(m => m.length).length, [missingByWallet])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (entries || []).filter(e => {
      if (renewalOnly && !moaNeedsRenewal(e.moaValidUntil)) return false
      if (missingOnly && !missingByWallet.get(e.walletId)?.length) return false
      if (!q) return true
      const contacts = CONTACTS.flatMap(c => [e[`${c.key}Name`], e[`${c.key}Email`], e[`${c.key}Number`]])
      return [e.hmoName, e.serviceCategory, ...contacts].some(v => v && v.toLowerCase().includes(q))
    })
  }, [entries, search, renewalOnly, missingOnly, missingByWallet])

  const editing = form ? entries?.find(e => e.walletId === form.walletId) : null

  // A category on the Services page, or the saved one if it has since been renamed there.
  const resolveCategory = (typed: string) => {
    const text = typed.trim().toUpperCase()
    const saved = editing?.serviceCategory || ''
    return categories.find(c => c.name.toUpperCase() === text)?.name ?? (saved && saved.toUpperCase() === text ? saved : undefined)
  }

  // Replace one branch's price lists (newest first), leaving the other branch's alone.
  const setPriceLists = (branch: AccreditableBranch | null, urls: string[]) => setForm(f => (f ? {
    ...f,
    priceListFileUrls: [...urls.map(url => ({ url, branch })), ...f.priceListFileUrls.filter(x => x.branch !== branch)],
  } : f))

  const save = async () => {
    if (!form) return
    const serviceCategory = form.serviceCategory.trim() ? resolveCategory(form.serviceCategory) : ''
    if (serviceCategory === undefined) { setFormError('Pick the Category in Services Section from the list.'); return }
    setSaving(true); setFormError('')
    try {
      const { hmoName: _hmoName, ...fields } = form
      const body = { ...fields, serviceCategory }
      const r = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { setFormError((await r.json().catch(() => null))?.error || 'Could not save'); return }
      setForm(null)
      await load()
    } catch {
      setFormError('Could not save. Check your connection and try again.')
    } finally { setSaving(false) }
  }

  const categoryHints = useMemo(() => Object.fromEntries(categories.map(c => [c.name, `${c.count} service${c.count === 1 ? '' : 's'}`])), [categories])

  // Escape closes the top popup: prices first, then the details (never the edit form).
  useEffect(() => {
    if (!pricesFor && !detailsId) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      if (pricesFor) setPricesFor(null)
      else if (!form) setDetailsId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pricesFor, detailsId, form])

  const detail = detailsId ? entries?.find(e => e.walletId === detailsId) || null : null

  const categoryNames = categories.map(c => c.name)
  const formMatches = form ? categoriesMatching(form.hmoName, categoryNames) : []
  const formCategory = form?.serviceCategory.trim() ? resolveCategory(form.serviceCategory) : undefined

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search HMO or contact…"
            className="pl-8 pr-3 py-2 rounded-xl border text-sm w-64" style={inputStyle} />
        </div>
        <button onClick={() => setRenewalOnly(v => !v)} className="px-3 py-2 rounded-xl text-xs font-medium"
          style={renewalOnly ? { background: 'var(--teal)', color: 'white' } : { background: 'var(--off-white)', color: 'var(--charcoal)', border: '1px solid var(--light-gray)' }}>
          Needs renewal ({renewalCount})
        </button>
        <button onClick={() => setMissingOnly(v => !v)} className="px-3 py-2 rounded-xl text-xs font-medium"
          style={missingOnly ? { background: MISSING_RED, color: 'white' } : { background: MISSING_BG, color: MISSING_RED, border: `1px solid ${MISSING_BORDER}` }}>
          Missing info ({missingCount})
        </button>
        <span className="text-sm" style={{ color: 'var(--mid-gray)' }}>
          {entries ? `${shown.length} HMO${shown.length === 1 ? '' : 's'}` : 'Loading…'}
        </span>
      </div>

      {loadError && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FCA5A5' }}>{loadError}</div>}

      {entries && !loadError && shown.length === 0 && (
        <p className="py-10 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
          {renewalOnly ? 'No MOA is due for renewal.' : missingOnly ? 'Every HMO card is complete.' : 'No HMO matches your search.'}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map(e => {
        const missing = missingByWallet.get(e.walletId) || []
        const acc = { name: e.accreditationName, email: e.accreditationEmail, number: e.accreditationNumber }
        return (
          <button key={e.walletId} type="button" onClick={() => setDetailsId(e.walletId)} aria-haspopup="dialog"
            className="text-left rounded-xl border bg-white p-4 flex flex-col gap-3 min-w-0 transition-[box-shadow,border-color] hover:shadow-[0_4px_12px_rgba(0,0,0,0.07)] focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ borderColor: missing.length ? MISSING_BORDER : 'var(--light-gray)', outlineColor: 'var(--teal)' }}>
            <div className="flex items-start justify-between gap-3">
              <HmoLogo url={e.logoUrl} name={e.hmoName} size="card" />
              {missing.length > 0 && (
                <span title={`Missing: ${missing.join(', ')}`} className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap text-white" style={{ background: MISSING_RED }}>
                  {missing.length} missing
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: 'var(--charcoal)' }}>{e.hmoName}</p>
              <div className="mt-1"><MoaBadge validUntil={e.moaValidUntil} noEndDate={e.moaNoEndDate} /></div>
            </div>
            <div className="border-t pt-2.5 min-w-0" style={{ borderColor: 'var(--light-gray)' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>Accreditation contact</p>
              {!acc.name && !acc.email && !acc.number ? (
                <p className="text-xs font-medium" style={{ color: MISSING_RED }}>No contact yet</p>
              ) : (
                <div className="text-xs space-y-0.5" style={{ color: 'var(--charcoal)' }}>
                  {acc.name && <p className="font-medium truncate">{acc.name}</p>}
                  {acc.email && <p className="truncate" style={{ color: 'var(--teal)' }}>{acc.email}</p>}
                  {acc.number && <p className="truncate">{acc.number}</p>}
                </div>
              )}
            </div>
          </button>
        )
      })}
      </div>

      {detail && (() => {
        const e = detail
        const chosen = e.serviceCategory || ''
        const branches = ACCREDITABLE_BRANCHES.filter(b => (e.accreditedBranches || []).includes(b.value))
        const missing = missingByWallet.get(e.walletId) || []
        return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setDetailsId(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="hmo-details-title" onClick={ev => ev.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex flex-wrap items-center gap-3 px-6 pt-5 pb-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
              <HmoLogo url={e.logoUrl} name={e.hmoName} size="row" />
              <h2 id="hmo-details-title" className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{e.hmoName}</h2>
              <MoaBadge validUntil={e.moaValidUntil} noEndDate={e.moaNoEndDate} />
              <div className="ml-auto flex items-center gap-2">
                {canEdit && (
                  <button onClick={() => { setFormError(''); setForm(toForm(e)) }} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
                    <Pencil size={12} /> Edit
                  </button>
                )}
                <button onClick={() => setDetailsId(null)} aria-label="Close"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
              </div>
            </div>
            <div className="px-6 py-4 space-y-3 overflow-y-auto">
            {missing.length > 0 && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ background: MISSING_BG, color: MISSING_RED, border: `1px solid ${MISSING_BORDER}` }}>
                <span className="font-semibold">Missing: </span>{missing.join(', ')}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <FileChips label="MOA" urls={e.moaFileUrls || []} missing="No MOA file" />
              <PriceListChips files={priceListFiles(e.priceListFileUrls)} />
              {e.loaApplicationUrl
                ? <a href={e.loaApplicationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}><ExternalLink size={12} /> LOA application</a>
                : <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>No LOA link</span>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CONTACTS.map(c => (
                <ContactCard key={c.key} title={c.title} name={e[`${c.key}Name`]} email={e[`${c.key}Email`]} number={e[`${c.key}Number`]}
                  extra={c.key === 'submission' && (
                    <p className="text-xs mt-1">
                      {e.soaSubmission
                        ? <>SOAs by <span className="font-semibold">{SOA_SUBMISSION_LABEL[e.soaSubmission].toLowerCase()}</span></>
                        : <span className="font-medium" style={{ color: MISSING_RED }}>How SOAs are submitted not set</span>}
                    </p>
                  )} />
              ))}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>Accredited branches</p>
                <p className={`text-xs${branches.length ? '' : ' font-medium'}`} style={{ color: branches.length ? 'var(--charcoal)' : MISSING_RED }}>
                  {branches.length ? branches.map(b => b.label).join(', ') : 'Not set'}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>Terms</p>
                <div className="text-xs space-y-1" style={{ color: 'var(--charcoal)' }}>
                  <p>{e.mdPayment ? MD_PAYMENT_LABEL[e.mdPayment] : <span className="font-medium" style={{ color: MISSING_RED }}>Doctor payment not set</span>}</p>
                  {e.mdPayment === 'CLINIC' && !e.paysClinicForMd && (
                    <p className="text-[11px]" style={{ color: '#92400e' }}>The books still treat this HMO&apos;s doctor consults as paid directly, so they post no revenue or AR.</p>
                  )}
                  {e.earlyDiscountPct != null || e.earlyDiscountDays != null || e.earlyDiscountNotes ? (
                    <p>
                      Early submission:{e.earlyDiscountPct != null && ` ${e.earlyDiscountPct}% off`}
                      {e.earlyDiscountDays != null && ` if submitted within ${e.earlyDiscountDays} day${e.earlyDiscountDays === 1 ? '' : 's'}`}
                      {e.earlyDiscountNotes && <span className="block" style={{ color: 'var(--mid-gray)' }}>{e.earlyDiscountNotes}</span>}
                    </p>
                  ) : <p style={{ color: 'var(--mid-gray)' }}>No early submission discount</p>}
                </div>
              </div>
            </div>

            <div className="border-t pt-3" style={{ borderColor: 'var(--light-gray)' }}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs">
                  <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>Category in Services Section: </span>
                  <span className={chosen ? undefined : 'font-medium'} style={{ color: chosen ? 'var(--charcoal)' : MISSING_RED }}>{chosen || (canEdit ? 'Not chosen yet. Choose it in Edit.' : 'Not chosen yet')}</span>
                </p>
                {chosen && (
                  <button onClick={() => setPricesFor({ hmoName: e.hmoName, category: chosen })}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                    <Tag size={12} /> View prices
                  </button>
                )}
              </div>
            </div>
            </div>
          </div>
        </div>
        )
      })()}

      {pricesFor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setPricesFor(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="hmo-prices-title" onClick={ev => ev.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
              <div className="min-w-0">
                <h2 id="hmo-prices-title" className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{pricesFor.hmoName} prices</h2>
                <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Services under {pricesFor.category} in the Services section</p>
              </div>
              <button onClick={() => setPricesFor(null)} aria-label="Close"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <div className="px-6 pb-5 overflow-y-auto"><ServicePrices category={pricesFor.category} /></div>
          </div>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-auto space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{form.hmoName}</h2>
              <button onClick={() => setForm(null)} aria-label="Close"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>

            <section>
              <p className="text-sm font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Logo</p>
              <div className="flex flex-wrap items-center gap-3">
                {form.logoUrl
                  ? <HmoLogo url={form.logoUrl} name={form.hmoName} size="form" />
                  : <span className="inline-flex h-16 w-44 items-center justify-center rounded-lg border border-dashed text-xs" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>No logo yet</span>}
                <div className="space-y-1">
                  <ScanUpload prefix={`LOGO-${form.hmoName}`} section="hmo-directory" existingCount={form.logoUrl ? 1 : 0} accept="image/png,image/jpeg,image/webp"
                    label={form.logoUrl ? 'Replace logo' : 'Upload logo'} compact qr={false}
                    onUploaded={u => {
                      if (!isLogoUrl(u)) { setFormError('The logo must be a PNG, JPG or WEBP image.'); return }
                      setForm(f => (f ? { ...f, logoUrl: u } : f))
                    }} />
                  {form.logoUrl && (
                    <button type="button" onClick={() => setForm(f => (f ? { ...f, logoUrl: '' } : f))} className="block text-xs underline" style={{ color: 'var(--mid-gray)' }}>Remove logo</button>
                  )}
                </div>
              </div>
            </section>

            <section>
              <p className="text-sm font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Accredited branches</p>
              <div className="flex flex-wrap gap-4">
                {ACCREDITABLE_BRANCHES.map(b => (
                  <label key={b.value} className="flex items-center gap-2 text-sm" style={{ color: 'var(--charcoal)' }}>
                    <input type="checkbox" checked={form.accreditedBranches.includes(b.value)}
                      onChange={ev => setForm({ ...form, accreditedBranches: ev.target.checked ? [...form.accreditedBranches, b.value] : form.accreditedBranches.filter(x => x !== b.value) })} />
                    {b.label}
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              {CONTACTS.map(c => (
                <div key={c.key}>
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>{c.title} contact</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input aria-label={`${c.title} contact person`} placeholder="Contact person" value={form[`${c.key}Name`]} onChange={ev => setForm({ ...form, [`${c.key}Name`]: ev.target.value })} className={inputClass} style={inputStyle} />
                    <input aria-label={`${c.title} email`} placeholder="Email" value={form[`${c.key}Email`]} onChange={ev => setForm({ ...form, [`${c.key}Email`]: ev.target.value })} className={inputClass} style={inputStyle} />
                    <input aria-label={`${c.title} number`} placeholder="Number" value={form[`${c.key}Number`]} onChange={ev => setForm({ ...form, [`${c.key}Number`]: ev.target.value })} className={inputClass} style={inputStyle} />
                  </div>
                  {c.key === 'submission' && (
                    <div className="mt-2 sm:w-1/3">
                      <label htmlFor="soa-submission" className="text-[11px] block mb-0.5" style={{ color: 'var(--mid-gray)' }}>How SOAs are submitted</label>
                      <select id="soa-submission" value={form.soaSubmission} onChange={ev => setForm({ ...form, soaSubmission: ev.target.value as SoaSubmission | '' })}
                        className={inputClass} style={inputStyle}>
                        <option value="">Not set</option>
                        {(Object.keys(SOA_SUBMISSION_LABEL) as SoaSubmission[]).map(k => <option key={k} value={k}>{SOA_SUBMISSION_LABEL[k]}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <label htmlFor="moa-valid-until" className="text-sm font-medium block mb-1" style={{ color: 'var(--charcoal)' }}>MOA valid until</label>
                  <input id="moa-valid-until" type="date" value={form.moaValidUntil} disabled={form.moaNoEndDate}
                    onChange={ev => setForm({ ...form, moaValidUntil: ev.target.value })} className={`${inputClass} disabled:opacity-50`} style={inputStyle} />
                  <label className="flex items-center gap-2 text-sm mt-1.5" style={{ color: 'var(--charcoal)' }}>
                    <input type="checkbox" checked={form.moaNoEndDate}
                      onChange={ev => setForm({ ...form, moaNoEndDate: ev.target.checked, moaValidUntil: ev.target.checked ? '' : form.moaValidUntil })} />
                    Until terminated (no end date)
                  </label>
                  {form.moaNoEndDate ? (
                    <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>The MOA runs until either side ends it, so there is no renewal reminder.</p>
                  ) : moaNeedsRenewal(editing?.moaValidUntil) ? (
                    <p className="text-[11px] mt-1" style={{ color: '#92400e' }}>To renew, enter the new validity date and upload the new signed MOA below. The daily reminder stops once the date is more than {MOA_ALERT_DAYS} days away.</p>
                  ) : (
                    <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>A daily reminder starts {MOA_ALERT_DAYS} days before this date.</p>
                  )}
                </div>
                <PdfField label="Signed copy of the MOA" hint="Older copies stay listed after a renewal." prefix={`MOA-${form.hmoName}`} urls={form.moaFileUrls}
                  onChange={urls => setForm(f => (f ? { ...f, moaFileUrls: urls } : f))} onRejected={() => setFormError('The MOA must be a PDF.')} />
              </div>
              <div className="space-y-3">
                <div>
                  <label htmlFor="loa-link" className="text-sm font-medium block mb-1" style={{ color: 'var(--charcoal)' }}>Link of LOA application</label>
                  <input id="loa-link" placeholder="https://…" value={form.loaApplicationUrl} onChange={ev => setForm({ ...form, loaApplicationUrl: ev.target.value })} className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <p className="text-sm font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Price list submitted to the HMO</p>
                  <p className="text-[11px] mb-1.5" style={{ color: 'var(--mid-gray)' }}>One for each branch. Older copies stay listed.</p>
                  <div className="space-y-2 pl-2 border-l-2" style={{ borderColor: 'var(--light-gray)' }}>
                    {ACCREDITABLE_BRANCHES.map(b => (
                      <PdfField key={b.value} label={b.label} prefix={`PRICELIST-${form.hmoName}-${b.label}`}
                        urls={form.priceListFileUrls.filter(f => f.branch === b.value).map(f => f.url)}
                        onChange={urls => setPriceLists(b.value, urls)} onRejected={() => setFormError('The price list must be a PDF.')} />
                    ))}
                    {form.priceListFileUrls.some(f => !f.branch) && (
                      <PdfField label="Not tagged to a branch" prefix={`PRICELIST-${form.hmoName}`} upload={false}
                        urls={form.priceListFileUrls.filter(f => !f.branch).map(f => f.url)}
                        onChange={urls => setPriceLists(null, urls)} onRejected={() => setFormError('The price list must be a PDF.')} />
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section>
              <label className="block">
                <span className="text-sm font-semibold block mb-1" style={{ color: 'var(--charcoal)' }}>Category in Services Section</span>
                <NameCombobox value={form.serviceCategory} onChange={v => setForm(f => (f ? { ...f, serviceCategory: v } : f))}
                  options={[...formMatches, ...categoryNames.filter(n => !formMatches.includes(n))]}
                  hints={categoryHints} maxOptions={categoryNames.length} placeholder="Choose this HMO's category…"
                  className={inputClass} style={inputStyle} />
              </label>
              {formCategory ? (
                <div className="max-h-72 overflow-y-auto"><ServicePrices category={formCategory} /></div>
              ) : (
                <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>
                  {form.serviceCategory.trim() ? 'Pick a category from the list to show its services and prices.' : 'Its services and prices show here once chosen.'}
                </p>
              )}
            </section>

            <section>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Medical doctors</p>
              <div className="space-y-1">
                {(Object.keys(MD_PAYMENT_LABEL) as MdPayment[]).map(k => (
                  <label key={k} className="flex items-center gap-2 text-sm" style={{ color: 'var(--charcoal)' }}>
                    <input type="checkbox" checked={form.mdPayment === k} onChange={ev => setForm({ ...form, mdPayment: ev.target.checked ? k : null })} />
                    {MD_PAYMENT_LABEL[k]}
                  </label>
                ))}
              </div>
              <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>A record of what the MOA says. It does not change what posts to the GL or what shows in AR.</p>
            </section>

            <section>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Early submission discount</p>
              <div className="grid gap-2 sm:grid-cols-4">
                <div>
                  <label htmlFor="early-pct" className="text-[11px] block mb-0.5" style={{ color: 'var(--mid-gray)' }}>Discount %</label>
                  <input id="early-pct" type="number" min={0} max={100} step="0.01" value={form.earlyDiscountPct} onChange={ev => setForm({ ...form, earlyDiscountPct: ev.target.value })} className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="early-days" className="text-[11px] block mb-0.5" style={{ color: 'var(--mid-gray)' }}>Days to submit</label>
                  <input id="early-days" type="number" min={1} step={1} value={form.earlyDiscountDays} onChange={ev => setForm({ ...form, earlyDiscountDays: ev.target.value })} className={inputClass} style={inputStyle} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="early-notes" className="text-[11px] block mb-0.5" style={{ color: 'var(--mid-gray)' }}>Details</label>
                  <input id="early-notes" value={form.earlyDiscountNotes} onChange={ev => setForm({ ...form, earlyDiscountNotes: ev.target.value })} className={inputClass} style={inputStyle} />
                </div>
              </div>
            </section>

            {formError && <p className="text-sm" style={{ color: '#b91c1c' }}>{formError}</p>}

            <div className="flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: 'var(--teal)' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
