'use client'


import { Suspense, useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import { useFocusTarget } from '@/lib/use-focus-target'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  Upload,
  Download,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ChevronDown,
} from 'lucide-react'
import { downloadXlsx, downloadPdf } from '@/lib/export'
import DownloadMenu from '@/components/ui/DownloadMenu'
import { HR_PAGE_CLASS, HR_PAGE_STYLE, HrShimmerStyle, StatCard, hrBtn } from '@/components/ui/hr-look'

interface Account {
  id: string
  accountNumber: string
  accountTitle: string
  accountType: string
  subType: string | null
  subSubType: string | null
  normalBalance: string
  currency: string
  description: string | null
  isActive: boolean
  isBankAccount?: boolean
  bankRetiredAt?: string | null
  isCheckingAccount?: boolean
  branch?: string | null
  createdAt: string
  createdBy: { name: string }
}

const CURRENCIES = [
  { value: 'PHP', label: 'PHP — Philippine Peso' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'CNY', label: 'CNY — Chinese Yuan' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'JPY', label: 'JPY — Japanese Yen' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'SGD', label: 'SGD — Singapore Dollar' },
  { value: 'HKD', label: 'HKD — Hong Kong Dollar' },
  { value: 'KRW', label: 'KRW — Korean Won' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'AED', label: 'AED — UAE Dirham' },
]

interface ImportRow {
  accountNumber: string
  accountTitle: string
  accountType: string
  subType: string
  normalBalance: string
  description: string
  selected: boolean
  duplicate?: { numberMatch: boolean; titleMatch: boolean }
}

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'ASSET', label: 'Asset' },
  { value: 'LIABILITY', label: 'Liability' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'REVENUE', label: 'Revenue' },
  { value: 'EXPENSE', label: 'Expense' },
]

// (Was keyed `bg`, which is not a CSS property, so the badges showed no background.)
const TYPE_BADGE: Record<string, { background: string; color: string }> = {
  ASSET:     { background: '#dbeafe', color: '#1e40af' },
  LIABILITY: { background: '#fce7f3', color: '#9d174d' },
  EQUITY:    { background: '#f3e8ff', color: '#6b21a8' },
  REVENUE:   { background: '#dcfce7', color: '#166534' },
  EXPENSE:   { background: '#fef3c7', color: '#92400e' },
}

// Per-type look for the cards and group headers.
const TYPE_META: Record<string, { plural: string; line: string; pill: { background: string; color: string } }> = {
  ASSET:     { plural: 'Assets',      line: '#3b82f6', pill: TYPE_BADGE.ASSET },
  LIABILITY: { plural: 'Liabilities', line: '#db2777', pill: TYPE_BADGE.LIABILITY },
  EQUITY:    { plural: 'Equity',      line: '#9333ea', pill: TYPE_BADGE.EQUITY },
  REVENUE:   { plural: 'Revenue',     line: '#059669', pill: TYPE_BADGE.REVENUE },
  EXPENSE:   { plural: 'Expenses',    line: '#d97706', pill: TYPE_BADGE.EXPENSE },
}

const DEFAULT_BALANCE: Record<string, string> = {
  ASSET: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  REVENUE: 'CREDIT',
  EXPENSE: 'DEBIT',
}

const SUB_TYPES: Record<string, { value: string; label: string; group?: string; hasSubSub?: boolean }[]> = {
  ASSET: [
    { value: 'CURRENT_ASSETS', label: 'Current Assets', group: 'PFRS Classification' },
    { value: 'PPE', label: 'Property, Plant & Equipment', group: 'PFRS Classification' },
    { value: 'INTANGIBLE_ASSETS', label: 'Intangible Assets', group: 'PFRS Classification' },
    { value: 'OTHER_NON_CURRENT_ASSETS', label: 'Other Non-Current Assets', group: 'PFRS Classification' },
    { value: 'INVENTORY', label: 'Inventory', group: 'Inventory Classification', hasSubSub: true },
  ],
  LIABILITY: [
    { value: 'CURRENT_LIABILITIES', label: 'Current Liabilities' },
    { value: 'NON_CURRENT_LIABILITIES', label: 'Non-Current Liabilities' },
  ],
  EQUITY: [
    { value: 'OWNERS_EQUITY', label: "Owner's Equity" },
    { value: 'RETAINED_EARNINGS', label: 'Retained Earnings' },
  ],
  REVENUE: [
    { value: 'OPERATING_REVENUE', label: 'Operating Revenue', group: 'PFRS Classification' },
    { value: 'NON_OPERATING_REVENUE', label: 'Non-Operating Revenue', group: 'PFRS Classification' },
    { value: 'SALES', label: 'Sales by Department', group: 'Revenue by Department', hasSubSub: true },
  ],
  EXPENSE: [
    { value: 'DIRECT_EXPENSES', label: 'Direct Operating Expenses', group: 'Operating Expenses' },
    { value: 'INDIRECT_EXPENSES', label: 'Indirect Operating Expenses', group: 'Operating Expenses' },
    { value: 'NON_OPERATING_EXPENSES', label: 'Non-Operating Expenses', group: 'PFRS Classification' },
    { value: 'COGS', label: 'Cost of Goods Sold', group: 'Cost of Goods Sold', hasSubSub: true },
  ],
}

// Department sub-sub types used for Inventory, Sales, and COGS
const DEPARTMENT_SUB_SUB_TYPES = [
  { value: 'PT', label: 'Physical Therapy (PT)' },
  { value: 'OT', label: 'Occupational Therapy (OT)' },
  { value: 'ST', label: 'Speech Therapy (ST)' },
  { value: 'SPED', label: 'Special Education (SPED)' },
  { value: 'PSY', label: 'Psychology & Assessment (PSY)' },
  { value: 'CLI', label: 'Clinic & Institutional (CLI)' },
  { value: 'DIG', label: 'Digital & Tech (DIG)' },
  { value: 'EDU', label: 'Training & Education (EDU)' },
  { value: 'MER', label: 'Merchandise (MER)' },
]

