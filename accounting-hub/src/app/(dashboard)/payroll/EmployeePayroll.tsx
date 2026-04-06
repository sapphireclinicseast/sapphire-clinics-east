'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Users, Settings, FileText, Plus, Pencil, Save, Search, X, AlertCircle,
  RefreshCw, Loader2, Upload, Download, Calendar, Clock, CheckCircle2,
  XCircle, ChevronDown, ChevronUp, Trash2, Eye, QrCode, ClipboardList,
  DollarSign, Shield, Star,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

const toNum = (v: unknown) => Number(v) || 0

const EMP_DEPARTMENTS = [
  { value: '', label: 'All Departments' },
  { value: 'ADMINISTRATION', label: 'Administration' },
  { value: 'FRONT_DESK', label: 'Front Desk' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'MARKETING', label: 'Marketing' },
]

const BRANCHES = [
  { value: '', label: 'All Branches' },
  { value: 'SBEA', label: 'Sandbox East' },
  { value: 'SBGH', label: 'Sandbox Greenhills' },
]

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const HOLIDAY_TYPES = [
  { value: 'REGULAR', label: 'Regular Holiday' },
  { value: 'SPECIAL_NON_WORKING', label: 'Special Non-Working Holiday' },
  { value: 'SPECIAL_WORKING', label: 'Special Working Holiday' },
]

const REQUEST_TYPES = [
  { value: 'LEAVE', label: 'Leave' },
  { value: 'OVERTIME', label: 'Overtime' },
  { value: 'UNDERTIME', label: 'Undertime' },
  { value: 'CHANGE_SCHEDULE', label: 'Change Schedule' },
  { value: 'CERTIFICATE_OF_EMPLOYMENT', label: 'Certificate of Employment' },
]

const LEAVE_TYPES = [
  { value: 'VACATION', label: 'Vacation Leave' },
  { value: 'SICK', label: 'Sick Leave' },
  { value: 'EMERGENCY', label: 'Emergency Leave' },
  { value: 'MATERNITY', label: 'Maternity Leave' },
  { value: 'PATERNITY', label: 'Paternity Leave' },
  { value: 'BEREAVEMENT', label: 'Bereavement Leave' },
  { value: 'UNPAID', label: 'Unpaid Leave' },
]

const BENEFIT_TYPES = ['SSS', 'PHILHEALTH', 'PAGIBIG', 'TAX']

const PH_HOLIDAYS_2026 = [
  { name: "New Year's Day", date: '2026-01-01', holidayType: 'REGULAR' },
  { name: 'Araw ng Kagitingan', date: '2026-04-09', holidayType: 'REGULAR' },
  { name: 'Maundy Thursday', date: '2026-04-02', holidayType: 'REGULAR' },
  { name: 'Good Friday', date: '2026-04-03', holidayType: 'REGULAR' },
  { name: 'Black Saturday', date: '2026-04-04', holidayType: 'SPECIAL_NON_WORKING' },
  { name: 'Labor Day', date: '2026-05-01', holidayType: 'REGULAR' },
  { name: 'Independence Day', date: '2026-06-12', holidayType: 'REGULAR' },
  { name: 'Ninoy Aquino Day', date: '2026-08-21', holidayType: 'SPECIAL_NON_WORKING' },
  { name: 'National Heroes Day', date: '2026-08-31', holidayType: 'REGULAR' },
  { name: 'Bonifacio Day', date: '2026-11-30', holidayType: 'REGULAR' },
  { name: 'Christmas Eve', date: '2026-12-24', holidayType: 'SPECIAL_NON_WORKING' },
  { name: 'Christmas Day', date: '2026-12-25', holidayType: 'REGULAR' },
  { name: 'Rizal Day', date: '2026-12-30', holidayType: 'REGULAR' },
  { name: "New Year's Eve", date: '2026-12-31', holidayType: 'SPECIAL_NON_WORKING' },
  { name: 'Eid al-Fitr', date: '2026-03-20', holidayType: 'REGULAR' },
  { name: 'Eid al-Adha', date: '2026-05-27', holidayType: 'REGULAR' },
  { name: 'All Saints Day', date: '2026-11-01', holidayType: 'SPECIAL_NON_WORKING' },
  { name: 'Immaculate Conception', date: '2026-12-08', holidayType: 'SPECIAL_NON_WORKING' },
  { name: 'Chinese New Year', date: '2026-02-17', holidayType: 'SPECIAL_NON_WORKING' },
  { name: 'EDSA People Power Revolution', date: '2026-02-25', holidayType: 'SPECIAL_NON_WORKING' },
]

