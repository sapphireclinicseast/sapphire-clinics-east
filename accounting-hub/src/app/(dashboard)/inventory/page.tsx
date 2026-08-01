'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
  FileText,
  ChevronUp,
  ChevronDown,
  History,
  ClipboardCheck,
  TrendingUp,
  TrendingDown,
  Gift,
} from 'lucide-react'
import { WEBSITE_CLASSIFICATIONS } from '@/lib/website-classification'
import JsBarcode from 'jsbarcode'
import { formatCurrency, formatDate } from '@/lib/utils'
import { downloadXlsx, downloadPdf } from '@/lib/export'
import { ScanUpload } from '@/components/ScanUpload'
import SkuGuidePanel from './SkuGuidePanel'
import { SKU_HIERARCHY } from '@/lib/sku-taxonomy'
import DownloadMenu from '@/components/ui/DownloadMenu'
import Pagination from '@/components/ui/Pagination'

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

  // Facebook, Instagram, TikTok SVG icons (all black)
  const fbIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="#000"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`
  const igIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="#000"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`
  const ttIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="#000"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13.2a8.16 8.16 0 005.58 2.17V11.9a4.81 4.81 0 01-3.15-1.13V6.69h3.15z"/></svg>`

  const stickerHtml = `
    <div style="width:100%;height:calc(100%/3);box-sizing:border-box;border-bottom:1px dashed #999;padding:5mm 5mm;display:flex;align-items:center;gap:3mm;font-family:Arial,Helvetica,sans-serif">
      <div style="flex:1;text-align:center">
        <div style="margin-bottom:1.5mm">
          <span style="font-size:13px;font-weight:900;color:#000;letter-spacing:0.3px">PROGRESS, MADE </span>
          <span style="font-size:14px;font-weight:900;color:#000;font-family:'Brush Script MT',cursive,serif;font-style:italic">Possible</span>
        </div>
        <div style="font-size:9px;font-weight:700;color:#000;margin-bottom:0.5mm">${item.name}</div>
        <div style="font-size:8px;color:#000;margin-bottom:1mm">${sku}</div>
        <img src="${barcodeDataUrl}" style="height:32px;max-width:160px" />
        <div style="margin-top:1.5mm;font-size:6.5px;font-weight:700;color:#000;letter-spacing:0.5px">HTTPS://VERDANAREHAB.COM/</div>
        <div style="margin-top:1mm;display:flex;justify-content:center;align-items:center;gap:8px;font-size:6.5px;color:#000">
          <span style="display:flex;align-items:center;gap:2px">${fbIcon} @verdanarehab</span>
          <span style="display:flex;align-items:center;gap:2px">${igIcon} @verdanarehab</span>
          <span style="display:flex;align-items:center;gap:2px">${ttIcon} @verdanarehab</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;min-width:60px;padding:3mm 6mm 3mm 3mm">
        <img src="${logoWordUrl}" style="width:60px;height:70px;object-fit:contain;filter:brightness(0)" />
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

/* ── Consignment Transmittal Form PDF ──────────────────────── */

interface TransmittalData {
  referenceNumber: string | null
  date: string
  fromBranch: string
  toBranch: string
  requestedBy: string
  status: string
  items: { sku: string; name: string; quantity: number; remarks: string | null }[]
  // Fillable fields from modal
  fromStaff?: string
  fromPosition?: string
  fromContact?: string
  toReceiver?: string
  toContact?: string
  releasedName?: string
  releasedDate?: string
  releasedContact?: string
  receivedName?: string
  receivedDate?: string
  receivedContact?: string
}

function generateTransmittalPDF(data: TransmittalData) {
  const logoUrl = `${window.location.origin}/brand/sandbox-clinic-logo.png`
  const today = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })

  // Build item rows — always 10 rows minimum (matching transmittal form)
  const padded = [...data.items]
  while (padded.length < 10) padded.push({ sku: '', name: '', quantity: 0, remarks: '' })

  const itemRows = padded.map((item, i) => `
    <tr>
      <td class="no">${i + 1}</td>
      <td class="particular">${item.sku ? `<span class="sku">${item.sku}</span> ${item.name}` : ''}</td>
      <td class="qty">${item.quantity || ''}</td>
      <td class="remarks">${item.remarks || ''}</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Consignment Transmittal Form${data.referenceNumber ? ' — ' + data.referenceNumber : ''}</title>
