'use client'

// Accounts Receivable → HMO Directory: who to call at each HMO and what our MOA
// with it says. Reference only; nothing here posts or changes a receivable. The
// renewal popup and the bell read the MOA date saved here.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, FileText, Loader2, Pencil, Search, X } from 'lucide-react'
import { ScanUpload } from '@/components/ScanUpload'
import { NameCombobox } from '@/components/NameCombobox'
import { formatCurrency } from '@/lib/utils'
import {
  ACCREDITABLE_BRANCHES, MD_PAYMENT_LABEL, MOA_ALERT_DAYS, categoriesMatching, moaDaysLeft, moaNeedsRenewal, moaStatusText, type MdPayment,
} from '@/lib/hmo-directory'

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
  moaFileUrls?: string[]
  priceListFileUrls?: string[]
  mdPayment?: MdPayment | null
  earlyDiscountPct?: number | null
  earlyDiscountDays?: number | null
  earlyDiscountNotes?: string | null
  loaApplicationUrl?: string | null
  serviceCategory?: string | null
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
  moaFileUrls: string[]
  priceListFileUrls: string[]
  mdPayment: MdPayment | null
  earlyDiscountPct: string
  earlyDiscountDays: string
  earlyDiscountNotes: string
  loaApplicationUrl: string
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
    moaFileUrls: e.moaFileUrls || [],
    priceListFileUrls: e.priceListFileUrls || [],
    mdPayment: e.mdPayment || null,
    earlyDiscountPct: e.earlyDiscountPct != null ? String(e.earlyDiscountPct) : '',
    earlyDiscountDays: e.earlyDiscountDays != null ? String(e.earlyDiscountDays) : '',
    earlyDiscountNotes: e.earlyDiscountNotes || '',
    loaApplicationUrl: e.loaApplicationUrl || '',
  } as Form
  for (const c of CONTACTS) {
    for (const f of ['Name', 'Email', 'Number'] as const) form[`${c.key}${f}`] = e[`${c.key}${f}`] || ''
  }
  return form
}

