'use client'

/**
 * Product details pop-up — opens when a row in the Inventory list is clicked
 * (Hannah, 11/14: "allow me to click the row and it will pop up to show the
 * details of that product even if i dont click the edit icon").
 *
 * Read-only. Edit / movement history / purchase lots are buttons that hand
 * back to the page's existing modals.
 */

import { useEffect } from 'react'
import { Package, Pencil, History, Layers, X } from 'lucide-react'
import { HR_VARS } from '@/components/ui/hr-look'
import { SKU_HIERARCHY } from '@/lib/sku-taxonomy'
import { priceTiers } from '@/lib/price-tiers'
import { formatCurrency } from '@/lib/utils'

type Acct = { accountNumber: string; accountTitle: string } | null | undefined
type Num = string | number | null | undefined

export interface DetailItem {
  id: string
  sku: string
  name: string
  barcode?: string | null
  imageUrl?: string | null
  branch: string
  isActive?: boolean
  skuDepartment: string
  skuCategory: string
  skuSubcategory: string
  quantity: number
  unitCost: number
  sellingPrice: number | null
  rewardPointsPrice: number | null
  reorderLevel: number | null
  supplier?: { supplierName: string } | null
  supplierProductName?: string | null
  supplierExchangeRate: number | null
  description?: string | null
  websiteClassification?: string | null
  isBundle?: boolean
  isPreOrder?: boolean
  issuedOfficialInvoice?: boolean
  revenueAccount?: Acct
  sourceAccount?: Acct
  expenseAccount?: Acct
  dimensionLength?: Num
  dimensionWidth?: Num
  dimensionHeight?: Num
  weightKg?: Num
  variants?: { id: string; variantType: string; variantLabel: string; variantSku: string; quantity: number; sellingPrice?: Num; unitCost?: Num }[]
  bundleComponents?: { id: string; quantity: number; component: { id: string; name: string; sku: string; quantity: number } }[]
}

export interface StockSplit { parts: { branch: string; quantity: number; itemId?: string }[]; total: number }

const n = (v: Num) => (v === null || v === undefined || v === '' ? null : Number(v))

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>{label}</p>
      <div className="text-[13px] mt-0.5 break-words" style={{ color: 'var(--charcoal)' }}>{children}</div>
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
      <p className="text-[11px] font-semibold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>{label}</p>
      <p className="text-lg font-extrabold tabular-nums leading-tight" style={{ fontFamily: 'var(--font-display)', color: tone || 'var(--charcoal)' }}>{value}</p>
    </div>
  )
}

const pill = (text: string, bg: string, fg: string) => (
  <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold" style={{ background: bg, color: fg }}>{text}</span>
)

