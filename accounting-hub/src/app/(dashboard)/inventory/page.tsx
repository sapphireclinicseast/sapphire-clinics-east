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
} from 'lucide-react'
import JsBarcode from 'jsbarcode'
import { formatCurrency, formatDate } from '@/lib/utils'

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
    GEN: { label: 'General', subcategories: { STK: 'Stickers', EMB: 'Car Emblems', TLS: 'Tagless Shirt' } },
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
  branch: string
  skuDepartment: string
  skuCategory: string
  skuSubcategory: string
  accountSubType: string | null
  quantity: number
  unitCost: number
  sellingPrice: number | null
  reorderLevel: number | null
  supplierId: string | null
  supplier?: { id: string; supplierName: string; isForeign: boolean; currency: string } | null
  supplierExchangeRate: number | null
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
  const [fInitialQty, setFInitialQty] = useState('')
  const [fReorderLevel, setFReorderLevel] = useState('')
  const [fSupplierId, setFSupplierId] = useState('')
  const [fExchangeRate, setFExchangeRate] = useState('')
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

  useEffect(() => {
    if (!session?.user) return
    setLoading(true)
    Promise.all([fetchItems(), fetchAllItems(), fetchSuppliers(), fetchAllSuppliers(), fetchAdjustments(), fetchConsignments()])
      .finally(() => setLoading(false))
  }, [session, fetchItems, fetchAllItems, fetchSuppliers, fetchAllSuppliers, fetchAdjustments, fetchConsignments])

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

  if (!session?.user || loading) {
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
    setFBranch('SANDBOX_EAST'); setFSubType(''); setFUnitCost(''); setFSellingPrice('')
    setFInitialQty(''); setFReorderLevel(''); setFSupplierId(''); setFExchangeRate('')
    setShowInlineSupplier(false); setError('')
    setItemModalOpen(true)
  }

  function openItemEdit(item: InventoryItem) {
    setEditingItem(item)
    setFName(item.name)
    // Parse SKU parts
    const parts = item.sku.split('-')
    setFSkuDept(parts[0] || ''); setFSkuCat(parts[1] || ''); setFSkuSub(parts[2] || '')
    setFSkuValue(item.sku)
    setFBranch(item.branch)
    setFSubType(item.accountSubType || '')
    setFUnitCost(String(item.unitCost))
    setFSellingPrice(item.sellingPrice != null ? String(item.sellingPrice) : '')
    setFInitialQty(String(item.quantity))
    setFReorderLevel(item.reorderLevel != null ? String(item.reorderLevel) : '')
    setFSupplierId(item.supplierId || '')
    setFExchangeRate(item.supplierExchangeRate != null ? String(item.supplierExchangeRate) : '')
    setShowInlineSupplier(false); setError('')
    setItemModalOpen(true)
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
          defaultExchangeRate: inlineSForeign && inlineSRate ? parseFloat(inlineSRate) : null,
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
      quantity: fInitialQty || '0',
      reorderLevel: fReorderLevel || null,
      supplierId: fSupplierId || null,
      supplierExchangeRate: fExchangeRate || null,
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
      defaultExchangeRate: sForeign && sRate ? parseFloat(sRate) : null,
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
              <button
                onClick={openItemCreate}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: 'var(--teal)' }}
              >
                <Plus size={18} />
                Add Item
              </button>
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
                          <div className="grid grid-cols-2 gap-2">
                            <input type="text" placeholder="Currency (e.g. USD)" value={inlineSCurrency} onChange={(e) => setInlineSCurrency(e.target.value)}
                              className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                            <input type="number" step="0.01" placeholder="Exchange Rate" value={inlineSRate} onChange={(e) => setInlineSRate(e.target.value)}
                              className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
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

                  {/* Exchange Rate (if foreign supplier) */}
                  {selectedFormSupplier?.isForeign && (
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                        Exchange Rate <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(1 {selectedFormSupplier.currency || 'FX'} = ? PHP)</span>
                      </label>
                      <input type="number" step="0.01" min="0" value={fExchangeRate} onChange={(e) => setFExchangeRate(e.target.value)}
                        placeholder={selectedFormSupplier.defaultExchangeRate ? String(selectedFormSupplier.defaultExchangeRate) : ''}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
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
                    <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Exchange Rate</th>
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
                      <td className="px-4 py-3 text-right text-xs" style={{ color: 'var(--mid-gray)' }}>{s.defaultExchangeRate != null ? Number(s.defaultExchangeRate).toFixed(2) : '—'}</td>
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
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Currency</label>
                        <input type="text" value={sCurrency} onChange={(e) => setSCurrency(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Default Exchange Rate</label>
                        <input type="number" step="0.01" min="0" value={sRate} onChange={(e) => setSRate(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
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
              <button onClick={openAdjCreate}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: 'var(--teal)' }}>
                <Plus size={18} />
                New Adjustment
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