<style>
  @page { size: A4 portrait; margin: 0.6in 0.75in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1A1A1A; font-size: 11pt; }

  .header { display: flex; align-items: center; gap: 20px; margin-bottom: 6px; }
  .header img { width: 80px; height: auto; }
  .header-text { flex: 1; }
  .company-name { font-size: 10pt; color: #666; }
  .form-title { font-size: 18pt; font-weight: 700; text-align: center; margin: 2px 0 16px; letter-spacing: 1px; }

  .meta-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 10pt; }
  .meta-row .label { font-weight: 600; font-style: italic; }
  .meta-row .value { border-bottom: 1px solid #333; min-width: 200px; padding-left: 4px; }
  .meta-row .ref-value { border-bottom: 1px solid #333; min-width: 220px; padding-left: 4px; }

  .section-label { font-weight: 600; font-style: italic; font-size: 10pt; margin-bottom: 4px; }
  .info-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10pt; }
  .info-table td { border: 1px solid #333; padding: 4px 8px; }
  .info-table .field-label { font-weight: 600; width: 180px; background: #f9f9f9; }

  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 10pt; }
  .items-table th { border: 1px solid #333; padding: 6px 8px; font-weight: 700; background: #f0f0f0; text-align: left; }
  .items-table td { border: 1px solid #333; padding: 5px 8px; height: 24px; }
  .items-table .no { width: 40px; text-align: center; }
  .items-table .particular { }
  .items-table .qty { width: 60px; text-align: center; }
  .items-table .remarks { width: 160px; }
  .items-table .sku { font-family: 'Courier New', monospace; font-size: 9pt; color: #555; }

  .signatures { display: flex; justify-content: space-between; margin-top: 30px; font-size: 10pt; }
  .sig-block { width: 45%; }
  .sig-block .sig-title { font-weight: 600; margin-bottom: 16px; }
  .sig-block .sig-field { display: flex; margin-bottom: 6px; }
  .sig-block .sig-label { width: 80px; font-weight: 500; }
  .sig-block .sig-line { flex: 1; border-bottom: 1px solid #333; min-height: 18px; }

  .status-badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 9pt; font-weight: 600; }
  .status-PENDING { background: #fef3c7; color: #92400e; }
  .status-APPROVED { background: #dbeafe; color: #1e40af; }
  .status-SHIPPED { background: #e0e7ff; color: #3730a3; }
  .status-RECEIVED { background: #dcfce7; color: #166534; }
  .status-RETURNED { background: #fce7f3; color: #9d174d; }
  .status-CANCELLED { background: #fee2e2; color: #991b1b; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <img src="${logoUrl}" alt="Aura Health Rehab Clinic Logo" />
    <div class="header-text">
      <div class="company-name">Sapphire Clinics East Incorporated</div>
      <div class="company-name">Multi-Specialty Clinic and Rehabilitation Center</div>
    </div>
  </div>

  <div class="form-title">CONSIGNMENT TRANSMITTAL FORM</div>

  <!-- Meta row: Date & Reference Number -->
  <div class="meta-row">
    <div>
      <span class="label">Date Transmittal: </span>
      <span class="value">${today}</span>
    </div>
    <div>
      <span class="label">Reference No: </span>
      <span class="ref-value">${data.referenceNumber || '—'}</span>
    </div>
  </div>

  <!-- From section -->
  <div class="section-label">From:</div>
  <table class="info-table">
    <tr><td class="field-label">Aura Health Rehab Clinic Branch</td><td>${data.fromBranch}</td></tr>
    <tr><td class="field-label">Staff Name</td><td>${data.fromStaff || data.requestedBy}</td></tr>
    <tr><td class="field-label">Position & Contact No.</td><td>${[data.fromPosition, data.fromContact].filter(Boolean).join(' — ')}</td></tr>
  </table>

  <!-- To section -->
  <div class="section-label">To:</div>
  <table class="info-table">
    <tr><td class="field-label">Receiver's Name</td><td>${data.toReceiver || ''}</td></tr>
    <tr><td class="field-label">Branch</td><td>${data.toBranch}</td></tr>
    <tr><td class="field-label">Contact No.</td><td>${data.toContact || ''}</td></tr>
  </table>

  <!-- Status -->
  <div style="margin-bottom: 12px; font-size: 10pt;">
    <span style="font-weight: 600;">Status: </span>
    <span class="status-badge status-${data.status}">${data.status}</span>
  </div>

  <!-- Items table -->
  <table class="items-table">
    <thead>
      <tr>
        <th class="no">No.</th>
        <th class="particular">Particular (SKU & Item Name)</th>
        <th class="qty">Qty</th>
        <th class="remarks">Remarks</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <!-- Signatures -->
  <div class="signatures">
    <div class="sig-block">
      <div class="sig-title">Released By:</div>
      <div class="sig-field"><span class="sig-label">Name:</span><span class="sig-line">${data.releasedName || ''}</span></div>
      <div class="sig-field"><span class="sig-label">Signature:</span><span class="sig-line"></span></div>
      <div class="sig-field"><span class="sig-label">Date:</span><span class="sig-line">${data.releasedDate || ''}</span></div>
      <div class="sig-field"><span class="sig-label">Contact No.</span><span class="sig-line">${data.releasedContact || ''}</span></div>
    </div>
    <div class="sig-block">
      <div class="sig-title">Received By:</div>
      <div class="sig-field"><span class="sig-label">Name:</span><span class="sig-line">${data.receivedName || ''}</span></div>
      <div class="sig-field"><span class="sig-label">Signature:</span><span class="sig-line"></span></div>
      <div class="sig-field"><span class="sig-label">Date:</span><span class="sig-line">${data.receivedDate || ''}</span></div>
      <div class="sig-field"><span class="sig-label">Contact No.</span><span class="sig-line">${data.receivedContact || ''}</span></div>
    </div>
  </div>
</body></html>`

  const win = window.open('', '_blank', 'width=800,height=1100')
  if (!win) return
  win.document.write(html)
  win.document.close()
  // Wait for logo to load then trigger print
  const img = win.document.querySelector('img')
  if (img && !img.complete) {
    img.onload = () => setTimeout(() => win.print(), 300)
    img.onerror = () => setTimeout(() => win.print(), 300)
  } else {
    setTimeout(() => win.print(), 500)
  }
}

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */


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
  { value: 'SANDBOX_EAST', label: 'East Branch' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
  { value: 'VERDANA_STORE', label: 'Verdana Store' },
  { value: 'AURA_INSTITUTE', label: 'Aura Health Institute' },
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

const TABS = ['Inventory', 'SKU Guide', 'Suppliers', 'Adjustments', 'Consignments', 'Forms'] as const
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
  imageUrl?: string | null
  branch: string
  isActive?: boolean
  skuDepartment: string
  skuCategory: string
  skuSubcategory: string
  accountSubType: string | null
  quantity: number
  branchStock?: Record<string, number> | null
  unitCost: number
  sellingPrice: number | null
  rewardPointsPrice: number | null
  reorderLevel: number | null
  supplierId: string | null
  supplier?: { id: string; supplierName: string; isForeign: boolean; currency: string } | null
  supplierExchangeRate: number | null
  revenueAccountId?: string | null
  revenueAccount?: { id: string; accountNumber: string; accountTitle: string } | null
  sourceAccountId?: string | null
  sourceAccount?: { id: string; accountNumber: string; accountTitle: string } | null
  expenseAccountId?: string | null
  expenseAccount?: { id: string; accountNumber: string; accountTitle: string } | null
  variants?: { id: string; variantType: string; variantLabel: string; color?: string; quantity: number; variantSku: string; barcode?: string | null }[]
  isBundle?: boolean
  issuedOfficialInvoice?: boolean
  isPreOrder?: boolean
  websiteClassification?: string | null
  bundleComponents?: { id: string; quantity: number; component: { id: string; name: string; sku: string; quantity: number } }[]
  dimensionLength?: number | null
  dimensionWidth?: number | null
  dimensionHeight?: number | null
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
  referenceNumber?: string | null
  batchRefId?: string | null
  batch?: { referenceNumber: string } | null
  displayRef?: string | null
  localCost?: number | string | null
}

// Reference number for a single adjustment. Older rows (opening batch, stock-in)
// carry no stored ref, so derive a stable one from the date + id: ADJ-YYYYMMDD-XXXXX.
function genAdjRef(adj: { id: string; adjustmentDate: string }): string {
  const d = new Date(adj.adjustmentDate)
  const ymd = isNaN(d.getTime())
    ? '00000000'
    : `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `ADJ-${ymd}-${adj.id.slice(-5).toUpperCase()}`
}

interface FbRow {
  itemId: string
  itemName: string
  itemSku: string
  dimL: string
  dimW: string
  dimH: string
  manPrice: string
  manPriceIsForeign: boolean
  quantity: string
}

// Foreign-currency bank account offered as the FX source of a freight purchase,
// with the weighted rate its money was actually bought at (from Fund Transfer /
// Bank Recon forex history).
interface FxAccount {
  id: string
  accountNumber: string
  accountTitle: string
  currency: string
  balance: number
  weightedRate: number | null
  phpTotal: number
  fxTotal: number
  purchases: { refNumber: string; date: string; php: number; foreign: number; rate: number | null }[]
  fallbackRate: { phpPerUnit: number; date: string; source: string } | null
}

interface RfpOption {
  id: string
  refNumber: string
  grossTotal: number
  status: string
  module: string
  branch: string
  payableTo: string | null
  paidAt: string | null
}

interface Consignment {
  id: string
  referenceNumber?: string | null
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

interface FormReceipt {
  id: string
  branch: string
  formType: string
  dateReceived: string
  fromControl: string
  toControl: string
  quantity: number
  remarks: string | null
  createdByName?: string | null
  createdAt: string
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

  // ── Pagination
  const [invPage, setInvPage] = useState(1)
  const [invPageSize, setInvPageSize] = useState(25)
  const [supPage, setSupPage] = useState(1)
  const [supPageSize, setSupPageSize] = useState(25)
  const [adjPage, setAdjPage] = useState(1)
  const [adjPageSize, setAdjPageSize] = useState(25)
  const [conPage, setConPage] = useState(1)
  const [conPageSize, setConPageSize] = useState(25)

  // ── Inventory state
  const [items, setItems] = useState<InventoryItem[]>([])
  const [allItems, setAllItems] = useState<InventoryItem[]>([])
  const [itemSearch, setItemSearch] = useState('')
  const [itemBranchFilter, setItemBranchFilter] = useState('')
  const [itemDeptFilter, setItemDeptFilter] = useState('')
  const [itemWebClassFilter, setItemWebClassFilter] = useState('')
  const [showDisabledItems, setShowDisabledItems] = useState(false)
  const [downloadWithPhotos, setDownloadWithPhotos] = useState(false)
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [deleteItemConfirm, setDeleteItemConfirm] = useState<string | null>(null)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkField, setBulkField] = useState('')
  const [bulkRevenueAccountId, setBulkRevenueAccountId] = useState('')
  const [bulkRevenueSearch, setBulkRevenueSearch] = useState('')
  const [bulkSourceAccountId, setBulkSourceAccountId] = useState('')
  const [bulkSourceSearch, setBulkSourceSearch] = useState('')
  const [bulkExpenseAccountId, setBulkExpenseAccountId] = useState('')
  const [bulkExpenseSearch, setBulkExpenseSearch] = useState('')
  const [bulkSupplierId, setBulkSupplierId] = useState('')
  const [bulkBranch, setBulkBranch] = useState('')
  const [bulkUnitCost, setBulkUnitCost] = useState('')
  const [bulkSellingPrice, setBulkSellingPrice] = useState('')
  const [bulkRewardPoints, setBulkRewardPoints] = useState('')
  const [bulkReorderLevel, setBulkReorderLevel] = useState('')
  const [bulkWebClass, setBulkWebClass] = useState('')
  const [bulkSubType, setBulkSubType] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

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
  const [fDimL, setFDimL] = useState('')
  const [fDimW, setFDimW] = useState('')
  const [fDimH, setFDimH] = useState('')
  const [fRevenueAccountId, setFRevenueAccountId] = useState('')
  const [fRevenueAccountSearch, setFRevenueAccountSearch] = useState('')
  const [revenueAccounts, setRevenueAccounts] = useState<{ id: string; accountNumber: string; accountTitle: string }[]>([])
  const [fSourceAccountId, setFSourceAccountId] = useState('')
  const [fFromPettyCash, setFFromPettyCash] = useState(false)  // set when creating from a petty-cash draft — no bank source, excluded from BS cash outflow
  const [pcfSourceEntryId, setPcfSourceEntryId] = useState<string | null>(null)  // petty-cash/expense entry to stamp "Recorded in Inventory" on save
  const [fSourceAccountSearch, setFSourceAccountSearch] = useState('')
  const [sourceAccounts, setSourceAccounts] = useState<{ id: string; accountNumber: string; accountTitle: string }[]>([])
  const [fExpenseAccountId, setFExpenseAccountId] = useState('')
  const [fExpenseAccountSearch, setFExpenseAccountSearch] = useState('')
  const [expenseAccounts, setExpenseAccounts] = useState<{ id: string; accountNumber: string; accountTitle: string }[]>([])
  // FIFO lot detail popup
  const [showLotDetail, setShowLotDetail] = useState<string | null>(null)
  const [lotData, setLotData] = useState<{ lots: { id: string; adjustmentDate: string; quantityChange: number; remaining: number; costPerUnit: number; foreignCost: number | null; foreignCurrency: string | null; batchId: string | null; remarks: string }[]; initialUnitCost: number | null; summary: { totalLots: number; activeLots: number; totalRemaining: number; weightedAvgCost: number } } | null>(null)
  // Qty movement history popup
  const [showMovements, setShowMovements] = useState<string | null>(null)
  const [movementData, setMovementData] = useState<{
    itemName: string
    currentQty: number
    startingQty: number
    movements: {
      date: string
      type: 'STOCK_IN' | 'SHRINKAGE' | 'SALE' | 'FREE_SAMPLE' | 'ORDER_VOID' | 'CONSIGNMENT'
      qty: number
      direction: number
      balance: number
      costPerUnit: number | null
      reference: string
      remarks: string
      adjustedBy: string | null
    }[]
  } | null>(null)
  // Inventory sort
  const [invSortField, setInvSortField] = useState<'sku' | 'name' | 'branch' | 'dept' | 'qty' | 'unitCost' | 'supplier' | ''>('')
  const [invSortDir, setInvSortDir] = useState<'asc' | 'desc'>('asc')
  // Adjustment delete
  const [deleteAdjConfirm, setDeleteAdjConfirm] = useState<string | null>(null)
  const [deletingAdj, setDeletingAdj] = useState(false)
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
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  const toggleBatch = (id: string) => setExpandedBatches(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  // Collapse freight-batch adjustments into one row each (expandable); others stay standalone.
  const groupedAdjustments = useMemo(() => {
    const out: Array<{ kind: 'batch'; batchRefId: string; ref: string; date: string; by: string; items: Adjustment[] } | { kind: 'single'; adj: Adjustment }> = []
    const seen = new Set<string>()
    for (const a of adjustments) {
      if (a.batchRefId) {
        if (seen.has(a.batchRefId)) continue
        seen.add(a.batchRefId)
        const items = adjustments.filter(x => x.batchRefId === a.batchRefId)
        out.push({ kind: 'batch', batchRefId: a.batchRefId, ref: a.batch?.referenceNumber || a.referenceNumber || '', date: a.adjustmentDate as unknown as string, by: a.adjustedBy?.name || '—', items })
      } else out.push({ kind: 'single', adj: a })
    }
    return out
  }, [adjustments])
  const [adjModalOpen, setAdjModalOpen] = useState(false)
  // Bulk upload state
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [bulkShrinkOpen, setBulkShrinkOpen] = useState(false)
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
  const [adjLocalCost, setAdjLocalCost] = useState('')  // Cost per unit in PHP
  const [adjForeignCost, setAdjForeignCost] = useState('')  // Cost per unit in foreign currency
  const [adjForeignCurrency, setAdjForeignCurrency] = useState('CNY')
  const [adjExchangeRate, setAdjExchangeRate] = useState('')

  // ── Capitalize-freight-into-a-lot state (freight forwarder cost paid via petty cash / expense)
  const [capOpen, setCapOpen] = useState(false)
  const [capEntryId, setCapEntryId] = useState<string | null>(null)   // source petty-cash/expense entry
  const [capAmount, setCapAmount] = useState('')                       // freight to capitalize (net of VAT)
  const [capItemId, setCapItemId] = useState('')                       // item whose batch receives the freight
  const [capLots, setCapLots] = useState<{ id: string; displayRef: string | null; adjustmentDate: string; quantityChange: number; remainingQuantity: number | null; totalLandedCost: number | null; localCost: number | null }[]>([])
  const [capAdjId, setCapAdjId] = useState('')                         // chosen INCREASE lot
  const [capSaving, setCapSaving] = useState(false)

  // ── Freight batch adjustment state
  const [fbOpen, setFbOpen] = useState(false)
  const [fbEditId, setFbEditId] = useState<string | null>(null)
  const [fbLoadingEdit, setFbLoadingEdit] = useState(false)
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null)
  const [fbDate, setFbDate] = useState(new Date().toISOString().split('T')[0])
  const [fbRemarks, setFbRemarks] = useState('')
  const [fbHasForeign, setFbHasForeign] = useState(true)
  const [fbCurrency, setFbCurrency] = useState('CNY')
  const [fbExRate, setFbExRate] = useState('')
  const [fbFreight1, setFbFreight1] = useState('')
  const [fbFreight1Foreign, setFbFreight1Foreign] = useState(false)
  const [fbFreight2, setFbFreight2] = useState('')
  const [fbFreight2Foreign, setFbFreight2Foreign] = useState(false)
  const [fbFreight3, setFbFreight3] = useState('')
  const [fbFreight3Foreign, setFbFreight3Foreign] = useState(false)
  const [fbRows, setFbRows] = useState<FbRow[]>([{ itemId: '', itemName: '', itemSku: '', dimL: '', dimW: '', dimH: '', manPrice: '', manPriceIsForeign: true, quantity: '' }])
  const [fbProofUrls, setFbProofUrls] = useState<string[]>([])
  const [fbUploading, setFbUploading] = useState(false)
  const [fbSaving, setFbSaving] = useState(false)
  // FX source account (auto-computes the exchange rate) + linked payment RFPs
  const [fbFxAccounts, setFbFxAccounts] = useState<FxAccount[]>([])
  const [fbFxAccountId, setFbFxAccountId] = useState('')
  const [fbRfpOptions, setFbRfpOptions] = useState<RfpOption[]>([])
  const [fbManuRfpId, setFbManuRfpId] = useState('')
  const [fbFreightRfpId, setFbFreightRfpId] = useState('')
  const fbFileRef = useRef<HTMLInputElement>(null)

  // ── Consignment state
  const [consignments, setConsignments] = useState<Consignment[]>([])
  const [conModalOpen, setConModalOpen] = useState(false)
  const [conItemId, setConItemId] = useState('')
  const [conToBranch, setConToBranch] = useState('')
  const [conQty, setConQty] = useState('')
  const [conRemarks, setConRemarks] = useState('')
  const [batchItems, setBatchItems] = useState<{ itemId: string; quantity: number; itemName?: string; itemSku?: string }[]>([])
  const [selectedTransferIds, setSelectedTransferIds] = useState<Set<string>>(new Set())
  const [expandedRef, setExpandedRef] = useState<string | null>(null)
  // Consignment item search
  const [conItemSearch, setConItemSearch] = useState('')
  const [conItemDropdownOpen, setConItemDropdownOpen] = useState(false)
  const conSearchRef = useRef<HTMLDivElement>(null)
  // Consignment CSV import state
  const [conCsvModalOpen, setConCsvModalOpen] = useState(false)
  const [conCsvStep, setConCsvStep] = useState<'upload' | 'review' | 'result'>('upload')
  const [conCsvData, setConCsvData] = useState<{ sku: string; quantity: number; toBranch: string; remarks: string; itemName?: string; itemId?: string; error?: string }[]>([])
  const [conCsvSubmitting, setConCsvSubmitting] = useState(false)
  const [conCsvResult, setConCsvResult] = useState<{ success: number; errors: string[] } | null>(null)
  const conCsvFileRef = useRef<HTMLInputElement>(null)

  // ── Consumable Forms state
  const [forms, setForms] = useState<FormReceipt[]>([])
  const [formTemplates, setFormTemplates] = useState<{ templateNo: string; templateName: string; department: string; massProduced: boolean }[]>([])
  const [formsBranchFilter, setFormsBranchFilter] = useState('')
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [formEditId, setFormEditId] = useState<string | null>(null)
  const [frBranch, setFrBranch] = useState('SANDBOX_EAST')
  const [frFormType, setFrFormType] = useState('')
  const [frDate, setFrDate] = useState('')
  const [frFrom, setFrFrom] = useState('')
  const [frTo, setFrTo] = useState('')
  const [frRemarks, setFrRemarks] = useState('')
  const [frSubmitting, setFrSubmitting] = useState(false)
  const [deleteFormConfirm, setDeleteFormConfirm] = useState<string | null>(null)
  const [deletingForm, setDeletingForm] = useState(false)

  // PDF modal state
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [pdfData, setPdfData] = useState<TransmittalData | null>(null)
  const [pdfFromStaff, setPdfFromStaff] = useState('')
  const [pdfFromPosition, setPdfFromPosition] = useState('')
  const [pdfFromContact, setPdfFromContact] = useState('')
  const [pdfToReceiver, setPdfToReceiver] = useState('')
  const [pdfToContact, setPdfToContact] = useState('')
  const [pdfReleasedName, setPdfReleasedName] = useState('')
  const [pdfReleasedDate, setPdfReleasedDate] = useState(new Date().toISOString().split('T')[0])
  const [pdfReleasedContact, setPdfReleasedContact] = useState('')
  const [pdfReceivedName, setPdfReceivedName] = useState('')
  const [pdfReceivedDate, setPdfReceivedDate] = useState('')
  const [pdfReceivedContact, setPdfReceivedContact] = useState('')
  const [issuedOfficialInvoice, setIssuedOfficialInvoice] = useState(false)
  const [isPreOrder, setIsPreOrder] = useState(false)
  const [fWebsiteClass, setFWebsiteClass] = useState('')
  // Bundle state
  const [isBundle, setIsBundle] = useState(false)
  const [bundleComponents, setBundleComponents] = useState<{ id?: string; componentId: string; quantity: number; name?: string; sku?: string; unitCost?: number }[]>([])
  const [bundleComponentId, setBundleComponentId] = useState('')
  const [bundleComponentQty, setBundleComponentQty] = useState(1)

  const canWrite = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN'].includes(session?.user?.role as string)

  // Memoized grouping for consignments (used by both render & download)
  const groupedConsignments = useMemo(() => {
    const groups: { key: string; ref: string | null; items: typeof consignments; first: typeof consignments[0] }[] = []
    const seen = new Set<string>()
    consignments.forEach(c => {
      if (c.referenceNumber) {
        if (seen.has(c.referenceNumber)) return
        seen.add(c.referenceNumber)
        const groupItems = consignments.filter(x => x.referenceNumber === c.referenceNumber)
        groups.push({ key: c.referenceNumber, ref: c.referenceNumber, items: groupItems, first: groupItems[0] })
      } else {
        groups.push({ key: c.id, ref: null, items: [c], first: c })
      }
    })
    return groups
  }, [consignments])

  // Sorted inventory items
  // A base item's stock can be split across branches (consigned to a Sandbox
  // branch). Two representations coexist during the '-SAND' → base merge:
  //  • Unmerged: a separate '<sku>-SAND' row still holds the consigned qty and
  //    this item.quantity is the base-branch-only qty.
  //  • Merged: the '-SAND' row is gone, item.quantity is the TOTAL across
  //    branches, and item.branchStock ({ branch: qty }) records the consigned
  //    portion. `quantity` stays authoritative for FIFO/COGS/BS.
  // Either way we surface a per-branch breakdown + a combined total (display only).
  const branchBreakdown = useMemo(() => {
    const m = new Map<string, { parts: { branch: string; quantity: number }[]; total: number }>()
    const sibsBy = new Map<string, { branch: string; quantity: number }[]>()
    for (const it of items) {
      if (it.sku.endsWith('-SAND')) {
        const base = it.sku.slice(0, -5)
        const arr = sibsBy.get(base) || []
        arr.push({ branch: it.branch, quantity: it.quantity })
        sibsBy.set(base, arr)
      }
    }
    for (const it of items) {
      if (it.sku.endsWith('-SAND')) continue
      const bs = it.branchStock && typeof it.branchStock === 'object' ? it.branchStock : null
      const bsEntries = bs ? Object.entries(bs).map(([branch, quantity]) => ({ branch, quantity: Number(quantity) })).filter(e => e.quantity !== 0) : []
      if (bsEntries.length > 0) {
        const consignedSum = bsEntries.reduce((s, x) => s + x.quantity, 0)
        m.set(it.sku, {
          parts: [{ branch: it.branch, quantity: it.quantity - consignedSum }, ...bsEntries],
          total: it.quantity,
        })
      } else {
        const sibs = sibsBy.get(it.sku)
        if (sibs && sibs.length > 0) {
          m.set(it.sku, {
            parts: [{ branch: it.branch, quantity: it.quantity }, ...sibs],
            total: it.quantity + sibs.reduce((s, x) => s + x.quantity, 0),
          })
        }
      }
    }
    return m
  }, [items])

  const sortedItems = useMemo(() => {
    const visible = items.filter(i => !i.sku.endsWith('-SAND'))
    if (!invSortField) return visible
    const sorted = [...visible].sort((a, b) => {
      let cmp = 0
      switch (invSortField) {
        case 'sku': cmp = a.sku.localeCompare(b.sku); break
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'branch': cmp = a.branch.localeCompare(b.branch); break
        case 'dept': cmp = (a.skuDepartment || '').localeCompare(b.skuDepartment || ''); break
        case 'qty': cmp = a.quantity - b.quantity; break
        case 'unitCost': cmp = Number(a.unitCost) - Number(b.unitCost); break
        case 'supplier': cmp = (a.supplier?.supplierName || '').localeCompare(b.supplier?.supplierName || ''); break
      }
      return invSortDir === 'desc' ? -cmp : cmp
    })
    return sorted
  }, [items, invSortField, invSortDir])

  // Freight batch: total freight in PHP (real-time)
  const fbTotalFreightPHP = useMemo(() => {
    const exRate = fbHasForeign && fbExRate ? parseFloat(fbExRate) : 1
    const f1 = (parseFloat(fbFreight1) || 0) * (fbFreight1Foreign ? exRate : 1)
    const f2 = (parseFloat(fbFreight2) || 0) * (fbFreight2Foreign ? exRate : 1)
    const f3 = (parseFloat(fbFreight3) || 0) * (fbFreight3Foreign ? exRate : 1)
    return f1 + f2 + f3
  }, [fbHasForeign, fbExRate, fbFreight1, fbFreight1Foreign, fbFreight2, fbFreight2Foreign, fbFreight3, fbFreight3Foreign])

  // Freight batch: total paid to the manufacturer (goods only), PHP + foreign.
  const fbGoodsTotals = useMemo(() => {
    let php = 0, foreign = 0
    const exRate = fbHasForeign && fbExRate ? parseFloat(fbExRate) : 1
    fbRows.forEach(r => {
      const qty = parseInt(r.quantity) || 0
      const manPrice = parseFloat(r.manPrice) || 0
      if (!r.itemId || qty <= 0 || manPrice <= 0) return
      if (r.manPriceIsForeign && fbHasForeign) { foreign += manPrice * qty; php += manPrice * exRate * qty }
      else php += manPrice * qty
    })
    return { php, foreign }
  }, [fbRows, fbHasForeign, fbExRate])

  // Freight batch: per-row computed values (CBM, unit cost)
  const fbComputedRows = useMemo(() => {
    const exRate = fbHasForeign && fbExRate ? parseFloat(fbExRate) : 1
    const rowsWithCbm = fbRows.map(r => {
      const l = parseFloat(r.dimL) || 0; const w = parseFloat(r.dimW) || 0; const h = parseFloat(r.dimH) || 0
      const cbmPerUnit = l > 0 && w > 0 && h > 0 ? (l * w * h) / 1_000_000 : 0
      const qty = parseInt(r.quantity) || 0
      return { cbmPerUnit, totalCbm: cbmPerUnit * qty }
    })
    const grandTotalCbm = rowsWithCbm.reduce((s, r) => s + r.totalCbm, 0)
    const validCount = fbRows.filter(r => r.itemId && parseInt(r.quantity) > 0).length
    return fbRows.map((r, i) => {
      const { cbmPerUnit, totalCbm } = rowsWithCbm[i]
      const qty = parseInt(r.quantity) || 0
      const cbmShare = grandTotalCbm > 0 ? totalCbm / grandTotalCbm : (validCount > 0 ? 1 / validCount : 0)
      const freightPerUnit = qty > 0 ? (cbmShare * fbTotalFreightPHP) / qty : 0
      const manPrice = parseFloat(r.manPrice) || 0
      const manPricePHP = r.manPriceIsForeign && fbHasForeign ? manPrice * exRate : manPrice
      const unitCost = manPricePHP + freightPerUnit
      return { cbmPerUnit, totalCbm, freightPerUnit, manPricePHP, unitCost }
    })
  }, [fbRows, fbTotalFreightPHP, fbHasForeign, fbExRate])

  const toggleSort = (field: typeof invSortField) => {
    if (invSortField === field) {
      setInvSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setInvSortField(field)
      setInvSortDir('asc')
    }
    setInvPage(1)
  }

  /* ── Fetchers ──────────────────────────────────────────── */

  const fetchItems = useCallback(async () => {
    try {
      const params = new URLSearchParams({ pageSize: '500' })
      if (itemSearch) params.set('search', itemSearch)
      if (itemBranchFilter) params.set('branch', itemBranchFilter)
      if (itemDeptFilter) params.set('department', itemDeptFilter)
      if (itemWebClassFilter) params.set('websiteClassification', itemWebClassFilter)
      if (showDisabledItems) params.set('includeDisabled', 'true')
      const res = await fetch(`/api/inventory?${params}`)
      const data = await res.json()
      setItems(data.data || [])
    } catch { /* ignore */ }
  }, [itemSearch, itemBranchFilter, itemDeptFilter, itemWebClassFilter, showDisabledItems])

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

  const fetchForms = useCallback(async () => {
    try {
      const qs = formsBranchFilter ? `?branch=${encodeURIComponent(formsBranchFilter)}` : ''
      const res = await fetch(`/api/inventory/forms${qs}`)
      const data = await res.json()
      setForms(data.data || [])
    } catch { /* ignore */ }
  }, [formsBranchFilter])

  const fetchFormTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/form-templates')
      const data = await res.json()
      setFormTemplates(Array.isArray(data.templates) ? data.templates : [])
    } catch { /* ignore — dropdown falls back to free text */ }
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
    Promise.all([fetchItems(), fetchAllItems(), fetchSuppliers(), fetchAllSuppliers(), fetchAdjustments(), fetchConsignments(), fetchForms(), fetchFormTemplates()])
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId])

  // Refetch consumable forms when the branch toggle changes (skip first mount).
  useEffect(() => {
    if (!initialLoaded.current) return
    fetchForms()
  }, [fetchForms])

  const openFormCreate = () => {
    setFormEditId(null)
    setFrBranch(formsBranchFilter || 'SANDBOX_EAST')
    setFrFormType(''); setFrDate(''); setFrFrom(''); setFrTo(''); setFrRemarks('')
    setError(''); setFormModalOpen(true)
  }
  const openFormEdit = (f: FormReceipt) => {
    setFormEditId(f.id)
    setFrBranch(f.branch); setFrFormType(f.formType)
    setFrDate(f.dateReceived ? new Date(f.dateReceived).toISOString().slice(0, 10) : '')
    setFrFrom(f.fromControl); setFrTo(f.toControl); setFrRemarks(f.remarks || '')
    setError(''); setFormModalOpen(true)
  }
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFrSubmitting(true); setError('')
    try {
      const body = { id: formEditId || undefined, branch: frBranch, formType: frFormType, dateReceived: frDate || undefined, fromControl: frFrom, toControl: frTo, remarks: frRemarks }
      const res = await fetch('/api/inventory/forms', { method: formEditId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to save'); return }
      setFormModalOpen(false); fetchForms()
    } catch { setError('Failed to save') } finally { setFrSubmitting(false) }
  }
  const handleFormDelete = async (id: string) => {
    setDeletingForm(true)
    try {
      const res = await fetch(`/api/inventory/forms?id=${id}`, { method: 'DELETE' })
      if (res.ok) { setDeleteFormConfirm(null); fetchForms() }
    } finally { setDeletingForm(false) }
  }

  // Fetch COA accounts for dropdowns
  useEffect(() => {
    if (!sessionUserId) return
    const mapAccounts = (d: { data?: { id: string; accountNumber: string; accountTitle: string }[] }) =>
      (d.data || []).map((a) => ({ id: a.id, accountNumber: a.accountNumber, accountTitle: a.accountTitle }))
    // Revenue + Liability accounts (for revenue account — includes Unearned Revenue for packages)
    Promise.all([
      fetch('/api/chart-of-accounts?accountType=REVENUE&pageSize=500').then(r => r.json()),
      fetch('/api/chart-of-accounts?accountType=LIABILITY&pageSize=500').then(r => r.json()),
    ]).then(([rev, liab]) => setRevenueAccounts([...mapAccounts(rev), ...mapAccounts(liab)])).catch(() => {})
    // Asset + Liability accounts (for source/paid-from account)
    Promise.all([
      fetch('/api/chart-of-accounts?accountType=ASSET&pageSize=500').then(r => r.json()),
      fetch('/api/chart-of-accounts?accountType=LIABILITY&pageSize=500').then(r => r.json()),
    ]).then(([asset, liab]) => setSourceAccounts([...mapAccounts(asset), ...mapAccounts(liab)])).catch(() => {})
    // Expense accounts (for COGS / expense classification)
    fetch('/api/chart-of-accounts?accountType=EXPENSE&pageSize=500').then(r => r.json())
      .then(d => setExpenseAccounts(mapAccounts(d))).catch(() => {})
  }, [sessionUserId])

  // Re-fetch items when search/filter changes (debounced)
  useEffect(() => {
    if (!initialLoaded.current) return
    const timeout = setTimeout(() => { fetchItems() }, 300)
    return () => clearTimeout(timeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemSearch, itemBranchFilter, itemDeptFilter, itemWebClassFilter])

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

  // Close consignment search dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (conSearchRef.current && !conSearchRef.current.contains(e.target as Node)) setConItemDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Pre-fill from a petty-cash / expense inventory purchase (draft in localStorage).
  // MUST stay above the auth-guard early return so hook order is stable.
  useEffect(() => {
    let draft: { action?: string; entryId?: string; name?: string; unitCost?: number; freightAmount?: number; branch?: string; supplierName?: string } | null = null
    try { const raw = localStorage.getItem('pcf-inventory-draft'); if (raw) draft = JSON.parse(raw) } catch { /* ignore */ }
    if (!draft) return
    try { localStorage.removeItem('pcf-inventory-draft') } catch { /* ignore */ }
    const entryId = draft.entryId || null
    // Freight forwarder cost → capitalize into an existing stock batch.
    if (draft.action === 'freight') {
      setActiveTab('Adjustments')
      setCapEntryId(entryId)
      setCapAmount(String(draft.freightAmount ?? draft.unitCost ?? ''))
      setCapItemId(''); setCapAdjId(''); setCapLots([])
      setCapOpen(true)
      return
    }
    // Replenishment → pre-fill a stock-in (INCREASE) adjustment; stamp on save.
    if (draft.action === 'adjust') {
      setActiveTab('Adjustments')
      setPcfSourceEntryId(entryId)
      setAdjType('INCREASE')
      if (draft.unitCost != null) setAdjLocalCost(String(draft.unitCost))
      setAdjRemarks(`Replenishment from petty cash${draft.name ? ` — ${draft.name}` : ''}`)
      setAdjModalOpen(true)
      return
    }
    // New item → create, then record its opening batch as an adjustment.
    openItemCreate()
    if (draft.name) setFName(String(draft.name))
    if (draft.unitCost != null) setFUnitCost(String(draft.unitCost))
    if (draft.branch) setFBranch(String(draft.branch))
    setFSourceAccountId(''); setFSourceAccountSearch('')
    setFFromPettyCash(true)
    setPcfSourceEntryId(entryId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    setFRevenueAccountId(''); setFRevenueAccountSearch(''); setFSourceAccountId(''); setFSourceAccountSearch(''); setFExpenseAccountId(''); setFExpenseAccountSearch('')
    setFFromPettyCash(false); setPcfSourceEntryId(null)
    setVariants([]); setNewVariantType('Color'); setNewVariantLabel(''); setNewVariantQty(0)
    setIssuedOfficialInvoice(false)
    setIsPreOrder(false)
    setFWebsiteClass('')
    setFDimL(''); setFDimW(''); setFDimH('')
    setIsBundle(false); setBundleComponents([]); setBundleComponentId(''); setBundleComponentQty(1)
    setShowInlineSupplier(false); setError('')
    setItemModalOpen(true)
  }

  function openItemEdit(item: InventoryItem) {
    setEditingItem(item)
    setPcfSourceEntryId(null)
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
    setFDimL(item.dimensionLength != null ? String(item.dimensionLength) : '')
    setFDimW(item.dimensionWidth != null ? String(item.dimensionWidth) : '')
    setFDimH(item.dimensionHeight != null ? String(item.dimensionHeight) : '')
    setFRevenueAccountId(item.revenueAccountId || '')
    setFRevenueAccountSearch(item.revenueAccount ? `${item.revenueAccount.accountNumber} ${item.revenueAccount.accountTitle}` : '')
    setFSourceAccountId(item.sourceAccountId || '')
    setFSourceAccountSearch(item.sourceAccount ? `${item.sourceAccount.accountNumber} ${item.sourceAccount.accountTitle}` : '')
    setFExpenseAccountId(item.expenseAccountId || '')
    setFExpenseAccountSearch(item.expenseAccount ? `${item.expenseAccount.accountNumber} ${item.expenseAccount.accountTitle}` : '')
    // Load variants
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setVariants((item.variants || []).map((v: any) => ({
      id: v.id, variantType: v.variantType || 'Color', variantLabel: v.variantLabel || v.color || '', quantity: v.quantity, variantSku: v.variantSku, barcode: v.barcode || undefined,
    })))
    setNewVariantType('Color'); setNewVariantLabel(''); setNewVariantQty(0)
    setIssuedOfficialInvoice(item.issuedOfficialInvoice || false)
    setIsPreOrder(item.isPreOrder || false)
    setFWebsiteClass(item.websiteClassification || '')
    setIsBundle(item.isBundle || false)
    setBundleComponents((item.bundleComponents || []).map((bc: { id: string; quantity: number; component: { id: string; name: string; sku: string; unitCost?: number } }) => ({
      id: bc.id, componentId: bc.component.id, quantity: bc.quantity, name: bc.component.name, sku: bc.component.sku, unitCost: Number(bc.component.unitCost) || 0,
    })))
    setBundleComponentId(''); setBundleComponentQty(1)
    setShowInlineSupplier(false); setError('')
    setItemModalOpen(true)
  }

  async function addBundleComponent() {
    if (!editingItem || !bundleComponentId) return
    try {
      const r = await fetch('/api/inventory/bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundleId: editingItem.id, componentId: bundleComponentId, quantity: bundleComponentQty }),
      })
      const d = await r.json()
      if (r.ok) {
        setBundleComponents(prev => {
          const newComponents = [...prev.filter(bc => bc.componentId !== bundleComponentId), {
            id: d.id, componentId: d.component.id, quantity: d.quantity, name: d.component.name, sku: d.component.sku, unitCost: Number(d.component.unitCost) || 0,
          }]
          // Auto-compute bundle unit cost
          const computedCost = newComponents.reduce((sum, bc) => sum + (bc.unitCost || 0) * bc.quantity, 0)
          setFUnitCost(String(computedCost))
          return newComponents
        })
        setBundleComponentId(''); setBundleComponentQty(1)
        setIsBundle(true)
        fetchItems()
      } else {
        setError(d.error || 'Failed to add component')
      }
    } catch { setError('Failed to add component') }
  }

  async function removeBundleComponent(bcId: string) {
    if (!window.confirm('Remove this component from the bundle?')) return
    try {
      await fetch('/api/inventory/bundles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bcId }),
      })
      setBundleComponents(prev => {
        const remaining = prev.filter(bc => bc.id !== bcId)
        const computedCost = remaining.reduce((sum, bc) => sum + (bc.unitCost || 0) * bc.quantity, 0)
        setFUnitCost(String(computedCost))
        return remaining
      })
      fetchItems()
    } catch {}
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
    // Petty-cash new-item flow: create the item with 0 stock, then record the
    // opening batch as an INCREASE adjustment so there's a proper FIFO lot + log
    // entry (item-create alone creates no lot). skipGl on the adjustment avoids
    // double-counting against the source petty-cash entry.
    const isPcfCreate = !editingItem && fFromPettyCash && !!pcfSourceEntryId
    const openingQty = parseInt(fInitialQty || '0') || 0
    const body: Record<string, unknown> = {
      name: fName, branch: fBranch,
      skuDepartment: fSkuDept || null, skuCategory: fSkuCat || null, skuSubcategory: fSkuSub || null,
      accountSubType: fSubType || null,
      unitCost: fUnitCost || '0',
      sellingPrice: fSellingPrice || null,
      rewardPointsPrice: fRewardPointsPrice || null,
      quantity: isPcfCreate ? '0' : (fInitialQty || '0'),
      reorderLevel: fReorderLevel || null,
      supplierId: fSupplierId || null,
      dimensionLength: fDimL || null,
      dimensionWidth: fDimW || null,
      dimensionHeight: fDimH || null,
      revenueAccountId: fRevenueAccountId || null,
      sourceAccountId: fSourceAccountId || null,
      expenseAccountId: fExpenseAccountId || null,
      issuedOfficialInvoice,
      isPreOrder,
      websiteClassification: fWebsiteClass || null,
      fromPettyCash: fFromPettyCash,
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
      if (isPcfCreate) {
        // Opening batch → INCREASE adjustment (no GL — source entry carries it).
        if (openingQty > 0 && data?.id) {
          try {
            await fetch('/api/inventory/adjustments', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                itemId: data.id, type: 'INCREASE', quantityChange: openingQty,
                adjustmentDate: new Date().toISOString().split('T')[0],
                remarks: 'Opening batch from petty cash / expense',
                localCost: fUnitCost || undefined, skipGl: true,
              }),
            })
          } catch { /* non-fatal */ }
        }
        try { await fetch('/api/inventory/record-entry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entryId: pcfSourceEntryId }) }) } catch { /* non-fatal */ }
        setPcfSourceEntryId(null)
      }
      setItemModalOpen(false); fetchItems(); fetchAllItems(); fetchAdjustments()
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
     BULK EDIT HANDLERS
     ═══════════════════════════════════════════════════════ */

  function toggleSelectItem(id: string) {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const pageItems = sortedItems.slice((invPage - 1) * invPageSize, invPage * invPageSize)
    const allSelected = pageItems.every(i => selectedItems.has(i.id))
    if (allSelected) {
      setSelectedItems(prev => {
        const next = new Set(prev)
        pageItems.forEach(i => next.delete(i.id))
        return next
      })
    } else {
      setSelectedItems(prev => {
        const next = new Set(prev)
        pageItems.forEach(i => next.add(i.id))
        return next
      })
    }
  }

  function openBulkEdit() {
    setBulkField('')
    setBulkRevenueAccountId(''); setBulkRevenueSearch('')
    setBulkSourceAccountId(''); setBulkSourceSearch('')
    setBulkSupplierId(''); setBulkBranch(''); setBulkUnitCost('')
    setBulkSellingPrice(''); setBulkRewardPoints(''); setBulkReorderLevel('')
    setBulkSubType(''); setBulkWebClass(''); setError('')
    setBulkEditOpen(true)
  }

  async function handleBulkEdit() {
    if (selectedItems.size === 0) return
    setBulkSaving(true); setError('')
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = { ids: Array.from(selectedItems) }
      if (bulkField === 'revenueAccountId') body.revenueAccountId = bulkRevenueAccountId
      else if (bulkField === 'sourceAccountId') body.sourceAccountId = bulkSourceAccountId
      else if (bulkField === 'expenseAccountId') body.expenseAccountId = bulkExpenseAccountId
      else if (bulkField === 'supplierId') body.supplierId = bulkSupplierId
      else if (bulkField === 'branch') body.branch = bulkBranch
      else if (bulkField === 'unitCost') body.unitCost = bulkUnitCost
      else if (bulkField === 'sellingPrice') body.sellingPrice = bulkSellingPrice
      else if (bulkField === 'rewardPointsPrice') body.rewardPointsPrice = bulkRewardPoints
      else if (bulkField === 'reorderLevel') body.reorderLevel = bulkReorderLevel
      else if (bulkField === 'accountSubType') body.accountSubType = bulkSubType
      else if (bulkField === 'websiteClassification') body.websiteClassification = bulkWebClass

      const res = await fetch('/api/inventory', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Bulk update failed'); return }
      setBulkEditOpen(false)
      setSelectedItems(new Set())
      fetchItems(); fetchAllItems()
    } catch { setError('Network error') }
    finally { setBulkSaving(false) }
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
          // Replenishment sourced from a petty-cash / expense entry → skip GL so
          // it doesn't double-count against that entry.
          ...(pcfSourceEntryId ? { skipGl: true } : {}),
          ...(adjType === 'INCREASE' ? {
            localCost: adjLocalCost || undefined,
            foreignCost: adjForeignCost || undefined,
            foreignCurrency: adjForeignCost ? adjForeignCurrency : undefined,
            exchangeRate: adjExchangeRate || undefined,
          } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong'); setSaving(false); return }
      if (pcfSourceEntryId) {
        try { await fetch('/api/inventory/record-entry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entryId: pcfSourceEntryId }) }) } catch { /* non-fatal */ }
        setPcfSourceEntryId(null)
      }
      setAdjModalOpen(false); fetchAdjustments(); fetchItems(); fetchAllItems()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  // Load an item's INCREASE (stock-in) lots so the user can pick which batch the
  // freight is capitalized into.
  async function loadCapLots(itemId: string) {
    setCapItemId(itemId); setCapAdjId(''); setCapLots([])
    if (!itemId) return
    try {
      const res = await fetch(`/api/inventory/adjustments?itemId=${itemId}&pageSize=100`)
      if (!res.ok) return
      const data = await res.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lots = (data.data || []).filter((a: any) => a.type === 'INCREASE')
      setCapLots(lots)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (lots.length === 1) setCapAdjId((lots[0] as any).id)
    } catch { /* ignore */ }
  }

  async function handleCapitalizeSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(capAmount)
    if (!capAdjId || !(amt > 0)) { setError('Pick a stock batch and a positive freight amount'); return }
    setCapSaving(true); setError('')
    try {
      const res = await fetch('/api/inventory/adjustments/capitalize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjustmentId: capAdjId, freightAmount: amt, sourceEntryId: capEntryId || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to capitalize freight'); setCapSaving(false); return }
      setCapOpen(false); setCapEntryId(null); setCapAmount(''); setCapItemId(''); setCapAdjId(''); setCapLots([])
      fetchAdjustments(); fetchItems(); fetchAllItems()
    } catch { setError('Network error') }
    finally { setCapSaving(false) }
  }

  // Load the FX-source bank accounts for a currency + the RFP list for linking.
  async function loadFbFxAndRfps(currency: string) {
    try {
      const [fxRes, rfpRes] = await Promise.all([
        fetch(`/api/inventory/adjustments/fx-source?currency=${currency}`),
        fetch('/api/inventory/adjustments/rfp-options'),
      ])
      const fx = fxRes.ok ? await fxRes.json() : { accounts: [] }
      setFbFxAccounts(Array.isArray(fx.accounts) ? fx.accounts : [])
      const rfps = rfpRes.ok ? await rfpRes.json() : []
      setFbRfpOptions(Array.isArray(rfps) ? rfps : [])
    } catch { setFbFxAccounts([]); setFbRfpOptions([]) }
  }

  // Selecting the FX source auto-fills the exchange rate with that account's
  // weighted forex purchase rate (the accountant can still overtype it).
  function applyFxAccount(accountId: string) {
    setFbFxAccountId(accountId)
    const acct = fbFxAccounts.find(a => a.id === accountId)
    if (!acct) return
    const rate = acct.weightedRate ?? acct.fallbackRate?.phpPerUnit ?? null
    if (rate != null && rate > 0) setFbExRate(String(Number(rate.toFixed(4))))
  }

  function openFbModal() {
    setFbEditId(null)
    setFbDate(new Date().toISOString().split('T')[0])
    setFbRemarks(''); setFbHasForeign(true); setFbCurrency('CNY'); setFbExRate('')
    setFbFreight1(''); setFbFreight1Foreign(false)
    setFbFreight2(''); setFbFreight2Foreign(false)
    setFbFreight3(''); setFbFreight3Foreign(false)
    setFbRows([{ itemId: '', itemName: '', itemSku: '', dimL: '', dimW: '', dimH: '', manPrice: '', manPriceIsForeign: true, quantity: '' }])
    setFbProofUrls([]); setError('')
    setFbFxAccountId(''); setFbManuRfpId(''); setFbFreightRfpId('')
    loadFbFxAndRfps('CNY')
    setFbOpen(true)
  }

  // Open the freight-batch modal prefilled with an existing batch, for editing.
  async function openFbEdit(batchRefId: string) {
    setFbLoadingEdit(true); setError('')
    try {
      const res = await fetch(`/api/inventory/adjustments/batch?id=${batchRefId}`)
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to load batch'); return }
      const b = d.batch
      setFbEditId(b.id)
      setFbDate(new Date(b.adjustmentDate).toISOString().split('T')[0])
      setFbRemarks(b.remarks || '')
      setFbHasForeign(!!b.hasForeignPurchase)
      setFbCurrency(b.foreignCurrency || 'CNY')
      setFbExRate(b.exchangeRate != null ? String(b.exchangeRate) : '')
      setFbFreight1(b.freight1Amount != null ? String(b.freight1Amount) : ''); setFbFreight1Foreign(!!b.freight1IsForeign)
      setFbFreight2(b.freight2Amount != null ? String(b.freight2Amount) : ''); setFbFreight2Foreign(!!b.freight2IsForeign)
      setFbFreight3(b.freight3Amount != null ? String(b.freight3Amount) : ''); setFbFreight3Foreign(!!b.freight3IsForeign)
      setFbFxAccountId(b.fxSourceAccountId || '')
      setFbManuRfpId(b.manufacturerRfpId || '')
      setFbFreightRfpId(b.freightRfpId || '')
      loadFbFxAndRfps(b.foreignCurrency || 'CNY')
      setFbProofUrls(Array.isArray(b.proofUrls) ? b.proofUrls : [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setFbRows((b.adjustments || []).map((a: any) => {
        const qty = a.quantityChange || 0
        const freightPerUnit = qty > 0 && a.freightAllocation != null ? Number(a.freightAllocation) / qty : 0
        const isForeign = a.foreignCost != null
        const manPrice = isForeign ? Number(a.foreignCost) : Math.max(0, Number(a.localCost || 0) - freightPerUnit)
        return {
          itemId: a.itemId, itemName: a.item?.name || '', itemSku: a.item?.sku || '',
          dimL: a.item?.dimensionLength ? String(a.item.dimensionLength) : '', dimW: a.item?.dimensionWidth ? String(a.item.dimensionWidth) : '', dimH: a.item?.dimensionHeight ? String(a.item.dimensionHeight) : '',
          manPrice: manPrice ? String(Number(manPrice.toFixed(4))) : '', manPriceIsForeign: isForeign, quantity: String(qty),
        }
      }))
      setFbOpen(true)
    } catch { setError('Network error') } finally { setFbLoadingEdit(false) }
  }

  async function handleFbUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setFbUploading(true)
    const urls: string[] = []
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      try {
        const r = await fetch('/api/upload', { method: 'POST', body: fd })
        const d = await r.json()
        if (r.ok && d.url) urls.push(d.url)
        else setError(d.error || 'Upload failed')
      } catch { setError('Upload failed') }
    }
    setFbProofUrls(prev => [...prev, ...urls])
    setFbUploading(false)
    if (fbFileRef.current) fbFileRef.current.value = ''
  }

  async function handleFbSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFbSaving(true); setError('')
    try {
      const res = await fetch('/api/inventory/adjustments/batch', {
        method: fbEditId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(fbEditId ? { id: fbEditId } : {}),
          adjustmentDate: fbDate,
          hasForeignPurchase: fbHasForeign,
          foreignCurrency: fbCurrency,
          exchangeRate: fbExRate || undefined,
          freight1Amount: fbFreight1 || undefined,
          freight1IsForeign: fbFreight1Foreign,
          freight2Amount: fbFreight2 || undefined,
          freight2IsForeign: fbFreight2Foreign,
          freight3Amount: fbFreight3 || undefined,
          freight3IsForeign: fbFreight3Foreign,
          fxSourceAccountId: fbFxAccountId || undefined,
          manufacturerRfpId: fbManuRfpId || undefined,
          freightRfpId: fbFreightRfpId || undefined,
          proofUrls: fbProofUrls.length > 0 ? fbProofUrls : undefined,
          remarks: fbRemarks || undefined,
          rows: fbRows.filter(r => r.itemId && r.quantity),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong'); setFbSaving(false); return }
      setFbOpen(false)
      fetchAdjustments(); fetchItems(); fetchAllItems()
    } catch { setError('Network error') }
    finally { setFbSaving(false) }
  }

  async function handleBatchDelete(batchRefId: string, ref: string, count: number) {
    if (!confirm(`Delete freight batch ${ref}? Its ${count} product line(s) will be reversed and removed. Blocked if any item was already sold.`)) return
    try {
      const res = await fetch(`/api/inventory/adjustments/batch?id=${batchRefId}`, { method: 'DELETE' })
      if (res.ok) { fetchAdjustments(); fetchItems(); fetchAllItems() }
      else setError((await res.json()).error || 'Failed to delete batch')
    } catch { setError('Network error') }
  }

  async function uploadItemPhoto(itemId: string, file: File | null) {
    if (!file) return
    setUploadingPhotoId(itemId)
    try {
      const fd = new FormData(); fd.append('file', file)
      const up = await fetch('/api/upload', { method: 'POST', body: fd })
      const ud = await up.json()
      if (!up.ok || !ud.url) { setError(ud.error || 'Upload failed'); return }
      const res = await fetch('/api/inventory', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: itemId, imageUrl: ud.url }) })
      if (!res.ok) { setError('Failed to save photo'); return }
      fetchItems()
    } catch { setError('Upload failed') } finally { setUploadingPhotoId(null) }
  }

  async function handleAdjDelete(id: string) {
    setDeletingAdj(true)
    try {
      const res = await fetch(`/api/inventory/adjustments?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteAdjConfirm(null)
        fetchAdjustments(); fetchItems(); fetchAllItems()
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to delete adjustment')
      }
    } catch { setError('Network error') }
    finally { setDeletingAdj(false) }
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

  const anyModalOpen = itemModalOpen || supplierModalOpen || adjModalOpen || conModalOpen || pdfModalOpen || bulkEditOpen || formModalOpen

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

  /* ── Download Handlers ──────────────────────────────────── */
  const handleDownloadInventory = (format: 'xlsx' | 'pdf', includePhotos = false) => {
    const headers = ['SKU', 'Name', 'Branch', 'Department', 'Category', 'Subcategory', 'Qty', 'Unit Cost', 'Selling Price', 'Reward Pts Price', 'Reorder Level', 'Supplier']
    const rows = items.map(i => [
      i.sku, i.name, BRANCH_LABELS[i.branch] || i.branch, i.skuDepartment, i.skuCategory, i.skuSubcategory,
      i.quantity, formatCurrency(i.unitCost), formatCurrency(i.sellingPrice || 0),
      i.rewardPointsPrice != null ? i.rewardPointsPrice : '', i.reorderLevel ?? '',
      i.supplier?.supplierName || ''
    ])
    const subtitle = `${rows.length} items — ${itemBranchFilter ? BRANCH_LABELS[itemBranchFilter] || itemBranchFilter : 'All Branches'}`
    if (format === 'xlsx') {
      // Excel can't embed images — include the photo URL column instead when requested.
      if (includePhotos) {
        downloadXlsx('Inventory_Items', [{ name: 'Inventory', headers: [...headers, 'Photo URL'], rows: rows.map((r, idx) => [...r, items[idx].imageUrl || '']) }])
      } else {
        downloadXlsx('Inventory_Items', [{ name: 'Inventory', headers, rows }])
      }
    } else {
      downloadPdf({ title: 'Inventory Items', subtitle, headers, rows, landscape: true, images: includePhotos ? items.map(i => i.imageUrl || null) : undefined, imageHeader: 'Photo' })
    }
  }

  const handleDownloadSuppliers = (format: 'xlsx' | 'pdf') => {
    const headers = ['Supplier Name', 'Email', 'Contact Number', 'Foreign', 'Currency', 'Exchange Rate', 'Address', 'Notes']
    const rows = suppliers.map(s => [
      s.supplierName, s.email || '', s.contactNumber || '',
      s.isForeign ? 'Yes' : 'No', s.currency || 'PHP', s.defaultExchangeRate ?? '', s.address || '', s.notes || ''
    ])
    if (format === 'xlsx') downloadXlsx('Suppliers', [{ name: 'Suppliers', headers, rows }])
    else downloadPdf({ title: 'Suppliers', subtitle: `${rows.length} suppliers`, headers, rows })
  }

  const handleDownloadAdjustments = (format: 'xlsx' | 'pdf') => {
    const headers = ['Date', 'Item', 'SKU', 'Type', 'Qty Change', 'Previous', 'New', 'Remarks', 'Adjusted By']
    const rows = adjustments.map((a: Adjustment) => [
      formatDate(a.adjustmentDate), a.item?.name || '', a.item?.sku || '',
      a.type, a.quantityChange, a.previousQuantity, a.newQuantity, a.remarks || '', a.adjustedBy?.name || ''
    ])
    if (format === 'xlsx') downloadXlsx('Inventory_Adjustments', [{ name: 'Adjustments', headers, rows }])
    else downloadPdf({ title: 'Inventory Adjustments', subtitle: `${rows.length} adjustments`, headers, rows })
  }

  const handleDownloadConsignments = (format: 'xlsx' | 'pdf') => {
    const headers = ['Reference', 'Date', 'From', 'To', 'Item', 'SKU', 'Qty', 'Status', 'Remarks', 'Requested By']
    const rows: (string | number | null | undefined)[][] = []
    for (const g of groupedConsignments) {
      for (const item of g.items) {
        rows.push([
          g.ref || '', formatDate(g.first.createdAt),
          BRANCH_LABELS[g.first.fromBranch] || g.first.fromBranch,
          BRANCH_LABELS[g.first.toBranch] || g.first.toBranch,
          item.item?.name || '', item.item?.sku || '', item.quantity,
          g.first.status, item.remarks || '', g.first.requestedBy?.name || ''
        ])
      }
    }
    if (format === 'xlsx') downloadXlsx('Consignment_Transfers', [{ name: 'Consignments', headers, rows }])
    else downloadPdf({ title: 'Consignment Transfers', subtitle: `${groupedConsignments.length} transfers — ${rows.length} items`, headers, rows, landscape: true })
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
      {activeTab === 'SKU Guide' && <SkuGuidePanel canWrite={canWrite} />}

      {activeTab === 'Inventory' && (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
              Manage stock levels and item details
            </p>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none whitespace-nowrap" style={{ color: 'var(--mid-gray)' }} title="Include the item photo in the download (embedded in PDF; photo URL column in Excel)">
                <input type="checkbox" checked={downloadWithPhotos} onChange={(e) => setDownloadWithPhotos(e.target.checked)} className="w-4 h-4 accent-teal-600" />
                Include photos
              </label>
              <DownloadMenu onDownload={(fmt) => handleDownloadInventory(fmt, downloadWithPhotos)} label="Download" />
              {canWrite && (<>
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
              </>)}
            </div>
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
            <select
              value={itemWebClassFilter}
              onChange={(e) => setItemWebClassFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ borderColor: 'var(--light-gray)', background: 'white' }}
              title="Filter by the customer-facing category used on verdanarehab.com"
            >
              <option value="">All Website Classes</option>
              {WEBSITE_CLASSIFICATIONS.map((c) => (
                <option key={c.slug} value={c.label}>{c.label}</option>
              ))}
              <option value="__none__">— Not classified —</option>
            </select>
            <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm cursor-pointer select-none whitespace-nowrap" style={{ borderColor: 'var(--light-gray)', background: 'white', color: 'var(--mid-gray)' }} title="Show items that have been disabled / retired">
              <input type="checkbox" checked={showDisabledItems} onChange={(e) => setShowDisabledItems(e.target.checked)} className="w-4 h-4 accent-teal-600" />
              Show disabled items
            </label>
          </div>

          {/* Bulk Edit Toolbar */}
          {canWrite && selectedItems.size > 0 && (
            <div className="mb-3 flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'var(--pale-teal)', border: '1px solid var(--bright-teal)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--deep-teal)' }}>
                {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
              </span>
              <button onClick={openBulkEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--teal)' }}>
                <Pencil size={14} /> Bulk Edit
              </button>
              <button onClick={() => setSelectedItems(new Set())}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border"
                style={{ borderColor: 'var(--bright-teal)', color: 'var(--deep-teal)' }}>
                <X size={14} /> Clear
              </button>
            </div>
          )}

          {/* Table */}
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    {canWrite && (
                      <th className="px-3 py-3 w-10">
                        <input type="checkbox"
                          checked={sortedItems.slice((invPage - 1) * invPageSize, invPage * invPageSize).length > 0 &&
                            sortedItems.slice((invPage - 1) * invPageSize, invPage * invPageSize).every(i => selectedItems.has(i.id))}
                          onChange={toggleSelectAll}
                          className="rounded" style={{ accentColor: 'var(--teal)' }} />
                      </th>
                    )}
                    <th className="text-left px-3 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Photo</th>
                    {([
                      { key: 'sku', label: 'SKU', align: 'left' },
                      { key: 'name', label: 'Name', align: 'left' },
                      { key: 'branch', label: 'Branch', align: 'left' },
                      { key: 'dept', label: 'Dept', align: 'left' },
                      { key: 'qty', label: 'Qty', align: 'right' },
                      { key: 'unitCost', label: 'Unit Cost', align: 'right' },
                      { key: 'supplier', label: 'Supplier', align: 'left' },
                    ] as const).map(col => (
                      <th key={col.key}
                        className={`text-${col.align} px-4 py-3 font-semibold cursor-pointer select-none hover:bg-gray-100/50 transition-colors`}
                        style={{ color: invSortField === col.key ? 'var(--teal)' : 'var(--charcoal)' }}
                        onClick={() => toggleSort(col.key)}>
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {invSortField === col.key ? (invSortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} className="opacity-30" />}
                        </span>
                      </th>
                    ))}
                    {canWrite && <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={canWrite ? 10 : 8} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                        <Package size={32} className="mx-auto mb-2 opacity-40" />
                        <p>No inventory items</p>
                      </td>
                    </tr>
                  ) : sortedItems.slice((invPage - 1) * invPageSize, invPage * invPageSize).map((item) => (
                    <tr key={item.id} className={`border-t hover:bg-gray-50/50 transition-colors ${selectedItems.has(item.id) ? 'bg-teal-50/40' : ''} ${item.isActive === false ? 'opacity-50 bg-gray-50' : ''}`} style={{ borderColor: 'var(--light-gray)' }} title={item.isActive === false ? 'Disabled / retired item' : undefined}>
                      {canWrite && (
                        <td className="px-3 py-3 w-10">
                          <input type="checkbox"
                            checked={selectedItems.has(item.id)}
                            onChange={() => toggleSelectItem(item.id)}
                            className="rounded" style={{ accentColor: 'var(--teal)' }} />
                        </td>
                      )}
                      <td className="px-3 py-2">
                        {item.imageUrl ? (
                          <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" title="View photo">
                            <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded-lg object-cover border" style={{ borderColor: 'var(--light-gray)' }} />
                          </a>
                        ) : (
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--off-white)', color: 'var(--light-gray)' }}><Package size={16} /></div>
                        )}
                        {canWrite && (
                          <label className="block mt-1 text-[10px] cursor-pointer text-center" style={{ color: 'var(--teal)' }}>
                            {uploadingPhotoId === item.id ? '…' : (item.imageUrl ? 'Change' : 'Add')}
                            <input type="file" accept="image/*" className="hidden" onChange={e => { uploadItemPhoto(item.id, e.target.files?.[0] || null); e.target.value = '' }} />
                          </label>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-medium" style={{ color: 'var(--charcoal)' }}>{item.sku}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>
                        {item.name}
                        {item.isBundle && <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>Bundle</span>}
                        {item.issuedOfficialInvoice && <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: '#dcfce7', color: '#166534' }}>Invoice</span>}
                        {item.isPreOrder && <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: '#dbeafe', color: '#1e40af' }}>Pre-order</span>}
                        {item.websiteClassification && <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: '#f5f3ff', color: '#5b21b6' }} title="Customer-facing category on verdanarehab.com">{item.websiteClassification}</span>}
                        {item.revenueAccount && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--teal)' }}>Rev: {item.revenueAccount.accountNumber} {item.revenueAccount.accountTitle}</p>
                        )}
                        {item.sourceAccount && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>Src: {item.sourceAccount.accountNumber} {item.sourceAccount.accountTitle}</p>
                        )}
                        {item.expenseAccount && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--coral)' }}>Exp: {item.expenseAccount.accountNumber} {item.expenseAccount.accountTitle}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                        {(() => {
                          const bd = branchBreakdown.get(item.sku)
                          if (!bd) return BRANCH_LABELS[item.branch] || item.branch
                          return (
                            <span className="flex flex-col gap-0.5">
                              {bd.parts.map((p, i) => (
                                <span key={i} className="whitespace-nowrap">
                                  <span style={{ color: 'var(--charcoal)' }}>{BRANCH_LABELS[p.branch] || p.branch}</span>
                                  <span className="ml-1 font-semibold" style={{ color: 'var(--deep-teal)' }}>{p.quantity}</span>
                                </span>
                              ))}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                        {item.skuDepartment ? (SKU_HIERARCHY[item.skuDepartment]?.label || item.skuDepartment) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        <button
                          onClick={async () => {
                            setShowMovements(item.id)
                            setMovementData(null)
                            try {
                              const res = await fetch(`/api/inventory/${item.id}/movements`)
                              if (res.ok) setMovementData(await res.json())
                            } catch { /* ignore */ }
                          }}
                          className="underline decoration-dotted cursor-pointer hover:opacity-70 flex items-center gap-1 ml-auto"
                          style={{ color: item.reorderLevel && item.quantity <= item.reorderLevel ? '#dc2626' : 'var(--teal)' }}
                          title="Combined stock across branches — click for the base item's movement history"
                        >
                          {(() => { const bd = branchBreakdown.get(item.sku); const q = bd ? bd.total : item.quantity; return q < 0 && item.isPreOrder ? `${q} (pre-sold)` : q })()}
                          <History size={11} className="opacity-50" />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={async () => {
                            setShowLotDetail(item.id)
                            setLotData(null)
                            try {
                              const res = await fetch(`/api/inventory/${item.id}/lots`)
                              if (res.ok) setLotData(await res.json())
                            } catch { /* ignore */ }
                          }}
                          className="underline decoration-dotted cursor-pointer hover:opacity-70"
                          style={{ color: 'var(--teal)' }}
                          title="Click to view purchase lots (FIFO)"
                        >
                          {formatCurrency(item.unitCost)}
                        </button>
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
                            {item.isActive === false ? (
                              <button onClick={async () => { await fetch('/api/inventory', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, isActive: true }) }); fetchItems() }} className="p-2 rounded-lg hover:bg-emerald-50 transition-colors" title="Restore (re-enable) item">
                                <RotateCcw size={15} className="text-emerald-600" />
                              </button>
                            ) : (
                              <button onClick={() => setDeleteItemConfirm(item.id)} className="p-2 rounded-lg hover:bg-red-50 transition-colors" title="Disable / retire item">
                                <Trash2 size={15} className="text-red-500" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {items.length > 0 && (
              <Pagination totalItems={items.length} page={invPage} pageSize={invPageSize}
                onPageChange={setInvPage} onPageSizeChange={setInvPageSize} />
            )}
          </div>

          {/* Qty Movement History Modal */}
          {showMovements && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowMovements(null)}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b shrink-0" style={{ borderColor: 'var(--light-gray)' }}>
                  <div>
                    <h3 className="text-base font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                      <History size={16} style={{ color: 'var(--teal)' }} />
                      Quantity Movement History
                    </h3>
                    {movementData && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                        {movementData.itemName} · Current stock: <strong style={{ color: 'var(--charcoal)' }}>{movementData.currentQty}</strong>
                      </p>
                    )}
                  </div>
                  <button onClick={() => setShowMovements(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                    <X size={18} style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 px-6 py-4">
                  {!movementData ? (
                    <p className="text-sm py-8 text-center" style={{ color: 'var(--mid-gray)' }}>Loading...</p>
                  ) : movementData.movements.length === 0 ? (
                    <p className="text-sm py-8 text-center" style={{ color: 'var(--mid-gray)' }}>No movements recorded yet.</p>
                  ) : (
                    <>
                      {/* Summary bar */}
                      <div className="flex flex-wrap gap-3 mb-4 p-3 rounded-xl text-xs" style={{ background: 'var(--pale-teal)' }}>
                        <span style={{ color: 'var(--deep-teal)' }}>
                          Total movements: <strong>{movementData.movements.length}</strong>
                        </span>
                        <span style={{ color: '#16a34a' }}>
                          Stock in: <strong>{movementData.movements.filter(m => m.direction === 1).reduce((s, m) => s + m.qty, 0)}</strong>
                        </span>
                        <span style={{ color: '#dc2626' }}>
                          Stock out: <strong>{movementData.movements.filter(m => m.direction === -1).reduce((s, m) => s + m.qty, 0)}</strong>
                        </span>
                        <span style={{ color: 'var(--charcoal)' }}>
                          Current balance: <strong>{movementData.currentQty}</strong>
                        </span>
                      </div>

                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-xs uppercase tracking-wide" style={{ color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>
                            <th className="text-left py-2 px-2">Date</th>
                            <th className="text-left py-2 px-2">Type</th>
                            <th className="text-right py-2 px-2">Qty</th>
                            <th className="text-right py-2 px-2">Balance</th>
                            <th className="text-right py-2 px-2">Cost/Unit</th>
                            <th className="text-left py-2 px-2">Reference / Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Starting balance row */}
                          {movementData.startingQty !== 0 && (
                            <tr className="border-b" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                              <td className="py-2 px-2 text-xs" style={{ color: 'var(--mid-gray)' }}>—</td>
                              <td className="py-2 px-2">
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: '#f3f4f6', color: '#374151' }}>
                                  Opening
                                </span>
                              </td>
                              <td className="py-2 px-2 text-right text-xs" style={{ color: 'var(--mid-gray)' }}>—</td>
                              <td className="py-2 px-2 text-right font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>
                                {movementData.startingQty}
                              </td>
                              <td className="py-2 px-2 text-right text-xs" style={{ color: 'var(--mid-gray)' }}>—</td>
                              <td className="py-2 px-2 text-xs" style={{ color: 'var(--mid-gray)' }}>Balance before tracked movements</td>
                            </tr>
                          )}

                          {movementData.movements.map((m, idx) => {
                            const isIn = m.direction === 1
                            const isInfo = m.direction === 0
                            const typeConfig = {
                              STOCK_IN:    { label: 'Stock In',    bg: '#dcfce7', color: '#166534', icon: <TrendingUp size={10} /> },
                              SHRINKAGE:   { label: 'Write-off',   bg: '#fff7ed', color: '#c2410c', icon: <TrendingDown size={10} /> },
                              SALE:        { label: 'Sale',        bg: '#fee2e2', color: '#991b1b', icon: <TrendingDown size={10} /> },
                              FREE_SAMPLE: { label: 'Free Sample', bg: '#fef3c7', color: '#92400e', icon: <Gift size={10} /> },
                              ORDER_VOID:  { label: 'Order Voided', bg: '#dbeafe', color: '#1e40af', icon: <TrendingUp size={10} /> },
                              CONSIGNMENT: { label: 'Consignment', bg: '#ede9fe', color: '#6d28d9', icon: <ArrowRightLeft size={10} /> },
                            }[m.type]

                            return (
                              <tr key={idx} className="border-b hover:bg-gray-50/60 transition-colors"
                                style={{ borderColor: 'var(--light-gray)' }}>
                                <td className="py-2.5 px-2 text-xs" style={{ color: 'var(--mid-gray)' }}>
                                  {new Date(m.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td className="py-2.5 px-2">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                    style={{ background: typeConfig.bg, color: typeConfig.color }}>
                                    {typeConfig.icon} {typeConfig.label}
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 text-right font-semibold text-sm"
                                  style={{ color: isInfo ? '#6d28d9' : isIn ? '#16a34a' : '#dc2626' }}>
                                  {isInfo ? '' : isIn ? '+' : '−'}{m.qty}
                                </td>
                                <td className="py-2.5 px-2 text-right font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>
                                  {isInfo ? '—' : m.balance}
                                </td>
                                <td className="py-2.5 px-2 text-right text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>
                                  {m.costPerUnit != null ? formatCurrency(m.costPerUnit) : '—'}
                                </td>
                                <td className="py-2.5 px-2 text-xs max-w-[220px]">
                                  {m.reference && (
                                    <p className="font-medium truncate" style={{ color: 'var(--charcoal)' }}>{m.reference}</p>
                                  )}
                                  {m.remarks && (
                                    <p className="truncate" style={{ color: 'var(--mid-gray)' }}>{m.remarks}</p>
                                  )}
                                  {m.adjustedBy && (
                                    <p className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>by {m.adjustedBy}</p>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Delete Confirm */}
          {/* FIFO Lot Detail Modal */}
          {showLotDetail && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowLotDetail(null)}>
              <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Purchase Lots (FIFO)</h3>
                  <button onClick={() => setShowLotDetail(null)} className="p-1 rounded hover:bg-gray-100"><X size={18} /></button>
                </div>
                {!lotData ? (
                  <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>Loading...</p>
                ) : lotData.lots.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No purchase lots recorded yet.</p>
                ) : (
                  <>
                    <div className="flex gap-4 mb-4 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      <span>Total Lots: <strong>{lotData.summary.totalLots}</strong></span>
                      <span>Active: <strong>{lotData.summary.activeLots}</strong></span>
                      <span>Remaining: <strong>{lotData.summary.totalRemaining}</strong></span>
                      <span>Weighted Avg: <strong style={{ color: 'var(--teal)' }}>{formatCurrency(lotData.summary.weightedAvgCost)}</strong></span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs uppercase" style={{ color: 'var(--mid-gray)' }}>
                          <th className="text-left py-2 px-2">Date</th>
                          <th className="text-right py-2 px-2">Purchased</th>
                          <th className="text-right py-2 px-2">Remaining</th>
                          <th className="text-right py-2 px-2">Foreign Cost</th>
                          <th className="text-right py-2 px-2">Cost/Unit (PHP)</th>
                          <th className="text-left py-2 px-2">Batch</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lotData.lots.map((lot) => (
                          <tr key={lot.id} className="border-b" style={{ opacity: lot.remaining === 0 ? 0.4 : 1 }}>
                            <td className="py-2 px-2 text-xs">{new Date(lot.adjustmentDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                            <td className="py-2 px-2 text-right">{lot.quantityChange}</td>
                            <td className="py-2 px-2 text-right font-medium" style={{ color: lot.remaining > 0 ? 'var(--teal)' : 'var(--mid-gray)' }}>{lot.remaining}</td>
                            <td className="py-2 px-2 text-right text-xs">{lot.foreignCost != null ? `${lot.foreignCost} ${lot.foreignCurrency || ''}` : '—'}</td>
                            <td className="py-2 px-2 text-right font-mono font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(lot.costPerUnit)}</td>
                            <td className="py-2 px-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{lot.batchId || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {lotData.initialUnitCost != null && (
                      <div className="mt-3 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--off-white)', border: '1px solid var(--light-gray)' }}>
                        <span style={{ color: 'var(--mid-gray)' }}>Initial Price (set at item creation): </span>
                        <strong style={{ color: 'var(--charcoal)' }}>{formatCurrency(lotData.initialUnitCost)}</strong>
                      </div>
                    )}
                    <p className="mt-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      Oldest lots are consumed first (FIFO). Grayed-out lots are fully consumed.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {deleteItemConfirm && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
                <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Disable / retire item</h3>
                <p className="text-sm mb-6" style={{ color: 'var(--mid-gray)' }}>This retires the item and hides it from the list. Its history is kept — tick <strong>&ldquo;Show disabled items&rdquo;</strong> to see it again and <strong>Restore</strong> anytime.</p>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setDeleteItemConfirm(null)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
                  <button onClick={() => handleItemDelete(deleteItemConfirm)} className="px-4 py-2 rounded-lg text-sm text-white bg-red-500 hover:bg-red-600">Disable</button>
                </div>
              </div>
            </div>
          )}

          {/* Bulk Edit Modal */}
          {bulkEditOpen && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
                    Bulk Edit — {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''}
                  </h2>
                  <button onClick={() => setBulkEditOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                    <X size={18} style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </div>

                {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>}

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Field to Update</label>
                    <select value={bulkField} onChange={(e) => setBulkField(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                      style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
                      <option value="">Select a field...</option>
                      <option value="revenueAccountId">Revenue Account</option>
                      <option value="sourceAccountId">Source Account</option>
                      <option value="expenseAccountId">Expense Account (COGS)</option>
                      <option value="supplierId">Supplier</option>
                      <option value="branch">Branch</option>
                      <option value="unitCost">Unit Cost</option>
                      <option value="sellingPrice">Selling Price</option>
                      <option value="rewardPointsPrice">Reward Points Price</option>
                      <option value="reorderLevel">Reorder Level</option>
                      <option value="accountSubType">Account Sub Type</option>
                      <option value="websiteClassification">Website Classification</option>
                    </select>
                  </div>

                  {bulkField === 'revenueAccountId' && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Revenue Account</label>
                      <input type="text" placeholder="Search accounts..."
                        value={bulkRevenueSearch} onChange={(e) => setBulkRevenueSearch(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none mb-1"
                        style={{ borderColor: 'var(--light-gray)' }} />
                      <select value={bulkRevenueAccountId} onChange={(e) => setBulkRevenueAccountId(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                        style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">— None —</option>
                        {revenueAccounts
                          .filter(a => !bulkRevenueSearch || `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(bulkRevenueSearch.toLowerCase()))
                          .map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}
                      </select>
                    </div>
                  )}

                  {bulkField === 'sourceAccountId' && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Source Account</label>
                      <input type="text" placeholder="Search accounts..."
                        value={bulkSourceSearch} onChange={(e) => setBulkSourceSearch(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none mb-1"
                        style={{ borderColor: 'var(--light-gray)' }} />
                      <select value={bulkSourceAccountId} onChange={(e) => setBulkSourceAccountId(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                        style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">— None —</option>
                        {sourceAccounts
                          .filter(a => !bulkSourceSearch || `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(bulkSourceSearch.toLowerCase()))
                          .map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}
                      </select>
                    </div>
                  )}

                  {bulkField === 'expenseAccountId' && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Expense Account (COGS)</label>
                      <input type="text" placeholder="Search accounts..."
                        value={bulkExpenseSearch} onChange={(e) => setBulkExpenseSearch(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none mb-1"
                        style={{ borderColor: 'var(--light-gray)' }} />
                      <select value={bulkExpenseAccountId} onChange={(e) => setBulkExpenseAccountId(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                        style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">— None —</option>
                        {expenseAccounts
                          .filter(a => !bulkExpenseSearch || `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(bulkExpenseSearch.toLowerCase()))
                          .map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.accountTitle}</option>)}
                      </select>
                    </div>
                  )}

                  {bulkField === 'supplierId' && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Supplier</label>
                      <select value={bulkSupplierId} onChange={(e) => setBulkSupplierId(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                        style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">— None —</option>
                        {allSuppliers.map(s => <option key={s.id} value={s.id}>{s.supplierName}</option>)}
                      </select>
                    </div>
                  )}

                  {bulkField === 'branch' && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Branch</label>
                      <select value={bulkBranch} onChange={(e) => setBulkBranch(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                        style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">Select...</option>
                        {Object.entries(BRANCH_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  )}

                  {bulkField === 'unitCost' && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Unit Cost (PHP)</label>
                      <input type="number" min="0" step="0.01" value={bulkUnitCost} onChange={(e) => setBulkUnitCost(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                        style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                  )}

                  {bulkField === 'sellingPrice' && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Selling Price (PHP)</label>
                      <input type="number" min="0" step="0.01" value={bulkSellingPrice} onChange={(e) => setBulkSellingPrice(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                        style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                  )}

                  {bulkField === 'rewardPointsPrice' && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Reward Points Price</label>
                      <input type="number" min="0" step="1" value={bulkRewardPoints} onChange={(e) => setBulkRewardPoints(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                        style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                  )}

                  {bulkField === 'reorderLevel' && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Reorder Level</label>
                      <input type="number" min="0" step="1" value={bulkReorderLevel} onChange={(e) => setBulkReorderLevel(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                        style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                  )}

                  {bulkField === 'accountSubType' && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Account Sub Type</label>
                      <select value={bulkSubType} onChange={(e) => setBulkSubType(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                        style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">— None —</option>
                        {INV_SUB_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                  )}

                  {bulkField === 'websiteClassification' && (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--mid-gray)' }}>Website Classification</label>
                      <select value={bulkWebClass} onChange={(e) => setBulkWebClass(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                        style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">— Not classified —</option>
                        {WEBSITE_CLASSIFICATIONS.map(c => <option key={c.slug} value={c.label}>{c.label}</option>)}
                      </select>
                      <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                        Sets the customer-facing category on verdanarehab.com for every selected item.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 justify-end mt-6">
                  <button onClick={() => setBulkEditOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-sm border"
                    style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                    Cancel
                  </button>
                  <button onClick={handleBulkEdit} disabled={!bulkField || bulkSaving}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: 'var(--teal)' }}>
                    {bulkSaving ? 'Updating...' : `Update ${selectedItems.size} Item${selectedItems.size !== 1 ? 's' : ''}`}
                  </button>
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
                      <label className="block text-xs font-medium mb-1.5" style={{ color: isBundle && bundleComponents.length > 0 ? 'var(--mid-gray)' : 'var(--charcoal)' }}>
                        Unit Cost (PHP) {isBundle && bundleComponents.length > 0 && <span className="font-normal">(auto-computed from components)</span>}
                      </label>
                      <input type="number" step="0.01" min="0" value={fUnitCost} onChange={(e) => setFUnitCost(e.target.value)}
                        readOnly={isBundle && bundleComponents.length > 0}
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                        style={{ borderColor: 'var(--light-gray)', background: isBundle && bundleComponents.length > 0 ? 'var(--off-white)' : 'white' }} />
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

                  {/* Dimensions (L × W × H for CBM freight calculation) */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                      Dimensions <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(cm, inclusive of packaging — used for CBM)</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>L (cm)</label>
                        <input type="number" step="0.01" min="0" value={fDimL} onChange={e => setFDimL(e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>W (cm)</label>
                        <input type="number" step="0.01" min="0" value={fDimW} onChange={e => setFDimW(e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>H (cm)</label>
                        <input type="number" step="0.01" min="0" value={fDimH} onChange={e => setFDimH(e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                    </div>
                    {fDimL && fDimW && fDimH && parseFloat(fDimL) > 0 && parseFloat(fDimW) > 0 && parseFloat(fDimH) > 0 && (
                      <p className="mt-1.5 text-xs font-medium" style={{ color: 'var(--teal)' }}>
                        CBM: {((parseFloat(fDimL) * parseFloat(fDimW) * parseFloat(fDimH)) / 1_000_000).toFixed(6)} m³
                      </p>
                    )}
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

                  {/* Revenue Account (COA) — searchable */}
                  <div className="relative">
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                      Revenue Account <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(Credit on checkout)</span>
                    </label>
                    <input
                      type="text"
                      value={fRevenueAccountSearch}
                      onChange={(e) => { setFRevenueAccountSearch(e.target.value); if (!e.target.value) setFRevenueAccountId('') }}
                      onFocus={() => setFRevenueAccountSearch(fRevenueAccountSearch || '')}
                      placeholder="Search account..."
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                      style={{ borderColor: fRevenueAccountId ? 'var(--teal)' : 'var(--light-gray)', background: fRevenueAccountId ? '#f0fdfa' : 'white' }}
                    />
                    {fRevenueAccountId && (
                      <button type="button" onClick={() => { setFRevenueAccountId(''); setFRevenueAccountSearch('') }}
                        className="absolute right-2 top-8 p-0.5 rounded hover:bg-gray-100"><X size={14} style={{ color: 'var(--mid-gray)' }} /></button>
                    )}
                    {fRevenueAccountSearch && !fRevenueAccountId && (
                      <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-40 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                        {revenueAccounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(fRevenueAccountSearch.toLowerCase())).slice(0, 10).map(a => (
                          <button key={a.id} type="button" onClick={() => { setFRevenueAccountId(a.id); setFRevenueAccountSearch(`${a.accountNumber} ${a.accountTitle}`) }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                            <span className="font-mono font-medium" style={{ color: 'var(--teal)' }}>{a.accountNumber}</span> {a.accountTitle}
                          </button>
                        ))}
                        {revenueAccounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(fRevenueAccountSearch.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>No matching accounts</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Source Account (Paid From) — searchable */}
                  <div className="relative">
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                      Source Account <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(Paid from / Debit)</span>
                    </label>
                    <input
                      type="text"
                      value={fSourceAccountSearch}
                      onChange={(e) => { setFSourceAccountSearch(e.target.value); if (!e.target.value) setFSourceAccountId('') }}
                      onFocus={() => setFSourceAccountSearch(fSourceAccountSearch || '')}
                      placeholder="Search account..."
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                      style={{ borderColor: fSourceAccountId ? 'var(--teal)' : 'var(--light-gray)', background: fSourceAccountId ? '#f0fdfa' : 'white' }}
                    />
                    {fSourceAccountId && (
                      <button type="button" onClick={() => { setFSourceAccountId(''); setFSourceAccountSearch('') }}
                        className="absolute right-2 top-8 p-0.5 rounded hover:bg-gray-100"><X size={14} style={{ color: 'var(--mid-gray)' }} /></button>
                    )}
                    {fSourceAccountSearch && !fSourceAccountId && (
                      <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-40 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                        {sourceAccounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(fSourceAccountSearch.toLowerCase())).slice(0, 10).map(a => (
                          <button key={a.id} type="button" onClick={() => { setFSourceAccountId(a.id); setFSourceAccountSearch(`${a.accountNumber} ${a.accountTitle}`) }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                            <span className="font-mono font-medium" style={{ color: 'var(--teal)' }}>{a.accountNumber}</span> {a.accountTitle}
                          </button>
                        ))}
                        {sourceAccounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(fSourceAccountSearch.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>No matching accounts</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Expense Account (COGS) — searchable */}
                  <div className="relative">
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                      Expense Account <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(COGS / Cost of Goods Sold)</span>
                    </label>
                    <input
                      type="text"
                      value={fExpenseAccountSearch}
                      onChange={(e) => { setFExpenseAccountSearch(e.target.value); if (!e.target.value) setFExpenseAccountId('') }}
                      onFocus={() => setFExpenseAccountSearch(fExpenseAccountSearch || '')}
                      placeholder="Search expense account..."
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                      style={{ borderColor: fExpenseAccountId ? 'var(--coral)' : 'var(--light-gray)', background: fExpenseAccountId ? '#fff5f5' : 'white' }}
                    />
                    {fExpenseAccountId && (
                      <button type="button" onClick={() => { setFExpenseAccountId(''); setFExpenseAccountSearch('') }}
                        className="absolute right-2 top-8 p-0.5 rounded hover:bg-gray-100"><X size={14} style={{ color: 'var(--mid-gray)' }} /></button>
                    )}
                    {fExpenseAccountSearch && !fExpenseAccountId && (
                      <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-40 overflow-y-auto" style={{ borderColor: 'var(--light-gray)' }}>
                        {expenseAccounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(fExpenseAccountSearch.toLowerCase())).slice(0, 10).map(a => (
                          <button key={a.id} type="button" onClick={() => { setFExpenseAccountId(a.id); setFExpenseAccountSearch(`${a.accountNumber} ${a.accountTitle}`) }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                            <span className="font-mono font-medium" style={{ color: 'var(--coral)' }}>{a.accountNumber}</span> {a.accountTitle}
                          </button>
                        ))}
                        {expenseAccounts.filter(a => `${a.accountNumber} ${a.accountTitle}`.toLowerCase().includes(fExpenseAccountSearch.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>No matching accounts</p>
                        )}
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

                  {/* Issued Official Sales Invoice */}
                  <div className="rounded-xl border p-3" style={{ borderColor: issuedOfficialInvoice ? '#86efac' : 'var(--light-gray)', background: issuedOfficialInvoice ? '#f0fdf4' : 'transparent' }}>
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: issuedOfficialInvoice ? '#166534' : 'var(--charcoal)' }}>
                      <input type="checkbox" checked={issuedOfficialInvoice}
                        onChange={(e) => setIssuedOfficialInvoice(e.target.checked)}
                        className="rounded" />
                      Issued Official Sales Invoice
                    </label>
                  </div>

                  {/* Website Classification — how shoppers browse this item on verdanarehab.com.
                      Kept separate from the SKU department/category so merchandising can be
                      re-grouped without renumbering SKUs. */}
                  <div className="rounded-xl border p-3" style={{ borderColor: fWebsiteClass ? '#c4b5fd' : 'var(--light-gray)', background: fWebsiteClass ? '#f5f3ff' : 'transparent' }}>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: fWebsiteClass ? '#5b21b6' : 'var(--charcoal)' }}>
                      Website Classification <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(customer-facing category on verdanarehab.com)</span>
                    </label>
                    <select
                      value={fWebsiteClass}
                      onChange={(e) => setFWebsiteClass(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-white"
                      style={{ borderColor: 'var(--light-gray)' }}
                    >
                      <option value="">— Not classified —</option>
                      {WEBSITE_CLASSIFICATIONS.map((c) => (
                        <option key={c.slug} value={c.label}>{c.label}</option>
                      ))}
                    </select>
                    <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                      Shoppers browse by this, not by the SKU hierarchy. Leave unset for items that
                      aren’t sold on the website.
                    </p>
                  </div>

                  {/* For Pre-order — deliberately 0-stock items (e.g. swings) stay buyable on verdanarehab.com */}
                  <div className="rounded-xl border p-3" style={{ borderColor: isPreOrder ? '#93c5fd' : 'var(--light-gray)', background: isPreOrder ? '#eff6ff' : 'transparent' }}>
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: isPreOrder ? '#1e40af' : 'var(--charcoal)' }}>
                      <input type="checkbox" checked={isPreOrder}
                        onChange={(e) => setIsPreOrder(e.target.checked)}
                        className="rounded" />
                      For Pre-order
                    </label>
                    <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                      Item is intentionally kept at 0 stock. It stays sellable at 0 — each sale takes the quantity
                      negative (that’s the pre-order backlog), and the backlog is netted off automatically when you
                      record the shipment’s arrival under Adjustments.
                    </p>
                  </div>

                  {/* Bundle Components */}
                  {editingItem && (
                    <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: isBundle ? '#fbbf24' : 'var(--light-gray)', background: isBundle ? '#fffbeb' : 'transparent' }}>
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: isBundle ? '#92400e' : 'var(--mid-gray)' }}>
                          {isBundle ? `Bundle (${bundleComponents.length} components)` : 'Bundle'}
                        </h4>
                        {!isBundle && (
                          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>Mark as bundle to auto-deduct components on sale</span>
                        )}
                      </div>
                      {bundleComponents.length > 0 && (
                        <div className="space-y-1">
                          {bundleComponents.map(bc => (
                            <div key={bc.id || bc.componentId} className="flex items-center justify-between p-2 rounded-lg text-xs" style={{ background: 'white' }}>
                              <div>
                                <span className="font-mono" style={{ color: 'var(--charcoal)' }}>{bc.sku}</span>
                                <span className="ml-2" style={{ color: 'var(--mid-gray)' }}>{bc.name}</span>
                                <span className="ml-2 font-semibold" style={{ color: '#92400e' }}>×{bc.quantity}</span>
                                <span className="ml-2" style={{ color: 'var(--teal)' }}>@ {formatCurrency(bc.unitCost || 0)} = {formatCurrency((bc.unitCost || 0) * bc.quantity)}</span>
                              </div>
                              {bc.id && (
                                <button type="button" onClick={() => removeBundleComponent(bc.id!)} className="p-1 rounded hover:bg-red-50">
                                  <Trash2 size={12} className="text-red-500" />
                                </button>
                              )}
                            </div>
                          ))}
                          <div className="flex justify-between px-2 pt-1 border-t text-xs font-bold" style={{ borderColor: '#fbbf24', color: '#92400e' }}>
                            <span>Total Bundle Unit Cost</span>
                            <span>{formatCurrency(bundleComponents.reduce((sum, bc) => sum + (bc.unitCost || 0) * bc.quantity, 0))}</span>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Component Product</label>
                          <select value={bundleComponentId} onChange={e => setBundleComponentId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                            <option value="">— Select product —</option>
                            {allItems.filter(i => i.id !== editingItem.id && !i.isBundle).map(i => (
                              <option key={i.id} value={i.id}>{i.sku} — {i.name} (Qty: {i.quantity})</option>
                            ))}
                          </select>
                        </div>
                        <div className="w-16">
                          <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Qty</label>
                          <input type="number" min={1} value={bundleComponentQty} onChange={e => setBundleComponentQty(parseInt(e.target.value) || 1)}
                            className="w-full px-2 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                        <button type="button" onClick={addBundleComponent} disabled={!bundleComponentId}
                          className="px-3 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ background: '#f59e0b' }}>
                          Add
                        </button>
                      </div>
                      {isBundle && (
                        <p className="text-xs" style={{ color: '#92400e' }}>
                          When this bundle is sold, each component quantity will be automatically deducted from inventory.
                        </p>
                      )}
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
            <div className="flex items-center gap-2">
              <DownloadMenu onDownload={handleDownloadSuppliers} label="Download" />
              {canWrite && (
                <button onClick={openSupplierCreate}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: 'var(--teal)' }}>
                  <Plus size={18} />
                  Add Supplier
                </button>
              )}
            </div>
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
                  ) : suppliers.slice((supPage - 1) * supPageSize, supPage * supPageSize).map((s) => (
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
            {suppliers.length > 0 && (
              <Pagination totalItems={suppliers.length} page={supPage} pageSize={supPageSize}
                onPageChange={setSupPage} onPageSizeChange={setSupPageSize} />
            )}
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
            <div className="flex items-center gap-2">
              <DownloadMenu onDownload={handleDownloadAdjustments} label="Download" />
              {canWrite && (<>
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
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border"
                  style={{ borderColor: 'var(--light-gray)', color: '#dc2626' }}>
                  <TrendingDown size={14} /> Adjust Stock
                </button>
                <button onClick={() => setBulkShrinkOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border"
                  style={{ borderColor: 'var(--teal)', color: 'var(--teal)', background: 'var(--pale-teal)' }}>
                  <ClipboardCheck size={14} /> Inventory Audit
                </button>
                <button onClick={openFbModal}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: 'var(--teal)' }}>
                  <Plus size={18} /> New Adjustment
                </button>
              </>)}
            </div>
          </div>

          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Ref #</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Date</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Item</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Type</th>
                    <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Qty Change</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Prev → New</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Remarks</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Adjusted By</th>
                    {canWrite && <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {adjustments.length === 0 ? (
                    <tr>
                      <td colSpan={canWrite ? 9 : 8} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                        <ArrowUpDown size={32} className="mx-auto mb-2 opacity-40" />
                        <p>No adjustments</p>
                      </td>
                    </tr>
                  ) : groupedAdjustments.slice((adjPage - 1) * adjPageSize, adjPage * adjPageSize).map((g) => (
                    g.kind === 'single' ? (() => { const adj = g.adj; return (
                    <tr key={adj.id} className="border-t hover:bg-gray-50/50 transition-colors" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: '#f0fdfa', color: 'var(--teal)' }}>
                          {adj.displayRef || adj.batch?.referenceNumber || adj.referenceNumber || genAdjRef(adj)}
                        </span>
                      </td>
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
                      {canWrite && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button onClick={() => setDeleteAdjConfirm(adj.id)} className="p-2 rounded-lg hover:bg-red-50 transition-colors" title="Delete Adjustment">
                            <Trash2 size={15} className="text-red-500" />
                          </button>
                        </td>
                      )}
                    </tr>
                    ) })() : (() => {
                      const open = expandedBatches.has(g.batchRefId)
                      const totalQty = g.items.reduce((s, x) => s + x.quantityChange, 0)
                      return (
                    <React.Fragment key={g.batchRefId}>
                      <tr className="border-t hover:bg-gray-50/50 transition-colors cursor-pointer" style={{ borderColor: 'var(--light-gray)' }} onClick={() => toggleBatch(g.batchRefId)}>
                        <td className="px-4 py-3">
                          <span className="mr-1" style={{ color: 'var(--mid-gray)' }}>{open ? '▾' : '▸'}</span>
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: '#f0fdfa', color: 'var(--teal)' }}>{g.ref}</span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{formatDate(g.date)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--charcoal)' }}>{g.items.length} product{g.items.length === 1 ? '' : 's'}</td>
                        <td className="px-4 py-3"><span className="px-2 py-1 rounded-md text-xs font-medium" style={{ background: '#e0f2fe', color: '#075985' }}>FREIGHT</span></td>
                        <td className="px-4 py-3 text-right font-medium" style={{ color: '#166534' }}>+{totalQty}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>—</td>
                        <td className="px-4 py-3 text-xs max-w-[180px] truncate" style={{ color: 'var(--mid-gray)' }}>{g.items[0]?.remarks || '—'}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{g.by}</td>
                        {canWrite && (
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button onClick={(e) => { e.stopPropagation(); openFbEdit(g.batchRefId) }} disabled={fbLoadingEdit} className="p-2 rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50 mr-1" title="Edit freight batch">
                              <Pencil size={15} style={{ color: 'var(--teal)' }} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleBatchDelete(g.batchRefId, g.ref, g.items.length) }} className="p-2 rounded-lg hover:bg-red-50 transition-colors" title="Delete freight batch">
                              <Trash2 size={15} className="text-red-500" />
                            </button>
                          </td>
                        )}
                      </tr>
                      {open && g.items.map(it => (
                        <tr key={it.id} style={{ background: '#fafafa', borderColor: 'var(--light-gray)' }} className="border-t">
                          <td className="px-4 py-2"></td>
                          <td className="px-4 py-2"></td>
                          <td className="px-4 py-2 pl-8">
                            <span className="font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{it.item?.sku}</span>
                            <span className="text-xs ml-2" style={{ color: 'var(--mid-gray)' }}>{it.item?.name}</span>
                          </td>
                          <td className="px-4 py-2"></td>
                          <td className="px-4 py-2 text-right font-medium text-xs" style={{ color: '#166534' }}>+{it.quantityChange}</td>
                          <td className="px-4 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{it.previousQuantity} → {it.newQuantity}</td>
                          <td className="px-4 py-2 text-xs" style={{ color: 'var(--mid-gray)' }} colSpan={canWrite ? 3 : 2}>{it.localCost != null ? `Unit cost ₱${Number(it.localCost).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : ''}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                      )
                    })()
                  ))}
                </tbody>
              </table>
            </div>
            {adjustments.length > 0 && (
              <Pagination totalItems={groupedAdjustments.length} page={adjPage} pageSize={adjPageSize}
                onPageChange={setAdjPage} onPageSizeChange={setAdjPageSize} />
            )}
          </div>

          {/* Delete Adjustment Confirm */}
          {deleteAdjConfirm && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
                <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Delete Adjustment</h3>
                <p className="text-sm mb-2" style={{ color: 'var(--mid-gray)' }}>Are you sure you want to delete this adjustment? This will reverse the quantity change on the item.</p>
                <div className="flex gap-3 justify-end mt-6">
                  <button onClick={() => setDeleteAdjConfirm(null)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--light-gray)' }} disabled={deletingAdj}>Cancel</button>
                  <button onClick={() => handleAdjDelete(deleteAdjConfirm)} className="px-4 py-2 rounded-lg text-sm text-white bg-red-500 hover:bg-red-600 flex items-center gap-2" disabled={deletingAdj}>
                    {deletingAdj && <Loader2 size={14} className="animate-spin" />} Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* New Adjustment Modal */}
          {capOpen && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>Capitalize Freight Forwarder Cost</h3>
                  <button onClick={() => { setCapOpen(false); setCapEntryId(null) }} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X size={20} style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </div>
                <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
                  Adds the freight cost to a specific stock batch&apos;s landed cost — no quantity change — raising that batch&apos;s unit cost. No journal entry is posted (the freight&apos;s petty-cash / expense entry already carries it), so inventory value is not double-counted.
                </p>
                {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>}
                <form onSubmit={handleCapitalizeSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Item</label>
                    <select value={capItemId} onChange={(e) => loadCapLots(e.target.value)} required
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">— Select item —</option>
                      {allItems.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Stock batch (INCREASE lot)</label>
                    <select value={capAdjId} onChange={(e) => setCapAdjId(e.target.value)} required disabled={!capItemId}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none disabled:bg-gray-50" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">{capItemId ? (capLots.length ? '— Select batch —' : 'No stock-in batches for this item') : '— Select item first —'}</option>
                      {capLots.map((l) => {
                        const capItemUnitCost = Number(allItems.find((i) => i.id === capItemId)?.unitCost ?? 0)
                        const cur = l.totalLandedCost != null ? Number(l.totalLandedCost) : (l.localCost != null ? Number(l.localCost) * l.quantityChange : capItemUnitCost * l.quantityChange)
                        return <option key={l.id} value={l.id}>{(l.displayRef || l.id.slice(0, 6))} · {String(l.adjustmentDate).slice(0, 10)} · qty {l.quantityChange} · cost ₱{cur.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</option>
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Freight amount to capitalize (₱, net of VAT)</label>
                    <input type="number" step="0.01" min="0" value={capAmount} onChange={(e) => setCapAmount(e.target.value)} required
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => { setCapOpen(false); setCapEntryId(null) }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
                    <button type="submit" disabled={capSaving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: 'var(--teal)' }}>{capSaving ? 'Saving…' : 'Capitalize freight'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {adjModalOpen && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>New Adjustment</h3>
                  <button onClick={() => { setAdjModalOpen(false); setPcfSourceEntryId(null) }} className="p-1 hover:bg-gray-100 rounded-lg">
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
                  {/* Cost fields for INCREASE (purchase cost tracking) */}
                  {adjType === 'INCREASE' && (
                    <div className="p-3 rounded-xl space-y-3" style={{ background: '#f0fdfa', border: '1px solid var(--teal)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--teal)' }}>Purchase Cost</p>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Cost per Unit (PHP)</label>
                        <input type="number" step="0.01" min="0" value={adjLocalCost} onChange={(e) => setAdjLocalCost(e.target.value)}
                          placeholder="e.g. 70.22"
                          className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                      <div className="text-xs font-medium pt-1" style={{ color: 'var(--mid-gray)' }}>— or enter foreign currency cost —</div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Foreign Cost/Unit</label>
                          <input type="number" step="0.01" min="0" value={adjForeignCost} onChange={(e) => setAdjForeignCost(e.target.value)}
                            placeholder="e.g. 9.50"
                            className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Currency</label>
                          <select value={adjForeignCurrency} onChange={(e) => setAdjForeignCurrency(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                            <option value="CNY">CNY</option>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                            <option value="JPY">JPY</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Exchange Rate</label>
                          <input type="number" step="0.0001" min="0" value={adjExchangeRate} onChange={(e) => setAdjExchangeRate(e.target.value)}
                            placeholder="e.g. 7.80"
                            className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Preview */}
                  {adjItemId && adjQty && (
                    <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>
                      Previous: <strong>{adjPrevQty}</strong> → New: <strong>{adjNewQty}</strong>
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => { setAdjModalOpen(false); setPcfSourceEntryId(null) }}
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

          {bulkShrinkOpen && (
            <BulkShrinkageCountModal
              items={allItems}
              onClose={() => setBulkShrinkOpen(false)}
              onDone={() => { setBulkShrinkOpen(false); fetchAdjustments(); fetchItems(); fetchAllItems() }}
            />
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

          {/* ── Freight Batch Adjustment Modal ─────────────── */}
          {fbOpen && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-6 pb-6 overflow-y-auto">
              <div className="bg-white rounded-2xl shadow-xl w-full mx-4" style={{ maxWidth: '960px' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--light-gray)' }}>
                  <div>
                    <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{fbEditId ? 'Edit Adjustment — Freight Purchase' : 'New Adjustment — Freight Purchase'}</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{fbEditId ? 'Editing reverses this batch and re-applies the rows below (blocked if any item was already sold). Unit costs recompute by CBM.' : 'Enter items, manufacturer prices, freight costs, and the system will compute unit costs proportionally by CBM.'}</p>
                  </div>
                  <button onClick={() => setFbOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg ml-4">
                    <X size={20} style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </div>

                <form onSubmit={handleFbSubmit}>
                  <div className="px-6 py-5 space-y-5">
                    {error && <div className="p-3 rounded-lg text-sm bg-red-50 text-red-600 flex items-center gap-1"><AlertCircle size={14} />{error}</div>}

                    {/* Date + Remarks */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Purchase Date</label>
                        <input type="date" value={fbDate} onChange={e => setFbDate(e.target.value)} required
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Remarks</label>
                        <input type="text" value={fbRemarks} onChange={e => setFbRemarks(e.target.value)} placeholder="e.g. PO-2025-001 shipment"
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                    </div>

                    {/* Exchange Rate */}
                    <div className="p-4 rounded-xl border space-y-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--charcoal)' }}>Exchange Rate</span>
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--charcoal)' }}>
                          <input type="checkbox" checked={!fbHasForeign} onChange={e => setFbHasForeign(!e.target.checked)} className="rounded" />
                          No foreign purchase (all PHP)
                        </label>
                      </div>
                      {fbHasForeign && (
                        <>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Foreign Currency</label>
                            <select value={fbCurrency} onChange={e => { setFbCurrency(e.target.value); setFbFxAccountId(''); loadFbFxAndRfps(e.target.value) }}
                              className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                              {['CNY','USD','EUR','JPY','KRW','SGD','HKD'].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>{fbCurrency} funds from (bank account)</label>
                            <select value={fbFxAccountId} onChange={e => applyFxAccount(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                              <option value="">— Select {fbCurrency} account —</option>
                              {fbFxAccounts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} · {a.accountTitle}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Exchange Rate (PHP per 1 {fbCurrency})</label>
                            <input type="number" step="0.0001" min="0" value={fbExRate} onChange={e => setFbExRate(e.target.value)} placeholder="e.g. 7.80"
                              className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                          </div>
                        </div>
                        {(() => {
                          const acct = fbFxAccounts.find(a => a.id === fbFxAccountId)
                          if (!acct) return fbFxAccounts.length === 0 ? (
                            <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>No {fbCurrency} bank account found in the Chart of Accounts — the rate must be keyed by hand.</p>
                          ) : null
                          const peso2 = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          return (
                            <div className="text-[11px] space-y-0.5" style={{ color: 'var(--mid-gray)' }}>
                              {acct.weightedRate != null ? (
                                <p>
                                  Auto rate <strong style={{ color: 'var(--teal)' }}>₱{acct.weightedRate.toFixed(4)}</strong> per 1 {fbCurrency} — weighted from {acct.purchases.length} forex purchase{acct.purchases.length === 1 ? '' : 's'} in Bank Recon
                                  {' '}(₱{peso2(acct.phpTotal)} paid for {fbCurrency} {peso2(acct.fxTotal)}).
                                  {' '}Available balance ≈ {fbCurrency} {peso2(acct.balance)}.
                                  {fbExRate && Math.abs(parseFloat(fbExRate) - acct.weightedRate) > 0.0001 && (
                                    <button type="button" onClick={() => setFbExRate(String(Number(acct.weightedRate!.toFixed(4))))} className="ml-1 underline" style={{ color: 'var(--teal)' }}>Use auto rate</button>
                                  )}
                                </p>
                              ) : acct.fallbackRate ? (
                                <p>No forex purchase recorded for this account — using the latest Bank-Recon rate ₱{acct.fallbackRate.phpPerUnit} ({acct.fallbackRate.date}). Available balance ≈ {fbCurrency} {peso2(acct.balance)}.</p>
                              ) : (
                                <p>No forex purchase or Bank-Recon rate on file for this account — key the rate by hand. Available balance ≈ {fbCurrency} {peso2(acct.balance)}.</p>
                              )}
                            </div>
                          )
                        })()}
                        </>
                      )}
                    </div>

                    {/* Freight Costs */}
                    <div className="p-4 rounded-xl border space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--charcoal)' }}>Freight Costs</span>
                      {[
                        { label: 'Manufacturing → Warehouse', val: fbFreight1, setVal: setFbFreight1, isForeign: fbFreight1Foreign, setForeign: setFbFreight1Foreign },
                        { label: 'Foreign → Local', val: fbFreight2, setVal: setFbFreight2, isForeign: fbFreight2Foreign, setForeign: setFbFreight2Foreign },
                        { label: 'Warehouse → Office', val: fbFreight3, setVal: setFbFreight3, isForeign: fbFreight3Foreign, setForeign: setFbFreight3Foreign },
                      ].map(({ label, val, setVal, isForeign, setForeign }) => (
                        <div key={label} className="flex items-center gap-3">
                          <span className="text-xs w-44 shrink-0" style={{ color: 'var(--mid-gray)' }}>{label}</span>
                          <input type="number" step="0.01" min="0" value={val} onChange={e => setVal(e.target.value)} placeholder="0.00"
                            className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                          <button type="button" onClick={() => setForeign(!isForeign)}
                            className="px-3 py-2 rounded-lg border text-xs font-medium transition-colors"
                            style={isForeign && fbHasForeign
                              ? { background: '#f0fdfa', borderColor: 'var(--teal)', color: 'var(--teal)' }
                              : { borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                            {isForeign && fbHasForeign ? fbCurrency : 'PHP'}
                          </button>
                          {isForeign && fbHasForeign && val && fbExRate && (
                            <span className="text-xs w-28 text-right shrink-0" style={{ color: 'var(--teal)' }}>
                              = ₱{((parseFloat(val) || 0) * (parseFloat(fbExRate) || 1)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--light-gray)' }}>
                        <span className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Total Freight (PHP)</span>
                        <span className="text-sm font-bold" style={{ color: 'var(--teal)' }}>
                          ₱{fbTotalFreightPHP.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {/* Linked Payments — the RFPs that actually paid the manufacturer and the
                        freight forwarder (often recorded separately in Expenses). */}
                    <div className="p-4 rounded-xl border space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--charcoal)' }}>Linked Payments (RFPs)</span>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Manufacturer payment RFP', val: fbManuRfpId, set: setFbManuRfpId },
                          { label: 'Freight forwarder RFP', val: fbFreightRfpId, set: setFbFreightRfpId },
                        ].map(({ label, val, set }) => (
                          <div key={label}>
                            <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>{label}</label>
                            <select value={val} onChange={e => set(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                              <option value="">— Not linked —</option>
                              {fbRfpOptions.map(r => (
                                <option key={r.id} value={r.id}>
                                  {r.refNumber}{r.payableTo ? ` — ${r.payableTo}` : ''} · ₱{r.grossTotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {r.status === 'PAID' ? 'Paid' : 'For Payment'}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                      {/* Overall totals of what this shipment cost */}
                      <div className="pt-2 border-t space-y-1" style={{ borderColor: 'var(--light-gray)' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                            Paid to manufacturer (goods)
                            {fbHasForeign && fbGoodsTotals.foreign > 0 && <> · {fbCurrency} {fbGoodsTotals.foreign.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>}
                          </span>
                          <span className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>₱{fbGoodsTotals.php.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>Freight costs</span>
                          <span className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>₱{fbTotalFreightPHP.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Total shipment cost (PHP)</span>
                          <span className="text-sm font-bold" style={{ color: 'var(--teal)' }}>₱{(fbGoodsTotals.php + fbTotalFreightPHP).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        {(fbManuRfpId || fbFreightRfpId) && (
                          <p className="text-[11px] pt-1" style={{ color: 'var(--mid-gray)' }}>
                            {[fbManuRfpId && `Manufacturer: ${fbRfpOptions.find(r => r.id === fbManuRfpId)?.refNumber || '—'}`,
                              fbFreightRfpId && `Freight: ${fbRfpOptions.find(r => r.id === fbFreightRfpId)?.refNumber || '—'}`]
                              .filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Item Table */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--charcoal)' }}>Items</span>
                        <button type="button"
                          onClick={() => setFbRows(prev => [...prev, { itemId: '', itemName: '', itemSku: '', dimL: '', dimW: '', dimH: '', manPrice: '', manPriceIsForeign: true, quantity: '' }])}
                          className="text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1"
                          style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                          <Plus size={12} /> Add Row
                        </button>
                      </div>
                      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs" style={{ minWidth: '860px' }}>
                            <thead>
                              <tr style={{ background: 'var(--off-white)' }}>
                                <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)', minWidth: '200px' }}>Item</th>
                                <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)', width: '140px' }}>Mfr. Price</th>
                                <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)', width: '64px' }}>Qty</th>
                                <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)', width: '60px' }}>L (cm)</th>
                                <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)', width: '60px' }}>W (cm)</th>
                                <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)', width: '60px' }}>H (cm)</th>
                                <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)', width: '90px' }}>CBM/unit</th>
                                <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)', width: '90px' }}>Total CBM</th>
                                <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--teal)', width: '100px' }}>Unit Cost (₱)</th>
                                <th className="px-2 py-2" style={{ width: '32px' }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {fbRows.map((row, i) => {
                                const computed = fbComputedRows[i]
                                return (
                                  <tr key={i} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                                    {/* Item selector */}
                                    <td className="px-2 py-1.5">
                                      <div className="flex items-center gap-2">
                                      {(() => { const img = allItems.find(it => it.id === row.itemId)?.imageUrl; return img ? <img src={img} alt="" className="w-8 h-8 rounded object-cover border shrink-0" style={{ borderColor: 'var(--light-gray)' }} /> : null })()}
                                      <select value={row.itemId}
                                        onChange={e => {
                                          const selected = allItems.find(it => it.id === e.target.value)
                                          setFbRows(prev => prev.map((r, idx) => idx !== i ? r : {
                                            ...r,
                                            itemId: e.target.value,
                                            itemName: selected?.name || '',
                                            itemSku: selected?.sku || '',
                                            dimL: selected?.dimensionLength != null ? String(selected.dimensionLength) : r.dimL,
                                            dimW: selected?.dimensionWidth != null ? String(selected.dimensionWidth) : r.dimW,
                                            dimH: selected?.dimensionHeight != null ? String(selected.dimensionHeight) : r.dimH,
                                          }))
                                        }}
                                        className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                                        <option value="">— Select item —</option>
                                        {allItems.map(it => <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>)}
                                      </select>
                                      </div>
                                    </td>
                                    {/* Manufacturer price + currency toggle */}
                                    <td className="px-2 py-1.5">
                                      <div className="flex gap-1">
                                        <input type="number" step="0.01" min="0" value={row.manPrice}
                                          onChange={e => setFbRows(prev => prev.map((r, idx) => idx !== i ? r : { ...r, manPrice: e.target.value }))}
                                          placeholder="0.00"
                                          className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                                        {fbHasForeign && (
                                          <button type="button"
                                            onClick={() => setFbRows(prev => prev.map((r, idx) => idx !== i ? r : { ...r, manPriceIsForeign: !r.manPriceIsForeign }))}
                                            className="px-2 py-1 rounded border text-xs shrink-0 transition-colors"
                                            style={row.manPriceIsForeign
                                              ? { background: '#f0fdfa', borderColor: 'var(--teal)', color: 'var(--teal)' }
                                              : { borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                                            {row.manPriceIsForeign ? fbCurrency : 'PHP'}
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                    {/* Quantity */}
                                    <td className="px-2 py-1.5">
                                      <input type="number" min="1" value={row.quantity}
                                        onChange={e => setFbRows(prev => prev.map((r, idx) => idx !== i ? r : { ...r, quantity: e.target.value }))}
                                        className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none text-right" style={{ borderColor: 'var(--light-gray)' }} />
                                    </td>
                                    {/* L / W / H */}
                                    {(['dimL', 'dimW', 'dimH'] as const).map(dim => (
                                      <td key={dim} className="px-2 py-1.5">
                                        <input type="number" step="0.01" min="0" value={row[dim]}
                                          onChange={e => setFbRows(prev => prev.map((r, idx) => idx !== i ? r : { ...r, [dim]: e.target.value }))}
                                          className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none text-right" style={{ borderColor: 'var(--light-gray)' }} />
                                      </td>
                                    ))}
                                    {/* CBM/unit */}
                                    <td className="px-3 py-1.5 text-right" style={{ color: 'var(--mid-gray)' }}>
                                      {computed.cbmPerUnit > 0 ? computed.cbmPerUnit.toFixed(6) : '—'}
                                    </td>
                                    {/* Total CBM */}
                                    <td className="px-3 py-1.5 text-right" style={{ color: 'var(--mid-gray)' }}>
                                      {computed.totalCbm > 0 ? computed.totalCbm.toFixed(6) : '—'}
                                    </td>
                                    {/* Unit Cost */}
                                    <td className="px-3 py-1.5 text-right font-semibold" style={{ color: 'var(--teal)' }}>
                                      {row.itemId && row.quantity ? `₱${computed.unitCost.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                                    </td>
                                    {/* Remove row */}
                                    <td className="px-2 py-1.5 text-center">
                                      {fbRows.length > 1 && (
                                        <button type="button" onClick={() => setFbRows(prev => prev.filter((_, idx) => idx !== i))}
                                          className="p-1 rounded hover:bg-red-50">
                                          <X size={12} className="text-red-400" />
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Proof of Purchase */}
                    <div>
                      <label className="block text-xs font-medium mb-2" style={{ color: 'var(--charcoal)' }}>
                        Proof of Purchase <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(PDF, JPG, PNG, Word)</span>
                      </label>
                      <input ref={fbFileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={handleFbUpload} />
                      <button type="button" onClick={() => fbFileRef.current?.click()} disabled={fbUploading}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm disabled:opacity-50"
                        style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                        {fbUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        {fbUploading ? 'Uploading…' : 'Upload Files'}
                      </button>
                      {fbProofUrls.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {fbProofUrls.map((url, i) => {
                            const filename = url.split('/').pop() || url
                            return (
                              <div key={i} className="flex items-center gap-2 p-2 rounded-lg text-xs" style={{ background: 'var(--off-white)' }}>
                                <FileText size={12} style={{ color: 'var(--mid-gray)' }} />
                                <span className="flex-1 truncate" style={{ color: 'var(--charcoal)' }}>{filename}</span>
                                <a href={url} target="_blank" rel="noreferrer"
                                  className="px-2 py-0.5 rounded border text-xs" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                                  View
                                </a>
                                <button type="button" onClick={() => setFbProofUrls(prev => prev.filter((_, idx) => idx !== i))}
                                  className="p-0.5 rounded hover:bg-red-50">
                                  <X size={11} className="text-red-400" />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <button type="button" onClick={() => setFbOpen(false)}
                      className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                      style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                      Cancel
                    </button>
                    <button type="submit" disabled={fbSaving || fbRows.filter(r => r.itemId && r.quantity).length === 0}
                      className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{ background: 'var(--teal)' }}>
                      {fbSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : (fbEditId ? 'Save Changes' : 'Record Freight Batch')}
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
            <div className="flex items-center gap-2">
              <DownloadMenu onDownload={handleDownloadConsignments} label="Download" />
              {canWrite && (
                <>
                  <button onClick={() => {
                    const csv = 'sku,quantity,to_branch,remarks\nOT-EQP-FIN-001,2,SANDBOX_GREENHILLS,Consignment\nEDU-MAT-BOK-001,3,SANDBOX_EAST,'
                    const blob = new Blob([csv], { type: 'text/csv' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a'); a.href = url; a.download = 'consignment-import-template.csv'; a.click()
                    URL.revokeObjectURL(url)
                  }}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border"
                    style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                    <Download size={14} /> CSV Template
                  </button>
                  <button onClick={() => { setConCsvModalOpen(true); setConCsvStep('upload'); setConCsvData([]); setConCsvResult(null); setError('') }}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border"
                    style={{ borderColor: 'var(--teal)', color: 'var(--teal)', background: 'var(--pale-teal)' }}>
                    <Upload size={14} /> Import CSV
                  </button>
                </>
              )}
              {canWrite && selectedTransferIds.size > 0 && (
                <>
                  <button onClick={async () => {
                    if (!window.confirm(`Approve ${selectedTransferIds.size} selected transfer(s)?`)) return
                    setSaving(true)
                    await fetch('/api/inventory/consignments', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(selectedTransferIds), action: 'approve' }) })
                    setSelectedTransferIds(new Set()); fetchConsignments(); setSaving(false)
                  }}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-white" style={{ background: '#16a34a' }}>
                    Bulk Approve ({selectedTransferIds.size})
                  </button>
                  <button onClick={async () => {
                    if (!window.confirm(`Cancel ${selectedTransferIds.size} selected transfer(s)?`)) return
                    setSaving(true)
                    await fetch('/api/inventory/consignments', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(selectedTransferIds), action: 'cancel' }) })
                    setSelectedTransferIds(new Set()); fetchConsignments(); setSaving(false)
                  }}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-white" style={{ background: '#dc2626' }}>
                    Bulk Cancel ({selectedTransferIds.size})
                  </button>
                </>
              )}
              {canWrite && (
                <button onClick={openConCreate}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: 'var(--teal)' }}>
                  <Plus size={18} />
                  New Transfer
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    <th className="px-2 py-3 w-8">
                      <input type="checkbox"
                        checked={consignments.filter(c => c.status === 'PENDING').length > 0 && consignments.filter(c => c.status === 'PENDING').every(c => selectedTransferIds.has(c.id))}
                        onChange={e => {
                          if (e.target.checked) setSelectedTransferIds(new Set(consignments.filter(c => c.status === 'PENDING').map(c => c.id)))
                          else setSelectedTransferIds(new Set())
                        }}
                        className="rounded" />
                    </th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Date</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Reference / Items</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>From → To</th>
                    <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Items</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Status</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Requested By</th>
                    {canWrite && <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {consignments.length === 0 ? (
                    <tr>
                      <td colSpan={canWrite ? 8 : 7} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                        <ArrowRightLeft size={32} className="mx-auto mb-2 opacity-40" />
                        <p>No transfers</p>
                      </td>
                    </tr>
                  ) : (() => {
                    return groupedConsignments.slice((conPage - 1) * conPageSize, conPage * conPageSize).map(g => {
                      const badge = STATUS_BADGE[g.first.status] || STATUS_BADGE.CANCELLED
                      const isExpanded = expandedRef === g.key
                      const allIds = g.items.map(i => i.id)
                      const allPending = g.items.every(i => i.status === 'PENDING')
                      const totalQty = g.items.reduce((s, i) => s + i.quantity, 0)
                      return (
                        <React.Fragment key={g.key}>
                          <tr className="border-t hover:bg-gray-50/50 transition-colors cursor-pointer" style={{ borderColor: 'var(--light-gray)' }}
                            onClick={() => setExpandedRef(isExpanded ? null : g.key)}>
                            <td className="px-2 py-3">
                              {allPending && (
                                <input type="checkbox" checked={allIds.every(id => selectedTransferIds.has(id))}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => {
                                    const next = new Set(selectedTransferIds)
                                    if (e.target.checked) allIds.forEach(id => next.add(id))
                                    else allIds.forEach(id => next.delete(id))
                                    setSelectedTransferIds(next)
                                  }}
                                  className="rounded" />
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{formatDate(g.first.createdAt)}</td>
                            <td className="px-4 py-3">
                              {g.ref ? (
                                <div>
                                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded" style={{ background: '#e0e7ff', color: '#3730a3' }}>{g.ref}</span>
                                  <span className="text-xs ml-2" style={{ color: 'var(--mid-gray)' }}>{g.items.length} items</span>
                                  <span className="ml-1 text-xs" style={{ color: 'var(--mid-gray)' }}>{isExpanded ? '▼' : '▶'}</span>
                                </div>
                              ) : (
                                <div>
                                  <span className="font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{g.first.item?.sku}</span>
                                  <span className="text-xs ml-2" style={{ color: 'var(--mid-gray)' }}>{g.first.item?.name}</span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                              {BRANCH_LABELS[g.first.fromBranch] || g.first.fromBranch}
                              <ArrowRight size={12} className="inline mx-1" />
                              {BRANCH_LABELS[g.first.toBranch] || g.first.toBranch}
                            </td>
                            <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--charcoal)' }}>
                              {g.ref ? `${g.items.length} (${totalQty} pcs)` : g.first.quantity}
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 rounded-md text-xs font-medium" style={{ background: badge.bg, color: badge.color }}>
                                {g.first.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{g.first.requestedBy?.name || '—'}</td>
                            {canWrite && (
                              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  {/* Generate PDF — opens modal to fill details */}
                                  <button onClick={() => {
                                    const staffName = g.first.requestedBy?.name || ''
                                    setPdfData({
                                      referenceNumber: g.ref,
                                      date: g.first.createdAt,
                                      fromBranch: BRANCH_LABELS[g.first.fromBranch] || g.first.fromBranch,
                                      toBranch: BRANCH_LABELS[g.first.toBranch] || g.first.toBranch,
                                      requestedBy: staffName,
                                      status: g.first.status,
                                      items: g.items.map(item => ({
                                        sku: item.item?.sku || '',
                                        name: item.item?.name || '',
                                        quantity: item.quantity,
                                        remarks: item.remarks,
                                      })),
                                    })
                                    setPdfFromStaff(staffName)
                                    setPdfFromPosition('')
                                    setPdfFromContact('')
                                    setPdfToReceiver('')
                                    setPdfToContact('')
                                    setPdfReleasedName(staffName)
                                    setPdfReleasedDate(new Date().toISOString().split('T')[0])
                                    setPdfReleasedContact('')
                                    setPdfReceivedName('')
                                    setPdfReceivedDate('')
                                    setPdfReceivedContact('')
                                    setPdfModalOpen(true)
                                  }}
                                    className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
                                    style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }} title="Generate Transmittal Form PDF">
                                    <FileText size={14} className="inline mr-1" />PDF
                                  </button>
                                  {allPending && (
                                    <>
                                      <button onClick={() => { allIds.forEach(id => handleConAction(id, 'approve')); setTimeout(fetchConsignments, 500) }}
                                        className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                                        style={{ background: 'var(--teal)' }} title="Approve">
                                        <CheckCircle2 size={14} className="inline mr-1" />Approve
                                      </button>
                                      <button onClick={() => { allIds.forEach(id => handleConAction(id, 'cancel')); setTimeout(fetchConsignments, 500) }}
                                        className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors" title="Cancel">
                                        <XCircle size={14} className="inline mr-1" />Cancel
                                      </button>
                                    </>
                                  )}
                                  {g.first.status === 'APPROVED' && (
                                    <button onClick={() => { allIds.forEach(id => handleConAction(id, 'ship')); setTimeout(fetchConsignments, 500) }}
                                      className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                                      style={{ background: '#4f46e5' }} title="Ship">
                                      <Send size={14} className="inline mr-1" />Ship
                                    </button>
                                  )}
                                  {g.first.status === 'SHIPPED' && (
                                    <>
                                      <button onClick={() => { allIds.forEach(id => handleConAction(id, 'receive')); setTimeout(fetchConsignments, 500) }}
                                        className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                                        style={{ background: '#16a34a' }} title="Receive">
                                        <CheckCircle2 size={14} className="inline mr-1" />Receive
                                      </button>
                                      <button onClick={() => { allIds.forEach(id => handleConAction(id, 'return')); setTimeout(fetchConsignments, 500) }}
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
                          {/* Expanded detail rows for batch transfers */}
                          {isExpanded && g.items.map(item => (
                            <tr key={item.id} className="border-t" style={{ borderColor: 'var(--light-gray)', background: '#f8fafc' }}>
                              <td></td>
                              <td></td>
                              <td className="px-4 py-2" colSpan={2}>
                                <span className="font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{item.item?.sku}</span>
                                <span className="text-xs ml-2" style={{ color: 'var(--mid-gray)' }}>{item.item?.name}</span>
                              </td>
                              <td className="px-4 py-2 text-right text-xs font-medium" style={{ color: 'var(--charcoal)' }}>{item.quantity}</td>
                              <td className="px-4 py-2">
                                <span className="px-2 py-0.5 rounded-md text-xs font-medium" style={{ background: (STATUS_BADGE[item.status] || STATUS_BADGE.CANCELLED).bg, color: (STATUS_BADGE[item.status] || STATUS_BADGE.CANCELLED).color }}>
                                  {item.status}
                                </span>
                              </td>
                              <td></td>
                              {canWrite && <td></td>}
                            </tr>
                          ))}
                        </React.Fragment>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
            {groupedConsignments.length > 0 && (
              <Pagination totalItems={groupedConsignments.length} page={conPage} pageSize={conPageSize}
                onPageChange={setConPage} onPageSizeChange={setConPageSize} />
            )}
          </div>

          {/* New Batch Transfer Modal */}
          {conModalOpen && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto">
              <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-xl mb-8">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>New Batch Transfer</h3>
                  <button onClick={() => { setConModalOpen(false); setBatchItems([]) }} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X size={20} style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </div>

                {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>}

                <div className="space-y-4">
                  {/* Destination branch (shared for all items) */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Destination Branch</label>
                    <select value={conToBranch} onChange={(e) => setConToBranch(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">— Select destination —</option>
                      {BRANCH_OPTIONS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>

                  {/* Items list */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium" style={{ color: 'var(--charcoal)' }}>Items to Transfer ({batchItems.length})</label>
                    </div>
                    {batchItems.length > 0 && (
                      <div className="space-y-1 mb-3 max-h-[280px] overflow-y-auto">
                        {batchItems.map((bi, idx) => {
                          const srcItem = allItems.find(i => i.id === bi.itemId)
                          const maxQty = srcItem?.quantity || 999
                          return (
                            <div key={idx} className="flex items-center justify-between p-2 rounded-lg text-xs gap-2" style={{ background: 'var(--off-white)' }}>
                              <span className="flex-1 truncate" style={{ color: 'var(--charcoal)' }}>{bi.itemSku} — {bi.itemName}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>Qty:</span>
                                <button type="button" onClick={() => setBatchItems(prev => prev.map((b, i) => i === idx ? { ...b, quantity: Math.max(1, b.quantity - 1) } : b))}
                                  className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold hover:bg-gray-200" style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}>−</button>
                                <input type="number" min={1} max={maxQty} value={bi.quantity}
                                  onChange={(e) => {
                                    const v = Math.max(1, Math.min(maxQty, parseInt(e.target.value) || 1))
                                    setBatchItems(prev => prev.map((b, i) => i === idx ? { ...b, quantity: v } : b))
                                  }}
                                  className="w-12 px-1 py-0.5 rounded border text-center text-xs outline-none"
                                  style={{ borderColor: 'var(--light-gray)' }} />
                                <button type="button" onClick={() => setBatchItems(prev => prev.map((b, i) => i === idx ? { ...b, quantity: Math.min(maxQty, b.quantity + 1) } : b))}
                                  className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold hover:bg-gray-200" style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}>+</button>
                                {srcItem && <span className="text-[10px] ml-1" style={{ color: 'var(--mid-gray)' }}>/ {maxQty}</span>}
                                <button type="button" onClick={() => setBatchItems(prev => prev.filter((_, i) => i !== idx))} className="p-0.5 rounded hover:bg-red-50 ml-1">
                                  <X size={12} className="text-red-500" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Add item — searchable dropdown */}
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 relative" ref={conSearchRef}>
                        <label className="block text-xs mb-1" style={{ color: 'var(--mid-gray)' }}>Search &amp; Add Item</label>
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
                          <input type="text" placeholder="Type SKU or item name..."
                            value={conItemSearch}
                            onChange={(e) => { setConItemSearch(e.target.value); setConItemDropdownOpen(true) }}
                            onFocus={() => setConItemDropdownOpen(true)}
                            className="w-full pl-9 pr-3 py-2 rounded-xl border text-sm outline-none"
                            style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                        {conItemDropdownOpen && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-xl shadow-lg z-50 max-h-[200px] overflow-y-auto"
                            style={{ borderColor: 'var(--light-gray)' }}>
                            {(() => {
                              const q = conItemSearch.toLowerCase()
                              const filtered = allItems.filter(i =>
                                (!conToBranch || i.branch !== conToBranch) &&
                                !batchItems.some(b => b.itemId === i.id) &&
                                i.quantity > 0 &&
                                (i.sku.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
                              ).slice(0, 50)
                              if (filtered.length === 0) return (
                                <div className="px-3 py-3 text-xs text-center" style={{ color: 'var(--mid-gray)' }}>No items found</div>
                              )
                              return filtered.map(i => (
                                <button key={i.id} type="button"
                                  onClick={() => {
                                    setBatchItems(prev => [...prev, { itemId: i.id, quantity: 1, itemName: i.name, itemSku: i.sku }])
                                    setConItemSearch('')
                                    setConItemDropdownOpen(false)
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50 flex items-center justify-between border-b last:border-b-0"
                                  style={{ borderColor: 'var(--light-gray)' }}>
                                  <span><span className="font-mono font-medium" style={{ color: 'var(--teal)' }}>{i.sku}</span> — {i.name}</span>
                                  <span className="shrink-0 ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>Stock: {i.quantity}</span>
                                </button>
                              ))
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Remarks */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                      Remarks <span className="font-normal" style={{ color: 'var(--mid-gray)' }}>(optional)</span>
                    </label>
                    <textarea value={conRemarks} onChange={(e) => setConRemarks(e.target.value)} rows={2}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>

                  {/* Submit */}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => { setConModalOpen(false); setBatchItems([]) }}
                      className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                      style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                    <button type="button" disabled={saving || batchItems.length === 0 || !conToBranch}
                      onClick={async () => {
                        setSaving(true); setError('')
                        try {
                          const res = await fetch('/api/inventory/consignments', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ items: batchItems, toBranch: conToBranch, remarks: conRemarks || null }),
                          })
                          const data = await res.json()
                          if (!res.ok) { setError(data.error || 'Failed'); setSaving(false); return }
                          setConModalOpen(false); setBatchItems([]); setConToBranch(''); setConRemarks('')
                          fetchConsignments()
                        } catch { setError('Failed to create transfer') } finally { setSaving(false) }
                      }}
                      className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                      style={{ background: 'var(--teal)' }}>
                      {saving ? 'Creating...' : `Create Transfer (${batchItems.length} items)`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Consignment CSV Import Modal */}
          {conCsvModalOpen && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto">
              <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-xl mb-8 relative">
                <button onClick={() => { setConCsvModalOpen(false); setConCsvStep('upload'); setConCsvData([]); setConCsvResult(null) }}
                  className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg"><X size={20} style={{ color: 'var(--mid-gray)' }} /></button>

                <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                  Import Consignment Transfers via CSV
                </h3>

                {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600 flex items-center gap-1"><AlertCircle size={14} />{error}</div>}

                {/* Step 1: Upload */}
                {conCsvStep === 'upload' && (
                  <div className="space-y-4">
                    <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
                      Upload a CSV with columns: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">sku, quantity, to_branch, remarks</code>
                    </p>
                    <div className="text-xs p-3 rounded-xl" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                      <p className="font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Branch values:</p>
                      <ul className="space-y-0.5">
                        {BRANCH_OPTIONS.map(b => (
                          <li key={b.value}><code className="font-mono">{b.value}</code> — {b.label}</li>
                        ))}
                      </ul>
                    </div>
                    <input ref={conCsvFileRef} type="file" accept=".csv" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = (ev) => {
                        const text = ev.target?.result as string
                        const lines = text.trim().split('\n')
                        const header = lines[0].toLowerCase()
                        if (!header.includes('sku') || !header.includes('quantity') || !header.includes('to_branch')) {
                          setError('CSV must have columns: sku, quantity, to_branch, remarks')
                          return
                        }
                        const rows = lines.slice(1).map(line => {
                          const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
                          const sku = cols[0] || ''
                          const quantity = parseInt(cols[1]) || 0
                          const toBranch = cols[2] || ''
                          const remarks = cols[3] || ''
                          // Look up item by SKU
                          const item = allItems.find(i => i.sku === sku)
                          return {
                            sku, quantity, toBranch, remarks,
                            itemName: item?.name,
                            itemId: item?.id,
                            error: !item ? 'SKU not found' : quantity <= 0 ? 'Invalid quantity' : quantity > item.quantity ? `Exceeds stock (${item.quantity})` : !toBranch ? 'No destination branch' : item.branch === toBranch ? 'Same branch' : undefined,
                          }
                        }).filter(r => r.sku)
                        if (rows.length === 0) { setError('No valid rows found in CSV'); return }
                        setConCsvData(rows)
                        setConCsvStep('review')
                        setError('')
                      }
                      reader.readAsText(file)
                      e.target.value = ''
                    }} />
                    <button onClick={() => conCsvFileRef.current?.click()}
                      className="w-full py-8 rounded-xl border-2 border-dashed text-sm flex flex-col items-center gap-2 hover:bg-gray-50"
                      style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                      <Upload size={24} />
                      Click to select CSV file
                    </button>
                  </div>
                )}

                {/* Step 2: Review */}
                {conCsvStep === 'review' && (
                  <div className="space-y-4">
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                      <div className="overflow-x-auto max-h-[400px]">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0">
                            <tr style={{ background: 'var(--off-white)' }}>
                              {['SKU', 'Item', 'Qty', 'To Branch', 'Remarks', 'Status'].map(h => (
                                <th key={h} className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {conCsvData.map((r, idx) => (
                              <tr key={idx} className="border-t" style={{ borderColor: 'var(--light-gray)', background: r.error ? '#fef2f2' : undefined }}>
                                <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                                <td className="px-3 py-2 text-xs">{r.itemName || '—'}</td>
                                <td className="px-3 py-2">{r.quantity}</td>
                                <td className="px-3 py-2 text-xs">{BRANCH_LABELS[r.toBranch] || r.toBranch}</td>
                                <td className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.remarks || '—'}</td>
                                <td className="px-3 py-2 text-xs">
                                  {r.error
                                    ? <span className="text-red-600 font-medium">{r.error}</span>
                                    : <span className="text-green-600 font-medium">✓ Ready</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs" style={{ color: 'var(--mid-gray)' }}>
                      <span>{conCsvData.filter(r => !r.error).length} of {conCsvData.length} rows valid</span>
                      {conCsvData.some(r => r.error) && (
                        <span className="text-red-500">Rows with errors will be skipped</span>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <button onClick={() => { setConCsvStep('upload'); setConCsvData([]) }}
                        className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                        style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                        Back
                      </button>
                      <button
                        disabled={conCsvSubmitting || conCsvData.every(r => !!r.error)}
                        onClick={async () => {
                          setConCsvSubmitting(true); setError('')
                          const validRows = conCsvData.filter(r => !r.error && r.itemId)
                          // Group by toBranch so each group becomes a batch transfer
                          const byBranch: Record<string, typeof validRows> = {}
                          for (const row of validRows) {
                            if (!byBranch[row.toBranch]) byBranch[row.toBranch] = []
                            byBranch[row.toBranch].push(row)
                          }
                          let totalSuccess = 0
                          const allErrors: string[] = []
                          for (const [branch, rows] of Object.entries(byBranch)) {
                            try {
                              const res = await fetch('/api/inventory/consignments', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  toBranch: branch,
                                  remarks: rows[0].remarks || 'CSV Import',
                                  items: rows.map(r => ({ itemId: r.itemId, quantity: r.quantity })),
                                }),
                              })
                              const data = await res.json()
                              if (!res.ok) { allErrors.push(data.error || `Failed for ${branch}`); continue }
                              totalSuccess += data.transfers?.length || 0
                              if (data.errors?.length) allErrors.push(...data.errors)
                            } catch { allErrors.push(`Network error for ${branch}`) }
                          }
                          setConCsvResult({ success: totalSuccess, errors: allErrors })
                          setConCsvStep('result')
                          setConCsvSubmitting(false)
                          fetchConsignments()
                        }}
                        className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                        style={{ background: 'var(--teal)' }}>
                        {conCsvSubmitting ? 'Creating transfers...' : `Create ${conCsvData.filter(r => !r.error).length} Transfer(s)`}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Result */}
                {conCsvStep === 'result' && conCsvResult && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl text-center" style={{ background: conCsvResult.success > 0 ? '#f0fdf4' : '#fef2f2' }}>
                      {conCsvResult.success > 0 ? (
                        <CheckCircle2 size={32} className="mx-auto mb-2" style={{ color: '#16a34a' }} />
                      ) : (
                        <AlertCircle size={32} className="mx-auto mb-2" style={{ color: '#dc2626' }} />
                      )}
                      <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>
                        {conCsvResult.success} transfer(s) created successfully
                      </p>
                      {conCsvResult.errors.length > 0 && (
                        <div className="mt-3 text-left max-h-32 overflow-y-auto text-xs text-red-600">
                          {conCsvResult.errors.map((e, i) => <p key={i}>• {e}</p>)}
                        </div>
                      )}
                    </div>
                    <button onClick={() => { setConCsvModalOpen(false); setConCsvStep('upload'); setConCsvData([]); setConCsvResult(null) }}
                      className="w-full py-2.5 rounded-xl text-white text-sm font-semibold"
                      style={{ background: 'var(--teal)' }}>
                      Done
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PDF Transmittal Form Modal */}
          {pdfModalOpen && pdfData && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto">
              <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                    Generate Transmittal Form
                  </h3>
                  <button onClick={() => setPdfModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X size={20} style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </div>

                <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
                  Fill in the details below. These will appear on the printed transmittal form.
                  {pdfData.referenceNumber && (
                    <span className="ml-1 font-mono font-semibold px-1.5 py-0.5 rounded" style={{ background: '#e0e7ff', color: '#3730a3' }}>
                      {pdfData.referenceNumber}
                    </span>
                  )}
                </p>

                <div className="space-y-4">
                  {/* FROM Section */}
                  <div className="p-3 rounded-xl" style={{ background: 'var(--off-white)' }}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--teal)' }}>From</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Branch</label>
                        <input type="text" value={pdfData.fromBranch} disabled
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-gray-50"
                          style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }} />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Staff Name</label>
                        <input type="text" value={pdfFromStaff} onChange={e => setPdfFromStaff(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                          style={{ borderColor: 'var(--light-gray)' }} placeholder="Name of staff releasing items" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Position</label>
                        <input type="text" value={pdfFromPosition} onChange={e => setPdfFromPosition(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                          style={{ borderColor: 'var(--light-gray)' }} placeholder="e.g. Store Manager" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Contact No.</label>
                        <input type="text" value={pdfFromContact} onChange={e => setPdfFromContact(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                          style={{ borderColor: 'var(--light-gray)' }} placeholder="09XX XXX XXXX" />
                      </div>
                    </div>
                  </div>

                  {/* TO Section */}
                  <div className="p-3 rounded-xl" style={{ background: 'var(--off-white)' }}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--teal)' }}>To</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Branch</label>
                        <input type="text" value={pdfData.toBranch} disabled
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-gray-50"
                          style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Receiver&apos;s Name</label>
                        <input type="text" value={pdfToReceiver} onChange={e => setPdfToReceiver(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                          style={{ borderColor: 'var(--light-gray)' }} placeholder="Name of person receiving" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Contact No.</label>
                        <input type="text" value={pdfToContact} onChange={e => setPdfToContact(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                          style={{ borderColor: 'var(--light-gray)' }} placeholder="09XX XXX XXXX" />
                      </div>
                    </div>
                  </div>

                  {/* Signatures Section */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-xl" style={{ background: 'var(--off-white)' }}>
                      <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--teal)' }}>Released By</p>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Name</label>
                          <input type="text" value={pdfReleasedName} onChange={e => setPdfReleasedName(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                            style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Date</label>
                          <input type="date" value={pdfReleasedDate} onChange={e => setPdfReleasedDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                            style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Contact No.</label>
                          <input type="text" value={pdfReleasedContact} onChange={e => setPdfReleasedContact(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                            style={{ borderColor: 'var(--light-gray)' }} placeholder="09XX XXX XXXX" />
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl" style={{ background: 'var(--off-white)' }}>
                      <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--teal)' }}>Received By</p>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Name</label>
                          <input type="text" value={pdfReceivedName} onChange={e => setPdfReceivedName(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                            style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Date</label>
                          <input type="date" value={pdfReceivedDate} onChange={e => setPdfReceivedDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                            style={{ borderColor: 'var(--light-gray)' }} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Contact No.</label>
                          <input type="text" value={pdfReceivedContact} onChange={e => setPdfReceivedContact(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                            style={{ borderColor: 'var(--light-gray)' }} placeholder="09XX XXX XXXX" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Items preview */}
                  <div className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                    <span className="font-semibold">{pdfData.items.length} item(s)</span> will be included in the transmittal form.
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setPdfModalOpen(false)}
                      className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                      style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                      Cancel
                    </button>
                    <button type="button" onClick={() => {
                      generateTransmittalPDF({
                        ...pdfData,
                        fromStaff: pdfFromStaff,
                        fromPosition: pdfFromPosition,
                        fromContact: pdfFromContact,
                        toReceiver: pdfToReceiver,
                        toContact: pdfToContact,
                        releasedName: pdfReleasedName,
                        releasedDate: pdfReleasedDate ? new Date(pdfReleasedDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '',
                        releasedContact: pdfReleasedContact,
                        receivedName: pdfReceivedName,
                        receivedDate: pdfReceivedDate ? new Date(pdfReceivedDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '',
                        receivedContact: pdfReceivedContact,
                      })
                      setPdfModalOpen(false)
                    }}
                      className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2"
                      style={{ background: 'var(--teal)' }}>
                      <FileText size={16} />
                      Generate PDF
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════
         TAB 5: CONSUMABLE FORMS (control-number stock)
         ════════════════════════════════════════════════════ */}
      {activeTab === 'Forms' && (() => {
        const summary = Array.from(
          forms.reduce((m, f) => {
            const cur = m.get(f.formType) || { total: 0, receipts: 0 }
            m.set(f.formType, { total: cur.total + f.quantity, receipts: cur.receipts + 1 })
            return m
          }, new Map<string, { total: number; receipts: number }>())
        ).sort((a, b) => a[0].localeCompare(b[0]))
        const grandTotal = forms.reduce((s, f) => s + f.quantity, 0)
        const tmplNameByNo = new Map(formTemplates.map((t) => [t.templateNo || t.templateName, t.templateName]))
        return (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <p className="text-sm" style={{ color: 'var(--charcoal)', fontWeight: 600 }}>Consumable Forms</p>
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Track how many pre-numbered forms are on hand — pcs are counted automatically from each control-number range received.</p>
            </div>
            <div className="flex items-center gap-2">
              <select value={formsBranchFilter} onChange={(e) => setFormsBranchFilter(e.target.value)}
                className="px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                <option value="">All Branches</option>
                {Object.entries(BRANCH_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {canWrite && (
                <button onClick={openFormCreate}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: 'var(--teal)' }}>
                  <Plus size={18} /> Add Receipt
                </button>
              )}
            </div>
          </div>

          {/* Available-pcs summary per form type */}
          {summary.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
              {summary.map(([type, s]) => (
                <div key={type} className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
                  <p className="text-xs font-mono font-semibold" style={{ color: 'var(--teal)' }}>{type}</p>
                  {tmplNameByNo.get(type) && <p className="text-xs truncate" style={{ color: 'var(--charcoal)' }} title={tmplNameByNo.get(type)}>{tmplNameByNo.get(type)}</p>}
                  <p className="text-2xl font-bold mt-1" style={{ color: 'var(--charcoal)' }}>{s.total.toLocaleString('en-PH')}</p>
                  <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>pcs on hand · {s.receipts} receipt{s.receipts === 1 ? '' : 's'}</p>
                </div>
              ))}
              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--teal)', background: 'var(--pale-teal)' }}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--teal)' }}>Total</p>
                <p className="text-2xl font-bold mt-1" style={{ color: 'var(--charcoal)' }}>{grandTotal.toLocaleString('en-PH')}</p>
                <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>pcs across all form types</p>
              </div>
            </div>
          )}

          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Form Type</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Branch</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Date Received</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Control Range</th>
                    <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Pcs</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Remarks</th>
                    <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Recorded By</th>
                    {canWrite && <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {forms.length === 0 ? (
                    <tr>
                      <td colSpan={canWrite ? 8 : 7} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                        <FileText size={32} className="mx-auto mb-2 opacity-40" />
                        <p>No form receipts yet</p>
                      </td>
                    </tr>
                  ) : forms.map((f) => (
                    <tr key={f.id} className="border-t hover:bg-gray-50/50 transition-colors" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: '#f0fdfa', color: 'var(--teal)' }}>{f.formType}</span>
                        {tmplNameByNo.get(f.formType) && <span className="text-xs ml-2" style={{ color: 'var(--mid-gray)' }}>{tmplNameByNo.get(f.formType)}</span>}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{BRANCH_LABELS[f.branch] || f.branch}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{formatDate(f.dateReceived)}</td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--charcoal)' }}>{f.fromControl} → {f.toControl}</td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--charcoal)' }}>{f.quantity.toLocaleString('en-PH')}</td>
                      <td className="px-4 py-3 text-xs max-w-[180px] truncate" style={{ color: 'var(--mid-gray)' }}>{f.remarks || '—'}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{f.createdByName || '—'}</td>
                      {canWrite && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button onClick={() => openFormEdit(f)} className="p-2 rounded-lg hover:bg-teal-50 transition-colors mr-1" title="Edit receipt">
                            <Pencil size={15} style={{ color: 'var(--teal)' }} />
                          </button>
                          <button onClick={() => setDeleteFormConfirm(f.id)} className="p-2 rounded-lg hover:bg-red-50 transition-colors" title="Delete receipt">
                            <Trash2 size={15} className="text-red-500" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Delete Form Receipt Confirm */}
          {deleteFormConfirm && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
                <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Delete Receipt</h3>
                <p className="text-sm mb-2" style={{ color: 'var(--mid-gray)' }}>Delete this form receipt? The pcs it contributes will be removed from the on-hand count.</p>
                <div className="flex gap-3 justify-end mt-6">
                  <button onClick={() => setDeleteFormConfirm(null)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--light-gray)' }} disabled={deletingForm}>Cancel</button>
                  <button onClick={() => handleFormDelete(deleteFormConfirm)} className="px-4 py-2 rounded-lg text-sm text-white bg-red-500 hover:bg-red-600 flex items-center gap-2" disabled={deletingForm}>
                    {deletingForm && <Loader2 size={14} className="animate-spin" />} Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add / Edit Form Receipt Modal */}
          {formModalOpen && (() => {
            const previewFrom = parseInt(String(frFrom).replace(/[^0-9]/g, ''), 10)
            const previewTo = parseInt(String(frTo).replace(/[^0-9]/g, ''), 10)
            const previewQty = Number.isFinite(previewFrom) && Number.isFinite(previewTo) && previewTo >= previewFrom ? previewTo - previewFrom + 1 : null
            const tmplByDept = formTemplates.reduce((m, t) => { (m[t.department] = m[t.department] || []).push(t); return m }, {} as Record<string, typeof formTemplates>)
            const tmplDepts = Object.keys(tmplByDept).sort()
            const knownFormType = formTemplates.some((t) => (t.templateNo || t.templateName) === frFormType)
            return (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{formEditId ? 'Edit Form Receipt' : 'Add Form Receipt'}</h3>
                  <button onClick={() => setFormModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X size={20} style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </div>
                {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>}
                <form onSubmit={handleFormSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Branch</label>
                      <select value={frBranch} onChange={(e) => setFrBranch(e.target.value)} required
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                        {Object.entries(BRANCH_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Date Received</label>
                      <input type="date" value={frDate} onChange={(e) => setFrDate(e.target.value)} required
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Form Type <span style={{ color: 'var(--mid-gray)', fontWeight: 400 }}>(from HR Hub Templates)</span></label>
                    {formTemplates.length > 0 ? (
                      <select value={frFormType} onChange={(e) => setFrFormType(e.target.value)} required
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                        <option value="">— Select form —</option>
                        {frFormType && !knownFormType && <option value={frFormType}>{frFormType} (custom)</option>}
                        {tmplDepts.map((dep) => (
                          <optgroup key={dep} label={dep}>
                            {tmplByDept[dep].map((t) => {
                              const val = t.templateNo || t.templateName
                              return <option key={`${t.templateNo}|${t.templateName}`} value={val}>{[t.templateNo, t.templateName].filter(Boolean).join(' — ')}{t.massProduced ? ' • mass-produced' : ''}</option>
                            })}
                          </optgroup>
                        ))}
                      </select>
                    ) : (
                      <input type="text" value={frFormType} onChange={(e) => setFrFormType(e.target.value)} required placeholder="e.g. ADMIN01"
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none font-mono" style={{ borderColor: 'var(--light-gray)' }} />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>From Control #</label>
                      <input type="text" value={frFrom} onChange={(e) => setFrFrom(e.target.value)} required placeholder="000001"
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none font-mono" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>To Control #</label>
                      <input type="text" value={frTo} onChange={(e) => setFrTo(e.target.value)} required placeholder="000100"
                        className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none font-mono" style={{ borderColor: 'var(--light-gray)' }} />
                    </div>
                  </div>
                  <div className="p-3 rounded-xl text-sm" style={{ background: previewQty != null ? 'var(--pale-teal)' : '#fef2f2', color: previewQty != null ? 'var(--teal)' : '#dc2626' }}>
                    {previewQty != null
                      ? <>This receipt = <span className="font-bold">{previewQty.toLocaleString('en-PH')} pcs</span></>
                      : 'Enter a valid range — the "to" number must be ≥ the "from" number.'}
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Remarks (optional)</label>
                    <input type="text" value={frRemarks} onChange={(e) => setFrRemarks(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div className="flex gap-3 justify-end pt-2">
                    <button type="button" onClick={() => setFormModalOpen(false)} className="px-4 py-2.5 rounded-xl text-sm border" style={{ borderColor: 'var(--light-gray)' }} disabled={frSubmitting}>Cancel</button>
                    <button type="submit" disabled={frSubmitting || previewQty == null}
                      className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                      {frSubmitting && <Loader2 size={14} className="animate-spin" />} {formEditId ? 'Save Changes' : 'Add Receipt'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
            )
          })()}
        </>
        )
      })()}
    </div>
  )
}

/* ── Bulk physical-count shrinkage (add rows, auditor + e-signature) ── */
function BulkShrinkageCountModal({ items, onClose, onDone }: {
  items: { id: string; name: string; sku: string; quantity: number }[]
  onClose: () => void
  onDone: () => void
}) {
  const [auditFrom, setAuditFrom] = useState('')
  const [auditTo, setAuditTo] = useState(new Date().toISOString().slice(0, 10))
  const [auditor, setAuditor] = useState('')
  const [proofUrls, setProofUrls] = useState<string[]>([])
  const [rows, setRows] = useState<{ itemId: string; search: string; counted: string; open: boolean }[]>([{ itemId: '', search: '', counted: '', open: false }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasSig, setHasSig] = useState(false)

  const itemById = useMemo(() => new Map(items.map(i => [i.id, i])), [items])
  const setRow = (i: number, patch: Partial<{ itemId: string; search: string; counted: string; open: boolean }>) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addRow = () => setRows(rs => [...rs, { itemId: '', search: '', counted: '', open: false }])
  const removeRow = (i: number) => setRows(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs)

  const posOf = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!; const r = c.getBoundingClientRect()
    const cx = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    const cy = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY
    return { x: cx - r.left, y: cy - r.top }
  }
  const start = (e: React.MouseEvent | React.TouchEvent) => { drawing.current = true; const ctx = canvasRef.current!.getContext('2d')!; const p = posOf(e); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
  const move = (e: React.MouseEvent | React.TouchEvent) => { if (!drawing.current) return; const ctx = canvasRef.current!.getContext('2d')!; const p = posOf(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke(); setHasSig(true) }
  const end = () => { drawing.current = false }
  const clearSig = () => { const c = canvasRef.current; if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setHasSig(false) }
  const uploadSig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    const rd = new FileReader()
    rd.onload = () => { const img = new window.Image(); img.onload = () => { const c = canvasRef.current!; const ctx = c.getContext('2d')!; ctx.clearRect(0, 0, c.width, c.height); const s = Math.min(c.width / img.width, c.height / img.height); ctx.drawImage(img, 0, 0, img.width * s, img.height * s); setHasSig(true) }; img.src = rd.result as string }
    rd.readAsDataURL(f)
  }

  const submit = async () => {
    setError('')
    if (!auditor.trim()) { setError('Enter who conducted the audit.'); return }
    if (!auditTo) { setError('Enter the audit "to" date.'); return }
    const payloadRows = rows.filter(r => r.itemId && r.counted !== '').map(r => ({ itemId: r.itemId, countedQuantity: Number(r.counted) }))
    if (!payloadRows.length) { setError('Add at least one item with an actual count.'); return }
    const signature = hasSig && canvasRef.current ? canvasRef.current.toDataURL('image/png') : null
    setBusy(true)
    try {
      const res = await fetch('/api/inventory/adjustments/shrinkage-count', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditFrom: auditFrom || null, auditTo, auditorName: auditor.trim(), auditorSignature: signature, proofUrls, rows: payloadRows }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to record the audit.'); setBusy(false); return }
      onDone()
    } catch { setError('Network error. Please try again.'); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-3xl w-full shadow-xl mb-8 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg"><X size={20} style={{ color: 'var(--mid-gray)' }} /></button>
        <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--charcoal)' }}>Inventory Audit</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>Add each product and its actual counted stock; the difference vs. the current system count is computed automatically and applied (shortages deducted, overages added back).</p>

        {error && <div className="mb-3 p-2.5 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>}

        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Audit period — From</label>
            <input type="date" value={auditFrom} onChange={e => setAuditFrom(e.target.value)} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>To <span className="text-red-500">*</span></label>
            <input type="date" value={auditTo} onChange={e => setAuditTo(e.target.value)} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
          </div>
        </div>

        <div className="rounded-xl border overflow-visible mb-2" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
              <th className="px-3 py-2 text-left text-xs font-semibold">Product</th>
              <th className="px-3 py-2 text-right text-xs font-semibold">Current Count</th>
              <th className="px-3 py-2 text-right text-xs font-semibold">Actual Count</th>
              <th className="px-3 py-2 text-right text-xs font-semibold">Difference</th>
              <th className="px-2 py-2"></th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const sys = r.itemId ? (itemById.get(r.itemId)?.quantity ?? 0) : null
                const shrink = sys !== null && r.counted !== '' ? sys - Number(r.counted) : null
                const matches = r.search && !r.itemId ? items.filter(it => `${it.name} ${it.sku}`.toLowerCase().includes(r.search.toLowerCase())).slice(0, 8) : []
                return (
                  <tr key={i} className="border-t align-top" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-2 relative" style={{ minWidth: 240 }}>
                      <input value={r.search} placeholder="Type item name or SKU…"
                        onChange={e => setRow(i, { search: e.target.value, itemId: '', open: true })}
                        onFocus={() => setRow(i, { open: true })}
                        className="w-full px-2 py-1.5 rounded-lg border text-sm" style={{ borderColor: r.itemId ? 'var(--teal)' : 'var(--light-gray)' }} />
                      {r.open && matches.length > 0 && (
                        <div className="absolute z-10 mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-auto w-full" style={{ borderColor: 'var(--light-gray)' }}>
                          {matches.map(m => (
                            <button key={m.id} type="button" onClick={() => setRow(i, { itemId: m.id, search: `${m.name} (${m.sku})`, open: false })}
                              className="block w-full text-left px-2 py-1.5 text-xs hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                              <strong>{m.name}</strong> <span style={{ color: 'var(--mid-gray)' }}>{m.sku} · stock {m.quantity}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right" style={{ color: 'var(--mid-gray)' }}>{sys ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" value={r.counted} onChange={e => setRow(i, { counted: e.target.value })}
                        className="w-20 px-2 py-1.5 rounded-lg border text-sm text-right" style={{ borderColor: 'var(--light-gray)' }} />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold" style={{ color: shrink === null ? 'var(--mid-gray)' : shrink > 0 ? '#dc2626' : shrink < 0 ? '#166534' : 'var(--charcoal)' }}>
                      {shrink === null ? '—' : (shrink > 0 ? `-${shrink}` : shrink < 0 ? `+${-shrink}` : '0')}
                    </td>
                    <td className="px-2 py-2 text-right"><button onClick={() => removeRow(i)} className="p-1 rounded hover:bg-red-50"><X size={13} style={{ color: '#dc2626' }} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button onClick={addRow} className="text-sm font-medium mb-4" style={{ color: 'var(--teal)' }}>+ Add Row</button>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Conducted by</label>
            <input value={auditor} onChange={e => setAuditor(e.target.value)} placeholder="Full name" className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: 'var(--light-gray)' }} />
            <div className="mt-3">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Proof</label>
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                {proofUrls.map((u, i) => (
                  <span key={u} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px]" style={{ borderColor: 'var(--light-gray)' }}>
                    <a href={u} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>Proof {i + 1}</a>
                    <button onClick={() => setProofUrls(p => p.filter(x => x !== u))}><X size={11} style={{ color: '#dc2626' }} /></button>
                  </span>
                ))}
              </div>
              <ScanUpload compact section="inventory-audit" prefix="inventory-audit" existingCount={proofUrls.length}
                accept="image/*,.pdf" label={proofUrls.length ? 'Add' : 'Upload'}
                onUploaded={u => setProofUrls(p => p.includes(u) ? p : [...p, u])} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Auditor Signature</label>
            <div className="rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
              <canvas ref={canvasRef} width={340} height={90} className="w-full touch-none rounded-t-xl"
                onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
                onTouchStart={start} onTouchMove={move} onTouchEnd={end} style={{ background: '#fff', cursor: 'crosshair' }} />
              <div className="flex items-center justify-between px-2 py-1 border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <label className="text-[11px] cursor-pointer" style={{ color: 'var(--teal)' }}>
                  Upload e-sig<input type="file" accept="image/*" className="hidden" onChange={uploadSig} />
                </label>
                <button type="button" onClick={clearSig} className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Clear</button>
              </div>
            </div>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>Sign above or upload an image.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>Cancel</button>
          <button onClick={submit} disabled={busy} className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
            {busy ? 'Saving…' : 'Save Audit'}
          </button>
        </div>
      </div>
    </div>
  )
}
