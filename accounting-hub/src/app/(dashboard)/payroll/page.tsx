'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  BadgeDollarSign, Users, Settings, FileText, Plus, Pencil, Save,
  ChevronUp, ChevronDown, ArrowUpDown, Search, X, AlertCircle,
  RefreshCw, Loader2, ChevronRight,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

const toNum = (v: unknown) => Number(v) || 0

interface Consultant {
  id: string
  externalStaffId?: string | null
  name: string
  department: string
  branch: string
  taxDeduction: string
  monthlyRetainer: number | string
  isActive: boolean
  unitPayRates: { id: string; unitPayId: string; unitPay: { id: string; name: string }; amount: number | string }[]
}

interface UnitPayType {
  id: string
  name: string
  departments: string[]
  isActive: boolean
  _count?: { consultantRates: number; services: number }
}

interface PayrollPreview {
  consultantId: string
  consultantName: string
  department: string
  branch: string
  taxDeduction: string
  items: { unitPayId: string; unitPayName: string; unitAmount: number; quantity: number; lineTotal: number }[]
  unitPayTotal: number
  retainerAmount: number
  grossPay: number
  taxAmount: number
  netPay: number
  orderCount: number
  existingStatus: string | null
}

const DEPARTMENTS = [
  { value: '', label: 'All Departments' },
  { value: 'PT', label: 'Physical Therapy' },
  { value: 'OT', label: 'Occupational Therapy' },
  { value: 'SLP', label: 'Speech-Language Pathology' },
  { value: 'SPED', label: 'Special Education' },
  { value: 'MD', label: 'Medical Doctor' },
  { value: 'PSYCHOLOGY', label: 'Psychology' },
  { value: 'ORTHOSIS', label: 'Orthosis & Prosthesis' },
]

const DEPT_LABELS: Record<string, string> = Object.fromEntries(DEPARTMENTS.filter(d => d.value).map(d => [d.value, d.label]))

const BRANCHES = [
  { value: '', label: 'All Branches' },
  { value: 'SBEA', label: 'Sandbox East' },
  { value: 'SBGH', label: 'Sandbox Greenhills' },
]

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function getCutoffLabel(period: string) {
  const [y, m, h] = period.split('-')
  return `${MONTHS[parseInt(m) - 1]} ${y} — ${h === '1' ? '1st Half' : '2nd Half'}`
}

