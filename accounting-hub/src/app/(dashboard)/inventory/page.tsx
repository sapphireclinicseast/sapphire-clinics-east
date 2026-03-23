'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  Package,
  Truck,
  ArrowUpDown,
  ArrowRightLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  RotateCcw,
  Upload,
  Download,
  Loader2,
  AlertCircle,
  Printer,
} from 'lucide-react'
import JsBarcode from 'jsbarcode'
import { formatCurrency, formatDate } from '@/lib/utils'

/* ── Verdana Sticker Print (A6, 3 per page) ──────────────── */
function printVerdanaSticker(item: { name: string; sku?: string; barcode?: string | null }) {
  const sku = item.sku || item.barcode || ''
  const barcodeValue = item.barcode || item.sku || ''

  // Generate barcode as data URL
  const canvas = document.createElement('canvas')
  try {
    JsBarcode(canvas, barcodeValue, {
      format: 'CODE128', width: 2, height: 50, displayValue: true,
      fontSize: 11, margin: 4, font: 'monospace',
    })
  } catch { /* invalid barcode */ }
  const barcodeDataUrl = canvas.toDataURL('image/png')

  // Verdana logo+word SVG from brand directory
  const logoWordUrl = `${window.location.origin}/brand/verdana-logo-word.svg`

  // Facebook, Instagram, TikTok SVG icons
  const fbIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="#333"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`
  const igIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="#333"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`
  const ttIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="#333"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13.2a8.16 8.16 0 005.58 2.17V11.9a4.81 4.81 0 01-3.15-1.13V6.69h3.15z"/></svg>`

  const stickerHtml = `
    <div style="width:100%;height:calc(100%/3);box-sizing:border-box;border-bottom:1px dashed #999;padding:4mm 4mm;display:flex;align-items:center;gap:3mm;font-family:Arial,Helvetica,sans-serif">
      <div style="display:flex;flex-direction:column;align-items:center;min-width:60px">
        <img src="${logoWordUrl}" style="width:60px;height:70px;object-fit:contain" />
      </div>
      <div style="flex:1;text-align:center">
        <div style="margin-bottom:1.5mm">
          <img src="${logoWordUrl}" style="display:none" />
          <span style="font-size:13px;font-weight:900;color:#000;letter-spacing:0.3px">PROGRESS, MADE </span>
          <span style="font-size:14px;font-weight:900;color:#000;font-family:'Brush Script MT',cursive,serif;font-style:italic">Possible</span>
        </div>
        <div style="font-size:9px;font-weight:700;color:#000;margin-bottom:0.5mm">${item.name}</div>
        <div style="font-size:8px;color:#555;margin-bottom:1mm">${sku}</div>
        <img src="${barcodeDataUrl}" style="height:32px;max-width:160px" />
        <div style="margin-top:1.5mm;font-size:6.5px;font-weight:700;color:#000;letter-spacing:0.5px">HTTPS://VERDANAREHAB.COM/</div>
        <div style="margin-top:1mm;display:flex;justify-content:center;align-items:center;gap:8px;font-size:6.5px;color:#333">
          <span style="display:flex;align-items:center;gap:2px">${fbIcon} @verdanarehab</span>
          <span style="display:flex;align-items:center;gap:2px">${igIcon} @verdanarehab</span>
          <span style="display:flex;align-items:center;gap:2px">${ttIcon} @verdanarehab</span>
        </div>
      </div>
    </div>`

  const win = window.open('', '_blank', 'width=420,height=600')
  if (!win) return
  win.document.write(`<html><head><title>Sticker: ${item.name}</title>
    <style>
      @page { size: 105mm 148mm; margin: 0; }
      @media print { body { margin: 0; } }
      body { margin: 0; padding: 0; width: 105mm; height: 148mm; }
      .page { width: 100%; height: 100%; display: flex; flex-direction: column; }
    </style>
  </head><body>
    <div class="page">
      ${stickerHtml}${stickerHtml}${stickerHtml}
    </div>
    <script>
      // Wait for logo image to load before printing
      const imgs = document.querySelectorAll('img');
      let loaded = 0;
      imgs.forEach(img => {
        if (img.complete) { loaded++; }
        else { img.onload = () => { loaded++; if (loaded >= imgs.length) setTimeout(() => window.print(), 300); }; }
      });
      if (loaded >= imgs.length) setTimeout(() => window.print(), 500);
    <\/script>
  </body></html>`)
  win.document.close()
}

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */

const SKU_HIERARCHY: Record<string, { label: string; categories: Record<string, { label: string; subcategories: Record<string, string> }> }> = {
  PT: { label: 'Physical Therapy', categories: {
    EQP: { label: 'Equipment', subcategories: { MOB: 'Mobility', STR: 'Strength', BAL: 'Balance' } },
    ACC: { label: 'Accessories', subcategories: { TAP: 'Taping' } },
    MAT: { label: 'Materials', subcategories: { MAS: 'Massage' } },
  }},
  OT: { label: 'Occupational Therapy', categories: {
    EQP: { label: 'Equipment', subcategories: { FUN: 'Functional', FIN: 'Fine Motor' } },
    SEN: { label: 'Sensory', subcategories: { INT: 'Integration' } },
    TOY: { label: 'Toys', subcategories: { THP: 'Therapeutic' } },
    ACC: { label: 'Accessories', subcategories: { GRI: 'Grip' } },
  }},
  ST: { label: 'Speech Therapy', categories: {
    EQP: { label: 'Equipment', subcategories: { ORA: 'Oral Motor' } },
    MAT: { label: 'Materials', subcategories: { LAN: 'Language', SND: 'Sound' } },
    TOY: { label: 'Toys', subcategories: { COM: 'Communication' } },
    ACC: { label: 'Accessories', subcategories: { DEV: 'Devices' } },
  }},
  SP: { label: 'Special Education', categories: {
    MAT: { label: 'Materials', subcategories: { LRN: 'Learning' } },
    EQP: { label: 'Equipment', subcategories: { BEH: 'Behavior' } },
    TOY: { label: 'Toys', subcategories: { EDU: 'General' } },
  }},
  PSY: { label: 'Psychology & Assessment', categories: {
    ASM: { label: 'Assessment', subcategories: { STD: 'Standardized Tests', SCR: 'Screening Tests' } },
    MAT: { label: 'Materials', subcategories: { THP: 'Therapy Aids' } },
  }},
  CLI: { label: 'Clinic & Institutional', categories: {
    FUR: { label: 'Furniture', subcategories: { GEN: 'General' } },
    EQP: { label: 'Equipment', subcategories: { MON: 'Monitoring Devices' } },
    ACC: { label: 'Accessories', subcategories: { SAN: 'Sanitary and Safety' } },
  }},
  DIG: { label: 'Digital & Tech', categories: {
    APP: { label: 'Application', subcategories: { TRN: 'Training & Simulation Apps' } },
    EQP: { label: 'Equipment', subcategories: { AUG: 'Augmentative & Assistive Tech' } },
    SUB: { label: 'Subscription', subcategories: { SFT: 'Software Subscriptions' } },
  }},
  EDU: { label: 'Training & Education', categories: {
    MAT: { label: 'Materials', subcategories: { BOK: 'Books & Manuals' } },
    KIT: { label: 'Kit', subcategories: { TRN: 'Training Kits' } },
    ACC: { label: 'Accessories', subcategories: { CER: 'Certification Materials' } },
  }},
  MER: { label: 'Merchandise', categories: {
    GEN: { label: 'General', subcategories: { STK: 'Stickers', EMB: 'Car Emblems', TLS: 'Tagless Shirt', PCH: 'Pouch' } },
  }},
}

const INV_SUB_TYPES = [
  { value: 'INV_PT', label: 'Inventory — Physical Therapy' },
  { value: 'INV_OT', label: 'Inventory — Occupational Therapy' },
  { value: 'INV_ST', label: 'Inventory — Speech Therapy' },
  { value: 'INV_SPED', label: 'Inventory — Special Education' },
  { value: 'INV_PSY', label: 'Inventory — Psychology & Assessment' },
  { value: 'INV_CLI', label: 'Inventory — Clinic & Institutional' },
  { value: 'INV_DIG', label: 'Inventory — Digital & Tech' },
  { value: 'INV_EDU', label: 'Inventory — Training & Education' },
  { value: 'INV_MER', label: 'Inventory — Merchandise' },
]

