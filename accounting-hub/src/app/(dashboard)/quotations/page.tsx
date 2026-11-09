'use client'

/**
 * Quotation Maker.
 *
 * Build a quotation from the services tagged to a branch plus Verdana products,
 * price it (PWD rate, a blanket discount, or a per-line one), and generate it onto
 * that branch's own .docx letterhead — uploaded under Settings.
 *
 * Pricing is computed with the same helper the API uses, so the totals on screen
 * and the ones saved to the document cannot disagree.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FileText, Search, Plus, Trash2, Loader2, Download, Upload, Settings as SettingsIcon,
  X, PenLine, Eraser, Building2, Package, Stethoscope, AlertCircle, Check, FileSignature,
} from 'lucide-react'
import {
  QUOTATION_BRANCHES, VALIDITY_OPTIONS, DOWNPAYMENT_OPTIONS, priceQuotation, formatPeso,
  type DiscountKind, type QuotationLineInput,
} from '@/lib/quotations/pricing'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'

type Tab = 'new' | 'saved' | 'settings'

/* ── HR Hub look: shared bits for the three tabs ─────────────────── */
const CARD = 'rounded-lg border bg-white'
const BORDER: React.CSSProperties = { borderColor: 'var(--light-gray)' }
const LINE: React.CSSProperties = { borderColor: 'var(--hr-line)' }
const FIELD_LABEL = 'block text-[11px] font-bold uppercase tracking-[.4px] mb-1'
const FIELD = 'w-full h-9 px-3 rounded-lg border bg-white text-[13px] outline-none transition-shadow focus:border-[var(--teal)] focus:shadow-[0_0_0_3px_rgba(74,128,115,0.12)]'
const TH = 'px-3 py-2 border-b text-[11px] font-bold uppercase tracking-[.5px] whitespace-nowrap'
const TH_STYLE: React.CSSProperties = { color: 'var(--mid-gray)', background: 'var(--hr-head)', borderColor: 'var(--light-gray)' }
const seg = (on: boolean): React.CSSProperties => (on ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' })
const KIND_PILL = {
  SERVICE: { background: 'var(--pale-teal)', color: 'var(--teal)' },
  PRODUCT: { background: '#eff6ff', color: '#1d4ed8' },
} as const
/** Short branch names for cards and pills; the full letterhead name stays in the pickers. */
const BRANCH_SHORT: Record<string, string> = { AHEA: 'East', AHGH: 'Greenhills', VERDANA: 'Verdana', INSTITUTE: 'Institute' }

/** Section header inside a white card: title, optional count, one-line help. */
function CardHead({ title, count, help, children }: { title: string; count?: string; help?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-3.5 pb-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          {title}
          {count && <span className="ml-1.5 text-xs font-semibold" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-body)' }}>{count}</span>}
        </h2>
        {help && <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{help}</p>}
      </div>
      {children}
    </div>
  )
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border text-[13px]" style={{ background: '#fef2f2', borderColor: '#fecaca', borderLeft: '4px solid #dc2626', color: '#991b1b' }}>
      <AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{text}</span>
    </div>
  )
}

interface ServiceResult {
  id: string
  name: string
  department: string
  branch: string
  price: string | number
  newPrice?: string | number | null
  newPriceEffectiveDate?: string | null
  hasDoctorFee?: boolean
  clinicFee?: string | number | null
  pwdDiscountClinicOnly?: boolean
  noPwdDiscount?: boolean
  branchPrices?: { branch: string; price: string | number; newPrice?: string | number | null; newPriceEffectiveDate?: string | null }[]
}

interface ProductResult {
  id: string
  name: string
  sku: string
  sellingPrice: number
  imageUrl?: string | null
}

interface SavedQuotation {
  id: string
  quotationNumber: string
  branch: string
  recipientName: string
  datePrepared: string
  grandTotal: string | number
  createdBy?: { name: string } | null
  _count?: { items: number }
}

interface BankAccountRow {
  id: string
  accountNumber: string
  accountTitle: string
  bankName: string | null
  currency: string
}

interface TemplateRow {
  id: string
  branch: string
  fileName: string
  storedName: string
  updatedAt: string
}

const num = (v: string | number | null | undefined): number => (v == null ? 0 : typeof v === 'number' ? v : parseFloat(v) || 0)

/**
 * The hub's list endpoints disagree on shape: some return a bare array, some a
 * pagination envelope under `data`, some a named key. Normalise rather than
 * guessing — reading the wrong key silently yields an empty result list.
 */
function asArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === 'object') {
    for (const key of ['data', 'items', 'services', 'results']) {
      const value = (payload as Record<string, unknown>)[key]
      if (Array.isArray(value)) return value as T[]
    }
  }
  return []
}

/** The price actually in force for this service at this branch today. */
function effectiveServicePrice(svc: ServiceResult, serviceBranch: string): number {
  const today = new Date()
  const override = svc.branchPrices?.find(bp => bp.branch === serviceBranch)
  const base = override ?? svc
  const newPrice = num(base.newPrice)
  const effective = base.newPriceEffectiveDate ? new Date(base.newPriceEffectiveDate) : null
  if (newPrice > 0 && effective && effective <= today) return newPrice
  return num(base.price)
}

