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
  X, PenLine, Eraser, Building2, Package, Stethoscope, AlertCircle, Check,
} from 'lucide-react'
import {
  QUOTATION_BRANCHES, VALIDITY_OPTIONS, DOWNPAYMENT_OPTIONS, priceQuotation, formatPeso,
  type DiscountKind, type QuotationLineInput,
} from '@/lib/quotations/pricing'

type Tab = 'new' | 'saved' | 'settings'

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
        className="w-full rounded-xl border bg-white touch-none"
        style={{ height: 120, borderColor: 'var(--light-gray)', cursor: 'crosshair' }}
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
          {hasInk ? 'Signature captured' : 'Sign inside the box'}
        </span>
        <button type="button" onClick={clear} className="flex items-center gap-1 text-xs hover:underline" style={{ color: 'var(--mid-gray)' }}>
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
    <div className="max-w-[1500px] mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Quotations
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
          Build a quotation from your services and products, and generate it on the branch letterhead.
        </p>
      </div>

      <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit" style={{ background: 'var(--light-gray)' }}>
        {([
          { key: 'new', label: 'New Quotation', icon: FileText },
          { key: 'saved', label: 'Saved', icon: Check },
          { key: 'settings', label: 'Settings', icon: SettingsIcon },
        ] as { key: Tab; label: string; icon: typeof FileText }[]).map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: active ? 'white' : 'transparent',
                color: active ? 'var(--teal)' : 'var(--mid-gray)',
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : undefined,
              }}
            >
              <Icon size={15} />
              {t.label}
            </button>
          )
        })}
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

  const label = 'block text-xs font-medium mb-1.5'
  const input = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none'
  const box: React.CSSProperties = { borderColor: 'var(--light-gray)' }
  const card = 'rounded-2xl border p-5 bg-white'

  if (done) {
    return (
      <div className={card} style={box}>
        <div className="flex items-center gap-2 mb-2">
          <Check size={18} style={{ color: 'var(--teal)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--charcoal)' }}>Quotation {done.quotationNumber} saved</h2>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--mid-gray)' }}>
          Download it as a Word file on the branch letterhead, or start another one.
        </p>
        <div className="flex gap-2">
          <a href={`/api/quotations/${done.id}/docx`}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white"
            style={{ background: 'var(--teal)' }}>
            <Download size={15} /> Download .docx
          </a>
          <button onClick={() => { setDone(null); setLines([]); setRecipientName(''); setContactPerson(''); setRecipientEmail(''); setRecipientPhone(''); setRemarks('') }}
            className="px-4 py-2.5 rounded-xl text-sm font-medium border" style={box}>
            New quotation
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }}>
      {/* ── Left: items ─────────────────────────────────── */}
      <div className="space-y-4">
        <div className={card} style={box}>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex-1 min-w-[220px]">
              <label className={label} style={{ color: 'var(--charcoal)' }}>Branch</label>
              <div className="relative">
                <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
                <select value={branch} onChange={e => { setBranch(e.target.value); setLines([]) }}
                  className={input + ' pl-9 appearance-none cursor-pointer'} style={box}>
                  {QUOTATION_BRANCHES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex rounded-xl overflow-hidden border" style={box}>
              {(['SERVICE', 'PRODUCT'] as const).map(m => (
                <button key={m} onClick={() => { setMode(m); setQuery('') }}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium"
                  style={{ background: mode === m ? 'var(--teal)' : 'white', color: mode === m ? 'white' : 'var(--charcoal)' }}>
                  {m === 'SERVICE' ? <Stethoscope size={14} /> : <Package size={14} />}
                  {m === 'SERVICE' ? 'Services' : 'Products'}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder={mode === 'SERVICE' ? 'Search services for this branch…' : 'Search Verdana products by name or SKU…'}
              className={input + ' pl-9'} style={box} />
            {searching && <Loader2 size={15} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--teal)' }} />}
          </div>

          {query.trim().length >= 2 && (
            <div className="mt-2 rounded-xl border max-h-64 overflow-y-auto" style={box}>
              {mode === 'SERVICE' ? (
                services.length === 0 ? <p className="px-3 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>No services match.</p>
                  : services.map(s => (
                    <button key={s.id} onClick={() => addService(s)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-gray-50 border-b last:border-0" style={box}>
                      <span className="min-w-0">
                        <span className="block text-sm truncate" style={{ color: 'var(--charcoal)' }}>{s.name}</span>
                        <span className="block text-xs" style={{ color: 'var(--mid-gray)' }}>{s.department} · {s.branch}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{formatPeso(effectiveServicePrice(s, serviceBranch))}</span>
                        <Plus size={14} style={{ color: 'var(--teal)' }} />
                      </span>
                    </button>
                  ))
              ) : (
                products.length === 0 ? <p className="px-3 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>No products match.</p>
                  : products.map(p => (
                    <button key={p.id} onClick={() => addProduct(p)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-gray-50 border-b last:border-0" style={box}>
                      <span className="flex items-center gap-2 min-w-0">
                        {p.imageUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                          : <span className="w-8 h-8 rounded shrink-0" style={{ background: 'var(--off-white)' }} />}
                        <span className="min-w-0">
                          <span className="block text-sm truncate" style={{ color: 'var(--charcoal)' }}>{p.name}</span>
                          <span className="block text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>{p.sku}</span>
                        </span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{formatPeso(num(p.sellingPrice))}</span>
                        <Plus size={14} style={{ color: 'var(--teal)' }} />
                      </span>
                    </button>
                  ))
              )}
            </div>
          )}
        </div>

        {/* Lines */}
        <div className={card} style={box}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--charcoal)' }}>
            Items ({lines.length})
          </h3>
          {lines.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--mid-gray)' }}>
              Search above to add services or products.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    <th className="text-left px-2 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Item</th>
                    <th className="text-right px-2 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Gross</th>
                    <th className="text-left px-2 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Line discount</th>
                    <th className="text-right px-2 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Discounted</th>
                    <th className="text-center px-2 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Qty</th>
                    <th className="text-right px-2 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {totals.lines.map((priced, i) => {
                    const l = lines[i]
                    return (
                      <tr key={l.key} className="border-b" style={box}>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            {l.kind === 'PRODUCT' && l.imageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={l.imageUrl} alt="" className="w-7 h-7 rounded object-cover" />
                            )}
                            <div>
                              <span className="block" style={{ color: 'var(--charcoal)' }}>{l.name}</span>
                              <span className="block" style={{ color: 'var(--mid-gray)' }}>
                                {l.kind === 'SERVICE' ? l.department : l.sku}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right" style={{ color: 'var(--charcoal)' }}>{formatPeso(l.grossPrice)}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <select value={l.lineDiscountType || 'NONE'}
                              onChange={e => update(l.key, { lineDiscountType: e.target.value as DiscountKind })}
                              className="px-1.5 py-1 rounded-lg border text-xs outline-none" style={box}>
                              <option value="NONE">—</option>
                              <option value="PERCENT">%</option>
                              <option value="AMOUNT">₱</option>
                            </select>
                            {l.lineDiscountType && l.lineDiscountType !== 'NONE' && (
                              <input type="number" min="0" step="0.01" value={l.lineDiscountValue ?? ''}
                                onChange={e => update(l.key, { lineDiscountValue: parseFloat(e.target.value) || 0 })}
                                className="w-16 px-1.5 py-1 rounded-lg border text-xs outline-none" style={box} />
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right" style={{ color: priced.discountedPrice != null ? 'var(--teal)' : 'var(--mid-gray)' }}>
                          {priced.discountedPrice != null ? formatPeso(priced.discountedPrice) : '—'}
                          {priced.discountLabel && (
                            <span className="block" style={{ color: 'var(--mid-gray)' }}>{priced.discountLabel}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input type="number" min="1" value={l.quantity}
                            onChange={e => update(l.key, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="w-14 px-1.5 py-1 rounded-lg border text-xs text-center outline-none" style={box} />
                        </td>
                        <td className="px-2 py-2 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>{formatPeso(priced.lineTotal)}</td>
                        <td className="px-1 py-2">
                          <button onClick={() => setLines(prev => prev.filter(x => x.key !== l.key))} className="p-1 rounded hover:bg-red-50">
                            <Trash2 size={13} className="text-red-500" />
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
          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--charcoal)' }}>
              <input type="checkbox" checked={usePwdRate} onChange={e => setUsePwdRate(e.target.checked)} />
              Use PWD rate for all
              <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                (services without a PWD rate stay at gross)
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--charcoal)' }}>
                <input type="checkbox" checked={useGlobalDiscount} onChange={e => setUseGlobalDiscount(e.target.checked)} />
                Special discount for all
              </label>
              {useGlobalDiscount && (
                <>
                  <select value={globalDiscountType} onChange={e => setGlobalDiscountType(e.target.value as DiscountKind)}
                    className="px-2 py-1.5 rounded-lg border text-xs outline-none" style={box}>
                    <option value="PERCENT">% off</option>
                    <option value="AMOUNT">₱ off</option>
                  </select>
                  <input type="number" min="0" step="0.01" value={globalDiscountValue}
                    onChange={e => setGlobalDiscountValue(e.target.value)} placeholder="0"
                    className="w-24 px-2 py-1.5 rounded-lg border text-xs outline-none" style={box} />
                  <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>applies to lines without their own discount</span>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t flex items-center justify-between" style={box}>
            <span className="text-sm" style={{ color: 'var(--mid-gray)' }}>
              Gross {formatPeso(totals.subtotalGross)}
              {totals.totalDiscount > 0 && <> · Discount −{formatPeso(totals.totalDiscount)}</>}
            </span>
            <span className="text-lg font-bold" style={{ color: 'var(--teal)' }}>
              Grand Total {formatPeso(totals.grandTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Right: details ──────────────────────────────── */}
      <div className="space-y-4">
        <div className={card} style={box}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--charcoal)' }}>Quotation for</h3>
          <div className="space-y-3">
            <div>
              <label className={label} style={{ color: 'var(--charcoal)' }}>Name / Company</label>
              <input value={recipientName} onChange={e => setRecipientName(e.target.value)} className={input} style={box} />
            </div>
            <div>
              <label className={label} style={{ color: 'var(--charcoal)' }}>Contact person</label>
              <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} className={input} style={box} />
            </div>
            <div>
              <label className={label} style={{ color: 'var(--charcoal)' }}>Email address</label>
              <input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} className={input} style={box} />
            </div>
            <div>
              <label className={label} style={{ color: 'var(--charcoal)' }}>Contact number</label>
              <input value={recipientPhone} onChange={e => setRecipientPhone(e.target.value)} className={input} style={box} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={label} style={{ color: 'var(--charcoal)' }}>Date prepared</label>
                <input type="date" value={datePrepared} onChange={e => setDatePrepared(e.target.value)} className={input} style={box} />
              </div>
              <div>
                <label className={label} style={{ color: 'var(--charcoal)' }}>Valid for</label>
                <select value={validityDays} onChange={e => setValidityDays(parseInt(e.target.value))} className={input} style={box}>
                  {VALIDITY_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className={card} style={box}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--charcoal)' }}>Payment</h3>
          <div className="space-y-3">
            <div>
              <label className={label} style={{ color: 'var(--charcoal)' }}>Downpayment</label>
              <select value={downpaymentPercent}
                onChange={e => setDownpaymentPercent(e.target.value === '' ? '' : parseInt(e.target.value))}
                className={input} style={box}>
                <option value="">— None —</option>
                {DOWNPAYMENT_OPTIONS.map(d => <option key={d} value={d}>{d}%</option>)}
              </select>
              {downpaymentPercent !== '' && totals.grandTotal > 0 && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--mid-gray)' }}>
                  {formatPeso(totals.grandTotal * (downpaymentPercent / 100))} now ·{' '}
                  {formatPeso(totals.grandTotal - totals.grandTotal * (downpaymentPercent / 100))} balance
                </p>
              )}
            </div>
            <div>
              <label className={label} style={{ color: 'var(--charcoal)' }}>Deposit to</label>
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
                    {a.bankName ? `${a.bankName} · ` : ''}{a.accountTitle} · {a.accountNumber}
                  </p>
                ) : null
              })()}
            </div>
          </div>
        </div>

        <div className={card} style={box}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--charcoal)' }}>Remarks</h3>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={4}
            placeholder="Any special terms, inclusions or notes for this client."
            className={input + ' resize-y'} style={box} />
        </div>

        <div className={card} style={box}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--charcoal)' }}>Prepared by</h3>
          <div className="space-y-3">
            <div>
              <label className={label} style={{ color: 'var(--charcoal)' }}>Name</label>
              <input value={preparedByName} onChange={e => setPreparedByName(e.target.value)} className={input} style={box} />
            </div>
            <div>
              <label className={label} style={{ color: 'var(--charcoal)' }}>Position</label>
              <input value={preparedByPosition} onChange={e => setPreparedByPosition(e.target.value)} className={input} style={box} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={label + ' mb-0'} style={{ color: 'var(--charcoal)' }}>Signature</label>
                <div className="flex rounded-lg overflow-hidden border" style={box}>
                  {(['draw', 'upload'] as const).map(m => (
                    <button key={m} type="button" onClick={() => setSigMode(m)}
                      className="px-2 py-1 text-xs font-medium"
                      style={{ background: sigMode === m ? 'var(--teal)' : 'white', color: sigMode === m ? 'white' : 'var(--mid-gray)' }}>
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
                    className="w-full text-xs" />
                  {sigUploadUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sigUploadUrl} alt="Signature" className="mt-2 max-h-16 object-contain" />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl text-sm" style={{ background: '#fef2f2', color: '#991b1b' }}>
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button onClick={handleSave} disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
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

  return (
    <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="p-4 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by number or recipient…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-center py-12" style={{ color: 'var(--mid-gray)' }}>No quotations yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--off-white)' }}>
              {['Number', 'Branch', 'For', 'Date', 'Items', 'Total', ''].map((h, i) => (
                <th key={h || i} className={`px-4 py-2.5 font-semibold text-xs ${i >= 4 && i < 6 ? 'text-right' : 'text-left'}`} style={{ color: 'var(--charcoal)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(q => (
              <tr key={q.id} className="border-b" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{q.quotationNumber}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
                  {QUOTATION_BRANCHES.find(b => b.key === q.branch)?.label || q.branch}
                </td>
                <td className="px-4 py-2.5" style={{ color: 'var(--charcoal)' }}>{q.recipientName}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
                  {new Date(q.datePrepared).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                </td>
                <td className="px-4 py-2.5 text-right text-xs" style={{ color: 'var(--mid-gray)' }}>{q._count?.items ?? 0}</td>
                <td className="px-4 py-2.5 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>{formatPeso(num(q.grandTotal))}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <a href={`/api/quotations/${q.id}/docx`} className="p-1.5 rounded-lg hover:bg-gray-100" title="Download .docx">
                      <Download size={15} style={{ color: 'var(--teal)' }} />
                    </a>
                    <button onClick={() => remove(q.id)} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete">
                      <Trash2 size={15} className="text-red-500" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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

  return (
    <div className="rounded-2xl border bg-white p-5 max-w-3xl" style={{ borderColor: 'var(--light-gray)' }}>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Quotation templates</h3>
      <p className="text-xs mt-1 mb-4" style={{ color: 'var(--mid-gray)' }}>
        Upload the .docx letterhead each branch should use. Generation keeps the file&apos;s header, footer and artwork
        exactly as designed and writes the quotation into the body — so whatever page setup the template has is what you get.
      </p>

      {error && (
        <div className="flex items-start gap-2 p-3 mb-3 rounded-xl text-sm" style={{ background: '#fef2f2', color: '#991b1b' }}>
          <AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={18} style={{ color: 'var(--teal)' }} /></div>
      ) : (
        <div className="space-y-2">
          {QUOTATION_BRANCHES.map(b => {
            const t = templates.find(x => x.branch === b.key)
            return (
              <div key={b.key} className="flex items-center justify-between gap-3 p-3 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{b.label}</p>
                  <p className="text-xs truncate" style={{ color: t ? 'var(--teal)' : 'var(--mid-gray)' }}>
                    {t ? `${t.fileName} · updated ${new Date(t.updatedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No template uploaded'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer hover:bg-gray-50" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                    {busy === b.key ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {t ? 'Replace' : 'Upload .docx'}
                    <input type="file" accept=".docx" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) upload(b.key, f); e.target.value = '' }} />
                  </label>
                  {t && (
                    <button onClick={() => remove(b.key)} className="p-2 rounded-xl hover:bg-red-50" title="Remove template">
                      <X size={14} className="text-red-500" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