export default function ItemDetailsModal({ item, stock, branchLabel, canWrite, onClose, onEdit, onMovements, onLots }: {
  item: DetailItem
  stock?: StockSplit
  branchLabel: (b: string) => string
  canWrite: boolean
  onClose: () => void
  onEdit: () => void
  onMovements: (itemId: string) => void
  onLots: (itemId: string) => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dept = SKU_HIERARCHY[item.skuDepartment]
  const cat = dept?.categories?.[item.skuCategory]
  const sub = cat?.subcategories?.[item.skuSubcategory]
  const tiers = priceTiers(Number(item.unitCost))
  const onHand = stock ? stock.total : item.quantity
  const low = item.reorderLevel != null && onHand <= item.reorderLevel
  const dims = [n(item.dimensionLength), n(item.dimensionWidth), n(item.dimensionHeight)]
  const hasDims = dims.some(d => d != null)
  const acct = (a: Acct) => (a ? `${a.accountNumber} ${a.accountTitle}` : '—')
  const variants = item.variants || []
  const parts = item.bundleComponents || []

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4" style={{ ...HR_VARS, background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${item.name} details`} onClick={e => e.stopPropagation()}
        className="bg-white w-full max-w-2xl max-h-[88vh] flex flex-col rounded-xl border overflow-hidden"
        style={{ borderColor: 'var(--light-gray)', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', color: 'var(--charcoal)' }}>

        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--hr-line)' }}>
          {item.imageUrl ? (
            <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" title="Open photo" className="flex-none">
              <img src={item.imageUrl} alt={item.name} className="w-16 h-16 rounded-lg object-cover border" style={{ borderColor: 'var(--light-gray)' }} />
            </a>
          ) : (
            <div className="flex-none w-16 h-16 rounded-lg flex items-center justify-center" style={{ background: 'var(--off-white)', color: 'var(--light-gray)' }}><Package size={22} /></div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold leading-snug" style={{ fontFamily: 'var(--font-display)' }}>{item.name}</h2>
            <p className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--mid-gray)' }}>{item.sku}{item.barcode && item.barcode !== item.sku ? ` · barcode ${item.barcode}` : ''}</p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {item.isActive === false && pill('Archived', '#f3f4f6', '#4b5563')}
              {item.isPreOrder && pill('Pre-order', '#dbeafe', '#1e40af')}
              {item.isBundle && pill('Bundle', '#fef3c7', '#92400e')}
              {item.issuedOfficialInvoice && pill('Invoice', '#dcfce7', '#166534')}
              {item.websiteClassification && pill(item.websiteClassification, '#f5f3ff', '#5b21b6')}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex-none p-1 rounded-md transition-colors hover:bg-[var(--pale-teal)]"><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Tile label="On hand" value={onHand.toLocaleString()} tone={onHand <= 0 ? '#b91c1c' : low ? '#b45309' : undefined} />
            <Tile label="Unit cost (COGS)" value={formatCurrency(Number(item.unitCost))} />
            <Tile label="POS price" value={item.sellingPrice != null ? formatCurrency(Number(item.sellingPrice)) : '—'} tone="var(--teal)" />
            <Tile label="Reorder level" value={item.reorderLevel != null ? String(item.reorderLevel) : '—'} />
          </div>

          {tiers && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-3 py-2 rounded-lg border text-[12.5px] tabular-nums"
              style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
              <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>Price tiers</span>
              <span>Lowest <b style={{ color: 'var(--charcoal)' }}>{formatCurrency(tiers.lowest)}</b></span>
              <span>Standard <b style={{ color: 'var(--teal)' }}>{formatCurrency(tiers.standard)}</b></span>
              <span>Highest <b style={{ color: 'var(--charcoal)' }}>{formatCurrency(tiers.highest)}</b></span>
              {item.sellingPrice != null && Number(item.sellingPrice) !== tiers.standard && (
                <span style={{ color: '#b45309' }}>POS price is not the Standard price</span>
              )}
            </div>
          )}

          {stock && stock.parts.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.4px] mb-1" style={{ color: 'var(--mid-gray)' }}>Stock by branch</p>
              <div className="flex flex-wrap gap-2">
                {stock.parts.map((p, i) => (
                  <button key={i} type="button" disabled={!p.itemId} onClick={() => p.itemId && onMovements(p.itemId)}
                    className="px-2.5 py-1 rounded-lg border text-[12.5px] enabled:hover:border-[var(--teal)] disabled:cursor-default"
                    style={{ borderColor: 'var(--light-gray)' }} title={p.itemId ? 'Movement history of this stock' : undefined}>
                    {branchLabel(p.branch)} <b className="tabular-nums" style={{ color: 'var(--deep-teal)' }}>{p.quantity}</b>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Branch">{branchLabel(item.branch)}</Field>
            <Field label="Department">{[dept?.label || item.skuDepartment, cat?.label, sub].filter(Boolean).join(' · ')}</Field>
            <Field label="Supplier">{item.supplier?.supplierName || '—'}</Field>
            <Field label="Supplier's name for it">{item.supplierProductName || '—'}</Field>
            {item.supplierExchangeRate != null && <Field label="Exchange rate">{Number(item.supplierExchangeRate)}</Field>}
            <Field label="Size (L × W × H)">{hasDims ? `${dims.map(d => (d == null ? '—' : d)).join(' × ')} cm` : '—'}</Field>
            <Field label="Weight">{n(item.weightKg) != null ? `${n(item.weightKg)} kg` : '—'}</Field>
            {item.rewardPointsPrice != null && <Field label="Reward points price">{item.rewardPointsPrice.toLocaleString()} pts</Field>}
          </div>

          {item.description && (
            <Field label="Description"><p className="whitespace-pre-line leading-relaxed">{item.description}</p></Field>
          )}

          {variants.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.4px] mb-1" style={{ color: 'var(--mid-gray)' }}>Variants</p>
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                <table className="w-full text-[12.5px]">
                  <tbody>
                    {variants.map(v => (
                      <tr key={v.id} className="border-t first:border-t-0" style={{ borderColor: 'var(--hr-line)' }}>
                        <td className="px-3 py-1.5">{v.variantType}: <b>{v.variantLabel}</b></td>
                        <td className="px-3 py-1.5 tabular-nums" style={{ color: 'var(--mid-gray)' }}>{v.variantSku}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{v.quantity} on hand</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{n(v.sellingPrice) != null ? formatCurrency(n(v.sellingPrice)!) : 'same price'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {parts.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.4px] mb-1" style={{ color: 'var(--mid-gray)' }}>Bundle contents</p>
              <ul className="text-[12.5px] space-y-0.5">
                {parts.map(bc => (
                  <li key={bc.id}><b className="tabular-nums">{bc.quantity}×</b> {bc.component.name} <span className="tabular-nums" style={{ color: 'var(--mid-gray)' }}>· {bc.component.sku} · {bc.component.quantity} on hand</span></li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2">
            <Field label="Revenue account">{acct(item.revenueAccount)}</Field>
            <Field label="Inventory account">{acct(item.sourceAccount)}</Field>
            <Field label="Cost account">{acct(item.expenseAccount)}</Field>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 border-t" style={{ borderColor: 'var(--hr-line)', background: '#fcfdfa' }}>
          <button onClick={() => onMovements(item.id)} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border bg-white text-[13px] font-semibold hover:border-[var(--teal)] hover:text-[var(--teal)]" style={{ borderColor: 'var(--light-gray)' }}>
            <History size={14} /> Movement history
          </button>
          <button onClick={() => onLots(item.id)} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border bg-white text-[13px] font-semibold hover:border-[var(--teal)] hover:text-[var(--teal)]" style={{ borderColor: 'var(--light-gray)' }}>
            <Layers size={14} /> Purchase lots
          </button>
          <span className="flex-1" />
          {canWrite && (
            <button onClick={onEdit} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-semibold text-white hover:bg-[var(--deep-teal)]" style={{ background: 'var(--teal)' }}>
              <Pencil size={14} /> Edit
            </button>
          )}
          <button onClick={onClose} className="inline-flex items-center h-9 px-4 rounded-lg border bg-white text-[13px] font-semibold hover:border-[var(--teal)] hover:text-[var(--teal)]" style={{ borderColor: 'var(--light-gray)' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