const BRANCH_OPTIONS = [
  { value: 'SANDBOX_EAST', label: 'Sandbox East' },
  { value: 'SANDBOX_GREENHILLS', label: 'Sandbox Greenhills' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
]

const BRANCH_LABELS: Record<string, string> = Object.fromEntries(BRANCH_OPTIONS.map((b) => [b.value, b.label]))

const CURRENCIES = [
  { value: 'CNY', label: 'CNY — Chinese Yuan' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'JPY', label: 'JPY — Japanese Yen' },
  { value: 'KRW', label: 'KRW — Korean Won' },
  { value: 'SGD', label: 'SGD — Singapore Dollar' },
  { value: 'HKD', label: 'HKD — Hong Kong Dollar' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'THB', label: 'THB — Thai Baht' },
  { value: 'TWD', label: 'TWD — Taiwan Dollar' },
  { value: 'MYR', label: 'MYR — Malaysian Ringgit' },
  { value: 'INR', label: 'INR — Indian Rupee' },
]

const TABS = ['Inventory', 'Suppliers', 'Adjustments', 'Consignments'] as const
type Tab = (typeof TABS)[number]

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  PENDING:   { bg: '#fef3c7', color: '#92400e' },
  APPROVED:  { bg: '#dbeafe', color: '#1e40af' },
  SHIPPED:   { bg: '#e0e7ff', color: '#3730a3' },
  RECEIVED:  { bg: '#dcfce7', color: '#166534' },
  RETURNED:  { bg: '#fce7f3', color: '#9d174d' },
  CANCELLED: { bg: '#f3f4f6', color: '#374151' },
}

/* ═══════════════════════════════════════════════════════════
   INTERFACES
   ═══════════════════════════════════════════════════════════ */

interface Supplier {
  id: string
  supplierName: string
  email: string | null
  contactNumber: string | null
  isForeign: boolean
  currency: string | null
  defaultExchangeRate: number | null
  address: string | null
  notes: string | null
}

interface InventoryItem {
  id: string
  sku: string
  name: string
  barcode?: string | null
  branch: string
  skuDepartment: string
  skuCategory: string
  skuSubcategory: string
  accountSubType: string | null
  quantity: number
  unitCost: number
  sellingPrice: number | null
  rewardPointsPrice: number | null
  reorderLevel: number | null
  supplierId: string | null
  supplier?: { id: string; supplierName: string; isForeign: boolean; currency: string } | null
  supplierExchangeRate: number | null
  variants?: { id: string; variantType: string; variantLabel: string; color?: string; quantity: number; variantSku: string; barcode?: string | null }[]
}

interface Adjustment {
  id: string
  itemId: string
  item?: { sku: string; name: string }
  type: string
  quantityChange: number
  previousQuantity: number
  newQuantity: number
  remarks: string | null
  adjustmentDate: string
  adjustedBy?: { name: string }
}

interface Consignment {
  id: string
  itemId: string
  item?: { sku: string; name: string }
  fromBranch: string
  toBranch: string
  quantity: number
  status: string
  remarks: string | null
  createdAt: string
  requestedBy?: { name: string }
}

/* ═══════════════════════════════════════════════════════════
   BARCODE COMPONENT
   ═══════════════════════════════════════════════════════════ */

function BarcodeDisplay({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: 'CODE128',
          width: 1.5,
          height: 40,
          displayValue: true,
          fontSize: 12,
        })
      } catch {
        // invalid barcode value
      }
    }
  }, [value])
  if (!value) return null
  return <svg ref={ref} />
}