function MoaBadge({ validUntil }: { validUntil?: string | null }) {
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
  if (!urls.length) return <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{missing}</span>
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

function ContactCard({ title, name, email, number }: { title: string; name?: string | null; email?: string | null; number?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>{title}</p>
      {!name && !email && !number ? (
        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No contact yet</p>
      ) : (
        <div className="text-xs space-y-0.5" style={{ color: 'var(--charcoal)' }}>
          {name && <p className="font-medium truncate">{name}</p>}
          {email && <p className="truncate"><a href={`mailto:${email}`} style={{ color: 'var(--teal)' }}>{email}</a></p>}
          {number && <p className="truncate">{number}</p>}
        </div>
      )}
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

function PdfField({ label, hint, prefix, urls, onChange, onRejected }: {
  label: string; hint?: string; prefix: string; urls: string[]; onChange: (urls: string[]) => void; onRejected: () => void
}) {
  // Uploads can resolve one after another, so each one adds to the latest list.
  const latest = useRef(urls)
  latest.current = urls
  return (
    <div>
      <p className="text-sm font-medium mb-1" style={{ color: 'var(--charcoal)' }}>{label}</p>
      {hint && <p className="text-[11px] mb-1.5" style={{ color: 'var(--mid-gray)' }}>{hint}</p>}
      <ScanUpload prefix={prefix} section="hmo-directory" existingCount={urls.length} accept=".pdf,application/pdf" label="Upload PDF" compact qr={false}
        onUploaded={u => {
          if (!/\.pdf$/i.test(u)) { onRejected(); return }
          latest.current = [u, ...latest.current]
          onChange(latest.current)
        }} />
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
  // Rows flipped from their default: closed normally, open while searching.
  const [toggledRows, setToggledRows] = useState<Set<string>>(new Set())
  const [openPrices, setOpenPrices] = useState<Set<string>>(new Set())
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [rowError, setRowError] = useState<{ walletId: string; message: string } | null>(null)
  // What is typed in a row's category box before it is picked and saved.
  const [categoryDraft, setCategoryDraft] = useState<Record<string, string>>({})
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
    setToggledRows(prev => new Set(prev).add(match.walletId))
    setFormError('')
    setForm(toForm(match))
  }, [focusWalletId, entries, canEdit])

  const renewalCount = useMemo(() => (entries || []).filter(e => moaNeedsRenewal(e.moaValidUntil)).length, [entries])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (entries || []).filter(e => {
      if (renewalOnly && !moaNeedsRenewal(e.moaValidUntil)) return false
      if (!q) return true
      const contacts = CONTACTS.flatMap(c => [e[`${c.key}Name`], e[`${c.key}Email`], e[`${c.key}Number`]])
      return [e.hmoName, e.serviceCategory, ...contacts].some(v => v && v.toLowerCase().includes(q))
    })
  }, [entries, search, renewalOnly])

  const save = async () => {
    if (!form) return
    setSaving(true); setFormError('')
    try {
      const { hmoName: _hmoName, ...body } = form
      const r = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { setFormError((await r.json().catch(() => null))?.error || 'Could not save'); return }
      setForm(null)
      await load()
    } catch {
      setFormError('Could not save. Check your connection and try again.')
    } finally { setSaving(false) }
  }

  const categoryHints = useMemo(() => Object.fromEntries(categories.map(c => [c.name, `${c.count} service${c.count === 1 ? '' : 's'}`])), [categories])

  const chooseCategory = async (walletId: string, typed: string, saved: string) => {
    setRowError(null)
    const text = typed.trim()
    if (text.toUpperCase() === saved.toUpperCase()) {
      setCategoryDraft(d => ({ ...d, [walletId]: saved }))
      return
    }
    const serviceCategory = text ? categories.find(c => c.name.toUpperCase() === text.toUpperCase())?.name : ''
    if (serviceCategory === undefined) { setRowError({ walletId, message: 'Pick a category from the list.' }); return }
    try {
      const r = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ walletId, serviceCategory }) })
      if (!r.ok) { setRowError({ walletId, message: (await r.json().catch(() => null))?.error || 'Could not save the category' }); return }
      await load()
      setCategoryDraft(d => ({ ...d, [walletId]: serviceCategory }))
      setOpenPrices(prev => {
        const next = new Set(prev)
        if (serviceCategory) next.add(walletId)
        else next.delete(walletId)
        return next
      })
    } catch {
      setRowError({ walletId, message: 'Could not save the category. Check your connection and try again.' })
    }
  }

  const toggleRow = (walletId: string) => setToggledRows(prev => {
    const next = new Set(prev)
    if (next.has(walletId)) next.delete(walletId)
    else next.add(walletId)
    return next
  })

  const togglePrices = (walletId: string) => setOpenPrices(prev => {
    const next = new Set(prev)
    if (next.has(walletId)) next.delete(walletId)
    else next.add(walletId)
    return next
  })

  const editing = form ? entries?.find(e => e.walletId === form.walletId) : null

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
        <span className="text-sm" style={{ color: 'var(--mid-gray)' }}>
          {entries ? `${shown.length} HMO${shown.length === 1 ? '' : 's'}` : 'Loading…'}
        </span>
      </div>

      {loadError && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FCA5A5' }}>{loadError}</div>}

      {entries && !loadError && shown.length === 0 && (
        <p className="py-10 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
          {renewalOnly ? 'No MOA is due for renewal.' : 'No HMO matches your search.'}
        </p>
      )}

      <div className="space-y-2">
      {shown.map(e => {
        const chosen = e.serviceCategory || ''
        const names = categories.map(c => c.name)
        const matches = categoriesMatching(e.hmoName, names)
        const pricesOpen = !!chosen && openPrices.has(e.walletId)
        const isOpen = toggledRows.has(e.walletId) !== !!search.trim()
        const branches = ACCREDITABLE_BRANCHES.filter(b => (e.accreditedBranches || []).includes(b.value))
        return (
          <div key={e.walletId} className="rounded-xl border" style={{ borderColor: 'var(--light-gray)', background: '#fff' }}>
            <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>
              <button type="button" aria-expanded={isOpen} onClick={() => toggleRow(e.walletId)} className="w-full flex flex-wrap items-center gap-2 px-4 py-3 text-left">
                {isOpen ? <ChevronDown size={16} style={{ color: 'var(--mid-gray)' }} /> : <ChevronRight size={16} style={{ color: 'var(--mid-gray)' }} />}
                <span>{e.hmoName}</span>
                <MoaBadge validUntil={e.moaValidUntil} />
              </button>
            </h3>

            {isOpen && (
            <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
            <div className="flex flex-wrap items-center gap-2">
              <FileChips label="MOA" urls={e.moaFileUrls || []} missing="No MOA file" />
              <FileChips label="Price list" urls={e.priceListFileUrls || []} missing="No price list" />
              {e.loaApplicationUrl
                ? <a href={e.loaApplicationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}><ExternalLink size={12} /> LOA application</a>
                : <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>No LOA link</span>}
              {canEdit && (
                <button onClick={() => { setFormError(''); setForm(toForm(e)) }} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
                  <Pencil size={12} /> Edit
                </button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {CONTACTS.map(c => <ContactCard key={c.key} title={c.title} name={e[`${c.key}Name`]} email={e[`${c.key}Email`]} number={e[`${c.key}Number`]} />)}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>Accredited branches</p>
                <p className="text-xs" style={{ color: branches.length ? 'var(--charcoal)' : 'var(--mid-gray)' }}>
                  {branches.length ? branches.map(b => b.label).join(', ') : 'Not set'}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--mid-gray)' }}>Terms</p>
                <div className="text-xs space-y-1" style={{ color: 'var(--charcoal)' }}>
                  <p>{e.mdPayment ? MD_PAYMENT_LABEL[e.mdPayment] : <span style={{ color: 'var(--mid-gray)' }}>Doctor payment not set</span>}</p>
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
                {canEdit ? (
                  <label className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Category in Services Section</span>
                    <span className="block w-72 max-w-full">
                      <NameCombobox value={categoryDraft[e.walletId] ?? chosen}
                        onChange={v => setCategoryDraft(d => ({ ...d, [e.walletId]: v }))}
                        onCommit={v => chooseCategory(e.walletId, v, chosen)}
                        options={[...matches, ...names.filter(n => !matches.includes(n))]}
                        hints={categoryHints} maxOptions={names.length} placeholder="Choose a category…"
                        className="w-full px-2 py-1.5 rounded-lg border text-xs" style={inputStyle} />
                    </span>
                  </label>
                ) : (
                  <p className="text-xs">
                    <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>Category in Services Section: </span>
                    <span style={{ color: chosen ? 'var(--charcoal)' : 'var(--mid-gray)' }}>{chosen || 'Not chosen yet'}</span>
                  </p>
                )}
                {chosen && (
                  <button onClick={() => togglePrices(e.walletId)} className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--teal)' }}>
                    {pricesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {pricesOpen ? 'Hide prices' : 'Show prices'}
                  </button>
                )}
              </div>
              {rowError?.walletId === e.walletId && <p className="text-xs mt-1" style={{ color: '#b91c1c' }}>{rowError.message}</p>}
              {pricesOpen && <ServicePrices category={chosen} />}
            </div>
            </div>
            )}
          </div>
        )
      })}
      </div>

      {form && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-auto space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{form.hmoName}</h2>
              <button onClick={() => setForm(null)} aria-label="Close"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>

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
                </div>
              ))}
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <label htmlFor="moa-valid-until" className="text-sm font-medium block mb-1" style={{ color: 'var(--charcoal)' }}>MOA valid until</label>
                  <input id="moa-valid-until" type="date" value={form.moaValidUntil} onChange={ev => setForm({ ...form, moaValidUntil: ev.target.value })} className={inputClass} style={inputStyle} />
                  {moaNeedsRenewal(editing?.moaValidUntil) ? (
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
                <PdfField label="Price list submitted to the HMO" prefix={`PRICELIST-${form.hmoName}`} urls={form.priceListFileUrls}
                  onChange={urls => setForm(f => (f ? { ...f, priceListFileUrls: urls } : f))} onRejected={() => setFormError('The price list must be a PDF.')} />
              </div>
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