// Which sub-types have sub-sub-type selectors
const SUB_SUB_TYPES: Record<string, { value: string; label: string }[]> = {
  INVENTORY: DEPARTMENT_SUB_SUB_TYPES,
  SALES: DEPARTMENT_SUB_SUB_TYPES,
  COGS: DEPARTMENT_SUB_SUB_TYPES,
}

const ALL_SUB_TYPES = Object.values(SUB_TYPES).flat()

const SUB_TYPE_LABELS: Record<string, string> = {
  ...Object.fromEntries(ALL_SUB_TYPES.map((s) => [s.value, s.label])),
  // Legacy: old single OPERATING_EXPENSES (now split into direct/indirect)
  OPERATING_EXPENSES: 'Operating Expenses',
  // Legacy flat inventory subtypes (backward compatibility)
  INV_PT: 'Inventory — Physical Therapy (PT)',
  INV_OT: 'Inventory — Occupational Therapy (OT)',
  INV_ST: 'Inventory — Speech Therapy (ST)',
  INV_SPED: 'Inventory — Special Education (SPED)',
  INV_PSY: 'Inventory — Psychology & Assessment (PSY)',
  INV_CLI: 'Inventory — Clinic & Institutional (CLI)',
  INV_DIG: 'Inventory — Digital & Tech (DIG)',
  INV_EDU: 'Inventory — Training & Education (EDU)',
  INV_MER: 'Inventory — Merchandise (MER)',
  // Legacy flat revenue subtypes
  REV_PT: 'Sales — Physical Therapy (PT)',
  REV_OT: 'Sales — Occupational Therapy (OT)',
  REV_ST: 'Sales — Speech Therapy (ST)',
  REV_SPED: 'Sales — Special Education (SPED)',
  REV_PSY: 'Sales — Psychology & Assessment (PSY)',
  REV_CLI: 'Sales — Clinic & Institutional (CLI)',
  REV_DIG: 'Sales — Digital & Tech (DIG)',
  REV_EDU: 'Sales — Training & Education (EDU)',
  REV_MER: 'Sales — Merchandise (MER)',
  // Legacy flat COGS subtypes
  COGS_PT: 'COGS — Physical Therapy (PT)',
  COGS_OT: 'COGS — Occupational Therapy (OT)',
  COGS_ST: 'COGS — Speech Therapy (ST)',
  COGS_SPED: 'COGS — Special Education (SPED)',
  COGS_PSY: 'COGS — Psychology & Assessment (PSY)',
  COGS_CLI: 'COGS — Clinic & Institutional (CLI)',
  COGS_DIG: 'COGS — Digital & Tech (DIG)',
  COGS_EDU: 'COGS — Training & Education (EDU)',
  COGS_MER: 'COGS — Merchandise (MER)',
}

const SUB_SUB_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  DEPARTMENT_SUB_SUB_TYPES.map((s) => [s.value, s.label])
)

// Build display label combining subType + subSubType
function getSubTypeDisplay(subType: string | null, subSubType: string | null): string {
  if (!subType) return '—'
  const base = SUB_TYPE_LABELS[subType] || subType
  if (subSubType) {
    const subLabel = SUB_SUB_TYPE_LABELS[subSubType] || subSubType
    return `${base} — ${subLabel}`
  }
  return base
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    const row: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"'
          i++
        } else if (ch === '"') {
          inQuotes = false
        } else {
          current += ch
        }
      } else {
        if (ch === '"') {
          inQuotes = true
        } else if (ch === ',') {
          row.push(current.trim())
          current = ''
        } else {
          current += ch
        }
      }
    }
    row.push(current.trim())
    rows.push(row)
  }
  return rows
}


// ── Grouped list ────────────────────────────────────────────
// Type → sub type, in the order the Add Account form lists them; bank and
// cash accounts get their own group at the top of the assets. Accounts keep
// the API's order (by account number) inside each group.
const BANK_GROUP = 'CURRENT_ASSETS:BANK'
interface AccountGroup { key: string; type: string; count: number; subs: { key: string; label: string; rows: Account[] }[] }
function groupAccounts(list: Account[]): AccountGroup[] {
  return ACCOUNT_TYPE_OPTIONS.map((t) => {
    const rows = list.filter((a) => a.accountType === t.value)
    const order = (SUB_TYPES[t.value] || []).map((s) => s.value)
    const buckets = new Map<string, Account[]>()
    for (const a of rows) {
      const k = a.subType === 'CURRENT_ASSETS' && a.isBankAccount ? BANK_GROUP : (a.subType || '')
      const b = buckets.get(k)
      if (b) b.push(a); else buckets.set(k, [a])
    }
    const rank = (k: string) => k === BANK_GROUP ? -1 : k === '' ? 999 : order.includes(k) ? order.indexOf(k) : 500
    const subs = [...buckets.entries()]
      .sort((x, y) => rank(x[0]) - rank(y[0]) || x[0].localeCompare(y[0]))
      .map(([k, r]) => ({
        key: `${t.value}:${k}`,
        label: k === BANK_GROUP ? 'Cash & bank accounts' : k === '' ? 'No sub type' : (SUB_TYPE_LABELS[k] || k),
        rows: r,
      }))
    return { key: t.value, type: t.value, count: rows.length, subs }
  }).filter((g) => g.count > 0)
}

// Which optional columns are on screen (md: balance + currency, lg: description).
// The group header rows span exactly the visible columns: a span wider than
// what is shown made the fixed-layout table squeeze the title on phones.
function useMinWidth(px: number) {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(`(min-width: ${px}px)`); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) },
    () => window.matchMedia(`(min-width: ${px}px)`).matches,
    () => true,
  )
}