/* ═══════════════════════════════════════════════════════════
   PAGE COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function InventoryPage() {
  const { data: session } = useSession()
  const sessionUserId = session?.user?.id as string | undefined
  const [activeTab, setActiveTab] = useState<Tab>('Inventory')

  // ── Shared state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Inventory state
  const [items, setItems] = useState<InventoryItem[]>([])
  const [allItems, setAllItems] = useState<InventoryItem[]>([])
  const [itemSearch, setItemSearch] = useState('')
  const [itemBranchFilter, setItemBranchFilter] = useState('')
  const [itemDeptFilter, setItemDeptFilter] = useState('')
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [deleteItemConfirm, setDeleteItemConfirm] = useState<string | null>(null)

  // Item form
  const [fName, setFName] = useState('')
  const [fSkuDept, setFSkuDept] = useState('')
  const [fSkuCat, setFSkuCat] = useState('')
  const [fSkuSub, setFSkuSub] = useState('')
  const [fSkuValue, setFSkuValue] = useState('')
  const [fBranch, setFBranch] = useState('SANDBOX_EAST')
  const [fSubType, setFSubType] = useState('')
  const [fUnitCost, setFUnitCost] = useState('')
  const [fSellingPrice, setFSellingPrice] = useState('')
  const [fRewardPointsPrice, setFRewardPointsPrice] = useState('')
  const [fInitialQty, setFInitialQty] = useState('')
  const [fReorderLevel, setFReorderLevel] = useState('')
  const [fSupplierId, setFSupplierId] = useState('')
  const [fExchangeRate, setFExchangeRate] = useState('')
  // Variants (color, size, material, etc.)
  const [variants, setVariants] = useState<{ id?: string; variantType: string; variantLabel: string; quantity: number; variantSku?: string; barcode?: string }[]>([])
  const [newVariantType, setNewVariantType] = useState('Color')
  const [newVariantLabel, setNewVariantLabel] = useState('')
  const [newVariantQty, setNewVariantQty] = useState(0)

  const [showInlineSupplier, setShowInlineSupplier] = useState(false)
  const [inlineSName, setInlineSName] = useState('')
  const [inlineSEmail, setInlineSEmail] = useState('')
  const [inlineSContact, setInlineSContact] = useState('')
  const [inlineSForeign, setInlineSForeign] = useState(false)
  const [inlineSCurrency, setInlineSCurrency] = useState('USD')
  const [inlineSRate, setInlineSRate] = useState('')

  // ── Supplier state
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([])
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [deleteSupplierConfirm, setDeleteSupplierConfirm] = useState<string | null>(null)

  // Supplier form
  const [sName, setSName] = useState('')
  const [sEmail, setSEmail] = useState('')
  const [sContact, setSContact] = useState('')
  const [sForeign, setSForeign] = useState(false)
  const [sCurrency, setSCurrency] = useState('USD')
  const [sRate, setSRate] = useState('')
  const [sAddress, setSAddress] = useState('')
  const [sNotes, setSNotes] = useState('')

  // ── Adjustment state
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [adjModalOpen, setAdjModalOpen] = useState(false)
  // Bulk upload state
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [bulkStep, setBulkStep] = useState<'upload' | 'review' | 'result'>('upload')
  const [bulkCsvData, setBulkCsvData] = useState<{ sku: string; quantity: number; foreignCostPerUnit: number; currency: string }[]>([])
  const [bulkLocalPayment, setBulkLocalPayment] = useState('')
  const [bulkFreight, setBulkFreight] = useState('')
  const [bulkRemarks, setBulkRemarks] = useState('Bulk import')
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ exchangeRate: number; items: { sku: string; name: string; quantity: number; landedCostPerUnit: number; freightAllocation: number }[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Bulk item import state
  const [bulkItemModalOpen, setBulkItemModalOpen] = useState(false)
  const [bulkItemCsv, setBulkItemCsv] = useState<{ name: string; department: string; category: string; subcategory: string; branch: string; unitCost: string; sellingPrice: string; rewardPointsPrice: string; quantity: string; reorderLevel: string }[]>([])
  const [bulkItemStep, setBulkItemStep] = useState<'upload' | 'review' | 'result'>('upload')
  const [bulkItemSubmitting, setBulkItemSubmitting] = useState(false)
  const [bulkItemResult, setBulkItemResult] = useState<{ success: number; errors: number; items: { sku: string; name: string; barcode: string }[]; errorDetails: string[] } | null>(null)
  const itemFileRef = useRef<HTMLInputElement>(null)
  const [adjItemId, setAdjItemId] = useState('')
  const [adjType, setAdjType] = useState<'SHRINKAGE' | 'INCREASE'>('SHRINKAGE')
  const [adjQty, setAdjQty] = useState('')
  const [adjDate, setAdjDate] = useState(new Date().toISOString().split('T')[0])
  const [adjRemarks, setAdjRemarks] = useState('')

  // ── Consignment state
  const [consignments, setConsignments] = useState<Consignment[]>([])
  const [conModalOpen, setConModalOpen] = useState(false)
  const [conItemId, setConItemId] = useState('')
  const [conToBranch, setConToBranch] = useState('')
  const [conQty, setConQty] = useState('')
  const [conRemarks, setConRemarks] = useState('')

  const canWrite = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN'].includes(session?.user?.role as string)

  /* ── Fetchers ──────────────────────────────────────────── */

  const fetchItems = useCallback(async () => {
    try {
      const params = new URLSearchParams({ pageSize: '500' })
      if (itemSearch) params.set('search', itemSearch)
      if (itemBranchFilter) params.set('branch', itemBranchFilter)
      if (itemDeptFilter) params.set('department', itemDeptFilter)
      const res = await fetch(`/api/inventory?${params}`)
      const data = await res.json()
      setItems(data.data || [])
    } catch { /* ignore */ }
  }, [itemSearch, itemBranchFilter, itemDeptFilter])

  const fetchAllItems = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory?all=true')
      const data = await res.json()
      setAllItems(Array.isArray(data) ? data : data.data || [])
    } catch { /* ignore */ }
  }, [])

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers?pageSize=100')
      const data = await res.json()
      setSuppliers(data.data || [])
    } catch { /* ignore */ }
  }, [])

  const fetchAllSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers?all=true')
      const data = await res.json()
      setAllSuppliers(Array.isArray(data) ? data : data.data || [])
    } catch { /* ignore */ }
  }, [])

  const fetchAdjustments = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/adjustments?pageSize=100')
      const data = await res.json()
      setAdjustments(data.data || [])
    } catch { /* ignore */ }
  }, [])

  const fetchConsignments = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/consignments?pageSize=100')
      const data = await res.json()
      setConsignments(data.data || [])
    } catch { /* ignore */ }
  }, [])

  // Initial load — only runs once when session is available
  const initialLoaded = useRef(false)
  useEffect(() => {
    if (initialLoaded.current) return
    if (!sessionUserId) {
      const t = setTimeout(() => { if (!initialLoaded.current) setLoading(false) }, 3000)
      return () => clearTimeout(t)
    }
    initialLoaded.current = true
    setLoading(true)
    Promise.all([fetchItems(), fetchAllItems(), fetchSuppliers(), fetchAllSuppliers(), fetchAdjustments(), fetchConsignments()])
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId])

  // Re-fetch items when search/filter changes (debounced)
  useEffect(() => {
    if (!initialLoaded.current) return
    const timeout = setTimeout(() => { fetchItems() }, 300)
    return () => clearTimeout(timeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemSearch, itemBranchFilter, itemDeptFilter])

  /* ── SKU Generation ────────────────────────────────────── */

  useEffect(() => {
    if (!fSkuDept || !fSkuCat || !fSkuSub) {
      if (!editingItem) setFSkuValue('')
      return
    }
    if (editingItem) return // don't regenerate SKU on edit
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/inventory/sku?department=${fSkuDept}&category=${fSkuCat}&subcategory=${fSkuSub}`)
        const data = await res.json()
        if (!cancelled && data.sku) setFSkuValue(data.sku)
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [fSkuDept, fSkuCat, fSkuSub, editingItem])

  /* ── Auth guard ────────────────────────────────────────── */

  if (loading && !initialLoaded.current) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm" style={{ color: 'var(--mid-gray)' }}>Loading...</div>
      </div>
    )
  }

  /* ── Helpers ───────────────────────────────────────────── */

  const selectedAdjItem = allItems.find((i) => i.id === adjItemId)
  const adjPrevQty = selectedAdjItem?.quantity ?? 0
  const adjNewQty = adjType === 'SHRINKAGE'
    ? adjPrevQty - (parseInt(adjQty) || 0)
    : adjPrevQty + (parseInt(adjQty) || 0)

  const selectedConItem = allItems.find((i) => i.id === conItemId)

  const deptKeys = Object.keys(SKU_HIERARCHY)
  const catKeys = fSkuDept ? Object.keys(SKU_HIERARCHY[fSkuDept]?.categories || {}) : []
  const subKeys = fSkuDept && fSkuCat ? Object.keys(SKU_HIERARCHY[fSkuDept]?.categories[fSkuCat]?.subcategories || {}) : []

  const selectedFormSupplier = allSuppliers.find((s) => s.id === fSupplierId)

  /* ═══════════════════════════════════════════════════════
     INVENTORY TAB HANDLERS
     ═══════════════════════════════════════════════════════ */

  function openItemCreate() {
    setEditingItem(null)
    setFName(''); setFSkuDept(''); setFSkuCat(''); setFSkuSub(''); setFSkuValue('')
    setFBranch('SANDBOX_EAST'); setFSubType(''); setFUnitCost(''); setFSellingPrice(''); setFRewardPointsPrice('')
    setFInitialQty(''); setFReorderLevel(''); setFSupplierId(''); setFExchangeRate('')
    setVariants([]); setNewVariantType('Color'); setNewVariantLabel(''); setNewVariantQty(0)
    setShowInlineSupplier(false); setError('')
    setItemModalOpen(true)
  }

  function openItemEdit(item: InventoryItem) {
    setEditingItem(item)
    setFName(item.name)
    const parts = item.sku.split('-')
    setFSkuDept(parts[0] || ''); setFSkuCat(parts[1] || ''); setFSkuSub(parts[2] || '')
    setFSkuValue(item.sku)
    setFBranch(item.branch)
    setFSubType(item.accountSubType || '')
    setFUnitCost(String(item.unitCost))
    setFSellingPrice(item.sellingPrice != null ? String(item.sellingPrice) : '')
    setFRewardPointsPrice(item.rewardPointsPrice != null ? String(item.rewardPointsPrice) : '')
    setFInitialQty(String(item.quantity))
    setFReorderLevel(item.reorderLevel != null ? String(item.reorderLevel) : '')
    setFSupplierId(item.supplierId || '')
    setFExchangeRate(item.supplierExchangeRate != null ? String(item.supplierExchangeRate) : '')
    // Load variants
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setVariants((item.variants || []).map((v: any) => ({
      id: v.id, variantType: v.variantType || 'Color', variantLabel: v.variantLabel || v.color || '', quantity: v.quantity, variantSku: v.variantSku, barcode: v.barcode || undefined,
    })))
    setNewVariantType('Color'); setNewVariantLabel(''); setNewVariantQty(0)
    setShowInlineSupplier(false); setError('')
    setItemModalOpen(true)
  }

  async function addVariant() {
    if (!editingItem || !newVariantLabel.trim()) return
    try {
      const r = await fetch('/api/inventory/variants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: editingItem.id, variantType: newVariantType, variantLabel: newVariantLabel.trim(), quantity: newVariantQty }),
      })
      const d = await r.json()
      if (r.ok) {
        setVariants(prev => [...prev, { id: d.id, variantType: d.variantType, variantLabel: d.variantLabel, quantity: d.quantity, variantSku: d.variantSku, barcode: d.barcode }])
        setNewVariantLabel('')
        setNewVariantQty(0)
        fetchItems()
      } else {
        setError(d.error || 'Failed to add variant')
      }
    } catch { setError('Failed to add variant') }
  }

  async function deleteVariant(variantId: string) {
    if (!window.confirm('Remove this color variant?')) return
    try {
      await fetch('/api/inventory/variants', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: variantId }),
      })
      setVariants(prev => prev.filter(v => v.id !== variantId))
      fetchItems()
    } catch {}
  }

  async function handleInlineSupplierSave() {
    if (!inlineSName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierName: inlineSName, email: inlineSEmail || null, contactNumber: inlineSContact || null,
          isForeign: inlineSForeign, currency: inlineSForeign ? inlineSCurrency : 'PHP',
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create supplier'); setSaving(false); return }
      await fetchAllSuppliers()
      setFSupplierId(data.id || '')
      setShowInlineSupplier(false)
      setInlineSName(''); setInlineSEmail(''); setInlineSContact(''); setInlineSForeign(false); setInlineSCurrency('USD'); setInlineSRate('')
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  async function handleItemSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const body: Record<string, unknown> = {
      name: fName, branch: fBranch,
      skuDepartment: fSkuDept || null, skuCategory: fSkuCat || null, skuSubcategory: fSkuSub || null,
      accountSubType: fSubType || null,
      unitCost: fUnitCost || '0',
      sellingPrice: fSellingPrice || null,
      rewardPointsPrice: fRewardPointsPrice || null,
      quantity: fInitialQty || '0',
      reorderLevel: fReorderLevel || null,
      supplierId: fSupplierId || null,
    }
    if (editingItem) body.id = editingItem.id
    try {
      const res = await fetch('/api/inventory', {
        method: editingItem ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong'); setSaving(false); return }
      setItemModalOpen(false); fetchItems(); fetchAllItems()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  async function handleItemDelete(id: string) {
    try {
      const res = await fetch(`/api/inventory?id=${id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to delete'); return }
      setDeleteItemConfirm(null); fetchItems(); fetchAllItems()
    } catch { setError('Network error') }
  }

  /* ═══════════════════════════════════════════════════════
     SUPPLIER TAB HANDLERS
     ═══════════════════════════════════════════════════════ */

  function openSupplierCreate() {
    setEditingSupplier(null)
    setSName(''); setSEmail(''); setSContact(''); setSForeign(false)
    setSCurrency('USD'); setSRate(''); setSAddress(''); setSNotes(''); setError('')
    setSupplierModalOpen(true)
  }

  function openSupplierEdit(s: Supplier) {
    setEditingSupplier(s)
    setSName(s.supplierName); setSEmail(s.email || ''); setSContact(s.contactNumber || '')
    setSForeign(s.isForeign); setSCurrency(s.currency || 'USD')
    setSRate(s.defaultExchangeRate != null ? String(s.defaultExchangeRate) : '')
    setSAddress(s.address || ''); setSNotes(s.notes || ''); setError('')
    setSupplierModalOpen(true)
  }

  async function handleSupplierSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const body: Record<string, unknown> = {
      supplierName: sName, email: sEmail || null, contactNumber: sContact || null,
      isForeign: sForeign, currency: sForeign ? sCurrency : 'PHP',
      address: sAddress || null, notes: sNotes || null,
    }
    if (editingSupplier) body.id = editingSupplier.id
    try {
      const res = await fetch('/api/suppliers', {
        method: editingSupplier ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong'); setSaving(false); return }
      setSupplierModalOpen(false); fetchSuppliers(); fetchAllSuppliers()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  async function handleSupplierDelete(id: string) {
    try {
      const res = await fetch(`/api/suppliers?id=${id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to delete'); return }
      setDeleteSupplierConfirm(null); fetchSuppliers(); fetchAllSuppliers()
    } catch { setError('Network error') }
  }

  /* ═══════════════════════════════════════════════════════
     ADJUSTMENT TAB HANDLERS
     ═══════════════════════════════════════════════════════ */

  function openAdjCreate() {
    setAdjItemId(''); setAdjType('SHRINKAGE'); setAdjQty(''); setAdjRemarks('')
    setAdjDate(new Date().toISOString().split('T')[0]); setError('')
    setAdjModalOpen(true)
  }

  async function handleAdjSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: adjItemId, type: adjType,
          quantityChange: parseInt(adjQty) || 0,
          adjustmentDate: adjDate, remarks: adjRemarks,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong'); setSaving(false); return }
      setAdjModalOpen(false); fetchAdjustments(); fetchItems(); fetchAllItems()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  /* ═══════════════════════════════════════════════════════
     CONSIGNMENT TAB HANDLERS
     ═══════════════════════════════════════════════════════ */

  function openConCreate() {
    setConItemId(''); setConToBranch(''); setConQty(''); setConRemarks(''); setError('')
    setConModalOpen(true)
  }

  async function handleConSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/inventory/consignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: conItemId, toBranch: conToBranch,
          quantity: parseInt(conQty) || 0, remarks: conRemarks || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong'); setSaving(false); return }
      setConModalOpen(false); fetchConsignments(); fetchItems(); fetchAllItems()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  async function handleConAction(id: string, action: string) {
    try {
      const res = await fetch('/api/inventory/consignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Action failed'); return }
      fetchConsignments(); fetchItems(); fetchAllItems()
    } catch { setError('Network error') }
  }

  /* ═══════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════ */

  const anyModalOpen = itemModalOpen || supplierModalOpen || adjModalOpen || conModalOpen

  // Print bulk barcodes — A6 pages, 10 barcodes per product per page
  const printBulkBarcodes = () => {
    const activeItems = allItems.filter((it: InventoryItem) => it.barcode || it.sku)
    if (activeItems.length === 0) { setError('No items with barcodes found'); return }
    const win = window.open('', '_blank')
    if (!win) return
    const COPIES = 10
    const pages = activeItems.map((item: InventoryItem) => {
      const code = item.barcode || item.sku
      const barcodes = Array(COPIES).fill(0).map(() =>
        `<div style="text-align:center;margin:4px 0">
          <svg class="bc" data-code="${code}"></svg>
          <div style="font-size:7px;margin-top:1px">${item.name}</div>
        </div>`
      ).join('')
      return `<div style="page-break-after:always;width:105mm;height:148mm;padding:4mm;box-sizing:border-box;display:flex;flex-wrap:wrap;align-content:flex-start;gap:2mm">
        ${barcodes}
      </div>`
    }).join('')

    win.document.write(`<html><head><title>Barcodes</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>@page{size:A6;margin:3mm}body{margin:0;font-family:monospace;font-size:8px}</style>
</head><body>${pages}<script>
document.querySelectorAll('.bc').forEach(el=>{
  try{JsBarcode(el,el.dataset.code,{format:'CODE128',width:1.5,height:30,displayValue:true,fontSize:9,margin:2})}catch(e){}
});
setTimeout(()=>window.print(),500);
<\/script></body></html>`)
    win.document.close()
  }

  return (
    <div>
      {/* Page Title */}
      <h1
        className="text-2xl font-bold mb-6"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
      >
        Inventory &amp; Procurement
      </h1>

      {/* Tab Navigation */}
      <div className="flex gap-6 border-b mb-6" style={{ borderColor: 'var(--light-gray)' }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setError('') }}
            className="pb-3 text-sm font-semibold transition-colors relative"
            style={{
              color: activeTab === tab ? 'var(--teal)' : 'var(--mid-gray)',
              borderBottom: activeTab === tab ? '2px solid var(--teal)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Error (outside modals) */}
      {error && !anyModalOpen && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>
      )}

      {/* ════════════════════════════════════════════════════
         TAB 1: INVENTORY ITEMS
         ════════════════════════════════════════════════════ */}
      {activeTab === 'Inventory' && (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
              Manage stock levels and item details
            </p>
            {canWrite && (
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  const csv = 'name,department,category,subcategory,branch,unit_cost,selling_price,reward_points_price,quantity,reorder_level\nPRODUCT NAME,OT,Equipment,Fine Motor,VERDANA_STORE,300,1200,,10,3'
                  const blob = new Blob([csv], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a'); a.href = url; a.download = 'inventory-import-template.csv'; a.click()
                  URL.revokeObjectURL(url)
                }}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                  <Download size={14} /> CSV Template
                </button>
                <button onClick={() => setBulkItemModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border"
                  style={{ borderColor: 'var(--teal)', color: 'var(--teal)', background: 'var(--pale-teal)' }}>
                  <Upload size={14} /> Import CSV
                </button>
                <button onClick={() => printBulkBarcodes()}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                  <Download size={14} /> Barcodes
                </button>
                <button onClick={openItemCreate}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: 'var(--teal)' }}>
                  <Plus size={18} /> Add Item
                </button>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
              <input
                type="text"
                placeholder="Search items..."
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none"
                style={{ borderColor: 'var(--light-gray)', background: 'white' }}
              />
            </div>
            <select
              value={itemBranchFilter}
              onChange={(e) => setItemBranchFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ borderColor: 'var(--light-gray)', background: 'white' }}
            >
              <option value="">All Branches</option>
              {BRANCH_OPTIONS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
            <select
              value={itemDeptFilter}
              onChange={(e) => setItemDeptFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ borderColor: 'var(--light-gray)', background: 'white' }}
            >
              <option value="">All Departments</option>
              {deptKeys.map((d) => (
                <option key={d} value={d}>{SKU_HIERARCHY[d].label}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>SKU</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Name</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Branch</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Dept</th>
                    <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Qty</th>
                    <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Unit Cost</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Supplier</th>
                    {canWrite && <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={canWrite ? 8 : 7} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                        <Package size={32} className="mx-auto mb-2 opacity-40" />
                        <p>No inventory items</p>
                      </td>
                    </tr>
                  ) : items.map((item) => (
                    <tr key={item.id} className="border-t hover:bg-gray-50/50 transition-colors" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-4 py-3 font-mono text-xs font-medium" style={{ color: 'var(--charcoal)' }}>{item.sku}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>{item.name}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{BRANCH_LABELS[item.branch] || item.branch}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                        {item.skuDepartment ? (SKU_HIERARCHY[item.skuDepartment]?.label || item.skuDepartment) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium" style={{ color: item.reorderLevel && item.quantity <= item.reorderLevel ? '#dc2626' : 'var(--charcoal)' }}>
                        {item.quantity}
                      </td>
                      <td className="px-4 py-3 text-right" style={{ color: 'var(--mid-gray)' }}>
                        {formatCurrency(item.unitCost)}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                        {item.supplier?.supplierName || '—'}
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => printVerdanaSticker(item)} className="p-2 rounded-lg hover:bg-blue-50 transition-colors" title="Print Sticker">
                              <Printer size={15} style={{ color: 'var(--teal)' }} />
                            </button>
                            <button onClick={() => openItemEdit(item)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Edit">
                              <Pencil size={15} style={{ color: 'var(--teal)' }} />
                            </button>
                            <button onClick={() => setDeleteItemConfirm(item.id)} className="p-2 rounded-lg hover:bg-red-50 transition-colors" title="Delete">
                              <Trash2 size={15} className="text-red-500" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Delete Confirm */}
          {deleteItemConfirm && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
                <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Delete Item</h3>
                <p className="text-sm mb-6" style={{ color: 'var(--mid-gray)' }}>Are you sure you want to deactivate this inventory item?</p>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setDeleteItemConfirm(null)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
                  <button onClick={() => handleItemDelete(deleteItemConfirm)} className="px-4 py-2 rounded-lg text-sm text-white bg-red-500 hover:bg-red-600">Delete</button>
                </div>
              </div>
            </div>
          )}

          {/* Add/Edit Item Modal */}
          {itemModalOpen && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                    {editingItem ? 'Edit Item' : 'Add Item'}
                  </h3>
                  <button onClick={() => setItemModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X size={20} style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </div>

                {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>}

                <form onSubmit={handleItemSubmit} className="space-y-4">
                  {/* Name */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Item Name</label>
                    <input type="text" value={fName} onChange={(e) => setFName(e.target.value)} required
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>

                  {/* SKU Generator */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>SKU Generator</label>
                    <div className="grid grid-cols-3 gap-2">
                      <select value={fSkuDept} onChange={(e) => { setFSkuDept(e.target.value); setFSkuCat(''); setFSkuSub('') }}
                        className="px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}
                        disabled={!!editingItem}>
                        <option value="">Department</option>
                        {deptKeys.map((d) => <option key={d} value={d}>{SKU_HIERARCHY[d].label}</option>)}
                      </select>
                      <select value={fSkuCat} onChange={(e) => { setFSkuCat(e.target.value); setFSkuSub('') }}
                        className="px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}
                        disabled={!fSkuDept || !!editingItem}>
                        <option value="">Category</option>
                        {catKeys.map((c) => <option key={c} value={c}>{SKU_HIERARCHY[fSkuDept]?.categories[c]?.label}</option>)}
                      </select>
                      <select value={fSkuSub} onChange={(e) => setFSkuSub(e.target.value)}
                        className="px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}
                        disabled={!fSkuCat || !!editingItem}>
                        <option value="">Subcategory</option>
                        {subKeys.map((s) => <option key={s} value={s}>{SKU_HIERARCHY[fSkuDept]?.categories[fSkuCat]?.subcategories[s]}</option>)}
                      </select>
                    </div>
                    {fSkuValue && (
                      <div className="mt-2 p-3 rounded-xl border text-center" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                        <span className="font-mono text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{fSkuValue}</span>
                      </div>
                    )}
                  </div>

                  {/* Barcode */}
                  {fSkuValue && (
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Barcode</label>
                      <div className="p-3 rounded-xl border flex justify-center" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                        <BarcodeDisplay value={fSkuValue} />
                      </div>
                    </div>
                  )}

                  {/* Branch + Sub Type */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Branch</label>
                      <select value={fBranch} onChange={(e) => setFBranch(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                        {BRANCH_OPTIONS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Account Sub Type</label>
                      <select value={fSubType} onChange={(e) => setFSubType(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">— Select —</option>
                        {INV_SUB_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Cost + Selling Price */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Unit Cost (PHP)</label>
                      <input type="number" step="0.01" min="0" value={fUnitCost} onChange={(e) => setFUnitCost(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Selling Price (PHP)</label>
                      <input type="number" step="0.01" min="0" value={fSellingPrice} onChange={(e) => setFSellingPrice(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                  </div>

                  {/* Reward Points Price */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                      Reward Points Price <span className="font-normal text-xs" style={{ color: 'var(--mid-gray)' }}>(optional — points needed to purchase)</span>
                    </label>
                    <input type="number" min="0" value={fRewardPointsPrice} onChange={(e) => setFRewardPointsPrice(e.target.value)}
                      placeholder="e.g. 1000"
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>

                  {/* Qty + Reorder */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                        {editingItem ? 'Quantity' : 'Initial Quantity'}
                      </label>
                      <input type="number" min="0" value={fInitialQty} onChange={(e) => setFInitialQty(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Reorder Level</label>
                      <input type="number" min="0" value={fReorderLevel} onChange={(e) => setFReorderLevel(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                  </div>

                  {/* Supplier */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Supplier</label>
                    {!showInlineSupplier ? (
                      <select
                        value={fSupplierId}
                        onChange={(e) => {
                          if (e.target.value === '__NEW__') {
                            setShowInlineSupplier(true)
                            setFSupplierId('')
                          } else {
                            setFSupplierId(e.target.value)
                          }
                        }}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                        style={{ borderColor: 'var(--light-gray)' }}
                      >
                        <option value="">— Select supplier —</option>
                        {allSuppliers.map((s) => <option key={s.id} value={s.id}>{s.supplierName}</option>)}
                        <option value="__NEW__">— Add New Supplier —</option>
                      </select>
                    ) : (
                      <div className="p-3 rounded-xl border space-y-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>New Supplier</span>
                          <button type="button" onClick={() => setShowInlineSupplier(false)} className="text-xs underline" style={{ color: 'var(--mid-gray)' }}>Cancel</button>
                        </div>
                        <input type="text" placeholder="Supplier Name *" value={inlineSName} onChange={(e) => setInlineSName(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                        <div className="grid grid-cols-2 gap-2">
                          <input type="email" placeholder="Email" value={inlineSEmail} onChange={(e) => setInlineSEmail(e.target.value)}
                            className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                          <input type="text" placeholder="Contact" value={inlineSContact} onChange={(e) => setInlineSContact(e.target.value)}
                            className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--charcoal)' }}>
                          <input type="checkbox" checked={inlineSForeign} onChange={(e) => setInlineSForeign(e.target.checked)} className="rounded" />
                          Foreign Supplier
                        </label>
                        {inlineSForeign && (
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Currency</label>
                            <select value={inlineSCurrency} onChange={(e) => setInlineSCurrency(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                              {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                          </div>
                        )}
                        <button type="button" onClick={handleInlineSupplierSave} disabled={saving || !inlineSName.trim()}
                          className="w-full py-2 rounded-lg text-white text-xs font-semibold disabled:opacity-50"
                          style={{ background: 'var(--teal)' }}>
                          {saving ? 'Saving...' : 'Save Supplier'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Color Variants */}
                  {editingItem && (
                    <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--light-gray)' }}>
                      <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>
                        Variants ({variants.length})
                      </h4>
                      {variants.length > 0 && (
                        <div className="space-y-1">
                          {variants.map(v => (
                            <div key={v.id || v.variantLabel} className="flex items-center justify-between p-2 rounded-lg text-xs" style={{ background: 'var(--off-white)' }}>
                              <div>
                                <span className="px-1.5 py-0.5 rounded text-xs font-semibold mr-1" style={{ background: '#e0e7ff', color: '#3730a3' }}>{v.variantType}</span>
                                <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{v.variantLabel}</span>
                                <span className="ml-2" style={{ color: 'var(--mid-gray)' }}>SKU: {v.variantSku || '—'}</span>
                                <span className="ml-2" style={{ color: 'var(--mid-gray)' }}>Qty: {v.quantity}</span>
                              </div>
                              {v.id && (
                                <button type="button" onClick={() => deleteVariant(v.id!)} className="p-1 rounded hover:bg-red-50">
                                  <Trash2 size={12} className="text-red-500" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2 items-end">
                        <div className="w-28">
                          <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Type</label>
                          <select value={newVariantType} onChange={e => setNewVariantType(e.target.value)}
                            className="w-full px-2 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                            <option value="Color">Color</option>
                            <option value="Size">Size</option>
                            <option value="Material">Material</option>
                            <option value="Flavor">Flavor</option>
                            <option value="Scent">Scent</option>
                            <option value="Style">Style</option>
                            <option value="Weight">Weight</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Label</label>
                          <input type="text" value={newVariantLabel} onChange={e => setNewVariantLabel(e.target.value)}
                            placeholder={newVariantType === 'Color' ? 'e.g. Red, Blue' : newVariantType === 'Size' ? 'e.g. Small, Large' : 'e.g. value'}
                            className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                        <div className="w-20">
                          <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Qty</label>
                          <input type="number" min={0} value={newVariantQty} onChange={e => setNewVariantQty(parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                        <button type="button" onClick={addVariant} disabled={!newVariantLabel.trim()}
                          className="px-3 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                          Add
                        </button>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                        Total quantity across all variants is synced to the parent item quantity.
                      </p>
                    </div>
                  )}

                  {/* Buttons */}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setItemModalOpen(false)}
                      className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                      style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                    <button type="submit" disabled={saving}
                      className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                      style={{ background: 'var(--teal)' }}>
                      {saving ? 'Saving...' : editingItem ? 'Update Item' : 'Add Item'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Bulk Item Import Modal */}
          {bulkItemModalOpen && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto">
              <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-xl mb-8 relative">
                <button onClick={() => { setBulkItemModalOpen(false); setBulkItemStep('upload'); setBulkItemCsv([]); setBulkItemResult(null) }}
                  className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg"><X size={20} style={{ color: 'var(--mid-gray)' }} /></button>
                <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                  Bulk Import Items
                </h3>
                {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600 flex items-center gap-1"><AlertCircle size={14} />{error}</div>}

                {bulkItemStep === 'upload' && (
                  <div className="space-y-4">
                    <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
                      Upload CSV with columns: <code className="bg-gray-100 px-1 rounded text-xs">name, department, category, subcategory, branch, unit_cost, selling_price, reward_points_price, quantity, reorder_level</code>
                    </p>
                    <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>SKU and barcode will be auto-generated from department/category/subcategory.</p>
                    <input ref={itemFileRef} type="file" accept=".csv" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = (ev) => {
                        const text = ev.target?.result as string
                        const lines = text.trim().split('\n')
                        const rows = lines.slice(1).map(line => {
                          const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
                          return { name: cols[0] || '', department: cols[1] || '', category: cols[2] || '', subcategory: cols[3] || '', branch: cols[4] || 'VERDANA_STORE', unitCost: cols[5] || '', sellingPrice: cols[6] || '', rewardPointsPrice: cols[7] || '', quantity: cols[8] || '', reorderLevel: cols[9] || '' }
                        }).filter(r => r.name)
                        if (rows.length === 0) { setError('No valid rows'); return }
                        setBulkItemCsv(rows); setBulkItemStep('review'); setError('')
                      }
                      reader.readAsText(file)
                    }} />
                    <button onClick={() => itemFileRef.current?.click()}
                      className="w-full py-8 rounded-xl border-2 border-dashed text-sm flex flex-col items-center gap-2 hover:bg-gray-50"
                      style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                      <Upload size={24} /> Click to select CSV file
                    </button>
                  </div>
                )}

                {bulkItemStep === 'review' && (
                  <div className="space-y-4">
                    <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
                      <table className="w-full text-xs">
                        <thead><tr style={{ background: 'var(--off-white)' }}>
                          {['Name', 'Dept', 'Cat', 'Sub', 'Branch', 'Cost', 'Price', 'Qty'].map(h => (
                            <th key={h} className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {bulkItemCsv.map((r, idx) => (
                            <tr key={idx} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                              <td className="px-2 py-1.5 font-medium">{r.name}</td>
                              <td className="px-2 py-1.5">{r.department}</td>
                              <td className="px-2 py-1.5">{r.category}</td>
                              <td className="px-2 py-1.5">{r.subcategory}</td>
                              <td className="px-2 py-1.5">{r.branch}</td>
                              <td className="px-2 py-1.5">{r.unitCost}</td>
                              <td className="px-2 py-1.5">{r.sellingPrice}</td>
                              <td className="px-2 py-1.5">{r.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{bulkItemCsv.length} items to import. SKU and barcode will be auto-generated.</p>
                    <div className="flex gap-2">
                      <button disabled={bulkItemSubmitting} onClick={async () => {
                        setBulkItemSubmitting(true); setError('')
                        try {
                          const res = await fetch('/api/inventory/bulk', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ items: bulkItemCsv }),
                          })
                          const data = await res.json()
                          if (!res.ok) { setError(data.error || 'Import failed'); setBulkItemSubmitting(false); return }
                          setBulkItemResult(data); setBulkItemStep('result')
                          fetchItems(); fetchAllItems()
                        } catch { setError('Import failed') }
                        finally { setBulkItemSubmitting(false) }
                      }}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                        style={{ background: 'var(--teal)' }}>
                        {bulkItemSubmitting && <Loader2 className="animate-spin" size={14} />} Import {bulkItemCsv.length} Items
                      </button>
                      <button onClick={() => { setBulkItemStep('upload'); setBulkItemCsv([]) }}
                        className="px-4 py-2.5 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Back</button>
                    </div>
                  </div>
                )}

                {bulkItemStep === 'result' && bulkItemResult && (
                  <div className="space-y-4">
                    <div className="rounded-xl p-4" style={{ background: '#dcfce7' }}>
                      <p className="text-sm font-semibold" style={{ color: '#166534' }}>{bulkItemResult.success} items imported successfully!</p>
                      {bulkItemResult.errors > 0 && <p className="text-xs mt-1 text-red-600">{bulkItemResult.errors} errors</p>}
                    </div>
                    {bulkItemResult.errorDetails?.length > 0 && (
                      <div className="rounded-xl p-3 text-xs space-y-1" style={{ background: '#fef2f2' }}>
                        {bulkItemResult.errorDetails.map((e, i) => <p key={i} className="text-red-600">{e}</p>)}
                      </div>
                    )}
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                      <table className="w-full text-xs">
                        <thead><tr style={{ background: 'var(--off-white)' }}>
                          {['Name', 'SKU', 'Barcode'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {(bulkItemResult.items || []).map((r, idx) => (
                            <tr key={idx} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                              <td className="px-3 py-2">{r.name}</td>
                              <td className="px-3 py-2 font-mono">{r.sku}</td>
                              <td className="px-3 py-2 font-mono">{r.barcode}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button onClick={() => { setBulkItemModalOpen(false); setBulkItemStep('upload'); setBulkItemCsv([]); setBulkItemResult(null) }}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>Done</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════
         TAB 2: SUPPLIERS
         ════════════════════════════════════════════════════ */}
      {activeTab === 'Suppliers' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>Manage supplier information</p>
            {canWrite && (
              <button onClick={openSupplierCreate}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: 'var(--teal)' }}>
                <Plus size={18} />
                Add Supplier
              </button>
            )}
          </div>

          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Name</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Email</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Contact</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Foreign?</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Currency</th>
                    {canWrite && <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={canWrite ? 7 : 6} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                        <Truck size={32} className="mx-auto mb-2 opacity-40" />
                        <p>No suppliers</p>
                      </td>
                    </tr>
                  ) : suppliers.map((s) => (
                    <tr key={s.id} className="border-t hover:bg-gray-50/50 transition-colors" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>{s.supplierName}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>{s.email || '—'}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>{s.contactNumber || '—'}</td>
                      <td className="px-4 py-3">
                        {s.isForeign ? (
                          <span className="px-2 py-1 rounded-md text-xs font-medium" style={{ background: '#e0e7ff', color: '#3730a3' }}>Foreign</span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>Local</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{s.currency || '—'}</td>
                      {canWrite && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openSupplierEdit(s)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Edit">
                              <Pencil size={15} style={{ color: 'var(--teal)' }} />
                            </button>
                            <button onClick={() => setDeleteSupplierConfirm(s.id)} className="p-2 rounded-lg hover:bg-red-50 transition-colors" title="Delete">
                              <Trash2 size={15} className="text-red-500" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Delete Supplier Confirm */}
          {deleteSupplierConfirm && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
                <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Delete Supplier</h3>
                <p className="text-sm mb-6" style={{ color: 'var(--mid-gray)' }}>Are you sure you want to deactivate this supplier?</p>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setDeleteSupplierConfirm(null)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
                  <button onClick={() => handleSupplierDelete(deleteSupplierConfirm)} className="px-4 py-2 rounded-lg text-sm text-white bg-red-500 hover:bg-red-600">Delete</button>
                </div>
              </div>
            </div>
          )}

          {/* Add/Edit Supplier Modal */}
          {supplierModalOpen && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                    {editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
                  </h3>
                  <button onClick={() => setSupplierModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X size={20} style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </div>

                {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>}

                <form onSubmit={handleSupplierSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Supplier Name</label>
                    <input type="text" value={sName} onChange={(e) => setSName(e.target.value)} required
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Email</label>
                    <input type="email" value={sEmail} onChange={(e) => setSEmail(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Contact Number</label>
                    <input type="text" value={sContact} onChange={(e) => setSContact(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--charcoal)' }}>
                    <input type="checkbox" checked={sForeign} onChange={(e) => setSForeign(e.target.checked)} className="rounded" />
                    Foreign Supplier
                  </label>
                  {sForeign && (
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Currency</label>
                      <select value={sCurrency} onChange={(e) => setSCurrency(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                        {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Address</label>
                    <input type="text" value={sAddress} onChange={(e) => setSAddress(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Notes</label>
                    <textarea value={sNotes} onChange={(e) => setSNotes(e.target.value)} rows={2}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setSupplierModalOpen(false)}
                      className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                      style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                    <button type="submit" disabled={saving}
                      className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                      style={{ background: 'var(--teal)' }}>
                      {saving ? 'Saving...' : editingSupplier ? 'Update Supplier' : 'Add Supplier'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════
         TAB 3: ADJUSTMENTS
         ════════════════════════════════════════════════════ */}
      {activeTab === 'Adjustments' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>Track inventory adjustments and corrections</p>
            {canWrite && (
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  const csv = 'sku,quantity,foreign_cost_per_unit,currency\nOT-EQP-FIN-001,10,23,CNY\nOT-EQP-GRS-001,5,15,CNY'
                  const blob = new Blob([csv], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = 'bulk-adjustment-template.csv'; a.click()
                  URL.revokeObjectURL(url)
                }}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                  <Download size={14} /> CSV Template
                </button>
                <button onClick={() => setBulkModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border"
                  style={{ borderColor: 'var(--teal)', color: 'var(--teal)', background: 'var(--pale-teal)' }}>
                  <Upload size={14} /> Bulk Upload
                </button>
                <button onClick={openAdjCreate}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: 'var(--teal)' }}>
                  <Plus size={18} /> New Adjustment
                </button>
              </div>
            )}
          </div>

          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Date</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Item</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Type</th>
                    <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Qty Change</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Prev → New</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Remarks</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Adjusted By</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                        <ArrowUpDown size={32} className="mx-auto mb-2 opacity-40" />
                        <p>No adjustments</p>
                      </td>
                    </tr>
                  ) : adjustments.map((adj) => (
                    <tr key={adj.id} className="border-t hover:bg-gray-50/50 transition-colors" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{formatDate(adj.adjustmentDate)}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{adj.item?.sku}</span>
                        <span className="text-xs ml-2" style={{ color: 'var(--mid-gray)' }}>{adj.item?.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-md text-xs font-medium"
                          style={adj.type === 'SHRINKAGE' ? { background: '#fef2f2', color: '#dc2626' } : { background: '#dcfce7', color: '#166534' }}>
                          {adj.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium" style={{ color: adj.type === 'SHRINKAGE' ? '#dc2626' : '#166534' }}>
                        {adj.type === 'SHRINKAGE' ? '-' : '+'}{adj.quantityChange}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                        {adj.previousQuantity} → {adj.newQuantity}
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[180px] truncate" style={{ color: 'var(--mid-gray)' }}>{adj.remarks || '—'}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{adj.adjustedBy?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* New Adjustment Modal */}
          {adjModalOpen && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>New Adjustment</h3>
                  <button onClick={() => setAdjModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X size={20} style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </div>

                {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>}

                <form onSubmit={handleAdjSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Item</label>
                    <select value={adjItemId} onChange={(e) => setAdjItemId(e.target.value)} required
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">— Select item —</option>
                      {allItems.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Type</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--charcoal)' }}>
                        <input type="radio" name="adjType" checked={adjType === 'SHRINKAGE'} onChange={() => setAdjType('SHRINKAGE')} /> Shrinkage
                      </label>
                      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--charcoal)' }}>
                        <input type="radio" name="adjType" checked={adjType === 'INCREASE'} onChange={() => setAdjType('INCREASE')} /> Increase
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Quantity Change</label>
                    <input type="number" min="1" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} required
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Adjustment Date</label>
                    <input type="date" value={adjDate} onChange={(e) => setAdjDate(e.target.value)} required
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Remarks</label>
                    <textarea value={adjRemarks} onChange={(e) => setAdjRemarks(e.target.value)} required rows={2}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  {/* Preview */}
                  {adjItemId && adjQty && (
                    <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>
                      Previous: <strong>{adjPrevQty}</strong> → New: <strong>{adjNewQty}</strong>
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setAdjModalOpen(false)}
                      className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                      style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                    <button type="submit" disabled={saving}
                      className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                      style={{ background: 'var(--teal)' }}>
                      {saving ? 'Saving...' : 'Record Adjustment'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Bulk Upload Modal */}
          {bulkModalOpen && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto">
              <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-xl mb-8 relative">
                <button onClick={() => { setBulkModalOpen(false); setBulkStep('upload'); setBulkCsvData([]); setBulkResult(null) }}
                  className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg"><X size={20} style={{ color: 'var(--mid-gray)' }} /></button>

                <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                  Bulk Inventory Adjustment
                </h3>

                {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600 flex items-center gap-1"><AlertCircle size={14} />{error}</div>}

                {/* Step 1: Upload CSV */}
                {bulkStep === 'upload' && (
                  <div className="space-y-4">
                    <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
                      Upload a CSV file with columns: <code className="bg-gray-100 px-1 rounded">sku, quantity, foreign_cost_per_unit, currency</code>
                    </p>
                    <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = (ev) => {
                        const text = ev.target?.result as string
                        const lines = text.trim().split('\n')
                        const header = lines[0].toLowerCase()
                        if (!header.includes('sku') || !header.includes('quantity')) {
                          setError('CSV must have columns: sku, quantity, foreign_cost_per_unit, currency')
                          return
                        }
                        const rows = lines.slice(1).map(line => {
                          const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
                          return {
                            sku: cols[0] || '',
                            quantity: parseInt(cols[1]) || 0,
                            foreignCostPerUnit: parseFloat(cols[2]) || 0,
                            currency: cols[3] || 'CNY',
                          }
                        }).filter(r => r.sku && r.quantity > 0)
                        if (rows.length === 0) { setError('No valid rows found in CSV'); return }
                        setBulkCsvData(rows)
                        setBulkStep('review')
                        setError('')
                      }
                      reader.readAsText(file)
                    }} />
                    <button onClick={() => fileInputRef.current?.click()}
                      className="w-full py-8 rounded-xl border-2 border-dashed text-sm flex flex-col items-center gap-2 hover:bg-gray-50"
                      style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                      <Upload size={24} />
                      Click to select CSV file
                    </button>
                  </div>
                )}

                {/* Step 2: Review + Enter local payment */}
                {bulkStep === 'review' && (
                  <div className="space-y-4">
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: 'var(--off-white)' }}>
                            {['SKU', 'Qty', 'Cost/Unit', 'Currency', 'Line Total'].map(h => (
                              <th key={h} className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {bulkCsvData.map((r, idx) => (
                            <tr key={idx} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                              <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                              <td className="px-3 py-2">{r.quantity}</td>
                              <td className="px-3 py-2">{r.foreignCostPerUnit.toLocaleString()}</td>
                              <td className="px-3 py-2">{r.currency}</td>
                              <td className="px-3 py-2 font-medium">{(r.foreignCostPerUnit * r.quantity).toLocaleString()} {r.currency}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: 'var(--off-white)' }}>
                            <td colSpan={4} className="px-3 py-2 text-right font-semibold text-xs">Total Foreign Cost:</td>
                            <td className="px-3 py-2 font-bold">
                              {bulkCsvData.reduce((s, r) => s + r.foreignCostPerUnit * r.quantity, 0).toLocaleString()} {bulkCsvData[0]?.currency || 'CNY'}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>
                          Total Paid in PHP *
                        </label>
                        <input type="number" min={0} step="0.01" value={bulkLocalPayment}
                          onChange={e => setBulkLocalPayment(e.target.value)}
                          placeholder="e.g. 8000"
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                        {bulkLocalPayment && parseFloat(bulkLocalPayment) > 0 && (
                          <p className="text-xs mt-1 font-medium" style={{ color: 'var(--deep-teal)' }}>
                            Exchange rate: 1 {bulkCsvData[0]?.currency || 'FX'} = {(parseFloat(bulkLocalPayment) / bulkCsvData.reduce((s, r) => s + r.foreignCostPerUnit * r.quantity, 0)).toFixed(4)} PHP
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>
                          Freight Cost (PHP) <span className="font-normal">(optional)</span>
                        </label>
                        <input type="number" min={0} step="0.01" value={bulkFreight}
                          onChange={e => setBulkFreight(e.target.value)}
                          placeholder="e.g. 5000"
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                        {bulkFreight && parseFloat(bulkFreight) > 0 && (
                          <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                            Distributed pro-rata by product cost
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Remarks</label>
                      <input value={bulkRemarks} onChange={e => setBulkRemarks(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>

                    <div className="flex gap-2">
                      <button
                        disabled={bulkSubmitting || !bulkLocalPayment || parseFloat(bulkLocalPayment) <= 0}
                        onClick={async () => {
                          setBulkSubmitting(true); setError('')
                          try {
                            const res = await fetch('/api/inventory/adjustments/bulk', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                items: bulkCsvData.map(r => ({ sku: r.sku, quantity: r.quantity, foreignCostPerUnit: r.foreignCostPerUnit, foreignCurrency: r.currency })),
                                localPaymentTotal: parseFloat(bulkLocalPayment),
                                freightCost: bulkFreight ? parseFloat(bulkFreight) : 0,
                                adjustmentDate: new Date().toISOString().split('T')[0],
                                remarks: bulkRemarks,
                              }),
                            })
                            const data = await res.json()
                            if (!res.ok) { setError(data.error || 'Bulk upload failed'); setBulkSubmitting(false); return }
                            setBulkResult(data)
                            setBulkStep('result')
                            fetchAdjustments(); fetchItems(); fetchAllItems()
                          } catch { setError('Bulk upload failed') }
                          finally { setBulkSubmitting(false) }
                        }}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                        style={{ background: 'var(--teal)' }}>
                        {bulkSubmitting && <Loader2 className="animate-spin" size={14} />}
                        Process Bulk Adjustment
                      </button>
                      <button onClick={() => { setBulkStep('upload'); setBulkCsvData([]) }}
                        className="px-4 py-2.5 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                        Back
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Result */}
                {bulkStep === 'result' && bulkResult && (
                  <div className="space-y-4">
                    <div className="rounded-xl p-4" style={{ background: '#dcfce7' }}>
                      <p className="text-sm font-semibold" style={{ color: '#166534' }}>Bulk adjustment completed successfully!</p>
                      <p className="text-xs mt-1" style={{ color: '#166534' }}>
                        {bulkResult.items?.length || 0} items processed &middot;
                        Exchange rate: 1 {bulkCsvData[0]?.currency || 'FX'} = {bulkResult.exchangeRate} PHP
                      </p>
                    </div>

                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: 'var(--off-white)' }}>
                            {['SKU', 'Product', 'Qty', 'Landed Cost/Unit', 'Freight Alloc.'].map(h => (
                              <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(bulkResult.items || []).map((r, idx) => (
                            <tr key={idx} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                              <td className="px-3 py-2 font-mono">{r.sku}</td>
                              <td className="px-3 py-2">{r.name}</td>
                              <td className="px-3 py-2">{r.quantity}</td>
                              <td className="px-3 py-2 font-medium" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(r.landedCostPerUnit)}</td>
                              <td className="px-3 py-2">{formatCurrency(r.freightAllocation)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <button onClick={() => { setBulkModalOpen(false); setBulkStep('upload'); setBulkCsvData([]); setBulkResult(null) }}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>
                      Done
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════
         TAB 4: CONSIGNMENTS
         ════════════════════════════════════════════════════ */}
      {activeTab === 'Consignments' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>Track inter-branch consignment transfers</p>
            {canWrite && (
              <button onClick={openConCreate}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: 'var(--teal)' }}>
                <Plus size={18} />
                New Transfer
              </button>
            )}
          </div>

          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Date</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Item</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>From → To</th>
                    <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Qty</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Status</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Requested By</th>
                    {canWrite && <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {consignments.length === 0 ? (
                    <tr>
                      <td colSpan={canWrite ? 7 : 6} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                        <ArrowRightLeft size={32} className="mx-auto mb-2 opacity-40" />
                        <p>No transfers</p>
                      </td>
                    </tr>
                  ) : consignments.map((c) => {
                    const badge = STATUS_BADGE[c.status] || STATUS_BADGE.CANCELLED
                    return (
                      <tr key={c.id} className="border-t hover:bg-gray-50/50 transition-colors" style={{ borderColor: 'var(--light-gray)' }}>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{formatDate(c.createdAt)}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{c.item?.sku}</span>
                          <span className="text-xs ml-2" style={{ color: 'var(--mid-gray)' }}>{c.item?.name}</span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                          {BRANCH_LABELS[c.fromBranch] || c.fromBranch}
                          <ArrowRight size={12} className="inline mx-1" />
                          {BRANCH_LABELS[c.toBranch] || c.toBranch}
                        </td>
                        <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--charcoal)' }}>{c.quantity}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 rounded-md text-xs font-medium" style={{ background: badge.bg, color: badge.color }}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{c.requestedBy?.name || '—'}</td>
                        {canWrite && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {c.status === 'PENDING' && (
                                <>
                                  <button onClick={() => handleConAction(c.id, 'approve')}
                                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                                    style={{ background: 'var(--teal)' }} title="Approve">
                                    <CheckCircle2 size={14} className="inline mr-1" />Approve
                                  </button>
                                  <button onClick={() => handleConAction(c.id, 'cancel')}
                                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors" title="Cancel">
                                    <XCircle size={14} className="inline mr-1" />Cancel
                                  </button>
                                </>
                              )}
                              {c.status === 'APPROVED' && (
                                <button onClick={() => handleConAction(c.id, 'ship')}
                                  className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                                  style={{ background: '#4f46e5' }} title="Ship">
                                  <Send size={14} className="inline mr-1" />Ship
                                </button>
                              )}
                              {c.status === 'SHIPPED' && (
                                <>
                                  <button onClick={() => handleConAction(c.id, 'receive')}
                                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                                    style={{ background: '#16a34a' }} title="Receive">
                                    <CheckCircle2 size={14} className="inline mr-1" />Receive
                                  </button>
                                  <button onClick={() => handleConAction(c.id, 'return')}
                                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                                    style={{ background: '#db2777' }} title="Return">
                                    <RotateCcw size={14} className="inline mr-1" />Return
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* New Transfer Modal */}
          {conModalOpen && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>New Transfer</h3>
                  <button onClick={() => setConModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X size={20} style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </div>

                {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>}

                <form onSubmit={handleConSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Item</label>
                    <select value={conItemId} onChange={(e) => { setConItemId(e.target.value); setConToBranch('') }} required
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">— Select item —</option>
                      {allItems.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name} ({BRANCH_LABELS[i.branch]})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>From Branch</label>
                    <input type="text" readOnly value={selectedConItem ? (BRANCH_LABELS[selectedConItem.branch] || selectedConItem.branch) : ''}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none bg-gray-50" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>To Branch</label>
                    <select value={conToBranch} onChange={(e) => setConToBranch(e.target.value)} required
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">— Select destination —</option>
                      {BRANCH_OPTIONS.filter((b) => b.value !== selectedConItem?.branch).map((b) => (
                        <option key={b.value} value={b.value}>{b.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                      Quantity {selectedConItem && <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(max: {selectedConItem.quantity})</span>}
                    </label>
                    <input type="number" min="1" max={selectedConItem?.quantity || undefined} value={conQty} onChange={(e) => setConQty(e.target.value)} required
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                      Remarks <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(optional)</span>
                    </label>
                    <textarea value={conRemarks} onChange={(e) => setConRemarks(e.target.value)} rows={2}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setConModalOpen(false)}
                      className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                      style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                    <button type="submit" disabled={saving}
                      className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                      style={{ background: 'var(--teal)' }}>
                      {saving ? 'Saving...' : 'Create Transfer'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