export default function PayrollPage() {
  const { data: session } = useSession()
  const canWrite = session?.user?.role && ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN'].includes(session.user.role as string)

  const now = new Date()
  const [branch, setBranch] = useState('')
  const [cutoffMonth, setCutoffMonth] = useState(now.getMonth() + 1)
  const [cutoffYear, setCutoffYear] = useState(now.getFullYear())
  const [cutoffHalf, setCutoffHalf] = useState(now.getDate() <= 15 ? 1 : 2)
  const cutoffPeriod = `${cutoffYear}-${String(cutoffMonth).padStart(2, '0')}-${cutoffHalf}`

  const [mainTab, setMainTab] = useState<'consultants' | 'employees'>('consultants')
  const [subTab, setSubTab] = useState<'list' | 'unit-pay' | 'payslips'>('list')

  // Data
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [unitPays, setUnitPays] = useState<UnitPayType[]>([])
  const [payrollPreviews, setPayrollPreviews] = useState<PayrollPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  // Consultant list state
  const [cSearch, setCSearch] = useState('')
  const [cDeptFilter, setCDeptFilter] = useState('')
  const [cSortField, setCSortField] = useState('name')
  const [cSortDir, setCSortDir] = useState<'asc' | 'desc'>('asc')
  const [expandedConsultant, setExpandedConsultant] = useState<string | null>(null)
  const [editingRates, setEditingRates] = useState<Record<string, number>>({})
  const [editingTax, setEditingTax] = useState('')
  const [editingRetainer, setEditingRetainer] = useState('')
  const [savingConsultant, setSavingConsultant] = useState(false)

  // Unit Pay form
  const [showUnitPayForm, setShowUnitPayForm] = useState(false)
  const [editingUnitPay, setEditingUnitPay] = useState<UnitPayType | null>(null)
  const [upName, setUpName] = useState('')
  const [upDepts, setUpDepts] = useState<string[]>([])
  const [savingUP, setSavingUP] = useState(false)

  // Payslip generation
  const [genDept, setGenDept] = useState('')
  const [genConsultantId, setGenConsultantId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchConsultants = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (branch) params.set('branch', branch)
      const res = await fetch(`/api/payroll/consultants?${params}`)
      setConsultants(await res.json())
    } catch { setConsultants([]) }
  }, [branch])

  const fetchUnitPays = useCallback(async () => {
    try {
      const res = await fetch('/api/payroll/unit-pay')
      setUnitPays(await res.json())
    } catch { setUnitPays([]) }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchConsultants(), fetchUnitPays()]).finally(() => setLoading(false))
  }, [fetchConsultants, fetchUnitPays])

  const syncConsultants = async () => {
    setSyncing(true)
    try {
      const params = new URLSearchParams({ sync: 'true' })
      if (branch) params.set('branch', branch)
      await fetch(`/api/payroll/consultants?${params}`)
      await fetchConsultants()
    } catch {}
    finally { setSyncing(false) }
  }

  // Consultant list helpers
  const filteredConsultants = consultants
    .filter(c => !cSearch || c.name.toLowerCase().includes(cSearch.toLowerCase()))
    .filter(c => !cDeptFilter || c.department === cDeptFilter)
    .sort((a, b) => {
      const av = cSortField === 'name' ? a.name : a.department
      const bv = cSortField === 'name' ? b.name : b.department
      return cSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })

  function toggleCSort(field: string) {
    if (cSortField === field) setCSortDir(p => p === 'asc' ? 'desc' : 'asc')
    else { setCSortField(field); setCSortDir('asc') }
  }

  function CSortIcon({ field }: { field: string }) {
    if (cSortField !== field) return <ArrowUpDown size={12} className="opacity-30" />
    return cSortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
  }

  const expandConsultant = (c: Consultant) => {
    if (expandedConsultant === c.id) { setExpandedConsultant(null); return }
    setExpandedConsultant(c.id)
    const rateMap: Record<string, number> = {}
    for (const r of c.unitPayRates) rateMap[r.unitPayId] = toNum(r.amount)
    setEditingRates(rateMap)
    setEditingTax(c.taxDeduction)
    setEditingRetainer(String(toNum(c.monthlyRetainer)))
  }

  const saveConsultantConfig = async (c: Consultant) => {
    setSavingConsultant(true)
    try {
      const unitPayRates = Object.entries(editingRates)
        .filter(([, amt]) => amt > 0)
        .map(([unitPayId, amount]) => ({ unitPayId, amount }))
      await fetch('/api/payroll/consultants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: c.id,
          taxDeduction: editingTax,
          monthlyRetainer: parseFloat(editingRetainer) || 0,
          unitPayRates,
        }),
      })
      await fetchConsultants()
    } catch { setError('Failed to save') }
    finally { setSavingConsultant(false) }
  }

  // Unit Pay CRUD
  const openUPCreate = () => {
    setEditingUnitPay(null); setUpName(''); setUpDepts([])
    setShowUnitPayForm(true); setError('')
  }
  const openUPEdit = (up: UnitPayType) => {
    setEditingUnitPay(up); setUpName(up.name); setUpDepts(up.departments || [])
    setShowUnitPayForm(true); setError('')
  }
  const saveUnitPay = async () => {
    if (!upName.trim()) { setError('Name required'); return }
    setSavingUP(true); setError('')
    try {
      const body = { name: upName, departments: upDepts, ...(editingUnitPay ? { id: editingUnitPay.id } : {}) }
      await fetch('/api/payroll/unit-pay', {
        method: editingUnitPay ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setShowUnitPayForm(false)
      fetchUnitPays()
    } catch { setError('Failed to save') }
    finally { setSavingUP(false) }
  }

  // Payslip generation
  const generatePayslips = async () => {
    setGenerating(true); setError('')
    try {
      const params = new URLSearchParams({ cutoffPeriod })
      if (branch) params.set('branch', branch)
      if (genDept) params.set('department', genDept)
      if (genConsultantId) params.set('consultantId', genConsultantId)
      const res = await fetch(`/api/payroll/generate?${params}`)
      const data = await res.json()
      setPayrollPreviews(data.payrolls || [])
    } catch { setError('Failed to generate') }
    finally { setGenerating(false) }
  }

  const savePayslips = async () => {
    setSaving(true)
    try {
      const entries = payrollPreviews.filter(p => p.grossPay > 0).map(p => ({
        consultantId: p.consultantId,
        branch: p.branch,
        items: p.items,
        grossPay: p.grossPay,
        retainerAmount: p.retainerAmount,
        taxAmount: p.taxAmount,
        netPay: p.netPay,
        status: 'DRAFT',
      }))
      await fetch('/api/payroll/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutoffPeriod, branch, entries }),
      })
      await generatePayslips()
    } catch { setError('Failed to save') }
    finally { setSaving(false) }
  }

  if (!session?.user) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            <BadgeDollarSign size={28} style={{ color: 'var(--teal)' }} /> Payroll
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>Consultant and employee compensation management</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Branch</label>
          <select value={branch} onChange={e => setBranch(e.target.value)}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Month</label>
          <select value={cutoffMonth} onChange={e => setCutoffMonth(parseInt(e.target.value))}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Year</label>
          <select value={cutoffYear} onChange={e => setCutoffYear(parseInt(e.target.value))}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Cutoff</label>
          <select value={cutoffHalf} onChange={e => setCutoffHalf(parseInt(e.target.value))}
            className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
            <option value={1}>1st Half (Day 1-15)</option>
            <option value={2}>2nd Half (Day 16-End)</option>
          </select>
        </div>
        <div className="px-3 py-2 rounded-xl text-sm font-medium" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
          {getCutoffLabel(cutoffPeriod)}
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setMainTab('consultants')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          style={mainTab === 'consultants' ? { background: 'var(--teal)', color: 'white' } : { background: 'var(--off-white)', color: 'var(--charcoal)' }}>
          <Users size={16} /> Consultants
        </button>
        <button onClick={() => setMainTab('employees')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          style={mainTab === 'employees' ? { background: 'var(--teal)', color: 'white' } : { background: 'var(--off-white)', color: 'var(--charcoal)' }}>
          <Users size={16} /> Employees
        </button>
      </div>

      {mainTab === 'employees' && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users size={36} className="mb-3 opacity-30" />
          <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Employee Payroll</p>
          <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>Coming soon — employee salary and payroll management</p>
        </div>
      )}

      {mainTab === 'consultants' && (
        <>
          {/* Sub-tabs */}
          <div className="flex gap-2 border-b pb-2" style={{ borderColor: 'var(--light-gray)' }}>
            {[
              { key: 'list' as const, label: 'Clinician List', icon: Users },
              { key: 'unit-pay' as const, label: 'Unit Pay Settings', icon: Settings },
              { key: 'payslips' as const, label: 'Payslip Generation', icon: FileText },
            ].map(t => (
              <button key={t.key} onClick={() => setSubTab(t.key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                style={subTab === t.key ? { background: 'var(--pale-teal)', color: 'var(--deep-teal)' } : { color: 'var(--mid-gray)' }}>
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>

          {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}

          {/* ── TAB 1: Clinician List ── */}
          {subTab === 'list' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5" style={{ color: 'var(--mid-gray)' }} />
                    <input value={cSearch} onChange={e => setCSearch(e.target.value)} placeholder="Search clinicians..."
                      className="pl-9 pr-3 py-2 rounded-xl border text-sm outline-none w-60" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <select value={cDeptFilter} onChange={e => setCDeptFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                    {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                {canWrite && (
                  <button onClick={syncConsultants} disabled={syncing}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: 'var(--teal)' }}>
                    {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Sync from Clinician Database
                  </button>
                )}
              </div>

              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--off-white)' }}>
                      <th className="w-8 px-4 py-3" />
                      <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}
                        onClick={() => toggleCSort('name')}>
                        <span className="flex items-center gap-1">Name <CSortIcon field="name" /></span>
                      </th>
                      <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none" style={{ color: 'var(--charcoal)' }}
                        onClick={() => toggleCSort('department')}>
                        <span className="flex items-center gap-1">Department <CSortIcon field="department" /></span>
                      </th>
                      <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Branch</th>
                      <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Tax</th>
                      <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)' }}>Retainer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>Loading...</td></tr>
                    ) : filteredConsultants.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                        No consultants found. Click &quot;Sync from Clinician Database&quot; to import.
                      </td></tr>
                    ) : filteredConsultants.map(c => (
                      <>
                        <tr key={c.id} className="border-t hover:bg-gray-50/50 cursor-pointer transition-colors"
                          style={{ borderColor: 'var(--light-gray)' }} onClick={() => expandConsultant(c)}>
                          <td className="px-4 py-3">
                            <ChevronRight size={14} className={`transition-transform ${expandedConsultant === c.id ? 'rotate-90' : ''}`} style={{ color: 'var(--mid-gray)' }} />
                          </td>
                          <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>{c.name}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{DEPT_LABELS[c.department] || c.department}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{c.branch}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                              style={c.taxDeduction === 'FIVE_PERCENT' ? { background: '#fef3c7', color: '#92400e' } : { background: '#f3f4f6', color: '#374151' }}>
                              {c.taxDeduction === 'FIVE_PERCENT' ? '5% Tax' : 'No Tax'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-medium" style={{ color: 'var(--charcoal)' }}>
                            {toNum(c.monthlyRetainer) > 0 ? formatCurrency(toNum(c.monthlyRetainer)) + '/mo' : '—'}
                          </td>
                        </tr>
                        {expandedConsultant === c.id && (
                          <tr key={`${c.id}-expand`} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                            <td colSpan={6} className="px-6 py-4" style={{ background: '#fafafa' }}>
                              <div className="space-y-4 max-w-lg">
                                {/* Tax toggle */}
                                <div className="flex items-center gap-4">
                                  <label className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Tax Deduction:</label>
                                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input type="radio" name={`tax-${c.id}`} value="FIVE_PERCENT" checked={editingTax === 'FIVE_PERCENT'}
                                      onChange={() => setEditingTax('FIVE_PERCENT')} />
                                    5% Tax Deduction
                                  </label>
                                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input type="radio" name={`tax-${c.id}`} value="NONE" checked={editingTax === 'NONE'}
                                      onChange={() => setEditingTax('NONE')} />
                                    No Tax Deduction
                                  </label>
                                </div>

                                {/* Monthly Retainer */}
                                <div>
                                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--charcoal)' }}>Fixed Monthly Retainer</label>
                                  <input type="number" min={0} step="0.01" value={editingRetainer}
                                    onChange={e => setEditingRetainer(e.target.value)}
                                    className="px-3 py-2 rounded-xl border text-sm outline-none w-48" style={{ borderColor: 'var(--light-gray)' }} />
                                </div>

                                {/* Unit Pay Rates */}
                                <div>
                                  <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Unit Pay Rates</label>
                                  {unitPays.length === 0 ? (
                                    <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No unit pay types. Create them in Unit Pay Settings tab first.</p>
                                  ) : (
                                    <div className="space-y-2">
                                      {unitPays.map(up => (
                                        <div key={up.id} className="flex items-center gap-3">
                                          <span className="text-xs font-medium w-40" style={{ color: 'var(--charcoal)' }}>{up.name}</span>
                                          <input type="number" min={0} step="0.01"
                                            value={editingRates[up.id] || ''}
                                            onChange={e => setEditingRates({ ...editingRates, [up.id]: parseFloat(e.target.value) || 0 })}
                                            placeholder="0.00"
                                            className="px-3 py-1.5 rounded-lg border text-sm outline-none w-32" style={{ borderColor: 'var(--light-gray)' }} />
                                          <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>per unit</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {canWrite && (
                                  <button onClick={() => saveConsultantConfig(c)} disabled={savingConsultant}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                                    style={{ background: 'var(--teal)' }}>
                                    <Save size={14} /> {savingConsultant ? 'Saving...' : 'Save Configuration'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── TAB 2: Unit Pay Settings ── */}
          {subTab === 'unit-pay' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Unit Pay Types</h3>
                {canWrite && (
                  <button onClick={openUPCreate} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--teal)' }}>
                    <Plus size={16} /> Add Unit Pay
                  </button>
                )}
              </div>

              {unitPays.length === 0 ? (
                <p className="text-sm py-8 text-center" style={{ color: 'var(--mid-gray)' }}>
                  No unit pay types created yet. Add one to start configuring consultant rates.
                </p>
              ) : (
                <div className="grid gap-3">
                  {unitPays.map(up => (
                    <div key={up.id} className="flex items-center justify-between p-4 rounded-xl border" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{up.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                          {(up.departments || []).length > 0
                            ? `Depts: ${(up.departments || []).map(d => DEPT_LABELS[d] || d).join(', ')}`
                            : 'All departments'}
                          {up._count && ` · ${up._count.consultantRates} consultants · ${up._count.services} services`}
                        </p>
                      </div>
                      {canWrite && (
                        <button onClick={() => openUPEdit(up)} className="p-2 rounded-lg hover:bg-gray-100">
                          <Pencil size={14} style={{ color: 'var(--teal)' }} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Unit Pay Form Modal */}
              {showUnitPayForm && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
                  <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-md relative">
                    <button onClick={() => setShowUnitPayForm(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100">
                      <X size={18} style={{ color: 'var(--mid-gray)' }} />
                    </button>
                    <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                      {editingUnitPay ? 'Edit Unit Pay' : 'Add Unit Pay'}
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Name of Unit Pay *</label>
                        <input value={upName} onChange={e => setUpName(e.target.value)} placeholder="e.g. Basic PF"
                          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Applicable Departments</label>
                        <p className="text-xs mb-2" style={{ color: 'var(--mid-gray)' }}>Leave empty for all departments</p>
                        <div className="flex flex-wrap gap-2">
                          {DEPARTMENTS.filter(d => d.value).map(d => (
                            <label key={d.value} className="flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded-lg border"
                              style={{ borderColor: upDepts.includes(d.value) ? 'var(--teal)' : 'var(--light-gray)', background: upDepts.includes(d.value) ? '#f0fdfa' : 'white' }}>
                              <input type="checkbox" checked={upDepts.includes(d.value)}
                                onChange={e => setUpDepts(e.target.checked ? [...upDepts, d.value] : upDepts.filter(x => x !== d.value))}
                                className="rounded" />
                              {d.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      {error && <p className="text-xs text-red-600">{error}</p>}
                      <div className="flex gap-3 pt-2">
                        <button onClick={() => setShowUnitPayForm(false)}
                          className="flex-1 py-2.5 rounded-xl border text-sm font-medium" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                        <button onClick={saveUnitPay} disabled={savingUP}
                          className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                          style={{ background: 'var(--teal)' }}>{savingUP ? 'Saving...' : 'Save'}</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 3: Payslip Generation ── */}
          {subTab === 'payslips' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <select value={genDept} onChange={e => setGenDept(e.target.value)}
                  className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                  {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <select value={genConsultantId} onChange={e => setGenConsultantId(e.target.value)}
                  className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
                  <option value="">All Consultants</option>
                  {consultants.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={generatePayslips} disabled={generating}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: 'var(--teal)' }}>
                  {generating ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  Generate Payslips
                </button>
                {payrollPreviews.some(p => p.grossPay > 0) && (
                  <button onClick={savePayslips} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border disabled:opacity-50"
                    style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                    <Save size={14} /> {saving ? 'Saving...' : 'Save All as Draft'}
                  </button>
                )}
              </div>

              {payrollPreviews.length > 0 && (
                <div className="space-y-4">
                  <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>
                    Showing payroll for: {getCutoffLabel(cutoffPeriod)}
                  </p>
                  {payrollPreviews.filter(p => p.grossPay > 0 || p.orderCount > 0).map(p => (
                    <div key={p.consultantId} className="rounded-2xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{p.consultantName}</p>
                          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{DEPT_LABELS[p.department] || p.department} · {p.branch}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(p.netPay)}</p>
                          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>Net Pay</p>
                        </div>
                      </div>

                      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: 'var(--off-white)' }}>
                              {['Item', 'Rate', 'Qty', 'Amount'].map(h => (
                                <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {p.items.map((item, idx) => (
                              <tr key={idx} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                                <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{item.unitPayName}</td>
                                <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{formatCurrency(item.unitAmount)}</td>
                                <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{item.quantity}</td>
                                <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(item.lineTotal)}</td>
                              </tr>
                            ))}
                            {p.retainerAmount > 0 && (
                              <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                                <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>Monthly Retainer (half)</td>
                                <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>—</td>
                                <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>—</td>
                                <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(p.retainerAmount)}</td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot>
                            <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                              <td colSpan={3} className="px-3 py-2 text-right font-semibold">Gross Pay</td>
                              <td className="px-3 py-2 font-semibold">{formatCurrency(p.grossPay)}</td>
                            </tr>
                            {p.taxAmount > 0 && (
                              <tr style={{ background: '#fef2f2' }}>
                                <td colSpan={3} className="px-3 py-2 text-right font-semibold" style={{ color: '#991b1b' }}>
                                  Tax Deduction (5%)
                                </td>
                                <td className="px-3 py-2 font-semibold" style={{ color: '#991b1b' }}>
                                  ({formatCurrency(p.taxAmount)})
                                </td>
                              </tr>
                            )}
                            <tr style={{ background: '#f0fdf4' }}>
                              <td colSpan={3} className="px-3 py-2 text-right font-bold" style={{ color: '#166534' }}>Net Pay</td>
                              <td className="px-3 py-2 font-bold" style={{ color: '#166534' }}>{formatCurrency(p.netPay)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {p.existingStatus && (
                        <p className="text-xs mt-2 px-2 py-1 rounded-lg inline-block"
                          style={p.existingStatus === 'FINAL' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>
                          Status: {p.existingStatus}
                        </p>
                      )}
                    </div>
                  ))}

                  {payrollPreviews.filter(p => p.grossPay > 0 || p.orderCount > 0).length === 0 && (
                    <p className="text-sm py-8 text-center" style={{ color: 'var(--mid-gray)' }}>
                      No payable transactions found for this cutoff period.
                    </p>
                  )}

                  {/* Total summary */}
                  {payrollPreviews.some(p => p.grossPay > 0) && (
                    <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: 'var(--pale-teal)' }}>
                      <span className="text-sm font-semibold" style={{ color: 'var(--deep-teal)' }}>
                        Total Payroll ({payrollPreviews.filter(p => p.grossPay > 0).length} consultants)
                      </span>
                      <span className="text-lg font-bold" style={{ color: 'var(--deep-teal)' }}>
                        {formatCurrency(payrollPreviews.reduce((s, p) => s + p.netPay, 0))}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {payrollPreviews.length === 0 && !generating && (
                <p className="text-sm py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                  Select a cutoff period and click &quot;Generate Payslips&quot; to preview consultant payroll.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
