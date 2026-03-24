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
  Upload,
  Download,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react'

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

const TYPE_BADGE: Record<string, { bg: string; color: string }> = {
  ASSET:     { bg: '#dbeafe', color: '#1e40af' },
  LIABILITY: { bg: '#fce7f3', color: '#9d174d' },
  EQUITY:    { bg: '#f3e8ff', color: '#6b21a8' },
  REVENUE:   { bg: '#dcfce7', color: '#166534' },
  EXPENSE:   { bg: '#fef3c7', color: '#92400e' },
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

export default function ChartOfAccountsPage() {
  const { data: session, status } = useSession()
  const sessionUserId = session?.user?.id as string | undefined
  const initialLoaded = useRef(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterSubType, setFilterSubType] = useState('')
  const [error, setError] = useState('')

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

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<Account | null>(null)

  // Import flow
  const [importStep, setImportStep] = useState<null | 'upload' | 'preview' | 'importing' | 'done'>(null)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importResult, setImportResult] = useState<{ imported: number; errors: { accountNumber: string; error: string }[] } | null>(null)

  const canWrite = session?.user?.role && ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN'].includes(session.user.role)

  const fetchAccounts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ pageSize: '500' })
      if (filterType) params.set('accountType', filterType)
      if (filterSubType) params.set('subType', filterSubType)
      const res = await fetch(`/api/chart-of-accounts?${params}`)
      const data = await res.json()
      setAccounts(data.data || [])
    } catch {
      setError('Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }, [filterType, filterSubType])

  // Initial load
  useEffect(() => {
    if (!sessionUserId || initialLoaded.current) return
    initialLoaded.current = true
    fetchAccounts()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId])

  // Refetch on filter changes (debounced, only after initial load)
  useEffect(() => {
    if (!initialLoaded.current) return
    const timeout = setTimeout(() => { fetchAccounts() }, 300)
    return () => clearTimeout(timeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterSubType])

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
    setError('')
    setModalOpen(true)
  }

  function handleTypeChange(type: string) {
    setFormType(type)
    setFormSubType('')
    setFormSubSubType('')
    setFormBalance(DEFAULT_BALANCE[type] || 'DEBIT')
  }

  function handleSubTypeChange(subType: string) {
    setFormSubType(subType)
    setFormSubSubType('') // Reset sub-sub type when sub type changes
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const body: Record<string, string> = {
      accountNumber: formNumber,
      accountTitle: formTitle,
      accountType: formType,
      subType: formSubType,
      subSubType: formSubSubType,
      normalBalance: formBalance,
      currency: formCurrency,
      description: formDescription,
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

  const filteredAccounts = accounts.filter((a) => {
    if (!search) return true
    const q = search.toLowerCase()
    return a.accountNumber.toLowerCase().includes(q) || a.accountTitle.toLowerCase().includes(q)
  })

  const selectedCount = importRows.filter((r) => r.selected).length
  const duplicateCount = importRows.filter((r) => r.duplicate).length

  // ── Render ─────────────────────────────────────────────────

  if (loading && !initialLoaded.current) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm" style={{ color: 'var(--mid-gray)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Chart of Accounts
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Manage your general ledger account structure
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setImportStep('upload'); setError('') }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors hover:bg-gray-50"
              style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}
            >
              <Upload size={18} />
              Import
            </button>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'var(--teal)' }}
            >
              <Plus size={18} />
              Add Account
            </button>
          </div>
        )}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
          <input
            type="text"
            placeholder="Search accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none"
            style={{ borderColor: 'var(--light-gray)', background: 'white' }}
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setFilterSubType('') }}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none"
          style={{ borderColor: 'var(--light-gray)', background: 'white' }}
        >
          <option value="">All Types</option>
          {ACCOUNT_TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select
          value={filterSubType}
          onChange={(e) => setFilterSubType(e.target.value)}
          className="px-3 py-2.5 rounded-xl border text-sm outline-none"
          style={{ borderColor: 'var(--light-gray)', background: 'white' }}
        >
          <option value="">All Sub Types</option>
          {(filterType ? SUB_TYPES[filterType] || [] : ALL_SUB_TYPES).map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && !modalOpen && !importStep && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>
      )}

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--off-white)' }}>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Account No.</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Account Title</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Type</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Sub Type</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Normal Balance</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Currency</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Description</th>
                {canWrite && <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 8 : 7} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                    <BookOpen size={32} className="mx-auto mb-2 opacity-40" />
                    <p>No accounts found</p>
                    {canWrite && <p className="text-xs mt-1">Add accounts manually or import from CSV</p>}
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((account) => (
                  <tr
                    key={account.id}
                    className="border-t hover:bg-gray-50/50 transition-colors"
                    style={{ borderColor: 'var(--light-gray)' }}
                  >
                    <td className="px-4 py-3 font-mono font-medium" style={{ color: 'var(--charcoal)' }}>
                      {account.accountNumber}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>
                      {account.accountTitle}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-1 rounded-md text-xs font-medium"
                        style={TYPE_BADGE[account.accountType] || { bg: '#f3f4f6', color: '#374151' }}
                      >
                        {account.accountType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {getSubTypeDisplay(account.subType, account.subSubType)}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>
                      {account.normalBalance}
                    </td>
                    <td className="px-4 py-3" style={{ color: account.currency && account.currency !== 'PHP' ? '#92400e' : 'var(--mid-gray)' }}>
                      {account.currency && account.currency !== 'PHP' ? (
                        <span className="px-2 py-0.5 rounded-md text-xs font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>
                          {account.currency}
                        </span>
                      ) : (
                        <span className="text-xs">PHP</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate" style={{ color: 'var(--mid-gray)' }}>
                      {account.description || '—'}
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEditModal(account)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Edit">
                            <Pencil size={15} style={{ color: 'var(--teal)' }} />
                          </button>
                          <button onClick={() => setDeleteConfirm(account)} className="p-2 rounded-lg hover:bg-red-50 transition-colors" title="Delete">
                            <Trash2 size={15} className="text-red-500" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
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