function formatJobTitle(jt: string | null | undefined): string {
  if (!jt) return '—'
  // If already formatted (contains spaces or starts with uppercase), return as-is
  if (jt.includes(' ') || /^[A-Z]/.test(jt)) return jt
  // Convert slug "clinic-aide" to "Clinic Aide"
  return jt.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/* ═══════════════════════════════════════════════════════════════
   INTERFACES
   ═══════════════════════════════════════════════════════════════ */
interface Employee {
  id: string
  externalStaffId?: string | null
  employeeBioId?: number | null
  firstName: string
  lastName: string
  email?: string | null
  department: string
  branch: string
  jobTitle?: string | null
  rateType: 'DAILY' | 'MONTHLY'
  dailyRate: number | string
  monthlyRate: number | string
  sssNumber?: string | null
  philhealthNumber?: string | null
  pagibigNumber?: string | null
  tinNumber?: string | null
  dateHired?: string | null
  regularizationDate?: string | null
  scheduleIn: string
  scheduleOut: string
  restDay: string
  isActive: boolean
  benefits: Benefit[]
}

interface Benefit {
  id: string
  employeeId: string
  benefitType: string
  employeeShare: number | string
  employerShare: number | string
  isActive: boolean
}

interface EmployeeRequest {
  id: string
  employeeId: string
  requestType: string
  leaveType?: string | null
  startDate?: string | null
  endDate?: string | null
  reason?: string | null
  status: string
  reviewNotes?: string | null
  createdAt: string
  employee: { id: string; firstName: string; lastName: string; department: string; branch: string }
}

interface TimekeepingRecord {
  id: string
  employeeId: string
  date: string
  timeIn?: string | null
  timeOut?: string | null
  hoursWorked?: number | string | null
  lateMinutes: number
  undertimeMinutes: number
  overtimeMinutes: number
  isRestDay: boolean
  isHoliday: boolean
  holidayType?: string | null
  source: string
  remarks?: string | null
  employee: { id: string; firstName: string; lastName: string; department: string; branch: string; scheduleIn: string; scheduleOut: string }
}

interface Holiday {
  id: string
  name: string
  date: string
  holidayType: string
  branch?: string | null
  isRecurring: boolean
}

interface EmpSettings {
  id: string
  cutoff1Start: number
  cutoff1End: number
  cutoff2Start: number
  cutoff2EndLastDay: boolean
  cutoff2End: number
  standardHoursPerDay: number | string
  overtimeMultiplier: number | string
  nightDiffMultiplier: number | string
  regularHolidayRate: number | string
  specialHolidayRate: number | string
  regularHolidayOTRate: number | string
  specialHolidayOTRate: number | string
  restDayRate: number | string
  restDayRegHolidayRate: number | string
  restDaySpecHolidayRate: number | string
  sssEnabled: boolean
  philhealthEnabled: boolean
  pagibigEnabled: boolean
  taxEnabled: boolean
}

interface Payslip {
  id: string
  employeeId: string
  cutoffPeriod: string
  branch: string
  basicPay: number | string
  overtimePay: number | string
  holidayPay: number | string
  nightDiffPay: number | string
  restDayPay: number | string
  grossPay: number | string
  sssDeduction: number | string
  philhealthDeduction: number | string
  pagibigDeduction: number | string
  taxDeduction: number | string
  lateDeduction: number | string
  undertimeDeduction: number | string
  totalDeductions: number | string
  netPay: number | string
  daysWorked: number | string
  hoursWorked: number | string
  overtimeHours: number | string
  lateMinutes: number
  undertimeMinutes: number
  status: string
  employee: { id: string; firstName: string; lastName: string; department: string; branch: string; rateType: string; dailyRate: number | string; monthlyRate: number | string }
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function EmployeePayroll({ canWrite }: { canWrite: boolean }) {
  const now = new Date()

  const [subTab, setSubTab] = useState<'list' | 'settings' | 'requests' | 'tk-upload' | 'tk-data' | 'benefits' | 'holidays' | 'payslips'>('list')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  /* ── Shared filters ── */
  const [branch, setBranch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [search, setSearch] = useState('')

  /* ── Employee List ── */
  const [employees, setEmployees] = useState<Employee[]>([])
  const [syncing, setSyncing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [formData, setFormData] = useState<Partial<Employee>>({
    firstName: '', lastName: '', email: '', department: 'ADMINISTRATION', branch: 'SBEA',
    jobTitle: '', rateType: 'DAILY', dailyRate: 0, monthlyRate: 0, employeeBioId: null,
    sssNumber: '', philhealthNumber: '', pagibigNumber: '', tinNumber: '',
    scheduleIn: '08:00', scheduleOut: '17:00', restDay: 'SUNDAY',
  })

  /* ── Settings ── */
  const [empSettings, setEmpSettings] = useState<EmpSettings | null>(null)

  /* ── Requests ── */
  const [requests, setRequests] = useState<EmployeeRequest[]>([])
  const [reqStatusFilter, setReqStatusFilter] = useState('PENDING')

  /* ── Timekeeping ── */
  const [tkRecords, setTkRecords] = useState<TimekeepingRecord[]>([])
  const [tkStartDate, setTkStartDate] = useState(() => {
    const d = new Date(); d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [tkEndDate, setTkEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ totalRawRecords: number; recordsProcessed: number; unmatchedBioIds: number[] } | null>(null)

  /* ── Holidays ── */
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [holidayYear, setHolidayYear] = useState(now.getFullYear())
  const [showHolidayForm, setShowHolidayForm] = useState(false)
  const [holidayForm, setHolidayForm] = useState({ name: '', date: '', holidayType: 'REGULAR' as string, branch: '', isRecurring: false })
  const [editHolidayId, setEditHolidayId] = useState('')

  /* ── Benefits ── */
  const [showBenefitForm, setShowBenefitForm] = useState(false)
  const [benefitEmpId, setBenefitEmpId] = useState('')
  const [benefitType, setBenefitType] = useState('SSS')
  const [benefitEmpShare, setBenefitEmpShare] = useState(0)
  const [benefitErShare, setBenefitErShare] = useState(0)

  /* ── Payslips ── */
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [cutoffMonth, setCutoffMonth] = useState(now.getMonth() + 1)
  const [cutoffYear, setCutoffYear] = useState(now.getFullYear())
  const [cutoffHalf, setCutoffHalf] = useState(now.getDate() <= 15 ? 1 : 2)
  const [generating, setGenerating] = useState(false)
  const [expandedPayslip, setExpandedPayslip] = useState('')

  /* ── Holiday Presets ── */
  const [showHolidayPresets, setShowHolidayPresets] = useState(false)
  const [holidayPresetChecks, setHolidayPresetChecks] = useState<Record<string, boolean>>({})
  const [savingPresets, setSavingPresets] = useState(false)

  /* ── Employee Request QR/Link ── */
  const [showRequestLink, setShowRequestLink] = useState(false)

  /* ── Bulk Edit Employees ── */
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set())
  const [showBulkEditModal, setShowBulkEditModal] = useState(false)
  const [bulkEditData, setBulkEditData] = useState<Partial<Employee>>({})

  /* ── Bulk Benefits ── */
  const [selectedBenefitEmpIds, setSelectedBenefitEmpIds] = useState<Set<string>>(new Set())
  const [showBulkBenefitModal, setShowBulkBenefitModal] = useState(false)
  const [bulkBenefitType, setBulkBenefitType] = useState('SSS')
  const [bulkBenefitEmpShare, setBulkBenefitEmpShare] = useState(0)
  const [bulkBenefitErShare, setBulkBenefitErShare] = useState(0)

  const cutoffPeriod = `${cutoffYear}-${String(cutoffMonth).padStart(2, '0')}-${cutoffHalf}`

  /* ═══════════════════════════════════════════════════════════════
     FETCHERS
     ═══════════════════════════════════════════════════════════════ */
  const fetchEmployees = useCallback(async (doSync = false) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (branch) params.set('branch', branch)
      if (deptFilter) params.set('department', deptFilter)
      if (doSync) params.set('sync', 'true')
      const r = await fetch(`/api/payroll/employees?${params}`)
      const d = await r.json()
      setEmployees(Array.isArray(d) ? d : [])
    } catch { setError('Failed to load employees') }
    setLoading(false)
  }, [branch, deptFilter])

  const fetchSettings = useCallback(async () => {
    try {
      const r = await fetch('/api/payroll/employee-settings')
      const d = await r.json()
      setEmpSettings(d)
    } catch { /* ignore */ }
  }, [])

  const fetchRequests = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (reqStatusFilter) params.set('status', reqStatusFilter)
      if (branch) params.set('branch', branch)
      const r = await fetch(`/api/payroll/employee-requests?${params}`)
      const d = await r.json()
      setRequests(Array.isArray(d) ? d : [])
    } catch { /* ignore */ }
  }, [reqStatusFilter, branch])

  const fetchTimekeeping = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (branch) params.set('branch', branch)
      if (tkStartDate) params.set('startDate', tkStartDate)
      if (tkEndDate) params.set('endDate', tkEndDate)
      const r = await fetch(`/api/payroll/timekeeping/records?${params}`)
      const d = await r.json()
      setTkRecords(Array.isArray(d) ? d : [])
    } catch { /* ignore */ }
  }, [branch, tkStartDate, tkEndDate])

  const fetchHolidays = useCallback(async () => {
    try {
      const r = await fetch(`/api/payroll/holidays?year=${holidayYear}`)
      const d = await r.json()
      setHolidays(Array.isArray(d) ? d : [])
    } catch { /* ignore */ }
  }, [holidayYear])

  const fetchPayslips = useCallback(async () => {
    try {
      const params = new URLSearchParams({ cutoffPeriod })
      if (branch) params.set('branch', branch)
      const r = await fetch(`/api/payroll/employee-payslips?${params}`)
      const d = await r.json()
      setPayslips(Array.isArray(d) ? d : [])
    } catch { /* ignore */ }
  }, [cutoffPeriod, branch])

  useEffect(() => {
    if (subTab === 'list') fetchEmployees()
    else if (subTab === 'settings') fetchSettings()
    else if (subTab === 'requests') fetchRequests()
    else if (subTab === 'tk-data') fetchTimekeeping()
    else if (subTab === 'holidays') fetchHolidays()
    else if (subTab === 'benefits') fetchEmployees()
    else if (subTab === 'payslips') fetchPayslips()
  }, [subTab, fetchEmployees, fetchSettings, fetchRequests, fetchTimekeeping, fetchHolidays, fetchPayslips])

  /* ═══════════════════════════════════════════════════════════════
     ACTIONS
     ═══════════════════════════════════════════════════════════════ */
  const syncEmployees = async () => {
    setSyncing(true)
    await fetchEmployees(true)
    setSyncing(false)
  }

  const saveEmployee = async () => {
    try {
      const method = editingId ? 'PUT' : 'POST'
      const payload = editingId ? { id: editingId, ...formData } : formData
      const r = await fetch('/api/payroll/employees', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!r.ok) throw new Error('Save failed')
      setShowForm(false)
      setEditingId('')
      fetchEmployees()
    } catch { setError('Failed to save employee') }
  }

  const openEditForm = (emp: Employee) => {
    setEditingId(emp.id)
    setFormData({
      firstName: emp.firstName, lastName: emp.lastName, email: emp.email || '',
      department: emp.department, branch: emp.branch, jobTitle: emp.jobTitle || '',
      rateType: emp.rateType, dailyRate: toNum(emp.dailyRate), monthlyRate: toNum(emp.monthlyRate),
      employeeBioId: emp.employeeBioId, sssNumber: emp.sssNumber || '',
      philhealthNumber: emp.philhealthNumber || '', pagibigNumber: emp.pagibigNumber || '',
      tinNumber: emp.tinNumber || '', scheduleIn: emp.scheduleIn, scheduleOut: emp.scheduleOut,
      restDay: emp.restDay,
    })
    setShowForm(true)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadResult(null)
    try {
      const text = await file.text()
      const r = await fetch('/api/payroll/timekeeping/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, content: text, branch }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Upload failed')
      setUploadResult(d)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const saveHoliday = async () => {
    try {
      const method = editHolidayId ? 'PUT' : 'POST'
      const payload = editHolidayId ? { id: editHolidayId, ...holidayForm } : holidayForm
      const r = await fetch('/api/payroll/holidays', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!r.ok) throw new Error('Save failed')
      setShowHolidayForm(false)
      setEditHolidayId('')
      setHolidayForm({ name: '', date: '', holidayType: 'REGULAR', branch: '', isRecurring: false })
      fetchHolidays()
    } catch { setError('Failed to save holiday') }
  }

  const deleteHoliday = async (id: string) => {
    if (!confirm('Delete this holiday?')) return
    await fetch(`/api/payroll/holidays?id=${id}`, { method: 'DELETE' })
    fetchHolidays()
  }

  const handleRequestAction = async (id: string, status: string) => {
    await fetch('/api/payroll/employee-requests', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    fetchRequests()
  }

  const saveBenefit = async () => {
    if (!benefitEmpId) return
    await fetch('/api/payroll/employee-benefits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: benefitEmpId, benefitType, employeeShare: benefitEmpShare, employerShare: benefitErShare }),
    })
    setShowBenefitForm(false)
    fetchEmployees()
  }

  const generatePayslips = async () => {
    setGenerating(true)
    try {
      const r = await fetch('/api/payroll/employee-payslips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutoffPeriod, branch: branch || 'SANDBOX_EAST' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Generation failed')
      fetchPayslips()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate payslips')
    }
    setGenerating(false)
  }

  const finalizePayslips = async () => {
    const draftIds = payslips.filter(p => p.status === 'DRAFT').map(p => p.id)
    if (draftIds.length === 0) return
    await fetch('/api/payroll/employee-payslips', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: draftIds, status: 'FINAL' }),
    })
    fetchPayslips()
  }

  const saveSettings = async () => {
    if (!empSettings) return
    try {
      await fetch('/api/payroll/employee-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(empSettings),
      })
      setError('')
    } catch { setError('Failed to save settings') }
  }

  /* ── Holiday Presets ── */
  const openHolidayPresets = () => {
    const existingNames = new Set(holidays.map(h => h.name))
    const missing = PH_HOLIDAYS_2026.filter(h => !existingNames.has(h.name))
    const checks: Record<string, boolean> = {}
    missing.forEach(h => { checks[h.name] = true })
    setHolidayPresetChecks(checks)
    setShowHolidayPresets(true)
  }

  const saveSelectedPresets = async () => {
    setSavingPresets(true)
    const existingNames = new Set(holidays.map(h => h.name))
    const toSave = PH_HOLIDAYS_2026.filter(h => !existingNames.has(h.name) && holidayPresetChecks[h.name])
    try {
      for (const h of toSave) {
        await fetch('/api/payroll/holidays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: h.name, date: h.date, holidayType: h.holidayType, branch: '', isRecurring: false }),
        })
      }
      setShowHolidayPresets(false)
      fetchHolidays()
    } catch { setError('Failed to save preset holidays') }
    setSavingPresets(false)
  }

  /* ── Bulk Edit Employees ── */
  const toggleEmployeeSelection = (id: string) => {
    setSelectedEmployeeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAllEmployees = () => {
    if (selectedEmployeeIds.size === filteredEmployees.length) {
      setSelectedEmployeeIds(new Set())
    } else {
      setSelectedEmployeeIds(new Set(filteredEmployees.map(e => e.id)))
    }
  }

  const saveBulkEdit = async () => {
    const ids = Array.from(selectedEmployeeIds)
    if (ids.length === 0) return
    const fields: Record<string, unknown> = {}
    if (bulkEditData.rateType) fields.rateType = bulkEditData.rateType
    if (bulkEditData.dailyRate && toNum(bulkEditData.dailyRate) > 0) fields.dailyRate = toNum(bulkEditData.dailyRate)
    if (bulkEditData.monthlyRate && toNum(bulkEditData.monthlyRate) > 0) fields.monthlyRate = toNum(bulkEditData.monthlyRate)
    if (bulkEditData.scheduleIn) fields.scheduleIn = bulkEditData.scheduleIn
    if (bulkEditData.scheduleOut) fields.scheduleOut = bulkEditData.scheduleOut
    if (bulkEditData.restDay) fields.restDay = bulkEditData.restDay
    if (bulkEditData.department) fields.department = bulkEditData.department
    if (bulkEditData.branch) fields.branch = bulkEditData.branch
    if (Object.keys(fields).length === 0) { setError('No fields to update'); return }
    try {
      const bulk = ids.map(id => ({ id, ...fields }))
      const r = await fetch('/api/payroll/employees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk }),
      })
      if (!r.ok) throw new Error('Bulk edit failed')
      setShowBulkEditModal(false)
      setSelectedEmployeeIds(new Set())
      setBulkEditData({})
      fetchEmployees()
    } catch { setError('Failed to bulk edit employees') }
  }

  /* ── Bulk Benefits ── */
  const toggleBenefitEmpSelection = (id: string) => {
    setSelectedBenefitEmpIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAllBenefitEmps = () => {
    if (selectedBenefitEmpIds.size === filteredEmployees.length) {
      setSelectedBenefitEmpIds(new Set())
    } else {
      setSelectedBenefitEmpIds(new Set(filteredEmployees.map(e => e.id)))
    }
  }

  const saveBulkBenefit = async () => {
    const ids = Array.from(selectedBenefitEmpIds)
    if (ids.length === 0) return
    try {
      const bulk = ids.map(id => ({
        employeeId: id,
        benefitType: bulkBenefitType,
        employeeShare: bulkBenefitEmpShare,
        employerShare: bulkBenefitErShare,
      }))
      await fetch('/api/payroll/employee-benefits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk }),
      })
      setShowBulkBenefitModal(false)
      setSelectedBenefitEmpIds(new Set())
      fetchEmployees()
    } catch { setError('Failed to bulk set benefits') }
  }

  /* ═══════════════════════════════════════════════════════════════
     FILTERED DATA
     ═══════════════════════════════════════════════════════════════ */
  const filteredEmployees = employees.filter(e => {
    const q = search.toLowerCase()
    const name = `${e.firstName} ${e.lastName}`.toLowerCase()
    return (!q || name.includes(q) || e.department.toLowerCase().includes(q)) &&
           (!deptFilter || e.department === deptFilter)
  })

  const fmtTime = (iso: string | null | undefined) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  const SUB_TABS: { key: typeof subTab; label: string; icon: typeof Users }[] = [
    { key: 'list', label: 'Employee List', icon: Users },
    { key: 'settings', label: 'Employee Settings', icon: Settings },
    { key: 'requests', label: 'Employee Requests', icon: ClipboardList },
    { key: 'tk-upload', label: 'Timekeeping Upload', icon: Upload },
    { key: 'tk-data', label: 'Timekeeping Data', icon: Clock },
    { key: 'benefits', label: 'Benefits Setting', icon: Shield },
    { key: 'holidays', label: 'Holiday Setting', icon: Calendar },
    { key: 'payslips', label: 'Payslip Generation', icon: FileText },
  ]

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1.5">
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={subTab === t.key
              ? { background: 'var(--pale-teal)', color: 'var(--deep-teal)' }
              : { color: 'var(--mid-gray)' }}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-xs" style={{ background: '#fef2f2', color: '#dc2626' }}>
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
         TAB: EMPLOYEE LIST
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === 'list' && (
        <div className="space-y-3">
          {/* Controls */}
          <div className="flex items-center flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
            </div>
            <select value={branch} onChange={e => setBranch(e.target.value)}
              className="px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
              {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
              {EMP_DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            {canWrite && (
              <>
                <button onClick={syncEmployees} disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                  {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync from CRM
                </button>
                <button onClick={() => { setEditingId(''); setFormData({ firstName: '', lastName: '', email: '', department: 'ADMINISTRATION', branch: 'SBEA', jobTitle: '', rateType: 'DAILY', dailyRate: 0, monthlyRate: 0, scheduleIn: '08:00', scheduleOut: '17:00', restDay: 'SUNDAY' }); setShowForm(true) }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white"
                  style={{ background: 'var(--teal)' }}>
                  <Plus size={13} /> Add Employee
                </button>
                {selectedEmployeeIds.size > 0 && (
                  <button onClick={() => { setBulkEditData({}); setShowBulkEditModal(true) }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white"
                    style={{ background: '#7c3aed' }}>
                    <Pencil size={13} /> Bulk Edit ({selectedEmployeeIds.size})
                  </button>
                )}
              </>
            )}
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--teal)' }} /></div>
          ) : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    {canWrite && (
                      <th className="text-center px-2 py-2.5">
                        <input type="checkbox" checked={filteredEmployees.length > 0 && selectedEmployeeIds.size === filteredEmployees.length}
                          onChange={toggleAllEmployees} />
                      </th>
                    )}
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Name</th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Department</th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Branch</th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Job Title</th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Rate Type</th>
                    <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Rate</th>
                    <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Bio ID</th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Schedule</th>
                    {canWrite && <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.length === 0 ? (
                    <tr><td colSpan={canWrite ? 11 : 9} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No employees found. Sync from CRM or add manually.</td></tr>
                  ) : filteredEmployees.map(emp => (
                    <tr key={emp.id} className="border-t hover:bg-gray-50" style={{ borderColor: 'var(--light-gray)' }}>
                      {canWrite && (
                        <td className="text-center px-2 py-2.5">
                          <input type="checkbox" checked={selectedEmployeeIds.has(emp.id)}
                            onChange={() => toggleEmployeeSelection(emp.id)} />
                        </td>
                      )}
                      <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>{emp.firstName} {emp.lastName}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{emp.department}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{emp.branch === 'SBEA' ? 'Sandbox East' : emp.branch === 'SBGH' ? 'Sandbox GH' : emp.branch}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{formatJobTitle(emp.jobTitle)}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{emp.rateType === 'DAILY' ? 'Daily' : 'Monthly'}</td>
                      <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--charcoal)' }}>
                        {formatCurrency(toNum(emp.rateType === 'DAILY' ? emp.dailyRate : emp.monthlyRate))}
                      </td>
                      <td className="px-3 py-2.5 text-center" style={{ color: 'var(--mid-gray)' }}>{emp.employeeBioId || '—'}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{emp.scheduleIn} – {emp.scheduleOut}</td>
                      {canWrite && (
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => openEditForm(emp)} className="p-1 rounded hover:bg-gray-100">
                            <Pencil size={13} style={{ color: 'var(--mid-gray)' }} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Employee Form Modal */}
          {showForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{editingId ? 'Edit Employee' : 'Add Employee'}</h3>
                  <button onClick={() => { setShowForm(false); setEditingId('') }}><X size={16} /></button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>First Name *</label>
                    <input value={formData.firstName || ''} onChange={e => setFormData(p => ({ ...p, firstName: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Last Name *</label>
                    <input value={formData.lastName || ''} onChange={e => setFormData(p => ({ ...p, lastName: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Email</label>
                    <input value={formData.email || ''} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Job Title</label>
                    <input value={formData.jobTitle || ''} onChange={e => setFormData(p => ({ ...p, jobTitle: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Department *</label>
                    <select value={formData.department || ''} onChange={e => setFormData(p => ({ ...p, department: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
                      {EMP_DEPARTMENTS.filter(d => d.value).map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Branch *</label>
                    <select value={formData.branch || ''} onChange={e => setFormData(p => ({ ...p, branch: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
                      {BRANCHES.filter(b => b.value).map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Rate Type</label>
                    <select value={formData.rateType || 'DAILY'} onChange={e => setFormData(p => ({ ...p, rateType: e.target.value as 'DAILY' | 'MONTHLY' }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="DAILY">Daily Rate</option>
                      <option value="MONTHLY">Fixed Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>{formData.rateType === 'DAILY' ? 'Daily Rate' : 'Monthly Rate'}</label>
                    <input type="number" value={formData.rateType === 'DAILY' ? (formData.dailyRate || '') : (formData.monthlyRate || '')}
                      onChange={e => setFormData(p => formData.rateType === 'DAILY' ? { ...p, dailyRate: parseFloat(e.target.value) || 0 } : { ...p, monthlyRate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Biometric ID</label>
                    <input type="number" value={formData.employeeBioId || ''} onChange={e => setFormData(p => ({ ...p, employeeBioId: parseInt(e.target.value) || null }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Rest Day(s)</label>
                    <div className="flex flex-wrap gap-2 px-1 py-1.5">
                      {DAYS_OF_WEEK.map(d => {
                        const selectedDays = (formData.restDay || 'SUNDAY').split(',').filter(Boolean)
                        const isChecked = selectedDays.includes(d)
                        return (
                          <label key={d} className="flex items-center gap-1 text-xs cursor-pointer">
                            <input type="checkbox" checked={isChecked}
                              onChange={() => {
                                const days = isChecked ? selectedDays.filter(x => x !== d) : [...selectedDays, d]
                                setFormData(p => ({ ...p, restDay: days.join(',') || 'SUNDAY' }))
                              }}
                              className="rounded" />
                            {d.charAt(0) + d.slice(1).toLowerCase()}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Schedule In</label>
                    <input type="time" value={formData.scheduleIn || '08:00'} onChange={e => setFormData(p => ({ ...p, scheduleIn: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Schedule Out</label>
                    <input type="time" value={formData.scheduleOut || '17:00'} onChange={e => setFormData(p => ({ ...p, scheduleOut: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>

                  <div className="col-span-2 border-t pt-3 mt-1" style={{ borderColor: 'var(--light-gray)' }}>
                    <p className="font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Government IDs</p>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>SSS Number</label>
                    <input value={formData.sssNumber || ''} onChange={e => setFormData(p => ({ ...p, sssNumber: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>PhilHealth Number</label>
                    <input value={formData.philhealthNumber || ''} onChange={e => setFormData(p => ({ ...p, philhealthNumber: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Pag-IBIG Number</label>
                    <input value={formData.pagibigNumber || ''} onChange={e => setFormData(p => ({ ...p, pagibigNumber: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>TIN Number</label>
                    <input value={formData.tinNumber || ''} onChange={e => setFormData(p => ({ ...p, tinNumber: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => { setShowForm(false); setEditingId('') }}
                    className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                  <button onClick={saveEmployee}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
                    <Save size={13} /> {editingId ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bulk Edit Modal */}
          {showBulkEditModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Bulk Edit ({selectedEmployeeIds.size} employees)</h3>
                  <button onClick={() => setShowBulkEditModal(false)}><X size={16} /></button>
                </div>
                <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>Only non-empty fields will be applied to all selected employees.</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Rate Type</label>
                    <select value={bulkEditData.rateType || ''} onChange={e => setBulkEditData(p => ({ ...p, rateType: e.target.value as 'DAILY' | 'MONTHLY' || undefined }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">— No change —</option>
                      <option value="DAILY">Daily Rate</option>
                      <option value="MONTHLY">Fixed Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Daily Rate</label>
                    <input type="number" value={bulkEditData.dailyRate || ''} onChange={e => setBulkEditData(p => ({ ...p, dailyRate: parseFloat(e.target.value) || 0 }))}
                      placeholder="No change" className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Monthly Rate</label>
                    <input type="number" value={bulkEditData.monthlyRate || ''} onChange={e => setBulkEditData(p => ({ ...p, monthlyRate: parseFloat(e.target.value) || 0 }))}
                      placeholder="No change" className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Schedule In</label>
                    <input type="time" value={bulkEditData.scheduleIn || ''} onChange={e => setBulkEditData(p => ({ ...p, scheduleIn: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Schedule Out</label>
                    <input type="time" value={bulkEditData.scheduleOut || ''} onChange={e => setBulkEditData(p => ({ ...p, scheduleOut: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Rest Day(s)</label>
                    <div className="flex flex-wrap gap-2 px-1 py-1.5">
                      {DAYS_OF_WEEK.map(d => {
                        const selectedDays = (bulkEditData.restDay || '').split(',').filter(Boolean)
                        const isChecked = selectedDays.includes(d)
                        return (
                          <label key={d} className="flex items-center gap-1 text-xs cursor-pointer">
                            <input type="checkbox" checked={isChecked}
                              onChange={() => {
                                const days = isChecked ? selectedDays.filter(x => x !== d) : [...selectedDays, d]
                                setBulkEditData(p => ({ ...p, restDay: days.join(',') }))
                              }}
                              className="rounded" />
                            {d.charAt(0) + d.slice(1).toLowerCase()}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Department</label>
                    <select value={bulkEditData.department || ''} onChange={e => setBulkEditData(p => ({ ...p, department: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">— No change —</option>
                      {EMP_DEPARTMENTS.filter(d => d.value).map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Branch</label>
                    <select value={bulkEditData.branch || ''} onChange={e => setBulkEditData(p => ({ ...p, branch: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">— No change —</option>
                      {BRANCHES.filter(b => b.value).map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowBulkEditModal(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                  <button onClick={saveBulkEdit}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white" style={{ background: '#7c3aed' }}>
                    <Save size={13} /> Apply to {selectedEmployeeIds.size} Employees
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
         TAB: EMPLOYEE SETTINGS
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === 'settings' && empSettings && (
        <div className="space-y-5 max-w-2xl">
          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--light-gray)' }}>
            <h4 className="text-xs font-bold mb-3" style={{ color: 'var(--charcoal)' }}>Cutoff Configuration</h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>1st Cutoff Start Day</label>
                <input type="number" min={1} max={31} value={empSettings.cutoff1Start}
                  onChange={e => setEmpSettings(s => s ? { ...s, cutoff1Start: parseInt(e.target.value) || 1 } : s)}
                  className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>1st Cutoff End Day</label>
                <input type="number" min={1} max={31} value={empSettings.cutoff1End}
                  onChange={e => setEmpSettings(s => s ? { ...s, cutoff1End: parseInt(e.target.value) || 15 } : s)}
                  className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>2nd Cutoff Start Day</label>
                <input type="number" min={1} max={31} value={empSettings.cutoff2Start}
                  onChange={e => setEmpSettings(s => s ? { ...s, cutoff2Start: parseInt(e.target.value) || 16 } : s)}
                  className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>2nd Cutoff End</label>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={empSettings.cutoff2EndLastDay}
                      onChange={e => setEmpSettings(s => s ? { ...s, cutoff2EndLastDay: e.target.checked } : s)} />
                    Last day of month
                  </label>
                  {!empSettings.cutoff2EndLastDay && (
                    <input type="number" min={1} max={31} value={empSettings.cutoff2End}
                      onChange={e => setEmpSettings(s => s ? { ...s, cutoff2End: parseInt(e.target.value) || 30 } : s)}
                      className="w-20 px-2 py-1 rounded border" style={{ borderColor: 'var(--light-gray)' }} />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--light-gray)' }}>
            <h4 className="text-xs font-bold mb-3" style={{ color: 'var(--charcoal)' }}>Pay Rates (DOLE Philippines)</h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                { key: 'standardHoursPerDay', label: 'Standard Hours/Day' },
                { key: 'overtimeMultiplier', label: 'OT Multiplier (e.g. 1.25)' },
                { key: 'nightDiffMultiplier', label: 'Night Diff Add-on (e.g. 0.10)' },
                { key: 'regularHolidayRate', label: 'Regular Holiday Rate (e.g. 2.0)' },
                { key: 'specialHolidayRate', label: 'Special Holiday Rate (e.g. 1.3)' },
                { key: 'restDayRate', label: 'Rest Day Rate (e.g. 1.3)' },
                { key: 'regularHolidayOTRate', label: 'Reg Holiday OT Rate' },
                { key: 'specialHolidayOTRate', label: 'Spec Holiday OT Rate' },
                { key: 'restDayRegHolidayRate', label: 'Rest Day + Reg Holiday' },
                { key: 'restDaySpecHolidayRate', label: 'Rest Day + Spec Holiday' },
              ].map(f => (
                <div key={f.key}>
                  <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>{f.label}</label>
                  <input type="number" step="0.01" value={toNum((empSettings as unknown as Record<string, unknown>)[f.key])}
                    onChange={e => setEmpSettings(s => s ? { ...s, [f.key]: parseFloat(e.target.value) || 0 } : s)}
                    className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--light-gray)' }}>
            <h4 className="text-xs font-bold mb-3" style={{ color: 'var(--charcoal)' }}>Deduction Toggles</h4>
            <div className="flex flex-wrap gap-4 text-xs">
              {[
                { key: 'sssEnabled', label: 'SSS' },
                { key: 'philhealthEnabled', label: 'PhilHealth' },
                { key: 'pagibigEnabled', label: 'Pag-IBIG' },
                { key: 'taxEnabled', label: 'Withholding Tax' },
              ].map(f => (
                <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={(empSettings as unknown as Record<string, unknown>)[f.key] as boolean}
                    onChange={e => setEmpSettings(s => s ? { ...s, [f.key]: e.target.checked } : s)} />
                  <span style={{ color: 'var(--charcoal)' }}>{f.label}</span>
                </label>
              ))}
            </div>
          </div>

          {canWrite && (
            <div className="flex justify-end">
              <button onClick={saveSettings}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
                <Save size={13} /> Save Settings
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
         TAB: EMPLOYEE REQUESTS
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === 'requests' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {(['PENDING', 'APPROVED', 'DENIED'] as const).map(s => (
              <button key={s} onClick={() => setReqStatusFilter(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                style={reqStatusFilter === s
                  ? { background: s === 'APPROVED' ? '#059669' : s === 'DENIED' ? '#dc2626' : 'var(--teal)', color: 'white', borderColor: 'transparent' }
                  : { borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                {s}
              </button>
            ))}
            <button onClick={fetchRequests} className="p-1.5 rounded-lg hover:bg-gray-100">
              <RefreshCw size={14} style={{ color: 'var(--mid-gray)' }} />
            </button>
            <button onClick={() => setShowRequestLink(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ml-auto"
              style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
              <QrCode size={13} /> Request Link / QR
            </button>
          </div>

          {/* Request Link / QR Modal */}
          {showRequestLink && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Employee Request Link</h3>
                  <button onClick={() => setShowRequestLink(false)}><X size={16} /></button>
                </div>
                <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>
                  Share this link or QR code with employees so they can submit requests (leave, overtime, etc.).
                </p>
                <div className="rounded-lg border p-3 mb-3 text-xs font-mono break-all" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)', color: 'var(--charcoal)' }}>
                  {typeof window !== 'undefined' ? `${window.location.origin}/employee-request` : '/employee-request'}
                </div>
                <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/employee-request`); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border mb-4 w-full justify-center"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                  Copy Link
                </button>
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(typeof window !== 'undefined' ? `${window.location.origin}/employee-request` : '')}`}
                    alt="QR Code for employee request link"
                    width={200} height={200}
                  />
                </div>
                <div className="flex justify-end mt-4">
                  <button onClick={() => setShowRequestLink(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Close</button>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--off-white)' }}>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Employee</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Type</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Dates</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Reason</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Filed</th>
                  {reqStatusFilter === 'PENDING' && canWrite && <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No {reqStatusFilter.toLowerCase()} requests</td></tr>
                ) : requests.map(r => (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>{r.employee.firstName} {r.employee.lastName}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>
                      {REQUEST_TYPES.find(t => t.value === r.requestType)?.label || r.requestType}
                      {r.leaveType && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--off-white)' }}>{LEAVE_TYPES.find(t => t.value === r.leaveType)?.label || r.leaveType}</span>}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{fmtDate(r.startDate)}{r.endDate ? ` – ${fmtDate(r.endDate)}` : ''}</td>
                    <td className="px-3 py-2.5 max-w-[200px] truncate" style={{ color: 'var(--mid-gray)' }}>{r.reason || '—'}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{fmtDate(r.createdAt)}</td>
                    {reqStatusFilter === 'PENDING' && canWrite && (
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleRequestAction(r.id, 'APPROVED')} className="p-1 rounded hover:bg-green-50" title="Approve">
                            <CheckCircle2 size={15} className="text-green-600" />
                          </button>
                          <button onClick={() => handleRequestAction(r.id, 'DENIED')} className="p-1 rounded hover:bg-red-50" title="Deny">
                            <XCircle size={15} className="text-red-500" />
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
      )}

      {/* ═══════════════════════════════════════════════════════════════
         TAB: TIMEKEEPING UPLOAD
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === 'tk-upload' && (
        <div className="space-y-4 max-w-xl">
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--light-gray)' }}>
            <h4 className="text-sm font-bold mb-1" style={{ color: 'var(--charcoal)' }}>Upload Biometric File (.dat)</h4>
            <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
              Upload the .dat file from your biometric device. The system will parse clock-in/out records
              and match them to employees by their Biometric ID.
            </p>

            <div className="flex items-center gap-3 mb-3">
              <select value={branch} onChange={e => setBranch(e.target.value)}
                className="px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>

            <input ref={fileInputRef} type="file" accept=".dat,.txt,.csv" onChange={handleFileUpload}
              className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium text-white w-full justify-center"
              style={{ background: uploading ? 'var(--mid-gray)' : 'var(--teal)' }}>
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {uploading ? 'Processing...' : 'Choose .dat File & Upload'}
            </button>
          </div>

          {uploadResult && (
            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
              <h4 className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: '#059669' }}>
                <CheckCircle2 size={14} /> Upload Complete
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--charcoal)' }}>
                <span>Raw records in file:</span><span className="font-mono font-medium">{uploadResult.totalRawRecords}</span>
                <span>Records processed:</span><span className="font-mono font-medium">{uploadResult.recordsProcessed}</span>
                {uploadResult.unmatchedBioIds.length > 0 && (
                  <>
                    <span className="text-orange-600">Unmatched Bio IDs:</span>
                    <span className="font-mono text-orange-600">{uploadResult.unmatchedBioIds.join(', ')}</span>
                  </>
                )}
              </div>
              {uploadResult.unmatchedBioIds.length > 0 && (
                <p className="text-[10px] mt-2" style={{ color: 'var(--mid-gray)' }}>
                  Unmatched IDs = employees whose Biometric ID has not been set. Go to Employee List to assign Bio IDs.
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--light-gray)' }}>
            <h4 className="text-xs font-bold mb-2" style={{ color: 'var(--charcoal)' }}>File Format Reference</h4>
            <p className="text-[10px] mb-2" style={{ color: 'var(--mid-gray)' }}>Tab-delimited .dat file from biometric device:</p>
            <div className="font-mono text-[10px] p-2 rounded" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>
              4&#9;2/26/2026 11:03&#9;1&#9;0&#9;15&#9;0<br />
              4&#9;2/26/2026 22:01&#9;1&#9;1&#9;15&#9;0
            </div>
            <p className="text-[10px] mt-2" style={{ color: 'var(--mid-gray)' }}>
              Col 1: Bio ID &nbsp;|&nbsp; Col 2: Date+Time &nbsp;|&nbsp; Col 3: Ignore &nbsp;|&nbsp; Col 4: 0=IN, 1=OUT &nbsp;|&nbsp; Rest: Ignore
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
         TAB: TIMEKEEPING DATA
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === 'tk-data' && (
        <div className="space-y-3">
          <div className="flex items-center flex-wrap gap-2">
            <select value={branch} onChange={e => setBranch(e.target.value)}
              className="px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
              {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
            <input type="date" value={tkStartDate} onChange={e => setTkStartDate(e.target.value)}
              className="px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
            <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
            <input type="date" value={tkEndDate} onChange={e => setTkEndDate(e.target.value)}
              className="px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
            <button onClick={fetchTimekeeping}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
              <Search size={13} /> Load
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--off-white)' }}>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Employee</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Date</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Time In</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Time Out</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Hours</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Late (min)</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>UT (min)</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>OT (min)</th>
                  <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Flags</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {tkRecords.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No timekeeping records for selected period</td></tr>
                ) : tkRecords.map(r => (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{r.employee.firstName} {r.employee.lastName}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{fmtDate(r.date)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: r.timeIn ? 'var(--charcoal)' : 'var(--mid-gray)' }}>{fmtTime(r.timeIn)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: r.timeOut ? 'var(--charcoal)' : 'var(--mid-gray)' }}>{fmtTime(r.timeOut)}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{toNum(r.hoursWorked).toFixed(1)}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: r.lateMinutes > 0 ? '#dc2626' : 'var(--mid-gray)' }}>{r.lateMinutes || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: r.undertimeMinutes > 0 ? '#dc2626' : 'var(--mid-gray)' }}>{r.undertimeMinutes || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: r.overtimeMinutes > 0 ? '#059669' : 'var(--mid-gray)' }}>{r.overtimeMinutes || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {r.isRestDay && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">Rest</span>}
                        {r.isHoliday && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">{r.holidayType === 'REGULAR' ? 'Reg Hol' : 'Spec Hol'}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[10px]" style={{ color: 'var(--mid-gray)' }}>{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
         TAB: BENEFITS SETTING
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === 'benefits' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Employee Benefits (SSS, PhilHealth, Pag-IBIG, Tax)</p>
            {canWrite && (
              <div className="flex items-center gap-2">
                {selectedBenefitEmpIds.size > 0 && (
                  <button onClick={() => { setBulkBenefitType('SSS'); setBulkBenefitEmpShare(0); setBulkBenefitErShare(0); setShowBulkBenefitModal(true) }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white"
                    style={{ background: '#7c3aed' }}>
                    <Shield size={13} /> Set Benefit for Selected ({selectedBenefitEmpIds.size})
                  </button>
                )}
                <button onClick={() => { setShowBenefitForm(true); setBenefitEmpId(''); setBenefitType('SSS'); setBenefitEmpShare(0); setBenefitErShare(0) }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
                  <Plus size={13} /> Set Benefit
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--off-white)' }}>
                  {canWrite && (
                    <th className="text-center px-2 py-2.5">
                      <input type="checkbox" checked={filteredEmployees.length > 0 && selectedBenefitEmpIds.size === filteredEmployees.length}
                        onChange={toggleAllBenefitEmps} />
                    </th>
                  )}
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Employee</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>SSS (EE / ER)</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>PhilHealth (EE / ER)</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Pag-IBIG (EE / ER)</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Tax (EE)</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr><td colSpan={canWrite ? 6 : 5} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No employees</td></tr>
                ) : filteredEmployees.map(emp => {
                  const sss = emp.benefits.find(b => b.benefitType === 'SSS')
                  const phil = emp.benefits.find(b => b.benefitType === 'PHILHEALTH')
                  const pag = emp.benefits.find(b => b.benefitType === 'PAGIBIG')
                  const tax = emp.benefits.find(b => b.benefitType === 'TAX')
                  return (
                    <tr key={emp.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                      {canWrite && (
                        <td className="text-center px-2 py-2.5">
                          <input type="checkbox" checked={selectedBenefitEmpIds.has(emp.id)}
                            onChange={() => toggleBenefitEmpSelection(emp.id)} />
                        </td>
                      )}
                      <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>{emp.firstName} {emp.lastName}</td>
                      <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--mid-gray)' }}>
                        {sss ? `${formatCurrency(toNum(sss.employeeShare))} / ${formatCurrency(toNum(sss.employerShare))}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--mid-gray)' }}>
                        {phil ? `${formatCurrency(toNum(phil.employeeShare))} / ${formatCurrency(toNum(phil.employerShare))}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--mid-gray)' }}>
                        {pag ? `${formatCurrency(toNum(pag.employeeShare))} / ${formatCurrency(toNum(pag.employerShare))}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--mid-gray)' }}>
                        {tax ? formatCurrency(toNum(tax.employeeShare)) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Benefit Form Modal */}
          {showBenefitForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Set Benefit</h3>
                  <button onClick={() => setShowBenefitForm(false)}><X size={16} /></button>
                </div>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Employee</label>
                    <select value={benefitEmpId} onChange={e => setBenefitEmpId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">Select employee...</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Benefit Type</label>
                    <select value={benefitType} onChange={e => setBenefitType(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
                      {BENEFIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Employee Share (Monthly)</label>
                    <input type="number" value={benefitEmpShare} onChange={e => setBenefitEmpShare(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Employer Share (Monthly)</label>
                    <input type="number" value={benefitErShare} onChange={e => setBenefitErShare(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowBenefitForm(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
                  <button onClick={saveBenefit} disabled={!benefitEmpId}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
                    <Save size={13} /> Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bulk Benefit Modal */}
          {showBulkBenefitModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Set Benefit for {selectedBenefitEmpIds.size} Employees</h3>
                  <button onClick={() => setShowBulkBenefitModal(false)}><X size={16} /></button>
                </div>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Benefit Type</label>
                    <select value={bulkBenefitType} onChange={e => setBulkBenefitType(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
                      {BENEFIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Employee Share (Monthly)</label>
                    <input type="number" value={bulkBenefitEmpShare} onChange={e => setBulkBenefitEmpShare(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Employer Share (Monthly)</label>
                    <input type="number" value={bulkBenefitErShare} onChange={e => setBulkBenefitErShare(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowBulkBenefitModal(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
                  <button onClick={saveBulkBenefit}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white" style={{ background: '#7c3aed' }}>
                    <Save size={13} /> Save for {selectedBenefitEmpIds.size} Employees
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
         TAB: HOLIDAY SETTING
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === 'holidays' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <select value={holidayYear} onChange={e => setHolidayYear(parseInt(e.target.value))}
              className="px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {canWrite && (
              <>
                <button onClick={() => { setEditHolidayId(''); setHolidayForm({ name: '', date: '', holidayType: 'REGULAR', branch: '', isRecurring: false }); setShowHolidayForm(true) }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
                  <Plus size={13} /> Add Holiday
                </button>
                <button onClick={openHolidayPresets}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border"
                  style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                  <Calendar size={13} /> Load 2026 PH Holidays
                </button>
              </>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--off-white)' }}>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Date</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Holiday</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Type</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Branch</th>
                  <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Recurring</th>
                  {canWrite && <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}></th>}
                </tr>
              </thead>
              <tbody>
                {holidays.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No holidays for {holidayYear}</td></tr>
                ) : holidays.map(h => (
                  <tr key={h.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--charcoal)' }}>{fmtDate(h.date)}</td>
                    <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>{h.name}</td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium"
                        style={{ background: h.holidayType === 'REGULAR' ? '#fee2e2' : '#fef3c7', color: h.holidayType === 'REGULAR' ? '#dc2626' : '#d97706' }}>
                        {HOLIDAY_TYPES.find(t => t.value === h.holidayType)?.label || h.holidayType}
                      </span>
                    </td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{h.branch ? BRANCHES.find(b => b.value === h.branch)?.label || h.branch : 'All'}</td>
                    <td className="px-3 py-2.5 text-center">{h.isRecurring ? <Star size={12} className="inline text-yellow-500" /> : '—'}</td>
                    {canWrite && (
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { setEditHolidayId(h.id); setHolidayForm({ name: h.name, date: h.date.split('T')[0], holidayType: h.holidayType, branch: h.branch || '', isRecurring: h.isRecurring }); setShowHolidayForm(true) }}
                            className="p-1 rounded hover:bg-gray-100"><Pencil size={13} style={{ color: 'var(--mid-gray)' }} /></button>
                          <button onClick={() => deleteHoliday(h.id)}
                            className="p-1 rounded hover:bg-red-50"><Trash2 size={13} className="text-red-400" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Holiday Form Modal */}
          {showHolidayForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{editHolidayId ? 'Edit Holiday' : 'Add Holiday'}</h3>
                  <button onClick={() => setShowHolidayForm(false)}><X size={16} /></button>
                </div>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Holiday Name *</label>
                    <input value={holidayForm.name} onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Date *</label>
                    <input type="date" value={holidayForm.date} onChange={e => setHolidayForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Type *</label>
                    <select value={holidayForm.holidayType} onChange={e => setHolidayForm(f => ({ ...f, holidayType: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
                      {HOLIDAY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Branch</label>
                    <select value={holidayForm.branch} onChange={e => setHolidayForm(f => ({ ...f, branch: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">All Branches</option>
                      {BRANCHES.filter(b => b.value).map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={holidayForm.isRecurring} onChange={e => setHolidayForm(f => ({ ...f, isRecurring: e.target.checked }))} />
                    <span>Recurring (yearly)</span>
                  </label>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowHolidayForm(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
                  <button onClick={saveHoliday}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>
                    <Save size={13} /> {editHolidayId ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Holiday Presets Modal */}
          {showHolidayPresets && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Load 2026 Philippine Holidays</h3>
                  <button onClick={() => setShowHolidayPresets(false)}><X size={16} /></button>
                </div>
                {(() => {
                  const existingNames = new Set(holidays.map(h => h.name))
                  const missing = PH_HOLIDAYS_2026.filter(h => !existingNames.has(h.name))
                  if (missing.length === 0) return (
                    <p className="text-xs py-4 text-center" style={{ color: 'var(--mid-gray)' }}>All 2026 PH holidays are already in the database.</p>
                  )
                  return (
                    <>
                      <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>
                        {missing.length} holiday(s) not yet added. Select which ones to import:
                      </p>
                      <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                        <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>
                          <input type="checkbox"
                            checked={missing.every(h => holidayPresetChecks[h.name])}
                            onChange={e => {
                              const checked = e.target.checked
                              setHolidayPresetChecks(prev => {
                                const next = { ...prev }
                                missing.forEach(h => { next[h.name] = checked })
                                return next
                              })
                            }} />
                          Select All
                        </label>
                        {missing.map(h => (
                          <label key={h.name} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-xs">
                            <input type="checkbox" checked={!!holidayPresetChecks[h.name]}
                              onChange={e => setHolidayPresetChecks(prev => ({ ...prev, [h.name]: e.target.checked }))} />
                            <span className="flex-1" style={{ color: 'var(--charcoal)' }}>{h.name}</span>
                            <span className="font-mono text-[10px]" style={{ color: 'var(--mid-gray)' }}>{h.date}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                              style={{ background: h.holidayType === 'REGULAR' ? '#fee2e2' : '#fef3c7', color: h.holidayType === 'REGULAR' ? '#dc2626' : '#d97706' }}>
                              {h.holidayType === 'REGULAR' ? 'Regular' : 'Special'}
                            </span>
                          </label>
                        ))}
                      </div>
                    </>
                  )
                })()}
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowHolidayPresets(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
                  <button onClick={saveSelectedPresets} disabled={savingPresets || !Object.values(holidayPresetChecks).some(v => v)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white"
                    style={{ background: savingPresets ? 'var(--mid-gray)' : 'var(--teal)' }}>
                    {savingPresets ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Save Selected
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
         TAB: PAYSLIP GENERATION
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === 'payslips' && (
        <div className="space-y-3">
          {/* Controls */}
          <div className="flex items-center flex-wrap gap-2">
            <select value={cutoffMonth} onChange={e => setCutoffMonth(parseInt(e.target.value))}
              className="px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <input type="number" value={cutoffYear} onChange={e => setCutoffYear(parseInt(e.target.value))} min={2020} max={2030}
              className="w-20 px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
              {[1, 2].map(h => (
                <button key={h} onClick={() => setCutoffHalf(h)}
                  className="px-3 py-2 text-xs font-medium"
                  style={cutoffHalf === h ? { background: 'var(--teal)', color: 'white' } : { color: 'var(--charcoal)' }}>
                  {h === 1 ? '1st Half' : '2nd Half'}
                </button>
              ))}
            </div>
            <select value={branch} onChange={e => setBranch(e.target.value)}
              className="px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
              {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
            {canWrite && (
              <>
                <button onClick={generatePayslips} disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white"
                  style={{ background: generating ? 'var(--mid-gray)' : 'var(--teal)' }}>
                  {generating ? <Loader2 size={13} className="animate-spin" /> : <DollarSign size={13} />}
                  Generate Payslips
                </button>
                {payslips.some(p => p.status === 'DRAFT') && (
                  <button onClick={finalizePayslips}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border"
                    style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                    <CheckCircle2 size={13} /> Finalize All
                  </button>
                )}
              </>
            )}
          </div>

          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            Cutoff: {MONTHS[cutoffMonth - 1]} {cutoffYear} — {cutoffHalf === 1 ? '1st Half' : '2nd Half'}
            {payslips.length > 0 && ` • ${payslips.length} payslip(s)`}
          </p>

          {/* Payslip Table */}
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--off-white)' }}>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Employee</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Days</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Basic</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>OT</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Holiday</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Gross</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Deductions</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Net Pay</th>
                  <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Status</th>
                  <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}></th>
                </tr>
              </thead>
              <tbody>
                {payslips.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No payslips generated for this period. Click &quot;Generate Payslips&quot; to compute.</td></tr>
                ) : payslips.map(p => (
                  <>
                    <tr key={p.id} className="border-t hover:bg-gray-50 cursor-pointer" style={{ borderColor: 'var(--light-gray)' }}
                      onClick={() => setExpandedPayslip(expandedPayslip === p.id ? '' : p.id)}>
                      <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>
                        {p.employee.firstName} {p.employee.lastName}
                        <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>{p.employee.department}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{toNum(p.daysWorked).toFixed(0)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(toNum(p.basicPay))}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(toNum(p.overtimePay))}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(toNum(p.holidayPay))}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-medium" style={{ color: 'var(--charcoal)' }}>{formatCurrency(toNum(p.grossPay))}</td>
                      <td className="px-3 py-2.5 text-right font-mono" style={{ color: '#dc2626' }}>({formatCurrency(toNum(p.totalDeductions))})</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(toNum(p.netPay))}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: p.status === 'FINAL' ? '#dcfce7' : '#fef3c7', color: p.status === 'FINAL' ? '#059669' : '#d97706' }}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {expandedPayslip === p.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                    </tr>
                    {expandedPayslip === p.id && (
                      <tr key={`${p.id}-detail`}>
                        <td colSpan={10} className="px-6 py-4" style={{ background: 'var(--off-white)' }}>
                          <div className="grid grid-cols-3 gap-4 text-xs">
                            <div>
                              <p className="font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Earnings</p>
                              <div className="space-y-1">
                                <div className="flex justify-between"><span>Basic Pay</span><span className="font-mono">{formatCurrency(toNum(p.basicPay))}</span></div>
                                <div className="flex justify-between"><span>Overtime</span><span className="font-mono">{formatCurrency(toNum(p.overtimePay))}</span></div>
                                <div className="flex justify-between"><span>Holiday Pay</span><span className="font-mono">{formatCurrency(toNum(p.holidayPay))}</span></div>
                                <div className="flex justify-between"><span>Night Diff</span><span className="font-mono">{formatCurrency(toNum(p.nightDiffPay))}</span></div>
                                <div className="flex justify-between"><span>Rest Day</span><span className="font-mono">{formatCurrency(toNum(p.restDayPay))}</span></div>
                                <div className="flex justify-between border-t pt-1 font-bold" style={{ borderColor: 'var(--light-gray)' }}><span>Gross Pay</span><span className="font-mono">{formatCurrency(toNum(p.grossPay))}</span></div>
                              </div>
                            </div>
                            <div>
                              <p className="font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Deductions</p>
                              <div className="space-y-1">
                                <div className="flex justify-between"><span>SSS</span><span className="font-mono">{formatCurrency(toNum(p.sssDeduction))}</span></div>
                                <div className="flex justify-between"><span>PhilHealth</span><span className="font-mono">{formatCurrency(toNum(p.philhealthDeduction))}</span></div>
                                <div className="flex justify-between"><span>Pag-IBIG</span><span className="font-mono">{formatCurrency(toNum(p.pagibigDeduction))}</span></div>
                                <div className="flex justify-between"><span>Tax</span><span className="font-mono">{formatCurrency(toNum(p.taxDeduction))}</span></div>
                                <div className="flex justify-between"><span>Late</span><span className="font-mono">{formatCurrency(toNum(p.lateDeduction))}</span></div>
                                <div className="flex justify-between"><span>Undertime</span><span className="font-mono">{formatCurrency(toNum(p.undertimeDeduction))}</span></div>
                                <div className="flex justify-between border-t pt-1 font-bold" style={{ borderColor: 'var(--light-gray)' }}><span>Total</span><span className="font-mono">{formatCurrency(toNum(p.totalDeductions))}</span></div>
                              </div>
                            </div>
                            <div>
                              <p className="font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Summary</p>
                              <div className="space-y-1">
                                <div className="flex justify-between"><span>Days Worked</span><span className="font-mono">{toNum(p.daysWorked).toFixed(0)}</span></div>
                                <div className="flex justify-between"><span>Hours Worked</span><span className="font-mono">{toNum(p.hoursWorked).toFixed(1)}</span></div>
                                <div className="flex justify-between"><span>OT Hours</span><span className="font-mono">{toNum(p.overtimeHours).toFixed(1)}</span></div>
                                <div className="flex justify-between"><span>Late</span><span className="font-mono">{p.lateMinutes} min</span></div>
                                <div className="flex justify-between"><span>Undertime</span><span className="font-mono">{p.undertimeMinutes} min</span></div>
                                <div className="flex justify-between"><span>Rate Type</span><span>{p.employee.rateType === 'DAILY' ? 'Daily' : 'Monthly'}</span></div>
                                <div className="flex justify-between"><span>Rate</span><span className="font-mono">{formatCurrency(toNum(p.employee.rateType === 'DAILY' ? p.employee.dailyRate : p.employee.monthlyRate))}</span></div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
              {payslips.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--off-white)' }} className="border-t font-bold" >
                    <td className="px-3 py-2.5" style={{ color: 'var(--charcoal)', borderColor: 'var(--light-gray)' }}>TOTAL ({payslips.length})</td>
                    <td className="px-3 py-2.5 text-right font-mono">{payslips.reduce((s, p) => s + toNum(p.daysWorked), 0).toFixed(0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(payslips.reduce((s, p) => s + toNum(p.basicPay), 0))}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(payslips.reduce((s, p) => s + toNum(p.overtimePay), 0))}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(payslips.reduce((s, p) => s + toNum(p.holidayPay), 0))}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(payslips.reduce((s, p) => s + toNum(p.grossPay), 0))}</td>
                    <td className="px-3 py-2.5 text-right font-mono" style={{ color: '#dc2626' }}>({formatCurrency(payslips.reduce((s, p) => s + toNum(p.totalDeductions), 0))})</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(payslips.reduce((s, p) => s + toNum(p.netPay), 0))}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