/* ═══════════════════════════════════════════════════════════════
   SIGNATURE PAD
   ═══════════════════════════════════════════════════════════════ */

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Match the backing store to the CSS size so strokes aren't blurry.
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
  }, [])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    drawing.current = true
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (!hasInk) setHasInk(true)
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    const canvas = canvasRef.current
    if (canvas) onChange(canvas.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full rounded-lg border bg-white touch-none"
        style={{ height: 120, borderColor: 'var(--light-gray)', borderStyle: hasInk ? 'solid' : 'dashed', cursor: 'crosshair' }}
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs font-semibold" style={{ color: hasInk ? '#047857' : 'var(--hr-faint)' }}>
          {hasInk ? 'Signature captured' : 'Sign inside the box'}
        </span>
        <button type="button" onClick={clear} className="flex items-center gap-1 text-xs font-semibold hover:text-[var(--teal)]" style={{ color: 'var(--mid-gray)' }}>
          <Eraser size={12} /> Clear
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function QuotationsPage() {
  const [tab, setTab] = useState<Tab>('new')

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <FileSignature size={22} style={{ color: 'var(--teal)' }} /> Quotations
        </h1>
        <p className="mt-1 text-[13px] max-w-2xl" style={{ color: 'var(--mid-gray)' }}>
          Build a quotation from your services and products, and generate it on the branch letterhead.
        </p>
      </div>

      {/* Tabs: one row, swipes sideways on narrow screens */}
      <div className="border-b-2" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex items-end -mb-[2px] max-w-full overflow-x-auto" role="tablist">
          {([
            { key: 'new', label: 'New quotation', icon: FileText },
            { key: 'saved', label: 'Saved', icon: Check },
            { key: 'settings', label: 'Settings', icon: SettingsIcon },
          ] as { key: Tab; label: string; icon: typeof FileText }[]).map(t => {
            const Icon = t.icon
            const active = tab === t.key
            return (
              <button key={t.key} onClick={() => setTab(t.key)} role="tab" aria-selected={active}
                className="flex items-center gap-1.5 px-3.5 py-2.5 border-b-2 text-[13px] font-semibold whitespace-nowrap transition-colors hover:text-[var(--teal)]"
                style={{ fontFamily: 'var(--font-display)', borderColor: active ? 'var(--teal)' : 'transparent', color: active ? 'var(--teal)' : 'var(--mid-gray)' }}>
                <Icon size={14} /> {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'new' && <MakerTab />}
      {tab === 'saved' && <SavedTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAKER
   ═══════════════════════════════════════════════════════════════ */

interface EditableLine extends QuotationLineInput {
  key: string
}

function MakerTab() {
  const [branch, setBranch] = useState<string>('AHEA')
  const [mode, setMode] = useState<'SERVICE' | 'PRODUCT'>('SERVICE')
  const [query, setQuery] = useState('')
  const [services, setServices] = useState<ServiceResult[]>([])
  const [products, setProducts] = useState<ProductResult[]>([])
  const [searching, setSearching] = useState(false)
  const [lines, setLines] = useState<EditableLine[]>([])

  const [recipientName, setRecipientName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [datePrepared, setDatePrepared] = useState(() => new Date().toISOString().slice(0, 10))
  const [validityDays, setValidityDays] = useState<number>(30)
  const [remarks, setRemarks] = useState('')
  const [downpaymentPercent, setDownpaymentPercent] = useState<number | ''>('')
  const [bankAccountId, setBankAccountId] = useState('')
  const [bankAccounts, setBankAccounts] = useState<BankAccountRow[]>([])
  const [preparedByName, setPreparedByName] = useState('')
  const [preparedByPosition, setPreparedByPosition] = useState('')

  const [usePwdRate, setUsePwdRate] = useState(false)
  const [useGlobalDiscount, setUseGlobalDiscount] = useState(false)
  const [globalDiscountType, setGlobalDiscountType] = useState<DiscountKind>('PERCENT')
  const [globalDiscountValue, setGlobalDiscountValue] = useState('')

  const [sigMode, setSigMode] = useState<'draw' | 'upload'>('draw')
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null)
  const [sigUploadUrl, setSigUploadUrl] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ id: string; quotationNumber: string } | null>(null)

  const serviceBranch = QUOTATION_BRANCHES.find(b => b.key === branch)?.serviceBranch || 'ALL'

  useEffect(() => {
    fetch('/api/quotations/bank-accounts')
      .then(r => (r.ok ? r.json() : { accounts: [] }))
      .then(d => setBankAccounts(asArray<BankAccountRow>(d)))
      .catch(() => setBankAccounts([]))
  }, [])

  // Search — services are branch-scoped, products always come from Verdana.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setServices([]); setProducts([]); return }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        if (mode === 'SERVICE') {
          const params = new URLSearchParams({ search: q, pageSize: '25' })
          if (serviceBranch !== 'ALL') params.set('branch', serviceBranch)
          const res = await fetch(`/api/services?${params}`)
          const data = await res.json()
          // /api/services answers with a pagination envelope: { data, total, … }.
          if (!cancelled) setServices(asArray<ServiceResult>(data))
        } else {
          const params = new URLSearchParams({ search: q, all: 'true', branch: 'VERDANA_STORE' })
          const res = await fetch(`/api/inventory?${params}`)
          const data = await res.json()
          // …while /api/inventory?all=true answers with a bare array.
          if (!cancelled) setProducts(asArray<ProductResult>(data).slice(0, 25))
        }
      } catch {
        if (!cancelled) { setServices([]); setProducts([]) }
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, mode, serviceBranch])

  const addService = (svc: ServiceResult) => {
    setLines(prev => [...prev, {
      key: `s-${svc.id}-${prev.length}`,
      kind: 'SERVICE',
      serviceId: svc.id,
      name: svc.name,
      department: svc.department,
      grossPrice: effectiveServicePrice(svc, serviceBranch),
      quantity: 1,
      lineDiscountType: 'NONE',
      lineDiscountValue: 0,
      noPwdDiscount: !!svc.noPwdDiscount,
      hasDoctorFee: !!svc.hasDoctorFee,
      pwdDiscountClinicOnly: !!svc.pwdDiscountClinicOnly,
      clinicFee: svc.clinicFee != null ? num(svc.clinicFee) : null,
    }])
    setQuery('')
  }

  const addProduct = (p: ProductResult) => {
    setLines(prev => [...prev, {
      key: `p-${p.id}-${prev.length}`,
      kind: 'PRODUCT',
      inventoryItemId: p.id,
      name: p.name,
      sku: p.sku,
      imageUrl: p.imageUrl || null,
      grossPrice: num(p.sellingPrice),
      quantity: 1,
      lineDiscountType: 'NONE',
      lineDiscountValue: 0,
    }])
    setQuery('')
  }

  const update = (key: string, patch: Partial<EditableLine>) =>
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)))

  const totals = useMemo(
    () => priceQuotation(lines, {
      usePwdRate,
      globalDiscountType: useGlobalDiscount ? globalDiscountType : 'NONE',
      globalDiscountValue: useGlobalDiscount ? parseFloat(globalDiscountValue) || 0 : 0,
    }),
    [lines, usePwdRate, useGlobalDiscount, globalDiscountType, globalDiscountValue],
  )

  async function uploadSignature(): Promise<string | null> {
    if (sigMode === 'upload') return sigUploadUrl
    if (!sigDataUrl) return null
    const blob = await (await fetch(sigDataUrl)).blob()
    const fd = new FormData()
    fd.append('file', new File([blob], 'signature.png', { type: 'image/png' }))
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Could not upload the signature')
    return data.url as string
  }

  async function handleSave() {
    setError(null)
    if (lines.length === 0) { setError('Add at least one service or product.'); return }
    if (!recipientName.trim()) { setError('Enter who the quotation is for.'); return }
    if (!preparedByName.trim() || !preparedByPosition.trim()) { setError('Enter the preparer’s name and position.'); return }

    setSaving(true)
    try {
      const signatureUrl = await uploadSignature()
      const res = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch, recipientName, recipientEmail, recipientPhone, contactPerson,
          datePrepared, validityDays, usePwdRate,
          globalDiscountType: useGlobalDiscount ? globalDiscountType : 'NONE',
          globalDiscountValue: useGlobalDiscount ? parseFloat(globalDiscountValue) || 0 : 0,
          remarks, preparedByName, preparedByPosition, signatureUrl,
          downpaymentPercent: downpaymentPercent === '' ? null : downpaymentPercent,
          bankAccountId: bankAccountId || null,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          lines: lines.map(({ key, ...rest }) => rest),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not save the quotation'); return }
      setDone({ id: data.id, quotationNumber: data.quotationNumber })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const label = FIELD_LABEL
  const input = FIELD
  const box: React.CSSProperties = BORDER
  const labelStyle: React.CSSProperties = { color: 'var(--mid-gray)' }

  if (done) {
    return (
      <div className={`${CARD} px-4 sm:px-5 py-4 max-w-2xl`} style={{ ...box, borderLeft: '4px solid #059669' }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: '#dcfce7' }}>
            <Check size={16} style={{ color: '#047857' }} />
          </span>
          <h2 className="text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Quotation <span className="font-mono">{done.quotationNumber}</span> saved
          </h2>
        </div>
        <p className="text-[13px] mb-4" style={{ color: 'var(--mid-gray)' }}>
          Download it as a Word file on the branch letterhead, or start another one.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/quotations/${done.id}/docx`} className={hrBtn.primary} style={{ background: 'var(--teal)' }}>
            <Download size={15} /> Download .docx
          </a>
          <button onClick={() => { setDone(null); setLines([]); setRecipientName(''); setContactPerson(''); setRecipientEmail(''); setRecipientPhone(''); setRemarks('') }}
            className={hrBtn.outline} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            <Plus size={15} /> New quotation
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] items-start">
      {/* ── Left: items ─────────────────────────────────── */}
      <div className="space-y-4 min-w-0">
        <section className={CARD} style={box}>
          <CardHead title="Add items" help={mode === 'SERVICE' ? 'Services priced at the branch’s current rate.' : 'Products come from the Verdana store.'} />
          <div className="flex flex-wrap items-end gap-2 px-4 py-2.5 border-y" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
            <div className="flex-1 min-w-[200px]">
              <label className={label} style={labelStyle}>Branch</label>
              <div className="relative">
                <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--hr-faint)' }} />
                <select value={branch} onChange={e => { setBranch(e.target.value); setLines([]) }}
                  className={input + ' pl-9 appearance-none cursor-pointer'} style={box}>
                  {QUOTATION_BRANCHES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex rounded-lg border overflow-hidden" style={box}>
              {(['SERVICE', 'PRODUCT'] as const).map(m => (
                <button key={m} onClick={() => { setMode(m); setQuery('') }} aria-pressed={mode === m}
                  className="flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold whitespace-nowrap"
                  style={seg(mode === m)}>
                  {m === 'SERVICE' ? <Stethoscope size={14} /> : <Package size={14} />}
                  {m === 'SERVICE' ? 'Services' : 'Products'}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 py-3">
            <label className="flex items-center gap-1.5 h-9 px-3 w-full rounded-lg border bg-white focus-within:border-[var(--teal)] focus-within:shadow-[0_0_0_3px_rgba(74,128,115,0.12)]"
              style={{ borderColor: 'var(--light-gray)', color: 'var(--hr-faint)' }}>
              <Search size={15} className="flex-shrink-0" />
              <input value={query} onChange={e => setQuery(e.target.value)}
                placeholder={mode === 'SERVICE' ? 'Search services for this branch…' : 'Search Verdana products by name or SKU…'}
                className="flex-1 min-w-0 bg-transparent outline-none text-[13px]" style={{ color: 'var(--charcoal)' }} />
              {searching && <Loader2 size={15} className="animate-spin flex-shrink-0" style={{ color: 'var(--teal)' }} />}
              {!searching && query && <button type="button" onClick={() => setQuery('')} title="Clear search"><X size={14} /></button>}
            </label>

            {query.trim().length >= 2 && (
              <div className="mt-2 rounded-lg border max-h-64 overflow-y-auto" style={box}>
                {mode === 'SERVICE' ? (
                  services.length === 0 ? <p className="px-3 py-3 text-xs" style={{ color: 'var(--hr-faint)' }}>{searching ? 'Searching…' : 'No services match.'}</p>
                    : services.map(s => (
                      <button key={s.id} onClick={() => addService(s)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[#f3f8ea] border-b last:border-0" style={LINE}>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{s.name}</span>
                          <span className="block text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>{s.department} · {s.branch}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--charcoal)' }}>{formatPeso(effectiveServicePrice(s, serviceBranch))}</span>
                          <span className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'var(--pale-teal)' }}><Plus size={13} style={{ color: 'var(--teal)' }} /></span>
                        </span>
                      </button>
                    ))
                ) : (
                  products.length === 0 ? <p className="px-3 py-3 text-xs" style={{ color: 'var(--hr-faint)' }}>{searching ? 'Searching…' : 'No products match.'}</p>
                    : products.map(p => (
                      <button key={p.id} onClick={() => addProduct(p)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[#f3f8ea] border-b last:border-0" style={LINE}>
                        <span className="flex items-center gap-2 min-w-0">
                          {p.imageUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={p.imageUrl} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
                            : <span className="w-8 h-8 rounded-md shrink-0 flex items-center justify-center" style={{ background: 'var(--off-white)' }}><Package size={14} style={{ color: 'var(--hr-faint)' }} /></span>}
                          <span className="min-w-0">
                            <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{p.name}</span>
                            <span className="block text-[11.5px] font-mono" style={{ color: 'var(--mid-gray)' }}>{p.sku}</span>
                          </span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--charcoal)' }}>{formatPeso(num(p.sellingPrice))}</span>
                          <span className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'var(--pale-teal)' }}><Plus size={13} style={{ color: 'var(--teal)' }} /></span>
                        </span>
                      </button>
                    ))
                )}
              </div>
            )}
          </div>
        </section>

        {/* Lines */}
        <section className={CARD} style={box}>
          <CardHead title="Items" count={String(lines.length)} help="Set a discount per line, or one for everything below." />
          {lines.length === 0 ? (
            <div className="mx-4 mb-4 rounded-lg border border-dashed px-4 py-8 text-center" style={box}>
              <Search size={18} className="mx-auto mb-1.5" style={{ color: 'var(--hr-faint)' }} />
              <p className="text-[13px]" style={{ color: 'var(--mid-gray)' }}>Search above to add services or products.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border-t" style={box}>
              <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 640 }}>
                <thead>
                  <tr>
                    <th className={`${TH} text-left`} style={TH_STYLE}>Item</th>
                    <th className={`${TH} text-right`} style={TH_STYLE}>Gross</th>
                    <th className={`${TH} text-left`} style={TH_STYLE}>Line discount</th>
                    <th className={`${TH} text-right`} style={TH_STYLE}>Discounted</th>
                    <th className={`${TH} text-center`} style={TH_STYLE}>Qty</th>
                    <th className={`${TH} text-right`} style={TH_STYLE}>Total</th>
                    <th className={TH} style={TH_STYLE} />
                  </tr>
                </thead>
                <tbody>
                  {totals.lines.map((priced, i) => {
                    const l = lines[i]
                    const td = 'px-3 py-2.5 border-b align-middle'
                    return (
                      <tr key={l.key} className="hover:bg-[#fafbf7]">
                        <td className={td} style={LINE}>
                          <div className="flex items-center gap-2">
                            {l.kind === 'PRODUCT' && l.imageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={l.imageUrl} alt="" className="w-7 h-7 rounded-md object-cover" />
                            )}
                            <div className="min-w-0">
                              <span className="block font-semibold" style={{ color: 'var(--charcoal)' }}>{l.name}</span>
                              <span className="flex items-center gap-1.5 mt-0.5">
                                <span className="px-1.5 py-px rounded text-[10px] font-bold uppercase tracking-[.3px]" style={KIND_PILL[l.kind]}>{l.kind === 'SERVICE' ? 'Service' : 'Product'}</span>
                                <span className={l.kind === 'PRODUCT' ? 'font-mono' : undefined} style={{ color: 'var(--mid-gray)' }}>{l.kind === 'SERVICE' ? l.department : l.sku}</span>
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className={`${td} text-right tabular-nums whitespace-nowrap`} style={{ ...LINE, color: 'var(--charcoal)' }}>{formatPeso(l.grossPrice)}</td>
                        <td className={td} style={LINE}>
                          <div className="flex items-center gap-1">
                            <select value={l.lineDiscountType || 'NONE'}
                              onChange={e => update(l.key, { lineDiscountType: e.target.value as DiscountKind })}
                              className="h-7 px-1.5 rounded-md border bg-white text-xs outline-none focus:border-[var(--teal)]" style={box}>
                              <option value="NONE">—</option>
                              <option value="PERCENT">%</option>
                              <option value="AMOUNT">₱</option>
                            </select>
                            {l.lineDiscountType && l.lineDiscountType !== 'NONE' && (
                              <input type="number" min="0" step="0.01" value={l.lineDiscountValue ?? ''}
                                onChange={e => update(l.key, { lineDiscountValue: parseFloat(e.target.value) || 0 })}
                                className="w-16 h-7 px-1.5 rounded-md border bg-white text-xs outline-none focus:border-[var(--teal)]" style={box} />
                            )}
                          </div>
                        </td>
                        <td className={`${td} text-right tabular-nums whitespace-nowrap`} style={{ ...LINE, color: priced.discountedPrice != null ? 'var(--teal)' : 'var(--hr-faint)' }}>
                          {priced.discountedPrice != null ? formatPeso(priced.discountedPrice) : '—'}
                          {priced.discountLabel && (
                            <span className="block text-[11px]" style={{ color: 'var(--mid-gray)' }}>{priced.discountLabel}</span>
                          )}
                        </td>
                        <td className={`${td} text-center`} style={LINE}>
                          <input type="number" min="1" value={l.quantity}
                            onChange={e => update(l.key, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="w-14 h-7 px-1.5 rounded-md border bg-white text-xs text-center outline-none focus:border-[var(--teal)]" style={box} />
                        </td>
                        <td className={`${td} text-right font-bold tabular-nums whitespace-nowrap`} style={{ ...LINE, color: 'var(--charcoal)' }}>{formatPeso(priced.lineTotal)}</td>
                        <td className="px-2 py-2.5 border-b text-right" style={LINE}>
                          <button onClick={() => setLines(prev => prev.filter(x => x.key !== l.key))} className="p-1.5 rounded-lg hover:bg-red-50" title="Remove this line">
                            <Trash2 size={13} style={{ color: '#dc2626' }} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Discount switches */}
          <div className="px-4 py-3 space-y-2 border-t" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
            <label className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-semibold cursor-pointer" style={{ color: 'var(--charcoal)' }}>
              <input type="checkbox" className="accent-[var(--teal)]" checked={usePwdRate} onChange={e => setUsePwdRate(e.target.checked)} />
              Use PWD rate for all
              <span className="text-xs font-normal" style={{ color: 'var(--mid-gray)' }}>
                (services without a PWD rate stay at gross)
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-[13px] font-semibold cursor-pointer" style={{ color: 'var(--charcoal)' }}>
                <input type="checkbox" className="accent-[var(--teal)]" checked={useGlobalDiscount} onChange={e => setUseGlobalDiscount(e.target.checked)} />
                Special discount for all
              </label>
              {useGlobalDiscount && (
                <>
                  <select value={globalDiscountType} onChange={e => setGlobalDiscountType(e.target.value as DiscountKind)}
                    className="h-8 px-2 rounded-lg border bg-white text-xs outline-none focus:border-[var(--teal)]" style={box}>
                    <option value="PERCENT">% off</option>
                    <option value="AMOUNT">₱ off</option>
                  </select>
                  <input type="number" min="0" step="0.01" value={globalDiscountValue}
                    onChange={e => setGlobalDiscountValue(e.target.value)} placeholder="0"
                    className="w-24 h-8 px-2 rounded-lg border bg-white text-xs outline-none focus:border-[var(--teal)]" style={box} />
                  <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>applies to lines without their own discount</span>
                </>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="px-4 py-3 border-t flex flex-wrap items-end justify-between gap-x-4 gap-y-2 rounded-b-lg" style={box}>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Gross</p>
                <p className="text-[15px] font-semibold tabular-nums" style={{ color: 'var(--charcoal)' }}>{formatPeso(totals.subtotalGross)}</p>
              </div>
              {totals.totalDiscount > 0 && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Discount</p>
                  <p className="text-[15px] font-semibold tabular-nums" style={{ color: '#b45309' }}>−{formatPeso(totals.totalDiscount)}</p>
                </div>
              )}
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Grand total</p>
              <p className="text-2xl font-extrabold leading-tight tabular-nums" style={{ fontFamily: 'var(--font-display)', color: 'var(--teal)' }}>
                {formatPeso(totals.grandTotal)}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* ── Right: details ──────────────────────────────── */}
      <div className="space-y-4 min-w-0">
        <section className={CARD} style={box}>
          <CardHead title="Quotation for" />
          <div className="space-y-3 px-4 pb-4">
            <div>
              <label className={label} style={labelStyle}>Name / Company</label>
              <input value={recipientName} onChange={e => setRecipientName(e.target.value)} className={input} style={box} />
            </div>
            <div>
              <label className={label} style={labelStyle}>Contact person</label>
              <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} className={input} style={box} />
            </div>
            <div>
              <label className={label} style={labelStyle}>Email address</label>
              <input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} className={input} style={box} />
            </div>
            <div>
              <label className={label} style={labelStyle}>Contact number</label>
              <input value={recipientPhone} onChange={e => setRecipientPhone(e.target.value)} className={input} style={box} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <label className={label} style={labelStyle}>Date prepared</label>
                <input type="date" value={datePrepared} onChange={e => setDatePrepared(e.target.value)} className={input + ' px-2'} style={box} />
              </div>
              <div className="min-w-0">
                <label className={label} style={labelStyle}>Valid for</label>
                <select value={validityDays} onChange={e => setValidityDays(parseInt(e.target.value))} className={input} style={box}>
                  {VALIDITY_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>
            </div>
          </div>
        </section>

        <section className={CARD} style={box}>
          <CardHead title="Payment" />
          <div className="space-y-3 px-4 pb-4">
            <div>
              <label className={label} style={labelStyle}>Downpayment</label>
              <select value={downpaymentPercent}
                onChange={e => setDownpaymentPercent(e.target.value === '' ? '' : parseInt(e.target.value))}
                className={input} style={box}>
                <option value="">— None —</option>
                {DOWNPAYMENT_OPTIONS.map(d => <option key={d} value={d}>{d}%</option>)}
              </select>
              {downpaymentPercent !== '' && totals.grandTotal > 0 && (
                <p className="text-xs mt-1.5 tabular-nums" style={{ color: 'var(--mid-gray)' }}>
                  <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{formatPeso(totals.grandTotal * (downpaymentPercent / 100))}</span> now ·{' '}
                  {formatPeso(totals.grandTotal - totals.grandTotal * (downpaymentPercent / 100))} balance
                </p>
              )}
            </div>
            <div>
              <label className={label} style={labelStyle}>Deposit to</label>
              <select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} className={input} style={box}>
                <option value="">— Not specified —</option>
                {bankAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.accountTitle} · {a.accountNumber}{a.currency !== 'PHP' ? ` (${a.currency})` : ''}
                  </option>
                ))}
              </select>
              {bankAccountId && (() => {
                const a = bankAccounts.find(x => x.id === bankAccountId)
                return a ? (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--mid-gray)' }}>
                    {a.bankName ? `${a.bankName} · ` : ''}{a.accountTitle} · <span className="font-mono">{a.accountNumber}</span>
                  </p>
                ) : null
              })()}
            </div>
          </div>
        </section>

        <section className={CARD} style={box}>
          <CardHead title="Remarks" />
          <div className="px-4 pb-4">
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={4}
              placeholder="Any special terms, inclusions or notes for this client."
              className="w-full px-3 py-2 rounded-lg border bg-white text-[13px] outline-none resize-y focus:border-[var(--teal)] focus:shadow-[0_0_0_3px_rgba(74,128,115,0.12)]" style={box} />
          </div>
        </section>

        <section className={CARD} style={box}>
          <CardHead title="Prepared by" />
          <div className="space-y-3 px-4 pb-4">
            <div>
              <label className={label} style={labelStyle}>Name</label>
              <input value={preparedByName} onChange={e => setPreparedByName(e.target.value)} className={input} style={box} />
            </div>
            <div>
              <label className={label} style={labelStyle}>Position</label>
              <input value={preparedByPosition} onChange={e => setPreparedByPosition(e.target.value)} className={input} style={box} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={label + ' mb-0'} style={labelStyle}>Signature</label>
                <div className="flex rounded-lg overflow-hidden border" style={box}>
                  {(['draw', 'upload'] as const).map(m => (
                    <button key={m} type="button" onClick={() => setSigMode(m)} aria-pressed={sigMode === m}
                      className="h-7 px-2.5 text-xs font-semibold"
                      style={seg(sigMode === m)}>
                      {m === 'draw' ? <span className="flex items-center gap-1"><PenLine size={11} /> Draw</span> : <span className="flex items-center gap-1"><Upload size={11} /> Upload</span>}
                    </button>
                  ))}
                </div>
              </div>
              {sigMode === 'draw' ? (
                <SignaturePad onChange={setSigDataUrl} />
              ) : (
                <div>
                  <input type="file" accept="image/*"
                    onChange={async e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const fd = new FormData()
                      fd.append('file', file)
                      const res = await fetch('/api/upload', { method: 'POST', body: fd })
                      const data = await res.json()
                      if (res.ok) setSigUploadUrl(data.url)
                      else setError(data.error || 'Upload failed')
                    }}
                    className="w-full text-xs file:mr-2 file:h-8 file:px-3 file:rounded-lg file:border file:border-[var(--light-gray)] file:bg-white file:text-xs file:font-semibold file:text-[var(--charcoal)]" />
                  {sigUploadUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sigUploadUrl} alt="Signature" className="mt-2 max-h-16 object-contain" />
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {error && <ErrorNote text={error} />}

        <button onClick={handleSave} disabled={saving}
          className={`${hrBtn.primary} w-full justify-center h-11 text-sm`}
          style={{ background: 'var(--teal)' }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          Save & generate
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   SAVED
   ═══════════════════════════════════════════════════════════════ */

function SavedTab() {
  const [rows, setRows] = useState<SavedQuotation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // Quick filter from the branch cards — client-side, over the list already loaded.
  const [branchFilter, setBranchFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/quotations?search=${encodeURIComponent(search)}`)
      const data = await res.json()
      setRows(data.quotations || [])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  async function remove(id: string) {
    if (!confirm('Delete this quotation? The number will not be reused.')) return
    await fetch(`/api/quotations/${id}`, { method: 'DELETE' })
    load()
  }

  const byBranch = useMemo(() => QUOTATION_BRANCHES.map(b => {
    const mine = rows.filter(q => q.branch === b.key)
    return { key: b.key as string, label: b.label as string, n: mine.length, total: mine.reduce((s, q) => s + num(q.grandTotal), 0) }
  }), [rows])
  const shown = branchFilter ? rows.filter(q => q.branch === branchFilter) : rows
  const filterLabel = BRANCH_SHORT[branchFilter] || branchFilter
  const firstLoad = loading && rows.length === 0

  return (
    <div className="space-y-4">
      {/* Cards (also quick filters) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {byBranch.map(b => (
          <StatCard key={b.key} loading={firstLoad} label={BRANCH_SHORT[b.key] || b.key} value={b.n.toLocaleString()}
            sub={`${formatPeso(b.total)} quoted`} compact
            {...(b.n > 0 ? { accent: { line: 'var(--teal)' } } : { tone: 'zero' as const })}
            active={branchFilter === b.key}
            onClick={() => setBranchFilter(f => (f === b.key ? '' : b.key))}
            title={`Show only ${b.label} quotations`} />
        ))}
      </div>

      <section className={CARD} style={BORDER}>
        <CardHead title="Saved quotations"
          count={loading ? '' : `${shown.length.toLocaleString()}${shown.length !== rows.length ? ` of ${rows.length.toLocaleString()}` : ''}`}
          help="Newest first. Download the Word file again, or delete one you no longer need." />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-y" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
          <label className="flex items-center gap-1.5 h-9 px-3 w-full sm:w-72 rounded-lg border bg-white focus-within:border-[var(--teal)] focus-within:shadow-[0_0_0_3px_rgba(74,128,115,0.12)]"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--hr-faint)' }}>
            <Search size={15} className="flex-shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by number or recipient…"
              className="flex-1 min-w-0 bg-transparent outline-none text-[13px]" style={{ color: 'var(--charcoal)' }} />
            {search && <button onClick={() => setSearch('')} title="Clear search"><X size={14} /></button>}
          </label>
          {branchFilter && (
            <button onClick={() => setBranchFilter('')} title="Show every branch"
              className="inline-flex items-center gap-1 h-8 px-3 rounded-full border text-xs font-semibold"
              style={{ background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff' }}>
              {filterLabel} <X size={12} />
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-4 space-y-2" aria-busy="true">
            {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-10 rounded-md hr-shimmer" />)}
          </div>
        ) : shown.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <FileText size={20} className="mx-auto mb-1.5" style={{ color: 'var(--hr-faint)' }} />
            <p className="text-[13px]" style={{ color: 'var(--mid-gray)' }}>
              {branchFilter && rows.length > 0 ? `No ${filterLabel} quotations in this list.` : search ? 'No quotations match your search.' : 'No quotations yet.'}
            </p>
            {branchFilter && rows.length > 0 && (
              <button onClick={() => setBranchFilter('')} className={`${hrBtn.outline} mt-3`} style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>Show every branch</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-b-lg">
            <table className="w-full text-[13px]" style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 680 }}>
              <thead>
                <tr>
                  {['Number', 'Branch', 'For', 'Date', 'Items', 'Total', ''].map((h, i) => (
                    <th key={h || i} className={`${TH} ${i >= 4 && i < 6 ? 'text-right' : 'text-left'}`} style={TH_STYLE}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(q => {
                  const td = 'px-3 py-2.5 border-b'
                  return (
                    <tr key={q.id} className="hover:bg-[#fafbf7]">
                      <td className={`${td} font-mono text-xs font-semibold whitespace-nowrap`} style={{ ...LINE, color: 'var(--charcoal)' }}>{q.quotationNumber}</td>
                      <td className={td} style={LINE}>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}
                          title={QUOTATION_BRANCHES.find(b => b.key === q.branch)?.label || q.branch}>
                          {BRANCH_SHORT[q.branch] || q.branch}
                        </span>
                      </td>
                      <td className={td} style={{ ...LINE, color: 'var(--charcoal)' }}>{q.recipientName}</td>
                      <td className={`${td} text-xs whitespace-nowrap`} style={{ ...LINE, color: 'var(--mid-gray)' }}>
                        {new Date(q.datePrepared).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className={`${td} text-right text-xs tabular-nums`} style={{ ...LINE, color: 'var(--mid-gray)' }}>{q._count?.items ?? 0}</td>
                      <td className={`${td} text-right font-bold tabular-nums whitespace-nowrap`} style={{ ...LINE, color: 'var(--charcoal)' }}>{formatPeso(num(q.grandTotal))}</td>
                      <td className="px-2 py-2 border-b" style={LINE}>
                        <div className="flex items-center justify-end gap-1">
                          <a href={`/api/quotations/${q.id}/docx`} className="p-1.5 rounded-lg hover:bg-[var(--pale-teal)]" title="Download .docx">
                            <Download size={15} style={{ color: 'var(--teal)' }} />
                          </a>
                          <button onClick={() => remove(q.id)} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete">
                            <Trash2 size={15} style={{ color: '#dc2626' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS — one .docx letterhead per branch
   ═══════════════════════════════════════════════════════════════ */

function SettingsTab() {
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/quotations/templates')
      const data = await res.json()
      setTemplates(data.templates || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function upload(branch: string, file: File) {
    setError(null)
    if (!file.name.toLowerCase().endsWith('.docx')) { setError('The template must be a .docx file.'); return }
    setBusy(branch)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      const upData = await up.json()
      if (!up.ok) { setError(upData.error || 'Upload failed'); return }

      const res = await fetch('/api/quotations/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, fileName: file.name, storedName: upData.filename }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not save the template'); return }
      load()
    } finally {
      setBusy(null)
    }
  }

  async function remove(branch: string) {
    if (!confirm('Remove this template? Quotations for this branch cannot be generated until another is uploaded.')) return
    await fetch(`/api/quotations/templates?branch=${branch}`, { method: 'DELETE' })
    load()
  }

  const uploaded = QUOTATION_BRANCHES.filter(b => templates.some(t => t.branch === b.key)).length

  return (
    <section className={`${CARD} max-w-3xl`} style={BORDER}>
      <CardHead title="Quotation templates" count={loading ? '' : `${uploaded} of ${QUOTATION_BRANCHES.length} uploaded`}
        help="Upload the .docx letterhead each branch should use. Generation keeps the file’s header, footer and artwork exactly as designed and writes the quotation into the body — so whatever page setup the template has is what you get." />

      <div className="px-4 pb-4 space-y-2">
        {error && <ErrorNote text={error} />}

        {loading ? (
          Array.from({ length: QUOTATION_BRANCHES.length }, (_, i) => <div key={i} className="h-[58px] rounded-lg hr-shimmer" />)
        ) : (
          QUOTATION_BRANCHES.map(b => {
            const t = templates.find(x => x.branch === b.key)
            return (
              <div key={b.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5 rounded-lg border"
                style={{ borderColor: 'var(--light-gray)', borderLeft: `4px solid ${t ? '#059669' : '#d97706'}`, background: t ? '#fff' : '#fffbeb' }}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold" style={{ color: 'var(--charcoal)' }}>
                    {b.label}
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                      style={t ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>
                      {t ? 'Uploaded' : 'No template'}
                    </span>
                  </p>
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--mid-gray)' }} title={t?.fileName}>
                    {t ? `${t.fileName} · updated ${new Date(t.updatedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Quotations for this branch cannot be generated yet'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <label className={`${hrBtn.ghost} cursor-pointer`} style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                    {busy === b.key ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {t ? 'Replace' : 'Upload .docx'}
                    <input type="file" accept=".docx" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) upload(b.key, f); e.target.value = '' }} />
                  </label>
                  {t && (
                    <button onClick={() => remove(b.key)} className="p-2 rounded-lg hover:bg-red-50" title="Remove template">
                      <X size={14} style={{ color: '#dc2626' }} />
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