const BRANCH_SHORT: Record<string, string> = { SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills', VERDANA_STORE: 'Verdana', AURA_INSTITUTE: 'AHI' }

function Tag({ children, bg, fg, title }: { children: React.ReactNode; bg: string; fg: string; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center px-1.5 py-px rounded text-[10.5px] font-semibold whitespace-nowrap" style={{ background: bg, color: fg }}>
      {children}
    </span>
  )
}

function SubGroupRows({ label, rows, colCount, canWrite, onEdit, onDelete }: {
  label: string; rows: Account[]; colCount: number; canWrite: boolean
  onEdit: (a: Account) => void; onDelete: (a: Account) => void
}) {
  return (
    <>
      <tr>
        <td colSpan={colCount} className="px-3 md:pl-10 py-1.5 border-b text-[11px] font-semibold"
          style={{ background: 'var(--hr-head)', borderColor: 'var(--hr-line)', color: 'var(--mid-gray)' }}>
          {label} <span style={{ color: 'var(--hr-faint)' }}>· {rows.length}</span>
        </td>
      </tr>
      {rows.map((a) => {
        const contra = a.normalBalance !== DEFAULT_BALANCE[a.accountType]
        const bal = a.normalBalance === 'DEBIT' ? 'Debit' : a.normalBalance === 'CREDIT' ? 'Credit' : a.normalBalance
        const foreign = !!a.currency && a.currency !== 'PHP'
        return (
          <tr key={a.id} className="border-b transition-colors hover:bg-[#fafbf7]" style={{ borderColor: 'var(--hr-line)', opacity: a.isActive ? 1 : 0.55 }}>
            <td className="px-3 md:pl-10 md:pr-4 py-2.5 align-top font-mono font-semibold text-[11.5px] md:text-[12.5px] break-all" style={{ color: 'var(--charcoal)' }}>
              {a.accountNumber}
            </td>
            <td className="px-3 md:px-4 py-2.5 align-top">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{a.accountTitle}</span>
                {a.isBankAccount && <Tag bg="#f1f5f9" fg="#475569">{a.isCheckingAccount ? 'Bank · checking' : 'Bank'}</Tag>}
                {a.branch && <Tag bg="var(--pale-teal)" fg="var(--teal)">{BRANCH_SHORT[a.branch] || a.branch}</Tag>}
                {a.subSubType && <Tag bg="#eff6ff" fg="#1d4ed8">{SUB_SUB_TYPE_LABELS[a.subSubType] || a.subSubType}</Tag>}
                {a.bankRetiredAt && (
                  <Tag bg="#fee2e2" fg="#991b1b"
                    title={`Bank account retired ${new Date(a.bankRetiredAt).toLocaleDateString('en-PH')} — hidden from dropdowns and Bank Rec; ledger history unaffected`}>
                    Retired bank
                  </Tag>
                )}
                {!a.isActive && <Tag bg="#f1f5f2" fg="#55616A">Inactive</Tag>}
              </div>
              {/* Phones: the hidden columns, in one line under the title */}
              <p className="md:hidden mt-0.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                {bal} balance{contra ? ' · contra' : ''}{foreign ? ` · ${a.currency}` : ''}
              </p>
            </td>
            <td className="hidden md:table-cell px-4 py-2.5 align-top whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
              {bal}
              {contra && (
                <span className="ml-1.5"><Tag bg="#f3e8ff" fg="#6b21a8" title="The opposite of this type's usual balance, e.g. a discount under revenue">Contra</Tag></span>
              )}
            </td>
            <td className="hidden md:table-cell px-4 py-2.5 align-top">
              {foreign ? <Tag bg="#fef3c7" fg="#92400e">{a.currency}</Tag> : <span className="text-xs" style={{ color: 'var(--hr-faint)' }}>PHP</span>}
            </td>
            <td className="hidden lg:table-cell px-4 py-2.5 align-top">
              <p className="truncate" style={{ color: 'var(--mid-gray)' }} title={a.description || undefined}>{a.description || '—'}</p>
            </td>
            {canWrite && (
              <td className="px-3 md:px-4 py-1.5 align-top">
                <div className="flex items-center justify-end gap-0.5">
                  <button onClick={() => onEdit(a)} className="p-2 rounded-lg hover:bg-[var(--pale-teal)] transition-colors" title="Edit">
                    <Pencil size={15} style={{ color: 'var(--teal)' }} />
                  </button>
                  <button onClick={() => onDelete(a)} className="p-2 rounded-lg hover:bg-red-50 transition-colors" title="Deactivate or delete">
                    <Trash2 size={15} className="text-red-500" />
                  </button>
                </div>
              </td>
            )}
          </tr>
        )
      })}
    </>
  )
}

export default function ChartOfAccountsPage() {
  return <Suspense fallback={null}><ChartOfAccountsInner /></Suspense>
}

function ChartOfAccountsInner() {
  const { data: session, status } = useSession()
  const sessionUserId = session?.user?.id as string | undefined
  const initialLoaded = useRef(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // Deep link from global search — seed the search box so the list narrows to
  // the record that was clicked, then drop ?focus= from the URL.
  const { focus, done } = useFocusTarget()
  useEffect(() => { if (focus) { setSearch(focus); done() } }, [focus, done])
  const [filterType, setFilterType] = useState('')
  const [filterSubType, setFilterSubType] = useState('')
  const [error, setError] = useState('')
  // Type groups the user folded away.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const isMd = useMinWidth(768)
  const isLg = useMinWidth(1024)
  const [showInactive, setShowInactive] = useState(false)

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [saving, setSaving] = useState(false)
  const [formNumber, setFormNumber] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formType, setFormType] = useState('ASSET')
  const [formSubType, setFormSubType] = useState('')
  const [formSubSubType, setFormSubSubType] = useState('')
  const [formBalance, setFormBalance] = useState('DEBIT')
  const [formDescription, setFormDescription] = useState('')
  const [formCurrency, setFormCurrency] = useState('PHP')
  const [formIsBankAccount, setFormIsBankAccount] = useState(false)
  const [formBankRetired, setFormBankRetired] = useState(false)
  const [formIsChecking, setFormIsChecking] = useState(false)
  const [formBranch, setFormBranch] = useState('')

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<Account | null>(null)

  // Import flow
  const [importStep, setImportStep] = useState<null | 'upload' | 'preview' | 'importing' | 'done'>(null)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importResult, setImportResult] = useState<{ imported: number; errors: { accountNumber: string; error: string }[] } | null>(null)

  const canWrite = session?.user?.role && ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN'].includes(session.user.role)

  const fetchAccounts = useCallback(async () => {
    try {
      // All accounts at once (the API caps a page at 1,000); type and sub type
      // are filtered in the page so the type cards keep their counts.
      const params = new URLSearchParams({ pageSize: '1000' })
      if (showInactive) params.set('showInactive', 'true')
      const res = await fetch(`/api/chart-of-accounts?${params}`)
      const data = await res.json()
      setAccounts(data.data || [])
    } catch {
      setError('Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }, [showInactive])

  // Initial load
  useEffect(() => {
    if (!sessionUserId || initialLoaded.current) return
    initialLoaded.current = true
    fetchAccounts()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId])

  // Refetch when Active / All changes (debounced, only after initial load)
  useEffect(() => {
    if (!initialLoaded.current) return
    const timeout = setTimeout(() => { fetchAccounts() }, 300)
    return () => clearTimeout(timeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive])

  // ── Form handlers ──────────────────────────────────────────

  function openCreateModal() {
    setEditingAccount(null)
    setFormNumber('')
    setFormTitle('')
    setFormType('ASSET')
    setFormSubType('')
    setFormSubSubType('')
    setFormBalance('DEBIT')
    setFormCurrency('PHP')
    setFormDescription('')
    setFormIsBankAccount(false)
    setFormIsChecking(false)
    setFormBranch('')
    setError('')
    setModalOpen(true)
  }

  function openEditModal(account: Account) {
    setEditingAccount(account)
    setFormNumber(account.accountNumber)
    setFormTitle(account.accountTitle)
    setFormType(account.accountType)
    setFormSubType(account.subType || '')
    setFormSubSubType(account.subSubType || '')
    setFormBalance(account.normalBalance)
    setFormCurrency(account.currency || 'PHP')
    setFormDescription(account.description || '')
    setFormIsBankAccount(!!account.isBankAccount)
    setFormBankRetired(!!account.bankRetiredAt)
    setFormIsChecking(!!account.isCheckingAccount)
    setFormBranch(account.branch || '')
    setError('')
    setModalOpen(true)
  }

  function handleTypeChange(type: string) {
    setFormType(type)
    setFormSubType('')
    setFormSubSubType('')
    setFormBalance(DEFAULT_BALANCE[type] || 'DEBIT')
    setFormIsBankAccount(false)
    setFormIsChecking(false)
    setFormBranch('')
  }

  function handleSubTypeChange(subType: string) {
    setFormSubType(subType)
    setFormSubSubType('') // Reset sub-sub type when sub type changes
    if (subType !== 'CURRENT_ASSETS') { setFormIsBankAccount(false); setFormIsChecking(false); setFormBranch('') }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const body: Record<string, string | boolean | null> = {
      accountNumber: formNumber,
      accountTitle: formTitle,
      accountType: formType,
      subType: formSubType,
      subSubType: formSubSubType,
      normalBalance: formBalance,
      currency: formCurrency,
      description: formDescription,
      isBankAccount: formSubType === 'CURRENT_ASSETS' ? formIsBankAccount : false,
      ...(editingAccount && editingAccount.isBankAccount ? { bankRetired: formBankRetired } : {}),
      isCheckingAccount: formSubType === 'CURRENT_ASSETS' && formIsBankAccount ? formIsChecking : false,
      branch: formSubType === 'CURRENT_ASSETS' && formIsBankAccount ? (formBranch || null) : null,
    }

    if (editingAccount) body.id = editingAccount.id

    try {
      const res = await fetch('/api/chart-of-accounts', {
        method: editingAccount ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        setSaving(false)
        return
      }
      setModalOpen(false)
      fetchAccounts()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, hard: boolean) {
    try {
      const url = hard ? `/api/chart-of-accounts?id=${id}&hard=true` : `/api/chart-of-accounts?id=${id}`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to delete')
        return
      }
      setDeleteConfirm(null)
      fetchAccounts()
    } catch {
      setError('Network error')
    }
  }

  // ── Import handlers ────────────────────────────────────────

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const rows = parseCSV(text)

    if (rows.length < 2) {
      setError('CSV file is empty or has no data rows')
      return
    }

    // Skip header row
    const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z]/g, ''))
    const numIdx = header.findIndex((h) => h.includes('number') || h.includes('accountnumber'))
    const titleIdx = header.findIndex((h) => h.includes('title') || h.includes('accounttitle'))
    const typeIdx = header.findIndex((h) => h.includes('type') || h.includes('accounttype'))
    const subTypeIdx = header.findIndex((h) => h.includes('subtype') || h.includes('sub'))
    const balIdx = header.findIndex((h) => h.includes('balance') || h.includes('normalbalance'))
    const descIdx = header.findIndex((h) => h.includes('description') || h.includes('desc'))

    if (numIdx === -1 || titleIdx === -1) {
      setError('CSV must have "Account Number" and "Account Title" columns')
      return
    }

    const dataRows = rows.slice(1).filter((r) => r[numIdx]?.trim())
    const parsed: ImportRow[] = dataRows.map((r) => {
      const type = (r[typeIdx] || '').trim().toUpperCase()
      const validType = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].includes(type) ? type : 'ASSET'
      const bal = (r[balIdx] || '').trim().toUpperCase()
      const validBal = ['DEBIT', 'CREDIT'].includes(bal) ? bal : DEFAULT_BALANCE[validType]

      return {
        accountNumber: r[numIdx]?.trim() || '',
        accountTitle: r[titleIdx]?.trim() || '',
        accountType: validType,
        subType: subTypeIdx !== -1 ? (r[subTypeIdx]?.trim().toUpperCase().replace(/[^A-Z_]/g, '_') || '') : '',
        normalBalance: validBal,
        description: r[descIdx]?.trim() || '',
        selected: true,
      }
    })

    // Check for duplicates against DB
    try {
      const res = await fetch('/api/chart-of-accounts/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: parsed }),
      })
      const data = await res.json()
      if (data.duplicates) {
        for (const dup of data.duplicates) {
          if (parsed[dup.index]) {
            parsed[dup.index].duplicate = { numberMatch: dup.numberMatch, titleMatch: dup.titleMatch }
            parsed[dup.index].selected = false
          }
        }
      }
    } catch {
      // Continue without duplicate info
    }

    setImportRows(parsed)
    setImportStep('preview')
    setError('')
  }

  async function handleImport() {
    const selected = importRows.filter((r) => r.selected)
    if (selected.length === 0) return

    setImportStep('importing')

    try {
      const res = await fetch('/api/chart-of-accounts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: selected }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Import failed')
        setImportStep('preview')
        return
      }
      setImportResult(data)
      setImportStep('done')
    } catch {
      setError('Network error during import')
      setImportStep('preview')
    }
  }

  function closeImport() {
    setImportStep(null)
    setImportRows([])
    setImportResult(null)
    setError('')
    fetchAccounts()
  }

  function toggleAll(checked: boolean) {
    setImportRows((prev) => prev.map((r) => ({ ...r, selected: checked })))
  }

  function toggleRow(index: number) {
    setImportRows((prev) => prev.map((r, i) => (i === index ? { ...r, selected: !r.selected } : r)))
  }

  // ── Filtering ──────────────────────────────────────────────
  // Type and sub type are filtered here in the page (the API's filter is the
  // same exact match), so the type cards keep their counts while one type is
  // shown. Search narrows by number or title, as before.
  const typeFiltered = accounts.filter((a) =>
    (!filterType || a.accountType === filterType) && (!filterSubType || a.subType === filterSubType))
  const filteredAccounts = typeFiltered.filter((a) => {
    if (!search) return true
    const q = search.toLowerCase()
    return a.accountNumber.toLowerCase().includes(q) || a.accountTitle.toLowerCase().includes(q)
  })
  const groups = groupAccounts(filteredAccounts)
  const typeCount = (t: string) => accounts.filter((a) => a.accountType === t).length
  const contraCount = (t: string) => accounts.filter((a) => a.accountType === t && a.normalBalance !== DEFAULT_BALANCE[t]).length
  const bankCount = accounts.filter((a) => a.isBankAccount && !a.bankRetiredAt && a.isActive).length
  const inactiveCount = accounts.filter((a) => !a.isActive).length
  const anyFilter = !!(filterType || filterSubType || search)
  const clearFilters = () => { setFilterType(''); setFilterSubType(''); setSearch('') }
  const toggleGroup = (k: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.key))
  const colCount = 2 + (isMd ? 2 : 0) + (isLg ? 1 : 0) + (canWrite ? 1 : 0)

  const selectedCount = importRows.filter((r) => r.selected).length
  const duplicateCount = importRows.filter((r) => r.duplicate).length

  /* ── Download Handler ───────────────────────────────────── */
  // Same file as before: every loaded account in the chosen type / sub type.
  const handleDownloadAccounts = (format: 'xlsx' | 'pdf') => {
    const headers = ['Account #', 'Account Title', 'Type', 'Sub Type', 'Sub-Sub Type', 'Normal Balance', 'Currency', 'Status', 'Description']
    const rows = typeFiltered.map(a => [
      a.accountNumber, a.accountTitle, a.accountType, a.subType || '', a.subSubType || '',
      a.normalBalance, a.currency, a.isActive ? 'Active' : 'Inactive', a.description || ''
    ])
    if (format === 'xlsx') downloadXlsx('Chart_of_Accounts', [{ name: 'Accounts', headers, rows }])
    else downloadPdf({ title: 'Chart of Accounts', subtitle: `${rows.length} accounts`, headers, rows, landscape: true })
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      <HrShimmerStyle />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Chart of Accounts
          </h1>
          <p className="mt-1 text-[13px] max-w-2xl" style={{ color: 'var(--mid-gray)' }}>
            Every general-ledger account, grouped by type and sub type.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DownloadMenu onDownload={handleDownloadAccounts} label="Download" />
          {canWrite && (<>
            <button onClick={() => { setImportStep('upload'); setError('') }} className={hrBtn.outline}
              style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
              <Upload size={15} /> Import
            </button>
            <button onClick={openCreateModal} className={hrBtn.primary} style={{ background: 'var(--teal)' }}>
              <Plus size={15} /> Add account
            </button>
          </>)}
        </div>
      </div>

      {/* Type cards (also quick filters) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {ACCOUNT_TYPE_OPTIONS.map((t) => {
          const meta = TYPE_META[t.value]
          const n = typeCount(t.value)
          const contra = contraCount(t.value)
          const bal = DEFAULT_BALANCE[t.value] === 'DEBIT' ? 'Debit' : 'Credit'
          return (
            <StatCard key={t.value} loading={loading} label={meta.plural} value={n.toLocaleString()}
              sub={t.value === 'ASSET' ? `${bankCount} bank account${bankCount === 1 ? '' : 's'} · ${bal} normal` : `${bal} normal${contra ? ` · ${contra} contra` : ''}`}
              accent={{ line: meta.line, fg: n ? 'var(--charcoal)' : 'var(--hr-faint)' }}
              active={filterType === t.value} activeSub="Filtered · click to show all"
              onClick={() => { setFilterType(filterType === t.value ? '' : t.value); setFilterSubType('') }}
              title={`Show only the ${meta.plural.toLowerCase()} accounts`} />
          )
        })}
      </div>

      {/* Error */}
      {error && !modalOpen && !importStep && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-[13px]" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Accounts card */}
      <section className="rounded-lg border bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-4 pt-3.5 pb-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              Accounts <span className="ml-1 text-xs font-semibold" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-body)' }}>
                {loading ? '' : `${filteredAccounts.length.toLocaleString()}${filteredAccounts.length !== accounts.length ? ` of ${accounts.length.toLocaleString()}` : ''}`}
              </span>
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
              {showInactive ? `Including ${inactiveCount} inactive account${inactiveCount === 1 ? '' : 's'} (faded).` : 'Active accounts. Inactive ones are hidden from pickers and this list.'}
            </p>
          </div>
          {groups.length > 0 && (
            <button onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)))}
              className="text-xs font-semibold mt-1" style={{ color: 'var(--teal)' }}>
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-y" style={{ background: '#fcfdfa', borderColor: 'var(--light-gray)' }}>
          <label className="flex items-center gap-1.5 h-9 px-3 w-full sm:w-72 rounded-lg border bg-white focus-within:border-[var(--teal)] focus-within:shadow-[0_0_0_3px_rgba(74,128,115,0.12)]"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--hr-faint)' }}>
            <Search size={15} className="flex-shrink-0" />
            <input type="text" placeholder="Search by number or title…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-0 bg-transparent outline-none text-[13px]" style={{ color: 'var(--charcoal)' }} />
            {search && <button onClick={() => setSearch('')} title="Clear search"><X size={14} /></button>}
          </label>
          <select value={filterSubType} onChange={(e) => setFilterSubType(e.target.value)}
            className="h-9 px-2.5 rounded-lg border bg-white text-[13px] outline-none focus:border-[var(--teal)]"
            style={{ borderColor: filterSubType ? 'var(--teal)' : 'var(--light-gray)', color: 'var(--charcoal)' }}>
            <option value="">{filterType ? `All ${TYPE_META[filterType]?.plural.toLowerCase()} sub types` : 'All sub types'}</option>
            {(filterType ? SUB_TYPES[filterType] || [] : ALL_SUB_TYPES).map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
            {([[false, 'Active'], [true, 'All, incl. inactive']] as const).map(([v, lbl]) => (
              <button key={lbl} onClick={() => setShowInactive(v)} aria-pressed={showInactive === v}
                className="h-9 px-3 text-xs font-semibold whitespace-nowrap"
                style={showInactive === v ? { background: 'var(--teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
                {lbl}
              </button>
            ))}
          </div>
          {anyFilter && (
            <button onClick={clearFilters} className="text-xs font-semibold hover:underline underline-offset-2" style={{ color: 'var(--teal)' }}>
              Clear filters
            </button>
          )}
        </div>

        {/* Grouped table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-4 space-y-2" aria-busy="true">
              {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-10 rounded-md hr-shimmer" />)}
            </div>
          ) : groups.length === 0 ? (
            <div className="px-6 py-14 flex flex-col items-center text-center">
              <span className="mb-2.5 flex w-11 h-11 items-center justify-center rounded-full" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                <BookOpen size={20} />
              </span>
              <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                {accounts.length === 0 ? 'No accounts yet' : 'No accounts match'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                {accounts.length === 0 ? (canWrite ? 'Add accounts one by one, or import them from a CSV file.' : 'Nothing has been set up yet.') : 'Nothing fits the search and filters.'}
              </p>
              {accounts.length > 0 && (
                <button onClick={clearFilters} className={`${hrBtn.outline} mt-4`} style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>Clear filters</button>
              )}
            </div>
          ) : (
            <table className="w-full table-fixed text-[13px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--hr-head)' }}>
                  {[
                    ['Account No.', 'w-[118px] md:w-[172px] md:pl-10'], ['Account title', ''], ['Normal balance', 'hidden md:table-cell w-[160px]'],
                    ['Currency', 'hidden md:table-cell w-[96px]'], ['Description', 'hidden lg:table-cell'],
                    ...(canWrite ? [['Actions', 'w-[92px] text-right']] : []),
                  ].map(([h, cls]) => (
                    <th key={h} className={`px-3 md:px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.5px] whitespace-nowrap border-b ${cls}`}
                      style={{ color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              {groups.map((g) => {
                const meta = TYPE_META[g.type]
                const open = !collapsed.has(g.key)
                return (
                  <tbody key={g.key}>
                    <tr>
                      <td colSpan={colCount} className="p-0 border-b" style={{ borderColor: 'var(--light-gray)' }}>
                        <button onClick={() => toggleGroup(g.key)} aria-expanded={open}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-[var(--hr-head)]"
                          style={{ boxShadow: `inset 4px 0 0 ${meta.line}` }}>
                          <ChevronDown size={15} className={`transition-transform ${open ? '' : '-rotate-90'}`} style={{ color: 'var(--mid-gray)' }} />
                          <span className="text-xs font-bold uppercase tracking-[.5px]" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{meta.plural}</span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums" style={meta.pill}>{g.count}</span>
                        </button>
                      </td>
                    </tr>
                    {open && g.subs.map((sg) => (
                      <SubGroupRows key={sg.key} label={sg.label} rows={sg.rows} colCount={colCount} canWrite={!!canWrite}
                        onEdit={openEditModal} onDelete={setDeleteConfirm} />
                    ))}
                  </tbody>
                )
              })}
            </table>
          )}
        </div>
      </section>

      {/* ── Delete Confirmation ──────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--charcoal)' }}>
              Remove Account
            </h3>
            <p className="text-sm mb-2" style={{ color: 'var(--mid-gray)' }}>
              <strong>{deleteConfirm.accountNumber}</strong> — {deleteConfirm.accountTitle}
            </p>
            <p className="text-sm mb-6" style={{ color: 'var(--mid-gray)' }}>
              You can deactivate (hide from lists) or permanently delete this account.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm border"
                style={{ borderColor: 'var(--light-gray)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id, false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100"
              >
                Deactivate
              </button>
              {session?.user?.role === 'ADMIN' && (
                <button
                  onClick={() => handleDelete(deleteConfirm.id, true)}
                  className="px-4 py-2 rounded-lg text-sm text-white bg-red-500 hover:bg-red-600"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Create/Edit Modal ────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          {/* The bank-account panels can grow the form past the viewport, so the
              card scrolls — without this the Save button is unreachable. */}
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                {editingAccount ? 'Edit Account' : 'Add Account'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={20} style={{ color: 'var(--mid-gray)' }} />
              </button>
            </div>

            {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Account Number</label>
                <input
                  type="text"
                  value={formNumber}
                  onChange={(e) => setFormNumber(e.target.value)}
                  required
                  placeholder="e.g. 1010"
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--light-gray)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Account Title</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  placeholder="e.g. Cash on Hand"
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--light-gray)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Account Type</label>
                <select
                  value={formType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--light-gray)' }}
                >
                  {ACCOUNT_TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Sub Type <span className="text-xs font-normal" style={{ color: 'var(--mid-gray)' }}>(optional)</span>
                </label>
                <select
                  value={formSubType}
                  onChange={(e) => handleSubTypeChange(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--light-gray)' }}
                >
                  <option value="">— Select sub type —</option>
                  {(() => {
                    const items = SUB_TYPES[formType] || []
                    const groups = [...new Set(items.map((s) => s.group).filter(Boolean))]
                    if (groups.length === 0) {
                      return items.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)
                    }
                    return groups.map((g) => (
                      <optgroup key={g} label={g}>
                        {items.filter((s) => s.group === g).map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </optgroup>
                    ))
                  })()}
                </select>
              </div>

              {/* Sub-Sub Type — shown for Inventory, Sales, and COGS */}
              {formSubType && SUB_SUB_TYPES[formSubType] && (
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                    {formSubType === 'INVENTORY' ? 'Inventory Type' : formSubType === 'SALES' ? 'Department' : 'COGS Department'}
                    <span className="text-xs font-normal ml-1" style={{ color: 'var(--mid-gray)' }}>(specific classification)</span>
                  </label>
                  <select
                    value={formSubSubType}
                    onChange={(e) => setFormSubSubType(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: 'var(--light-gray)' }}
                  >
                    <option value="">— Select {formSubType === 'INVENTORY' ? 'inventory type' : 'department'} —</option>
                    {SUB_SUB_TYPES[formSubType].map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {formSubType === 'CURRENT_ASSETS' && (
                <div className="space-y-2">
                  <label className="flex items-start gap-2 rounded-xl border p-3 cursor-pointer" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                    <input type="checkbox" checked={formIsBankAccount} onChange={(e) => { setFormIsBankAccount(e.target.checked); if (!e.target.checked) { setFormIsChecking(false); setFormBranch('') } }} className="mt-0.5" />
                    <span>
                      <span className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>Is this a bank account?</span>
                      <span className="block text-xs" style={{ color: 'var(--mid-gray)' }}>If ticked, this account appears in the Fund Transfer &quot;From&quot; / &quot;To&quot; dropdowns.</span>
                    </span>
                  </label>
                  {formIsBankAccount && (
                    <label className="flex items-start gap-2 rounded-xl border p-3 cursor-pointer ml-6" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                      <input type="checkbox" checked={formIsChecking} onChange={(e) => setFormIsChecking(e.target.checked)} className="mt-0.5" />
                      <span>
                        <span className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>Is this a checking account?</span>
                        <span className="block text-xs" style={{ color: 'var(--mid-gray)' }}>If ticked, checks drawn from this account appear in Fund Transfer &rarr; Check Release Monitoring.</span>
                      </span>
                    </label>
                  )}
                  {formIsBankAccount && editingAccount && (
                    <label className="flex items-start gap-2 rounded-xl border p-3 cursor-pointer ml-6" style={{ borderColor: formBankRetired ? '#fecaca' : 'var(--light-gray)', background: formBankRetired ? '#fef2f2' : 'var(--off-white)' }}>
                      <input type="checkbox" checked={formBankRetired} onChange={(e) => setFormBankRetired(e.target.checked)} className="mt-0.5" />
                      <span>
                        <span className="text-sm font-medium" style={{ color: formBankRetired ? '#991b1b' : 'var(--charcoal)' }}>Retire this bank account</span>
                        <span className="block text-xs" style={{ color: 'var(--mid-gray)' }}>
                          For closed accounts only: it disappears from every payment and transfer dropdown and from Bank Reconciliation, and no more statements can be uploaded. Allowed only when the last statement balance is zero and every bank line is matched — the ledger account itself stays active so history and reports are untouched.
                        </span>
                      </span>
                    </label>
                  )}
                  {formIsBankAccount && (
                    <div className="rounded-xl border p-3 ml-6" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Which branch owns this account?</label>
                      <span className="block text-xs mb-2" style={{ color: 'var(--mid-gray)' }}>
                        A bank statement covers the whole account and cannot be split, so the branch Balance Sheet and Cash Flow can only state this account&apos;s cash as the bank&apos;s own balance if it knows the account belongs to that branch. Leave as Shared for company-wide accounts (SCEI Main, SCI) &mdash; those stay in the All Branches view only.
                      </span>
                      <select
                        value={formBranch}
                        onChange={(e) => setFormBranch(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border text-sm"
                        style={{ borderColor: 'var(--light-gray)' }}
                      >
                        <option value="">Shared / company-wide</option>
                        <option value="SANDBOX_EAST">Aura Health East</option>
                        <option value="SANDBOX_GREENHILLS">Aura Health Greenhills</option>
                        <option value="VERDANA_STORE">Verdana</option>
                        <option value="AURA_INSTITUTE">Aura Health Institute</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Normal Balance
                  <span className="text-xs font-normal ml-1" style={{ color: 'var(--mid-gray)' }}>(auto-set by type, can override)</span>
                </label>
                <select
                  value={formBalance}
                  onChange={(e) => setFormBalance(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--light-gray)' }}
                >
                  <option value="DEBIT">Debit</option>
                  <option value="CREDIT">Credit</option>
                </select>
              </div>

              {/* Currency — available for all account types */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Currency
                  <span className="text-xs font-normal ml-1" style={{ color: 'var(--mid-gray)' }}>(defaults to PHP)</span>
                </label>
                <select
                  value={formCurrency}
                  onChange={(e) => setFormCurrency(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-colors"
                  style={{ borderColor: 'var(--light-gray)' }}
                >
                  {CURRENCIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                {formCurrency !== 'PHP' && (
                  <p className="text-xs mt-1 px-1" style={{ color: '#92400e' }}>
                    This account is denominated in {formCurrency}. Financial reports will auto-convert to PHP using the exchange rate at time of transaction.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Description <span className="text-xs font-normal" style={{ color: 'var(--mid-gray)' }}>(optional)</span>
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none"
                  style={{ borderColor: 'var(--light-gray)' }}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                  style={{ background: 'var(--teal)' }}
                >
                  {saving ? 'Saving...' : editingAccount ? 'Update Account' : 'Add Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Import Flow ──────────────────────────────────────── */}
      {importStep && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-3xl w-full shadow-xl max-h-[85vh] flex flex-col">

            {/* Upload Step */}
            {importStep === 'upload' && (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                    Import Chart of Accounts
                  </h3>
                  <button onClick={closeImport} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X size={20} style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </div>

                {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>}

                <div className="mb-6">
                  <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>
                    Upload a CSV file with your chart of accounts. Download the template to see the expected format.
                  </p>
                  <a
                    href="/api/chart-of-accounts/template"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors hover:bg-gray-50"
                    style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}
                  >
                    <Download size={16} />
                    Download CSV Template
                  </a>
                </div>

                <div className="border-2 border-dashed rounded-2xl p-8 text-center" style={{ borderColor: 'var(--light-gray)' }}>
                  <Upload size={32} className="mx-auto mb-3 opacity-40" style={{ color: 'var(--mid-gray)' }} />
                  <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>
                    Select a CSV file to import
                  </p>
                  <label
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold cursor-pointer transition-opacity hover:opacity-90"
                    style={{ background: 'var(--teal)' }}
                  >
                    <Upload size={16} />
                    Choose File
                    <input type="file" accept=".csv" onChange={handleFileSelect} className="hidden" />
                  </label>
                </div>
              </>
            )}

            {/* Preview Step */}
            {importStep === 'preview' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                    Review Import
                  </h3>
                  <button onClick={closeImport} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X size={20} style={{ color: 'var(--mid-gray)' }} />
                  </button>
                </div>

                {error && <div className="mb-3 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>}

                <div className="flex items-center gap-4 mb-4 text-sm" style={{ color: 'var(--mid-gray)' }}>
                  <span>{selectedCount} of {importRows.length} rows selected</span>
                  {duplicateCount > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle size={14} />
                      {duplicateCount} duplicate{duplicateCount > 1 ? 's' : ''} detected
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-auto border rounded-xl" style={{ borderColor: 'var(--light-gray)' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'var(--off-white)' }}>
                        <th className="px-3 py-2 text-left w-10">
                          <input
                            type="checkbox"
                            checked={importRows.length > 0 && importRows.every((r) => r.selected)}
                            onChange={(e) => toggleAll(e.target.checked)}
                            className="rounded"
                          />
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Account No.</th>
                        <th className="px-3 py-2 text-left font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Account Title</th>
                        <th className="px-3 py-2 text-left font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Type</th>
                        <th className="px-3 py-2 text-left font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Sub Type</th>
                        <th className="px-3 py-2 text-left font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Balance</th>
                        <th className="px-3 py-2 text-left font-semibold text-xs" style={{ color: 'var(--charcoal)' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map((row, i) => (
                        <tr
                          key={i}
                          className="border-t"
                          style={{
                            borderColor: 'var(--light-gray)',
                            background: row.duplicate ? '#fffbeb' : undefined,
                          }}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={() => toggleRow(i)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{row.accountNumber}</td>
                          <td className="px-3 py-2 text-xs">{row.accountTitle}</td>
                          <td className="px-3 py-2">
                            <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={TYPE_BADGE[row.accountType] || {}}>
                              {row.accountType}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{row.subType ? (SUB_TYPE_LABELS[row.subType] || row.subType) : '—'}</td>
                          <td className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{row.normalBalance}</td>
                          <td className="px-3 py-2">
                            {row.duplicate ? (
                              <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                                <AlertTriangle size={12} />
                                Duplicate:
                                {row.duplicate.numberMatch && row.duplicate.titleMatch
                                  ? ' No. & Title'
                                  : row.duplicate.numberMatch
                                  ? ' Account No.'
                                  : ' Title'}
                              </span>
                            ) : (
                              <span className="text-xs text-green-600">Ready</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3 justify-end mt-4 pt-4 border-t" style={{ borderColor: 'var(--light-gray)' }}>
                  <button
                    onClick={closeImport}
                    className="px-4 py-2.5 rounded-xl border text-sm font-medium"
                    style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={selectedCount === 0}
                    className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-opacity hover:opacity-90"
                    style={{ background: 'var(--teal)' }}
                  >
                    Import Selected ({selectedCount})
                  </button>
                </div>
              </>
            )}

            {/* Importing Step */}
            {importStep === 'importing' && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 size={32} className="animate-spin mb-4" style={{ color: 'var(--teal)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>Importing accounts...</p>
              </div>
            )}

            {/* Done Step */}
            {importStep === 'done' && importResult && (
              <>
                <div className="flex flex-col items-center py-8">
                  <CheckCircle2 size={48} className="mb-4" style={{ color: 'var(--teal)' }} />
                  <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Import Complete</h3>
                  <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
                    {importResult.imported} account{importResult.imported !== 1 ? 's' : ''} imported successfully.
                  </p>

                  {importResult.errors.length > 0 && (
                    <div className="mt-4 w-full max-w-md">
                      <p className="text-sm font-medium text-red-600 mb-2">{importResult.errors.length} failed:</p>
                      <div className="bg-red-50 rounded-xl p-3 text-xs text-red-700 space-y-1">
                        {importResult.errors.map((err, i) => (
                          <div key={i}><strong>{err.accountNumber}</strong>: {err.error}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-center mt-4">
                  <button
                    onClick={closeImport}
                    className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{ background: 'var(--teal)' }}
                  >
                    Close
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  )
}
