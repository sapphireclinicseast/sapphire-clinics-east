'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Users, Settings, FileText, Plus, Pencil, Save, Search, X, AlertCircle,
  RefreshCw, Loader2, Upload, Download, Calendar, Clock, CheckCircle2,
  XCircle, ChevronDown, ChevronUp, Trash2, Eye, QrCode, ClipboardList,
  DollarSign, Shield, ShieldOff, Star, Mail, FileDown, ArrowUpDown,
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
  { value: 'VERDANA', label: 'Verdana Store' },
]

const BRANCH_INFO: Record<string, { name: string; address: string; phone: string; tin: string }> = {
  SBEA: {
    name: 'Sandbox Clinic – East Branch',
    address: '4th Floor Robinsons Metro East, Marcos Highway, Dela Paz, Pasig City',
    phone: '0917 118 9289 | (02) 5310-4991',
    tin: 'TIN 010-817-642-00000',
  },
  SBGH: {
    name: 'Sandbox Clinic – Greenhills Branch',
    address: 'Level 8, GH Tower Offices, South Drive, Ortigas Avenue, Greenhills, San Juan City',
    phone: '0917 770 1686 | (02) 8529 1590',
    tin: 'TIN 010-817-642-00001',
  },
  VERDANA: {
    name: 'Verdana Store',
    address: 'Metro Manila, Philippines',
    phone: '',
    tin: '',
  },
  '': {
    name: 'Sapphire Clinics East Inc.',
    address: 'Metro Manila, Philippines',
    phone: '',
    tin: '',
  },
}

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
  { value: 'CHANGE_TIME_IN', label: 'Change Time In' },
  { value: 'CHANGE_TIME_OUT', label: 'Change Time Out' },
  { value: 'CERTIFICATE_OF_EMPLOYMENT', label: 'Certificate of Employment' },
  { value: 'CERTIFICATE_OF_CONSULTATION', label: 'Certificate of Consultation' },
]

const LEAVE_TYPES = [
  { value: 'VACATION', label: 'Vacation Leave' },
  { value: 'SICK', label: 'Sick Leave' },
  { value: 'EMERGENCY', label: 'Emergency Leave' },
  { value: 'MATERNITY', label: 'Maternity Leave' },
  { value: 'PATERNITY', label: 'Paternity Leave' },
  { value: 'BEREAVEMENT', label: 'Bereavement Leave' },
  { value: 'UNPAID', label: 'Unpaid Leave' },
  { value: 'SIL', label: 'Service Incentive Leave' },
  { value: 'BDAY', label: 'Birthday Leave' },
  { value: 'TRAINING', label: 'Training Leave' },
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
  phone?: string | null
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
  bankName?: string | null
  bankAccountNo?: string | null
  dateHired?: string | null
  regularizationDate?: string | null
  scheduleIn: string
  scheduleOut: string
  daySchedules?: Record<string, { in: string; out: string }> | null
  restDay: string
  ignoreTimekeeping?: boolean
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
  employeeId?: string | null
  consultantId?: string | null
  requestType: string
  leaveType?: string | null
  startDate?: string | null
  endDate?: string | null
  requestedTimeIn?: string | null
  requestedTimeOut?: string | null
  requestedScheduleIn?: string | null
  requestedScheduleOut?: string | null
  changeToWorkingDay?: boolean | null
  reason?: string | null
  attachment?: string | null
  status: string
  reviewNotes?: string | null
  createdAt: string
  employee?: { id: string; firstName: string; lastName: string; department: string; branch: string } | null
  consultant?: { id: string; name: string; department: string; branch: string } | null
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
  conflictData?: { ins: string[]; outs: string[]; totalEvents: number } | null
  dtrProof?: string | null
  remarks?: string | null
  employee: { id: string; firstName: string; lastName: string; department: string; branch: string; scheduleIn: string; scheduleOut: string }
  upload?: { id: string; status: string } | null
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
  payout1Day: number
  payout2Day: number
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
  lateGraceMinutes: number
  otIntervalMinutes: number
  otMaxHours: number | string
  sssEnabled: boolean
  philhealthEnabled: boolean
  pagibigEnabled: boolean
  taxEnabled: boolean
  benefitDeductionTiming: string
  hrOfficerNameSBEA?: string | null
  hrOfficerNameSBGH?: string | null
  hrOfficerNameVERDANA?: string | null
  requestApprovalExcludedPositions?: string[] | null
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
  allowances: number | string
  grossPay: number | string
  sssDeduction: number | string
  philhealthDeduction: number | string
  pagibigDeduction: number | string
  taxDeduction: number | string
  lateDeduction: number | string
  undertimeDeduction: number | string
  otherDeductions: number | string
  totalDeductions: number | string
  netPay: number | string
  daysWorked: number | string
  hoursWorked: number | string
  overtimeHours: number | string
  lateMinutes: number
  undertimeMinutes: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: any
  computeTaxNow?: boolean
  pdfUrl?: string | null
  status: string
  employee: { id: string; firstName: string; lastName: string; department: string; branch: string; rateType: string; dailyRate: number | string; monthlyRate: number | string; email?: string | null; employeeBioId?: number | null }
}

interface TkUploadRecord {
  id: string
  fileName: string
  uploadDate: string
  recordCount: number
  branch: string | null
  status: 'UPLOADED' | 'ACCEPTED' | 'FINALIZED'
  _count: { records: number }
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function EmployeePayroll({ canWrite, branch: parentBranch, cutoffMonth: parentCutoffMonth, cutoffYear: parentCutoffYear, cutoffHalf: parentCutoffHalf, cutoffPeriod: parentCutoffPeriod }: { canWrite: boolean; branch: string; cutoffMonth: number; cutoffYear: number; cutoffHalf: number; cutoffPeriod: string }) {
  const now = new Date()

  const [subTab, setSubTab] = useState<'list' | 'settings' | 'requests' | 'tk-upload' | 'tk-data' | 'benefits' | 'leave-settings' | 'adjustments' | 'holidays' | 'payslips' | 'lates'>('list')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  /* ── Shared filters (branch/cutoff come from parent) ── */
  const branch = parentBranch
  const cutoffPeriod = parentCutoffPeriod
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
    scheduleIn: '08:00', scheduleOut: '17:00', daySchedules: null, restDay: 'SUNDAY',
    ignoreTimekeeping: false,
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
  const [uploadResult, setUploadResult] = useState<{
    uploadId: string; totalRawRecords: number; recordsProcessed: number; unmatchedBioIds: number[]
    dateFrom?: string; dateTo?: string; detectedCutoff?: string; branch?: string | null
    totalBranchEmployees?: number; employeesIncluded?: number
    missingEmployees?: { id: string; name: string; rateType: string; hasBioId: boolean }[]
    conflicts?: { employeeId: string; employeeName?: string; date: string; insCount: number; outsCount: number }[]
    missingTimes?: { employeeId: string; employeeName?: string; date: string; missing: 'timeIn' | 'timeOut'; approvedRequests: { requestType: string; leaveType: string | null }[] }[]
  } | null>(null)

  /* ── Past Uploads ── */
  const [pastUploads, setPastUploads] = useState<TkUploadRecord[]>([])

  /* ── Timekeeping Inline Edit ── */
  const [tkEditId, setTkEditId] = useState('')
  const [tkEditForm, setTkEditForm] = useState({ timeIn: '', timeOut: '', lateMinutes: '', undertimeMinutes: '', overtimeMinutes: '', remarks: '' })
  const [tkEditSaving, setTkEditSaving] = useState(false)
  const [tkDeleting, setTkDeleting] = useState('')

  /* ── Conflict Resolution ── */
  const [conflictRecord, setConflictRecord] = useState<TimekeepingRecord | null>(null)
  const [conflictSelectedIn, setConflictSelectedIn] = useState('')
  const [conflictSelectedOut, setConflictSelectedOut] = useState('')
  const [conflictSaving, setConflictSaving] = useState(false)

  /* ── Missing Time / DTR Upload ── */
  const [dtrRecord, setDtrRecord] = useState<TimekeepingRecord | null>(null)
  const [dtrTimeIn, setDtrTimeIn] = useState('')
  const [dtrTimeOut, setDtrTimeOut] = useState('')
  const [dtrProofData, setDtrProofData] = useState('')
  const [dtrSaving, setDtrSaving] = useState(false)
  const dtrFileRef = useRef<HTMLInputElement>(null)
  const [tkApprovedRequests, setTkApprovedRequests] = useState<EmployeeRequest[]>([])

  /* ── Fetch approved requests for missing time check ── */
  const fetchApprovedRequests = useCallback(async () => {
    try {
      const params = new URLSearchParams({ status: 'APPROVED' })
      if (branch) params.set('branch', branch)
      const r = await fetch(`/api/payroll/employee-requests?${params}`)
      const d = await r.json()
      setTkApprovedRequests(Array.isArray(d) ? d : [])
    } catch { /* ignore */ }
  }, [branch])

  /* ── Holidays ── */
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [holidayYear, setHolidayYear] = useState(now.getFullYear())
  const [showHolidayForm, setShowHolidayForm] = useState(false)
  const [holidayForm, setHolidayForm] = useState({ name: '', date: '', holidayType: 'REGULAR' as string, branch: '', isRecurring: false })
  const [editHolidayId, setEditHolidayId] = useState('')
  const [holidayBranchFilter, setHolidayBranchFilter] = useState('')

  /* ── Benefits ── */
  const [showBenefitForm, setShowBenefitForm] = useState(false)
  const [benefitEmpId, setBenefitEmpId] = useState('')
  const [benefitType, setBenefitType] = useState('SSS')
  const [benefitEmpShare, setBenefitEmpShare] = useState(0)
  const [benefitErShare, setBenefitErShare] = useState(0)

  /* ── Leave Settings ── */
  interface LeaveEmployee { id: string; firstName: string; lastName: string; branch: string; department: string; used: Record<string, number>; remaining: Record<string, number> }
  const [leaveMaxDays, setLeaveMaxDays] = useState<Record<string, number>>({
    VACATION: 5, SICK: 5, EMERGENCY: 3, MATERNITY: 105, PATERNITY: 7,
    BEREAVEMENT: 3, UNPAID: 0, SIL: 5, BDAY: 1, TRAINING: 0,
  })
  const [leaveEmployees, setLeaveEmployees] = useState<LeaveEmployee[]>([])
  const [leaveYear, setLeaveYear] = useState(new Date().getFullYear())
  const [leaveLoading, setLeaveLoading] = useState(false)
  const [leaveSaving, setLeaveSaving] = useState(false)
  const [leaveSaved, setLeaveSaved] = useState(false)

  /* ── Cutoff Adjustments ── */
  interface AdjustmentRow { employeeId: string; employeeName?: string; allowance: number; allowanceType: string; allowanceLabel: string; deduction: number; deductionLabel: string; rowKey: string }
  const adjCutoffMonth = parentCutoffMonth
  const adjCutoffYear = parentCutoffYear
  const adjCutoffHalf = parentCutoffHalf
  const [adjRows, setAdjRows] = useState<AdjustmentRow[]>([])
  const [adjLoading, setAdjLoading] = useState(false)
  const [adjSaving, setAdjSaving] = useState(false)
  const [adjSaved, setAdjSaved] = useState(false)
  const [selectedAdjEmpIds, setSelectedAdjEmpIds] = useState<Set<string>>(new Set())
  const [showBulkAdjModal, setShowBulkAdjModal] = useState(false)
  const [bulkAdj, setBulkAdj] = useState<Partial<AdjustmentRow>>({})

  /* ── Payslips ── */
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const cutoffMonth = parentCutoffMonth
  const cutoffYear = parentCutoffYear
  const cutoffHalf = parentCutoffHalf
  const [generating, setGenerating] = useState(false)
  const [generatingPayreg, setGeneratingPayreg] = useState(false)
  const [expandedPayslip, setExpandedPayslip] = useState('')
  const [pdfGenerating, setPdfGenerating] = useState('')
  const [emailSending, setEmailSending] = useState('')
  const [emailSent, setEmailSent] = useState<Record<string, boolean>>({})
  const [downloadingAllPdfs, setDownloadingAllPdfs] = useState(false)
  const [emailingAll, setEmailingAll] = useState(false)
  const [regeneratingId, setRegeneratingId] = useState('')
  const [togglingTaxId, setTogglingTaxId] = useState('')
  const [breakdownModal, setBreakdownModal] = useState<{ payslip: Payslip; type: 'basicPay' | 'overtimePay' | 'holidayPay' | 'nightDiffPay' | 'restDayPay' | 'daysWorked' | 'hoursWorked' | 'otHours' | 'late' | 'undertime' } | null>(null)

  /* ── Holiday Presets ── */
  const [showHolidayPresets, setShowHolidayPresets] = useState(false)
  const [holidayPresetChecks, setHolidayPresetChecks] = useState<Record<string, boolean>>({})
  const [savingPresets, setSavingPresets] = useState(false)

  /* ── Employee Request QR/Link ── */
  const [showRequestLink, setShowRequestLink] = useState(false)
  const [showReqSettings, setShowReqSettings] = useState(false)
  const [excludedPositionInput, setExcludedPositionInput] = useState('')

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

  /* ── Past Payslips in Employee List ── */
  const [expandedEmpPayslips, setExpandedEmpPayslips] = useState('')
  const [empPastPayslips, setEmpPastPayslips] = useState<Payslip[]>([])
  const [loadingPastPayslips, setLoadingPastPayslips] = useState(false)

  /* ── Lates Tab ── */
  interface LateRecord { date: string; dayOfWeek: string; timeIn: string | null; scheduledIn: string; lateMinutes: number; withinGrace: boolean; effectiveLate: number }
  interface LateEmployee { id: string; firstName: string; lastName: string; department: string; branch: string; lateCount: number; withinGraceCount: number; beyondGraceCount: number; totalLateMinutes: number; lates: LateRecord[] }
  const nowDate = new Date()
  const [latesData, setLatesData] = useState<LateEmployee[]>([])
  const [latesGrace, setLatesGrace] = useState(0)
  const [latesLoading, setLatesLoading] = useState(false)
  const [latesLoaded, setLatesLoaded] = useState(false)
  const [latesDateFrom, setLatesDateFrom] = useState(`${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-01`)
  const [latesDateTo, setLatesDateTo] = useState(`${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`)
  const [latesEmpFilter, setLatesEmpFilter] = useState('')
  const [latesExpanded, setLatesExpanded] = useState('')

  /* ── Column Sorting ── */
  const [sortField, setSortField] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }
  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return <ArrowUpDown size={11} className="opacity-30" />
    return sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function sortRows<T>(rows: T[], getter: (row: T) => unknown): T[] {
    if (!sortField) return rows
    return [...rows].sort((a, b) => {
      const va = getter(a), vb = getter(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va
      const sa = String(va).toLowerCase(), sb = String(vb).toLowerCase()
      return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
    })
  }
  function SortTh({ field, children, className, style }: { field: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
    return (
      <th className={`cursor-pointer select-none ${className || ''}`} style={style} onClick={() => toggleSort(field)}>
        <span className="flex items-center gap-1">{children} <SortIcon field={field} /></span>
      </th>
    )
  }

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
      // Show all TK records regardless of upload review status — records are valid once uploaded
      const r = await fetch(`/api/payroll/timekeeping/records?${params}`)
      const d = await r.json()
      setTkRecords(Array.isArray(d) ? d : [])
    } catch { /* ignore */ }
  }, [branch, tkStartDate, tkEndDate])

  const fetchHolidays = useCallback(async () => {
    try {
      const params = new URLSearchParams({ year: String(holidayYear) })
      if (holidayBranchFilter) params.set('branch', holidayBranchFilter)
      const r = await fetch(`/api/payroll/holidays?${params}`)
      const d = await r.json()
      setHolidays(Array.isArray(d) ? d : [])
    } catch { /* ignore */ }
  }, [holidayYear, holidayBranchFilter])

  const fetchPayslips = useCallback(async () => {
    try {
      const params = new URLSearchParams({ cutoffPeriod })
      if (branch) params.set('branch', branch)
      const r = await fetch(`/api/payroll/employee-payslips?${params}`)
      const d = await r.json()
      setPayslips(Array.isArray(d) ? d : [])
    } catch { /* ignore */ }
  }, [cutoffPeriod, branch])

  const fetchLates = useCallback(async (from = latesDateFrom, to = latesDateTo) => {
    if (!from || !to) return
    setLatesLoading(true)
    try {
      const params = new URLSearchParams({ dateFrom: from, dateTo: to })
      if (branch) params.set('branch', branch)
      const r = await fetch(`/api/payroll/lates?${params}`)
      const d = await r.json()
      setLatesData(d.employees || [])
      setLatesGrace(d.lateGrace || 0)
      setLatesLoaded(true)
    } catch { /* ignore */ }
    setLatesLoading(false)
  }, [branch, latesDateFrom, latesDateTo])

  const fetchLeaveSettings = useCallback(async () => {
    setLeaveLoading(true)
    try {
      const params = new URLSearchParams({ year: String(leaveYear) })
      if (branch) params.set('branch', branch)
      const r = await fetch(`/api/payroll/leave-settings?${params}`)
      const d = await r.json()
      if (r.ok) {
        setLeaveMaxDays(d.leaveMaxDays || {})
        setLeaveEmployees(d.employees || [])
      }
    } catch { /* ignore */ }
    setLeaveLoading(false)
  }, [branch, leaveYear])

  const fetchEmpPastPayslips = async (employeeId: string) => {
    if (expandedEmpPayslips === employeeId) { setExpandedEmpPayslips(''); return }
    setExpandedEmpPayslips(employeeId)
    setLoadingPastPayslips(true)
    try {
      const params = new URLSearchParams({ employeeId, status: 'FINAL' })
      const r = await fetch(`/api/payroll/employee-payslips?${params}`)
      const d = await r.json()
      setEmpPastPayslips(Array.isArray(d) ? d : [])
    } catch { setEmpPastPayslips([]) }
    finally { setLoadingPastPayslips(false) }
  }

  const fetchPastUploads = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (branch) params.set('branch', branch)
      const r = await fetch(`/api/payroll/timekeeping/uploads?${params}`)
      const d = await r.json()
      setPastUploads(Array.isArray(d) ? d : [])
    } catch { /* ignore */ }
  }, [branch])

  useEffect(() => {
    if (subTab === 'list') fetchEmployees()
    else if (subTab === 'settings') fetchSettings()
    else if (subTab === 'requests') { fetchRequests(); fetchSettings() }
    else if (subTab === 'tk-data') { fetchTimekeeping(); fetchApprovedRequests(); fetchPastUploads() }
    else if (subTab === 'tk-upload') fetchPastUploads()
    else if (subTab === 'holidays') fetchHolidays()
    else if (subTab === 'benefits') fetchEmployees()
    else if (subTab === 'leave-settings') fetchLeaveSettings()
    else if (subTab === 'adjustments') fetchEmployees()
    else if (subTab === 'payslips') fetchPayslips()
    else if (subTab === 'lates') fetchLates()
  }, [subTab, leaveYear, fetchEmployees, fetchSettings, fetchRequests, fetchTimekeeping, fetchApprovedRequests, fetchPastUploads, fetchHolidays, fetchPayslips, fetchLeaveSettings, fetchLates])

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
      daySchedules: emp.daySchedules || null, restDay: emp.restDay,
      ignoreTimekeeping: emp.ignoreTimekeeping ?? false,
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
    setError('')
    try {
      const r = await fetch('/api/payroll/employee-payslips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutoffPeriod, branch: branch || 'SANDBOX_EAST' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Generation failed')
      fetchPayslips()
      if (d.errors?.length) {
        setError(`Generated ${d.generated} payslip(s) with ${d.errors.length} error(s): ${d.errors.slice(0, 3).join('; ')}${d.errors.length > 3 ? ` (+${d.errors.length - 3} more)` : ''}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate payslips')
    }
    setGenerating(false)
  }

  const regeneratePayslip = async (p: Payslip, computeTaxNow?: boolean) => {
    if (p.status === 'LOCKED') { setError('Cannot regenerate a locked payslip. Unlock payroll first.'); return }
    setRegeneratingId(p.id)
    setError('')
    try {
      const r = await fetch('/api/payroll/employee-payslips', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: p.employeeId, cutoffPeriod, branch: branch || 'SBEA', ...(computeTaxNow !== undefined ? { computeTaxNow } : {}) }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Regeneration failed')
      // Update this payslip in local state immediately
      setPayslips(prev => prev.map(ps => ps.id === p.id ? { ...d, employee: ps.employee } : ps))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate payslip')
    }
    setRegeneratingId('')
  }

  const toggleComputeTaxNow = async (p: Payslip) => {
    if (p.status === 'LOCKED') return
    setTogglingTaxId(p.id)
    setError('')
    try {
      const r = await fetch('/api/payroll/employee-payslips', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: p.employeeId, cutoffPeriod, branch: branch || 'SBEA', computeTaxNow: !p.computeTaxNow }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Toggle failed')
      setPayslips(prev => prev.map(ps => ps.id === p.id ? { ...d, employee: ps.employee } : ps))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle withholding tax')
    }
    setTogglingTaxId('')
  }

  const saveLeaveMaxDays = async () => {
    setLeaveSaving(true)
    try {
      const r = await fetch('/api/payroll/leave-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaveMaxDays }),
      })
      if (!r.ok) throw new Error('Save failed')
      setLeaveSaved(true)
      setTimeout(() => setLeaveSaved(false), 2500)
      await fetchLeaveSettings()
    } catch { setError('Failed to save leave settings') }
    setLeaveSaving(false)
  }

  const generateEmployeePayreg = async () => {
    if (payslips.length === 0) {
      alert('No payslips found for this period. Generate payslips first.')
      return
    }
    setGeneratingPayreg(true)
    try {
      const XLSX = await import('xlsx')
      const cutoffLabel = `${MONTHS[cutoffMonth - 1]} ${cutoffYear} — ${cutoffHalf === 1 ? '1st Half' : '2nd Half'}`

      // Fetch adjustments for this cutoff
      const adjParams = new URLSearchParams({ cutoffPeriod, branch: branch || 'SBEA' })
      const adjRes = await fetch(`/api/payroll/cutoff-adjustments?${adjParams}`)
      const adjData: { employeeId: string; allowance: number | string; allowanceType: string; deduction: number | string }[] = adjRes.ok ? await adjRes.json() : []

      // Group adjustments by employee
      const adjByEmp = new Map<string, { allowance: number; allowanceType: string; deduction: number }[]>()
      for (const adj of adjData) {
        if (!adjByEmp.has(adj.employeeId)) adjByEmp.set(adj.employeeId, [])
        adjByEmp.get(adj.employeeId)!.push({ allowance: Number(adj.allowance) || 0, allowanceType: adj.allowanceType, deduction: Number(adj.deduction) || 0 })
      }

      // Fetch approved leave requests for this branch
      const reqParams = new URLSearchParams({ status: 'APPROVED' })
      if (branch) reqParams.set('branch', branch)
      const reqRes = await fetch(`/api/payroll/employee-requests?${reqParams}`)
      const reqData: { employeeId?: string | null; requestType: string; leaveType?: string | null; startDate?: string | null; endDate?: string | null; isHalfDay?: boolean }[] = reqRes.ok ? await reqRes.json() : []

      // Determine cutoff date range
      let settings = empSettings
      if (!settings) {
        const sRes = await fetch('/api/payroll/employee-settings')
        settings = sRes.ok ? await sRes.json() : null
      }
      const [yearStr, monthStr, halfStr] = cutoffPeriod.split('-')
      const yr = parseInt(yearStr), mo = parseInt(monthStr), half = parseInt(halfStr)
      let startDay: number, endDay: number
      if (half === 1) {
        startDay = settings?.cutoff1Start ?? 1
        endDay = settings?.cutoff1End ?? 15
      } else {
        startDay = settings?.cutoff2Start ?? 16
        endDay = settings?.cutoff2EndLastDay ? new Date(yr, mo, 0).getDate() : (settings?.cutoff2End ?? new Date(yr, mo, 0).getDate())
      }
      let cutoffStart: Date, cutoffEnd: Date
      if (startDay > endDay) {
        cutoffStart = new Date(Date.UTC(yr, mo - 2, startDay))
        cutoffEnd = new Date(Date.UTC(yr, mo - 1, endDay))
      } else {
        cutoffStart = new Date(Date.UTC(yr, mo - 1, startDay))
        cutoffEnd = new Date(Date.UTC(yr, mo - 1, endDay))
      }

      // Group leave pays by employee and leave type within cutoff range
      const PAID_LEAVE_TYPES = ['VACATION', 'SICK', 'SIL', 'BDAY', 'TRAINING']
      const leavesByEmp = new Map<string, Record<string, number>>()
      for (const req of reqData) {
        if (!req.employeeId || req.requestType !== 'LEAVE' || !req.leaveType) continue
        if (!PAID_LEAVE_TYPES.includes(req.leaveType)) continue
        if (!req.startDate) continue
        const reqStart = new Date(req.startDate)
        const reqEnd = req.endDate ? new Date(req.endDate) : reqStart
        if (reqEnd < cutoffStart || reqStart > cutoffEnd) continue
        // Count days overlapping with cutoff
        let days = 0
        const d = new Date(Math.max(reqStart.getTime(), cutoffStart.getTime()))
        const end = new Date(Math.min(reqEnd.getTime(), cutoffEnd.getTime()))
        while (d <= end) { days++; d.setUTCDate(d.getUTCDate() + 1) }
        if (req.isHalfDay) days = 0.5
        if (!leavesByEmp.has(req.employeeId)) leavesByEmp.set(req.employeeId, {})
        const empLeaves = leavesByEmp.get(req.employeeId)!
        empLeaves[req.leaveType] = (empLeaves[req.leaveType] || 0) + days
      }

      const headers = [
        'PAYROLL DATE', 'LOCATION', 'ID NO', 'NAME', 'RATE',
        'RD', 'WRD', 'VL', 'SL', 'SIL', 'BDAY', 'TRAINING', 'RH', 'SH',
        'TARDINESS', 'OVERTIME', 'TAXABLE ADJUSTMENT',
        'GROSS TAXABLE PAY', 'SSSEE', 'PHICEE', 'HDMFEE',
        'NET TAXABLE AMOUNT BEFORE TAX', 'WTAX',
        'NET TAXABLE AMOUNT AFTER TAX', 'NON TAXABLE ADJUSTMENT',
        'NET PAY', '13TH MONTH PAY',
      ]

      const data: (string | number)[][] = [[], [], [], headers]
      const r = (n: number) => Math.round(n * 100) / 100

      let totWRD = 0, totVL = 0, totSL = 0, totSIL = 0, totBDAY = 0, totTRAINING = 0
      let totRH = 0, totTardiness = 0, totOT = 0, totTaxAdj = 0, totGrossT = 0
      let totSSS = 0, totPHIC = 0, totHDMF = 0, totNetBeforeTax = 0, totWTax = 0
      let totNetAfterTax = 0, totNonTaxAdj = 0, totNetPay = 0, totThirteenth = 0

      for (const p of payslips) {
        const emp = p.employee
        const dailyRate = toNum(emp.rateType === 'DAILY' ? emp.dailyRate : Number(emp.monthlyRate) / 22)

        // Split adjustments into taxable / non-taxable
        let taxableAdj = 0, nonTaxableAdj = 0
        for (const adj of (adjByEmp.get(emp.id) || [])) {
          if (adj.allowanceType === 'TAXABLE') taxableAdj += adj.allowance
          else nonTaxableAdj += adj.allowance
        }

        // Leave pays
        const leaves = leavesByEmp.get(emp.id) || {}
        const vlPay  = r((leaves['VACATION'] || 0) * dailyRate)
        const slPay  = r((leaves['SICK']     || 0) * dailyRate)
        const silPay = r((leaves['SIL']      || 0) * dailyRate)
        const bdayPay    = r((leaves['BDAY']     || 0) * dailyRate)
        const trainingPay = r((leaves['TRAINING'] || 0) * dailyRate)

        const wrd       = r(toNum(p.restDayPay))
        const rh        = r(toNum(p.holidayPay))
        const tardiness = r(toNum(p.lateDeduction) + toNum(p.undertimeDeduction))
        const ot        = r(toNum(p.overtimePay))
        const sss       = r(toNum(p.sssDeduction))
        const phic      = r(toNum(p.philhealthDeduction))
        const hdmf      = r(toNum(p.pagibigDeduction))
        const wtax      = r(toNum(p.taxDeduction))
        const netPay    = r(toNum(p.netPay))
        const basicPay  = r(toNum(p.basicPay))

        const grossTaxable   = r(basicPay + ot + rh + wrd + r(taxableAdj))
        const netBeforeTax   = r(grossTaxable - sss - phic - hdmf)
        const netAfterTax    = r(netBeforeTax - wtax)
        const thirteenthMonth = r(basicPay / 12)

        totWRD += wrd; totVL += vlPay; totSL += slPay; totSIL += silPay
        totBDAY += bdayPay; totTRAINING += trainingPay
        totRH += rh; totTardiness += tardiness; totOT += ot; totTaxAdj += taxableAdj
        totGrossT += grossTaxable; totSSS += sss; totPHIC += phic; totHDMF += hdmf
        totNetBeforeTax += netBeforeTax; totWTax += wtax; totNetAfterTax += netAfterTax
        totNonTaxAdj += nonTaxableAdj; totNetPay += netPay; totThirteenth += thirteenthMonth

        data.push([
          cutoffLabel, p.branch,
          emp.employeeBioId ?? '',
          `${emp.firstName} ${emp.lastName}`,
          r(dailyRate),
          0,                // RD — unworked rest days, 0 in PH law
          wrd, vlPay, slPay, silPay, bdayPay, trainingPay,
          rh,
          0,                // SH — no separate SH tracking, combined in RH
          tardiness, ot,
          r(taxableAdj),
          grossTaxable, sss, phic, hdmf,
          netBeforeTax, wtax, netAfterTax,
          r(nonTaxableAdj),
          netPay, thirteenthMonth,
        ])
      }

      data.push([
        'TOTAL', '', '', '', '',
        0, r(totWRD), r(totVL), r(totSL), r(totSIL), r(totBDAY), r(totTRAINING),
        r(totRH), 0, r(totTardiness), r(totOT), r(totTaxAdj), r(totGrossT),
        r(totSSS), r(totPHIC), r(totHDMF), r(totNetBeforeTax), r(totWTax),
        r(totNetAfterTax), r(totNonTaxAdj), r(totNetPay), r(totThirteenth),
      ])

      const ws = XLSX.utils.aoa_to_sheet(data)
      ws['!cols'] = headers.map(() => ({ wch: 22 }))

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Employee')

      const labelSafe = cutoffLabel.replace(/[^a-zA-Z0-9-]/g, '_')
      XLSX.writeFile(wb, `payreg_employee_${labelSafe}${branch ? '_' + branch : ''}.xlsx`)
    } catch (e) {
      alert('Failed to generate payreg: ' + (e instanceof Error ? e.message : String(e)))
    }
    setGeneratingPayreg(false)
  }

  const buildEmployeePayslipPdf = async (p: Payslip) => {
    const { jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const ORANGE: [number, number, number] = [168, 92, 61]   // #A85C3D Clay
    const NET_GREEN: [number, number, number] = [226, 239, 217]
    const WHITE: [number, number, number] = [255, 255, 255]
    const DARK: [number, number, number] = [30, 30, 30]
    const MID: [number, number, number] = [80, 80, 80]
    const LIGHT_BORDER: [number, number, number] = [210, 210, 210]

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const margin = 25.4
    let y = margin

    const branchInfo = BRANCH_INFO[p.branch] || BRANCH_INFO['']
    const branchLabel = BRANCHES.find(b => b.value === p.branch)?.label || p.branch
    const cutoffLabel = `${MONTHS[parseInt(p.cutoffPeriod.split('-')[1]) - 1]} ${p.cutoffPeriod.split('-')[0]} — ${p.cutoffPeriod.endsWith('-1') ? '1st Half' : '2nd Half'}`
    const fmtPHP = (n: number) => `PHP ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    // Header
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...ORANGE)
    doc.text('SAPPHIRE CLINICS EAST INC.', pageW / 2, y + 8, { align: 'center' })
    y += 14
    doc.setFontSize(9)
    doc.setTextColor(...MID)
    doc.text(branchInfo.address, pageW / 2, y, { align: 'center' })
    y += 5
    if (branchInfo.phone) {
      doc.text(branchInfo.phone, pageW / 2, y, { align: 'center' })
      y += 5
    }
    if (branchInfo.tin) {
      doc.text(branchInfo.tin, pageW / 2, y, { align: 'center' })
      y += 5
    }
    y += 3

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text('EMPLOYEE PAYSLIP', pageW / 2, y, { align: 'center' })
    y += 10

    // Employee details
    const details: [string, string][] = [
      ['Name', `${p.employee.firstName} ${p.employee.lastName}`],
      ['Department', p.employee.department],
      ['Branch', branchLabel],
      ['Rate Type', p.employee.rateType === 'DAILY' ? 'Daily' : 'Monthly'],
      ['Rate', fmtPHP(toNum(p.employee.rateType === 'DAILY' ? p.employee.dailyRate : p.employee.monthlyRate))],
      ['Cutoff Period', cutoffLabel],
    ]
    for (const [label, value] of details) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...MID)
      doc.text(`${label}:`, margin, y)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...DARK)
      doc.text(value, margin + 42, y)
      y += 6
    }
    y += 4

    const tableHeadStyles = { fillColor: ORANGE, textColor: WHITE, fontStyle: 'bold' as const, fontSize: 9, lineColor: ORANGE, lineWidth: 0 }
    const tableBodyStyles = { fontSize: 9, textColor: DARK, lineColor: LIGHT_BORDER, lineWidth: 0.3 }

    // Earnings
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text('EARNINGS', margin, y)
    y += 2
    autoTable(doc, {
      startY: y,
      head: [['Description', 'Amount']],
      body: [
        ['Basic Pay', fmtPHP(toNum(p.basicPay))],
        ['Overtime Pay', fmtPHP(toNum(p.overtimePay))],
        ['Holiday Pay', fmtPHP(toNum(p.holidayPay))],
        ['Night Differential', fmtPHP(toNum(p.nightDiffPay))],
        ['Rest Day Pay', fmtPHP(toNum(p.restDayPay))],
        ['Allowances', fmtPHP(toNum(p.allowances))],
      ].filter(r => parseFloat(r[1].replace(/[^0-9.-]/g, '')) > 0),
      theme: 'grid',
      headStyles: tableHeadStyles,
      bodyStyles: tableBodyStyles,
      columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 50 } },
      margin: { left: margin, right: margin },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable?.finalY ?? y
    y += 6

    // Deductions
    doc.text('DEDUCTIONS', margin, y)
    y += 2
    autoTable(doc, {
      startY: y,
      head: [['Description', 'Amount']],
      body: [
        ['SSS', fmtPHP(toNum(p.sssDeduction))],
        ['PhilHealth', fmtPHP(toNum(p.philhealthDeduction))],
        ['Pag-IBIG', fmtPHP(toNum(p.pagibigDeduction))],
        ['Tax', fmtPHP(toNum(p.taxDeduction))],
        ['Late Deduction', fmtPHP(toNum(p.lateDeduction))],
        ['Undertime Deduction', fmtPHP(toNum(p.undertimeDeduction))],
        ['Other Deductions', fmtPHP(toNum(p.otherDeductions))],
      ].filter(r => parseFloat(r[1].replace(/[^0-9.-]/g, '')) > 0),
      theme: 'grid',
      headStyles: { ...tableHeadStyles, fillColor: [180, 40, 40] as [number, number, number] },
      bodyStyles: tableBodyStyles,
      columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 50 } },
      margin: { left: margin, right: margin },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable?.finalY ?? y
    y += 6

    // Summary
    doc.text('SUMMARY', margin, y)
    y += 2
    autoTable(doc, {
      startY: y,
      head: [['', 'Amount']],
      body: [
        ['Gross Pay', fmtPHP(toNum(p.grossPay))],
        ['Total Deductions', `(${fmtPHP(toNum(p.totalDeductions))})`],
        ['NET PAY', fmtPHP(toNum(p.netPay))],
      ],
      theme: 'grid',
      headStyles: tableHeadStyles,
      bodyStyles: tableBodyStyles,
      columnStyles: { 0: { cellWidth: 'auto', fontStyle: 'bold' }, 1: { halign: 'right', cellWidth: 50 } },
      margin: { left: margin, right: margin },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (data: any) => {
        if (data.row.index === 2) {
          data.cell.styles.fillColor = NET_GREEN
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.textColor = [0, 80, 40]
        }
        if (data.row.index === 1) {
          data.cell.styles.textColor = [180, 40, 40]
        }
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable?.finalY ?? y
    y += 10

    // Attendance summary
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MID)
    doc.text(`Days Worked: ${toNum(p.daysWorked).toFixed(0)}  |  Hours: ${toNum(p.hoursWorked).toFixed(1)}  |  OT Hours: ${toNum(p.overtimeHours).toFixed(1)}  |  Late: ${p.lateMinutes} min  |  UT: ${p.undertimeMinutes} min`, margin, y)
    y += 10

    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text('Computer-generated payslip. No signature required.', pageW / 2, y, { align: 'center' })
    y += 4
    doc.text(`Generated: ${new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}`, pageW / 2, y, { align: 'center' })

    return doc
  }

  const getHrOfficerForBranch = (branchCode: string): string => {
    if (!empSettings) return ''
    if (branchCode === 'SBEA') return empSettings.hrOfficerNameSBEA || ''
    if (branchCode === 'SBGH') return empSettings.hrOfficerNameSBGH || ''
    if (['VERDANA', 'VDNA'].includes(branchCode)) return empSettings.hrOfficerNameVERDANA || ''
    return ''
  }

  const buildCertificateLetterhead = (doc: import('jspdf').jsPDF) => {
    const pageW = doc.internal.pageSize.getWidth()
    let y = 30

    // Company Name
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(13, 148, 136)
    doc.text('SAPPHIRE CLINICS EAST INCORPORATED', pageW / 2, y, { align: 'center' })
    y += 6

    // Email
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    doc.text('main@sapphireclinicseast.org', pageW / 2, y, { align: 'center' })
    y += 5

    // Main Office address (used in COE letterhead — defaults to SBEA)
    doc.text('4th Floor Robinsons Metro East, Marcos Highway, Dela Paz, Pasig City', pageW / 2, y, { align: 'center' })
    y += 10

    // Divider line
    doc.setDrawColor(13, 148, 136)
    doc.setLineWidth(0.5)
    doc.line(30, y, pageW - 30, y)
    y += 5

    return y
  }

  const generateCoePdf = async (req: EmployeeRequest) => {
    const emp = req.employee ? employees.find(e => e.id === req.employeeId) : null
    if (!emp) {
      setError('Employee data not found. Please go to the Employee List tab first to load employee data, then return here.')
      return
    }

    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const margin = 30
    const contentW = pageW - margin * 2

    let y = buildCertificateLetterhead(doc)
    y += 15

    // Title
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(30, 30, 30)
    doc.text('CERTIFICATE OF EMPLOYMENT', pageW / 2, y, { align: 'center' })
    y += 20

    // Date issued
    const issuedDate = new Date().toLocaleDateString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila',
    })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(60, 60, 60)
    doc.text(issuedDate, pageW / 2, y, { align: 'center' })
    y += 15

    // "To Whom It May Concern"
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(30, 30, 30)
    doc.text('TO WHOM IT MAY CONCERN:', margin, y)
    y += 12

    // Body text
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(50, 50, 50)

    const empName = `${emp.firstName} ${emp.lastName}`.toUpperCase()
    const dateHired = emp.dateHired
      ? new Date(emp.dateHired).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' })
      : 'N/A'
    const jobTitle = formatJobTitle(emp.jobTitle) || 'N/A'
    const branchLabel = BRANCHES.find(b => b.value === emp.branch)?.label || emp.branch

    let bodyText = `This is to certify that ${empName} has been employed with Sapphire Clinics East Incorporated since ${dateHired} as ${jobTitle} under the ${branchLabel} branch.`

    // Compensation
    let compensation = ''
    if (emp.rateType === 'DAILY' && toNum(emp.dailyRate) > 0) {
      const grossMonthly = toNum(emp.dailyRate) * 22
      compensation = `PHP ${grossMonthly.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    } else if (emp.rateType === 'MONTHLY' && toNum(emp.monthlyRate) > 0) {
      compensation = `PHP ${toNum(emp.monthlyRate).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }

    if (compensation) {
      bodyText += `\n\nThe above-named employee receives a gross monthly compensation of ${compensation}.`
    }

    // Purpose
    const purpose = req.reason || 'the purpose stated'
    bodyText += `\n\nThis certificate is issued upon the request of the above-named employee for ${purpose}.`

    // Render body text with word wrap
    const lines = doc.splitTextToSize(bodyText, contentW)
    doc.text(lines, margin, y)
    y += lines.length * 6 + 30

    // Signature block — HR Officer name from settings (per branch)
    const hrOfficer = getHrOfficerForBranch(emp.branch)
    if (hrOfficer) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(30, 30, 30)
      doc.text(hrOfficer.toUpperCase(), margin, y)
      y += 5
    }
    doc.setDrawColor(80, 80, 80)
    doc.setLineWidth(0.3)
    doc.line(margin, y, margin + 70, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text('HR Officer', margin, y)
    y += 20

    // Footer note
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text('This is a computer-generated document.', pageW / 2, y, { align: 'center' })
    y += 4
    doc.text(`Generated: ${issuedDate}`, pageW / 2, y, { align: 'center' })

    doc.save(`COE-${emp.lastName}-${emp.firstName}-${issuedDate.replace(/\s/g, '-')}.pdf`)
  }

  const generateCocPdf = async (req: EmployeeRequest) => {
    if (!req.consultant) {
      setError('Consultant data not found for this request.')
      return
    }

    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const margin = 30
    const contentW = pageW - margin * 2

    let y = buildCertificateLetterhead(doc)
    y += 15

    // Title
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(30, 30, 30)
    doc.text('CERTIFICATE OF CONSULTATION', pageW / 2, y, { align: 'center' })
    y += 20

    // Date issued
    const issuedDate = new Date().toLocaleDateString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila',
    })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(60, 60, 60)
    doc.text(issuedDate, pageW / 2, y, { align: 'center' })
    y += 15

    // "To Whom It May Concern"
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(30, 30, 30)
    doc.text('TO WHOM IT MAY CONCERN:', margin, y)
    y += 12

    // Body text
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(50, 50, 50)

    const consultantName = req.consultant.name.toUpperCase()
    const branchLabel = BRANCHES.find(b => b.value === req.consultant!.branch)?.label || req.consultant.branch

    let bodyText = `This is to certify that ${consultantName} has been engaged with Sapphire Clinics East Incorporated on a consultancy basis under the ${branchLabel} branch.`

    // Purpose
    const purpose = req.reason || 'the purpose stated'
    bodyText += `\n\nThis certificate is issued upon the request of the above-named consultant for ${purpose}.`

    // Render body text with word wrap
    const lines = doc.splitTextToSize(bodyText, contentW)
    doc.text(lines, margin, y)
    y += lines.length * 6 + 30

    // Signature block — HR Officer name from settings (per branch)
    const hrOfficer = getHrOfficerForBranch(req.consultant!.branch)
    if (hrOfficer) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(30, 30, 30)
      doc.text(hrOfficer.toUpperCase(), margin, y)
      y += 5
    }
    doc.setDrawColor(80, 80, 80)
    doc.setLineWidth(0.3)
    doc.line(margin, y, margin + 70, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text('HR Officer', margin, y)
    y += 20

    // Footer note
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text('This is a computer-generated document.', pageW / 2, y, { align: 'center' })
    y += 4
    doc.text(`Generated: ${issuedDate}`, pageW / 2, y, { align: 'center' })

    const nameParts = req.consultant.name.split(',').map(s => s.trim())
    const fileLabel = nameParts.join('-') || 'consultant'
    doc.save(`COC-${fileLabel}-${issuedDate.replace(/\s/g, '-')}.pdf`)
  }

  const downloadPayslipPdf = async (p: Payslip) => {
    setPdfGenerating(p.id)
    try {
      const doc = await buildEmployeePayslipPdf(p)
      doc.save(`payslip-${p.employee.lastName}-${p.employee.firstName}-${p.cutoffPeriod}.pdf`)

      // Also store on server
      const pdfBase64 = doc.output('datauristring')
      await fetch('/api/payroll/payslip-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, type: 'employee', pdfBase64 }),
      })
      fetchPayslips()
    } catch { setError('Failed to generate PDF') }
    setPdfGenerating('')
  }

  const downloadAllPayslipPdfs = async () => {
    setDownloadingAllPdfs(true)
    for (const p of payslips) {
      try { await downloadPayslipPdf(p); await new Promise(r => setTimeout(r, 600)) }
      catch (e) { console.error('PDF error for', p.employee.lastName, e) }
    }
    setDownloadingAllPdfs(false)
  }

  const emailPayslip = async (p: Payslip) => {
    const email = p.employee.email
    if (!email) { setError(`No email address for ${p.employee.firstName} ${p.employee.lastName}`); return }
    setEmailSending(p.id)
    try {
      const doc = await buildEmployeePayslipPdf(p)
      const pdfBase64 = doc.output('datauristring')

      // Store PDF on server
      await fetch('/api/payroll/payslip-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, type: 'employee', pdfBase64 }),
      })

      // Send email
      const branchLabel = BRANCHES.find(b => b.value === p.branch)?.label || p.branch
      const r = await fetch('/api/payroll/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultantName: `${p.employee.lastName}, ${p.employee.firstName}`,
          firstName: p.employee.firstName,
          branch: BRANCH_INFO[p.branch]?.name || branchLabel,
          cutoffPeriod: p.cutoffPeriod,
          netPay: formatCurrency(toNum(p.netPay)),
          email,
          pdfBase64,
        }),
      })
      if (!r.ok) {
        const text = await r.text()
        let msg = 'Email failed'
        try { msg = JSON.parse(text).error || msg } catch { msg = `Email failed (${r.status})` }
        throw new Error(msg)
      }
      setEmailSent(prev => ({ ...prev, [p.id]: true }))
      fetchPayslips()
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to send email') }
    setEmailSending('')
  }

  const emailAllPayslips = async () => {
    setEmailingAll(true)
    for (const p of payslips) {
      if (!p.employee.email) continue
      try { await emailPayslip(p); await new Promise(r => setTimeout(r, 800)) }
      catch (e) { console.error('Email error for', p.employee.lastName, e) }
    }
    setEmailingAll(false)
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

  const [lockingPayroll, setLockingPayroll] = useState(false)
  const lockAndFinalizeEmployees = async () => {
    if (!confirm(`Lock and finalize all employee payslips for ${cutoffPeriod} — ${branch || 'all branches'}? This cannot be undone.`)) return
    setLockingPayroll(true)
    try {
      const res = await fetch('/api/payroll/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutoffPeriod, branch: branch || 'SBEA', payrollType: 'EMPLOYEE' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to finalize'); return }
      setError('')
      alert(`Payroll locked! ${data.lockedCount} payslips finalized. Journal entry created.`)
      fetchPayslips()
    } catch (e) { setError(String(e)) }
    finally { setLockingPayroll(false) }
  }

  const createBankFile = async () => {
    if (!cutoffPeriod) { setError('Select a cutoff period first'); return }
    const params = new URLSearchParams({ cutoffPeriod, payrollType: 'EMPLOYEE' })
    if (branch) params.set('branch', branch)
    const url = `/api/payroll/bank-file?${params}`
    const res = await fetch(url)
    if (!res.ok) { setError('Failed to generate bank file'); return }
    const text = await res.text()
    const blob = new Blob([text], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `bank-employee-${cutoffPeriod}${branch ? `-${branch}` : ''}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const [unlockingPayroll, setUnlockingPayroll] = useState(false)
  const unlockEmployeePayroll = async () => {
    if (!confirm(`Unlock employee payslips for ${cutoffPeriod} — ${branch || 'all branches'}? This will delete the journal entry and allow editing again.`)) return
    setUnlockingPayroll(true)
    try {
      const res = await fetch('/api/payroll/finalize', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutoffPeriod, branch: branch || 'SBEA', payrollType: 'EMPLOYEE' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to unlock'); return }
      setError('')
      alert('Payroll unlocked. Payslips are now editable again.')
      fetchPayslips()
    } catch (e) { setError(String(e)) }
    finally { setUnlockingPayroll(false) }
  }

  /* ── Timekeeping Edit/Delete ── */
  const startTkEdit = (r: TimekeepingRecord) => {
    setTkEditId(r.id)
    const toLocal = (iso: string | null | undefined) => {
      if (!iso) return ''
      const d = new Date(iso)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    setTkEditForm({
      timeIn: toLocal(r.timeIn),
      timeOut: toLocal(r.timeOut),
      lateMinutes: String(r.lateMinutes || 0),
      undertimeMinutes: String(r.undertimeMinutes || 0),
      overtimeMinutes: String(r.overtimeMinutes || 0),
      remarks: r.remarks || '',
    })
  }

  const saveTkEdit = async () => {
    setTkEditSaving(true)
    try {
      const r = await fetch('/api/payroll/timekeeping/records', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tkEditId,
          timeIn: tkEditForm.timeIn ? new Date(tkEditForm.timeIn).toISOString() : null,
          timeOut: tkEditForm.timeOut ? new Date(tkEditForm.timeOut).toISOString() : null,
          lateMinutes: tkEditForm.lateMinutes,
          undertimeMinutes: tkEditForm.undertimeMinutes,
          overtimeMinutes: tkEditForm.overtimeMinutes,
          remarks: tkEditForm.remarks,
        }),
      })
      if (r.ok) {
        setTkEditId('')
        fetchTimekeeping()
      }
    } catch { /* ignore */ }
    setTkEditSaving(false)
  }

  const deleteTkRecord = async (id: string) => {
    if (!confirm('Delete this timekeeping record?')) return
    setTkDeleting(id)
    try {
      await fetch(`/api/payroll/timekeeping/records?id=${id}`, { method: 'DELETE' })
      fetchTimekeeping()
    } catch { /* ignore */ }
    setTkDeleting('')
  }

  /* ── Conflict Resolution ── */
  const openConflictModal = (r: TimekeepingRecord) => {
    setConflictRecord(r)
    setConflictSelectedIn(r.timeIn || '')
    setConflictSelectedOut(r.timeOut || '')
  }

  const saveConflictResolution = async () => {
    if (!conflictRecord) return
    setConflictSaving(true)
    try {
      const r = await fetch('/api/payroll/timekeeping/records', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: conflictRecord.id,
          timeIn: conflictSelectedIn ? new Date(conflictSelectedIn).toISOString() : null,
          timeOut: conflictSelectedOut ? new Date(conflictSelectedOut).toISOString() : null,
          resolveConflict: true,
        }),
      })
      if (r.ok) {
        setConflictRecord(null)
        fetchTimekeeping()
      }
    } catch { /* ignore */ }
    setConflictSaving(false)
  }

  /* ── DTR Upload for Missing Time ── */
  const openDtrModal = (r: TimekeepingRecord) => {
    setDtrRecord(r)
    const toLocal = (iso: string | null | undefined) => {
      if (!iso) return ''
      const d = new Date(iso)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    setDtrTimeIn(toLocal(r.timeIn))
    setDtrTimeOut(toLocal(r.timeOut))
    setDtrProofData(r.dtrProof || '')
  }

  const handleDtrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setDtrProofData(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const saveDtrEntry = async () => {
    if (!dtrRecord) return
    if (!dtrProofData && !dtrRecord.dtrProof) {
      setError('Please upload a DTR photo as proof before saving')
      return
    }
    setDtrSaving(true)
    try {
      const r = await fetch('/api/payroll/timekeeping/records', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: dtrRecord.id,
          timeIn: dtrTimeIn ? new Date(dtrTimeIn).toISOString() : null,
          timeOut: dtrTimeOut ? new Date(dtrTimeOut).toISOString() : null,
          dtrProof: dtrProofData || undefined,
          remarks: `Manual entry with DTR proof${dtrRecord.remarks ? ' | ' + dtrRecord.remarks : ''}`,
        }),
      })
      if (r.ok) {
        setDtrRecord(null)
        setDtrProofData('')
        fetchTimekeeping()
      }
    } catch { /* ignore */ }
    setDtrSaving(false)
  }

  const autoFillFromRequest = (req: EmployeeRequest) => {
    if (!dtrRecord) return
    // For leave: set both times to schedule
    const emp = dtrRecord.employee
    const dateStr = dtrRecord.date.split('T')[0]
    if (req.requestType === 'LEAVE') {
      setDtrTimeIn(`${dateStr}T${emp.scheduleIn}`)
      setDtrTimeOut(`${dateStr}T${emp.scheduleOut}`)
    } else if (req.requestType === 'UNDERTIME') {
      // Keep existing timeIn, set timeOut to current value or schedule
      if (!dtrTimeIn) setDtrTimeIn(`${dateStr}T${emp.scheduleIn}`)
    } else if (req.requestType === 'OVERTIME') {
      if (!dtrTimeIn) setDtrTimeIn(`${dateStr}T${emp.scheduleIn}`)
    }
  }

  // Helper to find approved requests for a given employee+date
  const getApprovedRequestsForRecord = (r: TimekeepingRecord) => {
    const recordDate = r.date.split('T')[0]
    return tkApprovedRequests.filter(req => {
      if (req.employeeId !== r.employeeId) return false
      if (!req.startDate || !req.endDate) return false
      const start = req.startDate.split('T')[0]
      const end = req.endDate.split('T')[0]
      return recordDate >= start && recordDate <= end
    })
  }

  const [settingsSaved, setSettingsSaved] = useState(false)
  const saveSettings = async () => {
    if (!empSettings) return
    try {
      const r = await fetch('/api/payroll/employee-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(empSettings),
      })
      if (r.ok) {
        setError('')
        setSettingsSaved(true)
        setTimeout(() => setSettingsSaved(false), 3000)
      } else {
        const d = await r.json()
        setError(d.error || 'Failed to save settings')
      }
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

  // Converts stored "HH:MM" (24-hour) strings to 12-hour AM/PM format
  const fmtHHMM = (hhmm: string | null | undefined) => {
    if (!hhmm) return '—'
    const [h, m] = hhmm.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return hhmm
    const period = h >= 12 ? 'PM' : 'AM'
    const hour12 = h % 12 || 12
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`
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
    { key: 'leave-settings', label: 'Leave Setting', icon: Star },
    { key: 'adjustments', label: 'Allowance/Deduction', icon: DollarSign },
    { key: 'holidays', label: 'Holiday Setting', icon: Calendar },
    { key: 'payslips', label: 'Payslip Generation', icon: FileText },
    { key: 'lates', label: 'Lates', icon: AlertCircle },
  ]

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1">
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium transition-all hover:bg-gray-100 active:scale-[0.97]"
            style={subTab === t.key
              ? { background: 'var(--pale-teal)', color: 'var(--deep-teal)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { color: 'var(--mid-gray)' }}>
            <t.icon size={14} /> {t.label}
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
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200" style={{ borderColor: 'var(--light-gray)' }} />
            </div>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border text-xs cursor-pointer hover:border-gray-400 transition-colors" style={{ borderColor: 'var(--light-gray)' }}>
              {EMP_DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            {canWrite && (
              <>
                <button onClick={syncEmployees} disabled={syncing}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium border transition-all hover:bg-gray-50 active:scale-[0.97]"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                  {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync from Hub
                </button>
                <button onClick={() => { setEditingId(''); setFormData({ firstName: '', lastName: '', email: '', department: 'ADMINISTRATION', branch: 'SBEA', jobTitle: '', rateType: 'DAILY', dailyRate: 0, monthlyRate: 0, scheduleIn: '08:00', scheduleOut: '17:00', daySchedules: null, restDay: 'SUNDAY' }); setShowForm(true) }}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium text-white transition-all hover:opacity-90 active:scale-[0.97]"
                  style={{ background: 'var(--teal)' }}>
                  <Plus size={13} /> Add Employee
                </button>
                {selectedEmployeeIds.size > 0 && (
                  <button onClick={() => { setBulkEditData({}); setShowBulkEditModal(true) }}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium text-white transition-all hover:opacity-90 active:scale-[0.97]"
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
                    <SortTh field="empName" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Name</SortTh>
                    <SortTh field="empDept" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Department</SortTh>
                    <SortTh field="empBranch" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Branch</SortTh>
                    <SortTh field="empJobTitle" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Job Title</SortTh>
                    <SortTh field="empRateType" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Rate Type</SortTh>
                    <SortTh field="empRate" className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Rate</SortTh>
                    <SortTh field="empBioId" className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Bio ID</SortTh>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Email</th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Phone</th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>TIN</th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>SSS</th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>PhilHealth</th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Pag-IBIG</th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Bank</th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Bank Account No.</th>
                    <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Schedule</th>
                    <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Payslips</th>
                    {canWrite && <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.length === 0 ? (
                    <tr><td colSpan={canWrite ? 20 : 18} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No employees found. Sync from CRM or add manually.</td></tr>
                  ) : sortRows(filteredEmployees, (e) => {
                    if (sortField === 'empName') return `${e.lastName} ${e.firstName}`
                    if (sortField === 'empDept') return e.department
                    if (sortField === 'empBranch') return e.branch
                    if (sortField === 'empJobTitle') return e.jobTitle
                    if (sortField === 'empRateType') return e.rateType
                    if (sortField === 'empRate') return e.rateType === 'MONTHLY' ? toNum(e.monthlyRate) : toNum(e.dailyRate)
                    if (sortField === 'empBioId') return e.employeeBioId
                    return null
                  }).map(emp => (
                    <React.Fragment key={emp.id}>
                    <tr className="border-t hover:bg-gray-50" style={{ borderColor: 'var(--light-gray)' }}>
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
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{emp.email || '—'}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{emp.phone || '—'}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{emp.tinNumber || '—'}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{emp.sssNumber || '—'}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{emp.philhealthNumber || '—'}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{emp.pagibigNumber || '—'}</td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{emp.bankName || '—'}</td>
                      <td className="px-3 py-2.5 text-xs font-mono" style={{ color: 'var(--mid-gray)' }}>{emp.bankAccountNo || '—'}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>
                        {fmtHHMM(emp.scheduleIn)} – {fmtHHMM(emp.scheduleOut)}
                        {emp.daySchedules && Object.keys(emp.daySchedules).length > 0 && (
                          <span className="ml-1 text-[10px] px-1 py-0.5 rounded" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }} title={Object.entries(emp.daySchedules).map(([d, s]) => `${d}: ${fmtHHMM((s as {in:string;out:string}).in)}–${fmtHHMM((s as {in:string;out:string}).out)}`).join(', ')}>+{Object.keys(emp.daySchedules).length} override{Object.keys(emp.daySchedules).length > 1 ? 's' : ''}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => fetchEmpPastPayslips(emp.id)}
                          className="p-2 rounded-lg hover:bg-blue-50 transition-colors active:scale-95" title="View past payslips">
                          <FileText size={14} style={{ color: expandedEmpPayslips === emp.id ? 'var(--deep-teal)' : 'var(--mid-gray)' }} />
                        </button>
                      </td>
                      {canWrite && (
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => openEditForm(emp)} className="p-2 rounded-lg hover:bg-blue-50 transition-colors active:scale-95" title="Edit employee">
                            <Pencil size={14} style={{ color: 'var(--teal)' }} />
                          </button>
                        </td>
                      )}
                    </tr>
                    {expandedEmpPayslips === emp.id && (
                      <tr className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                        <td colSpan={canWrite ? 20 : 18} className="px-4 py-3" style={{ background: '#f8fafc' }}>
                          {loadingPastPayslips ? (
                            <div className="flex items-center gap-2 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>
                              <Loader2 size={12} className="animate-spin" /> Loading payslips...
                            </div>
                          ) : empPastPayslips.length === 0 ? (
                            <p className="text-xs py-2" style={{ color: 'var(--mid-gray)' }}>No finalized payslips found for this employee.</p>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Past Payslips ({empPastPayslips.length})</p>
                              <div className="grid gap-1">
                                {empPastPayslips.map(ps => (
                                  <div key={ps.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                                    <div className="flex items-center gap-4">
                                      <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{ps.cutoffPeriod}</span>
                                      <span style={{ color: 'var(--mid-gray)' }}>{ps.branch}</span>
                                      <span className="font-mono" style={{ color: 'var(--charcoal)' }}>Net: {formatCurrency(toNum(ps.netPay))}</span>
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                        style={ps.status === 'FINAL' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>
                                        {ps.status}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {ps.pdfUrl && (
                                        <a href={ps.pdfUrl} target="_blank" rel="noopener noreferrer"
                                          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors" title="View PDF">
                                          <Eye size={12} style={{ color: 'var(--teal)' }} /> <span style={{ color: 'var(--teal)' }}>View</span>
                                        </a>
                                      )}
                                      <a href={ps.pdfUrl || '#'} download className={`flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors ${!ps.pdfUrl ? 'opacity-30 pointer-events-none' : ''}`} title="Download PDF">
                                        <Download size={12} style={{ color: 'var(--charcoal)' }} /> <span style={{ color: 'var(--charcoal)' }}>Download</span>
                                      </a>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
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
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Last Name *</label>
                    <input value={formData.lastName || ''} onChange={e => setFormData(p => ({ ...p, lastName: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Email</label>
                    <input value={formData.email || ''} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Job Title</label>
                    <input value={formData.jobTitle || ''} onChange={e => setFormData(p => ({ ...p, jobTitle: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Department *</label>
                    <select value={formData.department || ''} onChange={e => setFormData(p => ({ ...p, department: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }}>
                      {EMP_DEPARTMENTS.filter(d => d.value).map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Branch *</label>
                    <select value={formData.branch || ''} onChange={e => setFormData(p => ({ ...p, branch: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }}>
                      {BRANCHES.filter(b => b.value).map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Rate Type</label>
                    <select value={formData.rateType || 'DAILY'} onChange={e => setFormData(p => ({ ...p, rateType: e.target.value as 'DAILY' | 'MONTHLY' }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="DAILY">Daily Rate</option>
                      <option value="MONTHLY">Fixed Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>{formData.rateType === 'DAILY' ? 'Daily Rate' : 'Monthly Rate'}</label>
                    <input type="number" value={formData.rateType === 'DAILY' ? (formData.dailyRate || '') : (formData.monthlyRate || '')}
                      onChange={e => setFormData(p => formData.rateType === 'DAILY' ? { ...p, dailyRate: parseFloat(e.target.value) || 0 } : { ...p, monthlyRate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div className="col-span-full">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input type="checkbox" checked={!!formData.ignoreTimekeeping}
                        onChange={e => setFormData(p => ({ ...p, ignoreTimekeeping: e.target.checked }))}
                        className="mt-0.5 rounded" style={{ accentColor: 'var(--teal)', width: 15, height: 15 }} />
                      <span>
                        <span className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>Not dependent on biometrics</span>
                        <span className="block text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                          Payslip uses fixed half-month salary (monthly ÷ 2) regardless of attendance records. No late/undertime deductions applied.
                        </span>
                      </span>
                    </label>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Biometric ID</label>
                    <input type="number" value={formData.employeeBioId || ''} onChange={e => setFormData(p => ({ ...p, employeeBioId: parseInt(e.target.value) || null }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
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
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Default Schedule In</label>
                    <input type="time" value={formData.scheduleIn || '08:00'} onChange={e => setFormData(p => ({ ...p, scheduleIn: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Default Schedule Out</label>
                    <input type="time" value={formData.scheduleOut || '17:00'} onChange={e => setFormData(p => ({ ...p, scheduleOut: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div className="col-span-2">
                    <label className="font-medium mb-2 block" style={{ color: 'var(--charcoal)' }}>Per-Day Schedule Overrides <span className="text-xs font-normal" style={{ color: 'var(--mid-gray)' }}>(leave blank to use default)</span></label>
                    <div className="space-y-1.5">
                      {DAYS_OF_WEEK.map(day => {
                        const ds = formData.daySchedules || {}
                        const override = ds[day]
                        const hasOverride = !!override
                        return (
                          <div key={day} className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 w-28 text-xs">
                              <input type="checkbox" checked={hasOverride}
                                onChange={() => {
                                  const next = { ...ds }
                                  if (hasOverride) { delete next[day] } else { next[day] = { in: formData.scheduleIn || '08:00', out: formData.scheduleOut || '17:00' } }
                                  setFormData(p => ({ ...p, daySchedules: Object.keys(next).length > 0 ? next : null }))
                                }}
                                className="rounded" style={{ accentColor: 'var(--teal)' }} />
                              {day.charAt(0) + day.slice(1).toLowerCase()}
                            </label>
                            {hasOverride && (
                              <>
                                <input type="time" value={override.in}
                                  onChange={e => {
                                    const next = { ...ds, [day]: { ...override, in: e.target.value } }
                                    setFormData(p => ({ ...p, daySchedules: next }))
                                  }}
                                  className="px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)', width: '110px' }} />
                                <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
                                <input type="time" value={override.out}
                                  onChange={e => {
                                    const next = { ...ds, [day]: { ...override, out: e.target.value } }
                                    setFormData(p => ({ ...p, daySchedules: next }))
                                  }}
                                  className="px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)', width: '110px' }} />
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label className="font-medium mb-2 block" style={{ color: 'var(--charcoal)' }}>Holiday Schedule Overrides <span className="text-xs font-normal" style={{ color: 'var(--mid-gray)' }}>(optional — use if holiday hours differ from regular schedule)</span></label>
                    <div className="space-y-1.5">
                      {(['REGULAR_HOLIDAY', 'SPECIAL_HOLIDAY'] as const).map(key => {
                        const ds = formData.daySchedules || {}
                        const override = ds[key]
                        const hasOverride = !!override
                        const label = key === 'REGULAR_HOLIDAY' ? 'Regular Holiday' : 'Special Non-Working Holiday'
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ minWidth: '180px' }}>
                              <input type="checkbox" checked={hasOverride}
                                onChange={() => {
                                  const next = { ...ds }
                                  if (hasOverride) { delete next[key] } else { next[key] = { in: formData.scheduleIn || '08:00', out: formData.scheduleOut || '17:00' } }
                                  setFormData(p => ({ ...p, daySchedules: Object.keys(next).length > 0 ? next : null }))
                                }}
                                className="rounded" style={{ accentColor: 'var(--teal)' }} />
                              {label}
                            </label>
                            {hasOverride && (
                              <>
                                <input type="time" value={override.in}
                                  onChange={e => {
                                    const next = { ...ds, [key]: { ...override, in: e.target.value } }
                                    setFormData(p => ({ ...p, daySchedules: next }))
                                  }}
                                  className="px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)', width: '110px' }} />
                                <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
                                <input type="time" value={override.out}
                                  onChange={e => {
                                    const next = { ...ds, [key]: { ...override, out: e.target.value } }
                                    setFormData(p => ({ ...p, daySchedules: next }))
                                  }}
                                  className="px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)', width: '110px' }} />
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="col-span-2 border-t pt-3 mt-1" style={{ borderColor: 'var(--light-gray)' }}>
                    <p className="font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>Government IDs</p>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>SSS Number</label>
                    <input value={formData.sssNumber || ''} onChange={e => setFormData(p => ({ ...p, sssNumber: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>PhilHealth Number</label>
                    <input value={formData.philhealthNumber || ''} onChange={e => setFormData(p => ({ ...p, philhealthNumber: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Pag-IBIG Number</label>
                    <input value={formData.pagibigNumber || ''} onChange={e => setFormData(p => ({ ...p, pagibigNumber: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>TIN Number</label>
                    <input value={formData.tinNumber || ''} onChange={e => setFormData(p => ({ ...p, tinNumber: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
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
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">— No change —</option>
                      <option value="DAILY">Daily Rate</option>
                      <option value="MONTHLY">Fixed Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Daily Rate</label>
                    <input type="number" value={bulkEditData.dailyRate || ''} onChange={e => setBulkEditData(p => ({ ...p, dailyRate: parseFloat(e.target.value) || 0 }))}
                      placeholder="No change" className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Monthly Rate</label>
                    <input type="number" value={bulkEditData.monthlyRate || ''} onChange={e => setBulkEditData(p => ({ ...p, monthlyRate: parseFloat(e.target.value) || 0 }))}
                      placeholder="No change" className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Schedule In</label>
                    <input type="time" value={bulkEditData.scheduleIn || ''} onChange={e => setBulkEditData(p => ({ ...p, scheduleIn: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Schedule Out</label>
                    <input type="time" value={bulkEditData.scheduleOut || ''} onChange={e => setBulkEditData(p => ({ ...p, scheduleOut: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
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
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">— No change —</option>
                      {EMP_DEPARTMENTS.filter(d => d.value).map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Branch</label>
                    <select value={bulkEditData.branch || ''} onChange={e => setBulkEditData(p => ({ ...p, branch: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }}>
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
            <h4 className="text-xs font-bold mb-1" style={{ color: 'var(--charcoal)' }}>Cutoff Configuration</h4>
            <p className="text-[11px] mb-3" style={{ color: 'var(--mid-gray)' }}>
              If start day {'>'} end day (e.g. 26th to 10th), the cutoff spans from the previous month to the current month.
            </p>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>1st Cutoff Start</label>
                <input type="number" min={1} max={31} value={empSettings.cutoff1Start}
                  onChange={e => setEmpSettings(s => s ? { ...s, cutoff1Start: parseInt(e.target.value) || 1 } : s)}
                  className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>1st Cutoff End</label>
                <input type="number" min={1} max={31} value={empSettings.cutoff1End}
                  onChange={e => setEmpSettings(s => s ? { ...s, cutoff1End: parseInt(e.target.value) || 15 } : s)}
                  className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Payout Day</label>
                <input type="number" min={1} max={31} value={empSettings.payout1Day || 15}
                  onChange={e => setEmpSettings(s => s ? { ...s, payout1Day: parseInt(e.target.value) || 15 } : s)}
                  className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>2nd Cutoff Start</label>
                <input type="number" min={1} max={31} value={empSettings.cutoff2Start}
                  onChange={e => setEmpSettings(s => s ? { ...s, cutoff2Start: parseInt(e.target.value) || 16 } : s)}
                  className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>2nd Cutoff End</label>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={empSettings.cutoff2EndLastDay}
                      onChange={e => setEmpSettings(s => s ? { ...s, cutoff2EndLastDay: e.target.checked } : s)} />
                    Last day
                  </label>
                  {!empSettings.cutoff2EndLastDay && (
                    <input type="number" min={1} max={31} value={empSettings.cutoff2End}
                      onChange={e => setEmpSettings(s => s ? { ...s, cutoff2End: parseInt(e.target.value) || 30 } : s)}
                      className="w-20 px-2 py-1 rounded border" style={{ borderColor: 'var(--light-gray)' }} />
                  )}
                </div>
              </div>
              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Payout Day</label>
                <input type="number" min={1} max={31} value={empSettings.payout2Day || 30}
                  onChange={e => setEmpSettings(s => s ? { ...s, payout2Day: parseInt(e.target.value) || 30 } : s)}
                  className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>Use 0 for last day</p>
              </div>
            </div>
            {empSettings.cutoff1Start > empSettings.cutoff1End && (
              <p className="text-[11px] mt-2 px-2 py-1.5 rounded-lg" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
                1st cutoff spans months: {empSettings.cutoff1Start}th of prev month &rarr; {empSettings.cutoff1End}th of current month (payout {empSettings.payout1Day || 15}th)
              </p>
            )}
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
                    className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--light-gray)' }}>
            <h4 className="text-xs font-bold mb-3" style={{ color: 'var(--charcoal)' }}>Late & Overtime Rules</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Late Grace Period (minutes)</label>
                <input type="number" min={0} max={60} value={empSettings.lateGraceMinutes ?? 0}
                  onChange={e => setEmpSettings(s => s ? { ...s, lateGraceMinutes: parseInt(e.target.value) || 0 } : s)}
                  className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>Minutes late from time-in with no deduction (e.g. 5)</p>
              </div>
              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>OT Interval (minutes)</label>
                <input type="number" min={1} max={60} value={empSettings.otIntervalMinutes ?? 30}
                  onChange={e => setEmpSettings(s => s ? { ...s, otIntervalMinutes: parseInt(e.target.value) || 30 } : s)}
                  className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>OT counted only in full intervals (e.g. 30 = round down to nearest 30min)</p>
              </div>
              <div>
                <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Max OT per Day (hours)</label>
                <input type="number" min={0} step="0.5" value={toNum(empSettings.otMaxHours) || 3}
                  onChange={e => setEmpSettings(s => s ? { ...s, otMaxHours: parseFloat(e.target.value) || 3 } : s)}
                  className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>Maximum OT hours considered per day (e.g. 3)</p>
              </div>
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

          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--light-gray)' }}>
            <h4 className="text-xs font-bold mb-3" style={{ color: 'var(--charcoal)' }}>EE Share Deduction Timing</h4>
            <p className="text-[10px] mb-3" style={{ color: 'var(--mid-gray)' }}>When to deduct the employee share of SSS, PhilHealth, and Pag-IBIG per month:</p>
            <div className="flex flex-wrap gap-3 text-xs">
              {[
                { value: 'HALF_HALF', label: 'Half in 1st Cutoff + Half in 2nd Cutoff' },
                { value: 'FIRST_CUTOFF', label: 'Full deduction in 1st Cutoff only' },
                { value: 'SECOND_CUTOFF', label: 'Full deduction in 2nd Cutoff only' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition-colors"
                  style={{ borderColor: empSettings?.benefitDeductionTiming === opt.value ? 'var(--teal)' : 'var(--light-gray)', background: empSettings?.benefitDeductionTiming === opt.value ? 'var(--pale-teal)' : 'transparent' }}>
                  <input type="radio" name="benefitDeductionTiming" value={opt.value}
                    checked={empSettings?.benefitDeductionTiming === opt.value}
                    onChange={e => setEmpSettings(s => s ? { ...s, benefitDeductionTiming: e.target.value } : s)} />
                  <span style={{ color: 'var(--charcoal)' }}>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--light-gray)' }}>
            <h4 className="text-xs font-bold mb-3" style={{ color: 'var(--charcoal)' }}>Certificate Settings — HR Officer Name (COE/COC Signatory)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {[
                { key: 'hrOfficerNameSBEA', label: 'Sandbox East' },
                { key: 'hrOfficerNameSBGH', label: 'Sandbox Greenhills' },
                { key: 'hrOfficerNameVERDANA', label: 'Verdana Store' },
              ].map(f => (
                <div key={f.key}>
                  <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>{f.label}</label>
                  <input type="text" value={(empSettings as unknown as Record<string, string>)[f.key] || ''}
                    onChange={e => setEmpSettings(s => s ? { ...s, [f.key]: e.target.value } : s)}
                    placeholder="e.g. MARIA DELA CRUZ"
                    className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
              ))}
            </div>
            <p className="text-[10px] mt-2" style={{ color: 'var(--mid-gray)' }}>These names will appear as the signatory on Certificate of Employment and Certificate of Consultation PDFs for each branch.</p>
          </div>

          {canWrite && (
            <div className="flex items-center justify-end gap-3">
              {settingsSaved && (
                <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#16a34a' }}>
                  <CheckCircle2 size={14} /> Settings saved
                </span>
              )}
              <button onClick={saveSettings}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white transition-colors hover:opacity-80 active:scale-[0.97]" style={{ background: 'var(--teal)' }}>
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
            {canWrite && (
              <button onClick={() => setShowReqSettings(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
                style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                <Settings size={13} /> Settings
              </button>
            )}
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

          {/* Request Approval Settings Modal */}
          {showReqSettings && empSettings && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Request Approval Settings</h3>
                  <button onClick={() => setShowReqSettings(false)}><X size={16} /></button>
                </div>
                <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>
                  Positions listed below require Admin or Accountant approval. Branch admins (SBEA Admin, SBGH Admin) cannot approve requests from employees with these job titles.
                </p>
                <div className="space-y-2 mb-3">
                  {(empSettings.requestApprovalExcludedPositions || []).map((pos, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                      <span className="flex-1" style={{ color: 'var(--charcoal)' }}>{pos}</span>
                      <button onClick={() => {
                        const updated = (empSettings.requestApprovalExcludedPositions || []).filter((_, j) => j !== i)
                        setEmpSettings({ ...empSettings, requestApprovalExcludedPositions: updated })
                      }} className="text-red-400 hover:text-red-600"><X size={13} /></button>
                    </div>
                  ))}
                  {(empSettings.requestApprovalExcludedPositions || []).length === 0 && (
                    <p className="text-[10px] italic py-2" style={{ color: 'var(--mid-gray)' }}>No excluded positions. All branch admins can approve all requests.</p>
                  )}
                </div>
                <div className="relative mb-4">
                  <input type="text" value={excludedPositionInput} onChange={e => setExcludedPositionInput(e.target.value)}
                    placeholder="Search job titles..."
                    className="w-full px-3 py-2 rounded-lg border text-xs outline-none" style={{ borderColor: 'var(--light-gray)' }} />
                  {excludedPositionInput.trim() && (() => {
                    const currentExcluded = empSettings.requestApprovalExcludedPositions || []
                    const allTitles = [...new Set(employees.map(e => e.jobTitle).filter((t): t is string => !!t && t.trim() !== ''))]
                    const filtered = allTitles.filter(t =>
                      t.toLowerCase().includes(excludedPositionInput.toLowerCase()) && !currentExcluded.includes(t)
                    )
                    return filtered.length > 0 ? (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto z-10" style={{ borderColor: 'var(--light-gray)' }}>
                        {filtered.map(title => (
                          <button key={title} onClick={() => {
                            setEmpSettings({ ...empSettings, requestApprovalExcludedPositions: [...currentExcluded, title] })
                            setExcludedPositionInput('')
                          }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50" style={{ color: 'var(--charcoal)' }}>
                            {title}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 px-3 py-2 text-xs" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                        No matching job titles found
                      </div>
                    )
                  })()}
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowReqSettings(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
                  <button onClick={async () => {
                    await saveSettings()
                    setShowReqSettings(false)
                  }}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--teal)' }}>Save</button>
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
                  {reqStatusFilter === 'APPROVED' && <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr><td colSpan={(reqStatusFilter === 'PENDING' && canWrite) || reqStatusFilter === 'APPROVED' ? 6 : 5} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No {reqStatusFilter.toLowerCase()} requests</td></tr>
                ) : requests.map(r => {
                  const reqName = r.employee
                    ? `${r.employee.firstName} ${r.employee.lastName}`
                    : r.consultant?.name || '—'
                  return (
                  <tr key={r.id} className="border-t transition-colors hover:bg-gray-50/50" style={{ borderColor: 'var(--light-gray)' }}>
                    <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>{reqName}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>
                      {REQUEST_TYPES.find(t => t.value === r.requestType)?.label || r.requestType}
                      {r.leaveType && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--off-white)' }}>{LEAVE_TYPES.find(t => t.value === r.leaveType)?.label || r.leaveType}</span>}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{fmtDate(r.startDate)}{r.endDate ? ` – ${fmtDate(r.endDate)}` : ''}</td>
                    <td className="px-3 py-2.5 max-w-[200px]" style={{ color: 'var(--mid-gray)' }}>
                      {(r.requestType === 'CHANGE_TIME_IN' || r.requestType === 'CHANGE_TIME_OUT') ? (
                        <div className="space-y-0.5">
                          <span className="font-mono text-xs">{r.requestType === 'CHANGE_TIME_IN' ? r.requestedTimeIn : r.requestedTimeOut}</span>
                          {r.attachment && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">DTR attached</span>}
                          {r.reason && <div className="text-[10px] truncate">{r.reason}</div>}
                        </div>
                      ) : r.requestType === 'CHANGE_SCHEDULE' ? (
                        <div className="space-y-0.5">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: r.changeToWorkingDay ? '#dcfce7' : '#fef3c7', color: r.changeToWorkingDay ? '#059669' : '#d97706' }}>
                            → {r.changeToWorkingDay ? 'Working Day' : 'Rest Day'}
                          </span>
                          {r.changeToWorkingDay && r.requestedScheduleIn && (
                            <div className="text-[10px] font-mono">{fmtHHMM(r.requestedScheduleIn)} – {fmtHHMM(r.requestedScheduleOut)}</div>
                          )}
                          {r.reason && <div className="text-[10px] truncate">{r.reason}</div>}
                        </div>
                      ) : (
                        <span className="truncate block">{r.reason || '—'}</span>
                      )}
                    </td>
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
                    {reqStatusFilter === 'APPROVED' && (
                      <td className="px-3 py-2.5 text-center">
                        {r.requestType === 'CERTIFICATE_OF_EMPLOYMENT' && (
                          <button onClick={() => generateCoePdf(r)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium text-white mx-auto"
                            style={{ background: 'var(--teal)' }}
                            title="Generate Certificate of Employment PDF">
                            <FileDown size={12} /> Generate COE
                          </button>
                        )}
                        {r.requestType === 'CERTIFICATE_OF_CONSULTATION' && (
                          <button onClick={() => generateCocPdf(r)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium text-white mx-auto"
                            style={{ background: 'var(--teal)' }}
                            title="Generate Certificate of Consultation PDF">
                            <FileDown size={12} /> Generate COC
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
         TAB: TIMEKEEPING UPLOAD
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === 'tk-upload' && (
        <div className="space-y-4 max-w-2xl">
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--light-gray)' }}>
            <h4 className="text-sm font-bold mb-1" style={{ color: 'var(--charcoal)' }}>Upload Biometric File (.dat)</h4>
            <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>
              Upload the .dat file from your biometric device. Select the branch first.
            </p>

            {!branch && <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: '#fef3c7', color: '#78350f' }}>Please select a branch from the top filter first.</p>}

            <input ref={fileInputRef} type="file" accept=".dat,.txt,.csv" onChange={handleFileUpload}
              className="hidden" />
            <button onClick={() => { if (!branch) { setError('Please select a branch first'); return }; fileInputRef.current?.click() }} disabled={uploading}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium text-white w-full justify-center transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: uploading ? 'var(--mid-gray)' : !branch ? '#9ca3af' : 'var(--teal)' }}>
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {uploading ? 'Processing...' : 'Choose .dat File & Upload'}
            </button>
          </div>

          {uploadResult && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
              {/* Header with success indicator */}
              <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#f0fdf4' }}>
                <h4 className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#059669' }}>
                  <CheckCircle2 size={14} /> Upload Successful
                </h4>
                <button onClick={async () => {
                  if (!confirm('Delete all records from this upload?')) return
                  await fetch(`/api/payroll/timekeeping/records?uploadId=${uploadResult.uploadId}`, { method: 'DELETE' })
                  setUploadResult(null)
                }} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-red-600 hover:bg-red-50">
                  <Trash2 size={11} /> Delete Upload
                </button>
              </div>

              <div className="px-4 py-3 space-y-3">
                {/* Cutoff & Branch Detection */}
                <div className="flex flex-wrap items-center gap-2">
                  {uploadResult.branch && (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                      {BRANCHES.find(b => b.value === uploadResult.branch)?.label || uploadResult.branch}
                    </span>
                  )}
                  {uploadResult.detectedCutoff && (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: '#fae8ff', color: '#9333ea' }}>
                      Cutoff: {uploadResult.detectedCutoff.endsWith('-A') ? '1st Half' : '2nd Half'} ({uploadResult.detectedCutoff.replace(/-[AB]$/, '')})
                    </span>
                  )}
                  {uploadResult.dateFrom && uploadResult.dateTo && (
                    <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                      {uploadResult.dateFrom} to {uploadResult.dateTo}
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg p-2.5 text-center" style={{ background: 'var(--off-white)' }}>
                    <div className="font-mono font-bold text-sm" style={{ color: 'var(--charcoal)' }}>{uploadResult.recordsProcessed}</div>
                    <div style={{ color: 'var(--mid-gray)' }}>Records</div>
                  </div>
                  <div className="rounded-lg p-2.5 text-center" style={{ background: 'var(--off-white)' }}>
                    <div className="font-mono font-bold text-sm" style={{ color: 'var(--charcoal)' }}>{uploadResult.employeesIncluded || 0}</div>
                    <div style={{ color: 'var(--mid-gray)' }}>Employees</div>
                  </div>
                  <div className="rounded-lg p-2.5 text-center" style={{ background: 'var(--off-white)' }}>
                    <div className="font-mono font-bold text-sm" style={{ color: 'var(--charcoal)' }}>{uploadResult.totalRawRecords}</div>
                    <div style={{ color: 'var(--mid-gray)' }}>Raw Lines</div>
                  </div>
                </div>

                {/* Employee Coverage */}
                {uploadResult.totalBranchEmployees !== undefined && (
                  <div>
                    {uploadResult.employeesIncluded === uploadResult.totalBranchEmployees ? (
                      <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#059669' }}>
                        <CheckCircle2 size={14} /> All {uploadResult.totalBranchEmployees} employees included
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-medium mb-2" style={{ color: '#d97706' }}>
                          <AlertCircle size={14} /> {uploadResult.employeesIncluded} of {uploadResult.totalBranchEmployees} employees included
                        </div>
                        {(uploadResult.missingEmployees || []).length > 0 && (
                          <div className="rounded-lg p-3" style={{ background: '#fffbeb' }}>
                            <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#92400e' }}>Missing employees:</p>
                            <div className="space-y-1">
                              {(uploadResult.missingEmployees || []).map(e => (
                                <div key={e.id} className="flex items-center justify-between text-[11px]">
                                  <span style={{ color: '#92400e' }}>{e.name}</span>
                                  <div className="flex items-center gap-2">
                                    {e.rateType === 'MONTHLY' && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">Fixed Monthly</span>
                                    )}
                                    {!e.hasBioId && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">No Bio ID</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <p className="text-[10px] mt-2" style={{ color: '#92400e' }}>
                              Fixed Monthly employees do not need timekeeping data. Employees without Bio ID need one assigned in Employee List.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Unmatched Bio IDs */}
                {uploadResult.unmatchedBioIds.length > 0 && (
                  <div className="rounded-lg p-2.5" style={{ background: '#fff7ed' }}>
                    <span className="text-[11px] font-medium text-orange-700">Unmatched Bio IDs: </span>
                    <span className="font-mono text-[11px] text-orange-600">{uploadResult.unmatchedBioIds.join(', ')}</span>
                    <p className="text-[10px] mt-1 text-orange-600">These IDs exist in the .dat file but no employee has this Bio ID assigned.</p>
                  </div>
                )}

                {/* Conflicts */}
                {(uploadResult.conflicts || []).length > 0 && (
                  <div className="rounded-lg p-3" style={{ background: '#fef3c7' }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertCircle size={14} className="text-amber-600" />
                      <span className="text-[11px] font-semibold text-amber-800">{uploadResult.conflicts!.length} conflict(s) detected — multiple clock entries on same date</span>
                    </div>
                    <div className="space-y-1">
                      {uploadResult.conflicts!.map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px] text-amber-700">
                          <span>{c.employeeName} — {c.date}</span>
                          <span className="font-mono">{c.insCount} IN, {c.outsCount} OUT</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] mt-2 text-amber-600">Default: first IN / last OUT used. Review in Timekeeping Data to resolve.</p>
                  </div>
                )}

                {/* Missing Times */}
                {(uploadResult.missingTimes || []).length > 0 && (
                  <div className="rounded-lg p-3" style={{ background: '#fef2f2' }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertCircle size={14} className="text-red-600" />
                      <span className="text-[11px] font-semibold text-red-800">{uploadResult.missingTimes!.length} record(s) with missing time in/out</span>
                    </div>
                    <div className="space-y-1">
                      {uploadResult.missingTimes!.map((m, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px] text-red-700">
                          <span>{m.employeeName} — {m.date}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Missing {m.missing === 'timeIn' ? 'Time In' : 'Time Out'}</span>
                            {m.approvedRequests.length > 0 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                                Has approved {m.approvedRequests.map(r => r.requestType).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] mt-2 text-red-600">Set missing times manually in Timekeeping Data (DTR proof required).</p>
                  </div>
                )}

                {/* Proceed button */}
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => { setSubTab('tk-data'); if (uploadResult.dateFrom) setTkStartDate(uploadResult.dateFrom); if (uploadResult.dateTo) setTkEndDate(uploadResult.dateTo) }}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-medium text-white transition-all hover:opacity-90 active:scale-[0.97]" style={{ background: 'var(--teal)' }}>
                    <Eye size={14} /> View Timekeeping Data
                  </button>
                  <button onClick={() => setUploadResult(null)}
                    className="px-5 py-2.5 rounded-xl text-xs font-medium border transition-all hover:bg-gray-50 active:scale-[0.97]" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                    Upload Another
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Past Uploads */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
            <div className="px-4 py-3" style={{ background: 'var(--off-white)' }}>
              <h4 className="text-xs font-bold" style={{ color: 'var(--charcoal)' }}>Past Uploads</h4>
            </div>
            {pastUploads.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>No past uploads found</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--off-white)' }}>
                    <th className="text-left px-4 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>File</th>
                    <th className="text-left px-4 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Date</th>
                    <th className="text-left px-4 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Branch</th>
                    <th className="text-right px-4 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Records</th>
                    <th className="text-center px-4 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Status</th>
                    <th className="text-center px-4 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pastUploads.map(u => (
                    <tr key={u.id} className="border-t transition-colors hover:bg-gray-50/50" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>{u.fileName}</td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--mid-gray)' }}>{new Date(u.uploadDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--mid-gray)' }}>{BRANCHES.find(b => b.value === u.branch)?.label || u.branch || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{u._count.records}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{
                          background: u.status === 'FINALIZED' ? '#dcfce7' : u.status === 'ACCEPTED' ? '#fef3c7' : '#f3f4f6',
                          color: u.status === 'FINALIZED' ? '#16a34a' : u.status === 'ACCEPTED' ? '#d97706' : '#6b7280',
                        }}>{u.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canWrite && u.status === 'UPLOADED' && (
                            <button onClick={async () => {
                              await fetch('/api/payroll/timekeeping/upload-status', {
                                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ uploadId: u.id, status: 'ACCEPTED' }),
                              })
                              fetchPastUploads()
                            }} className="px-2 py-1 rounded-lg text-[10px] font-medium text-white transition-colors hover:opacity-80"
                              style={{ background: '#d97706' }} title="Accept TK Data — records will appear in Timekeeping Data">
                              Accept TK Data
                            </button>
                          )}
                          {canWrite && u.status === 'ACCEPTED' && (
                            <button onClick={async () => {
                              if (!confirm('Finalize this upload? Finalized data will be used for Payslip Generation.')) return
                              await fetch('/api/payroll/timekeeping/upload-status', {
                                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ uploadId: u.id, status: 'FINALIZED' }),
                              })
                              fetchPastUploads()
                            }} className="px-2 py-1 rounded-lg text-[10px] font-medium text-white transition-colors hover:opacity-80"
                              style={{ background: '#16a34a' }} title="Finalize TK Data — records will be used in Payslip Generation">
                              Finalize
                            </button>
                          )}
                          <button onClick={() => { setSubTab('tk-data') }}
                            className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors" title="View records" style={{ color: 'var(--teal)' }}>
                            <Eye size={14} />
                          </button>
                          {canWrite && (
                            <button onClick={async () => {
                              if (!confirm(`Delete upload "${u.fileName}" and all its ${u._count.records} records?`)) return
                              await fetch(`/api/payroll/timekeeping/records?uploadId=${u.id}`, { method: 'DELETE' })
                              fetchPastUploads()
                            }} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-red-500" title="Delete upload">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

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
            <input type="date" value={tkStartDate} onChange={e => setTkStartDate(e.target.value)}
              className="px-3 py-2.5 rounded-xl border text-xs cursor-pointer hover:border-gray-400 transition-colors" style={{ borderColor: 'var(--light-gray)' }} />
            <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>to</span>
            <input type="date" value={tkEndDate} onChange={e => setTkEndDate(e.target.value)}
              className="px-3 py-2.5 rounded-xl border text-xs cursor-pointer hover:border-gray-400 transition-colors" style={{ borderColor: 'var(--light-gray)' }} />
            <button onClick={fetchTimekeeping}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium text-white transition-all hover:opacity-90 active:scale-[0.97]" style={{ background: 'var(--teal)' }}>
              <Search size={13} /> Load
            </button>
            {canWrite && pastUploads.some(u => u.status === 'UPLOADED') && (
              <button onClick={async () => {
                if (!confirm('Accept all uploaded TK data? Accepted records will appear in the table below.')) return
                for (const u of pastUploads.filter(u => u.status === 'UPLOADED')) {
                  await fetch('/api/payroll/timekeeping/upload-status', {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uploadId: u.id, status: 'ACCEPTED' }),
                  })
                }
                fetchPastUploads()
                fetchTimekeeping()
              }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium text-white transition-all hover:opacity-80 active:scale-[0.97]" style={{ background: '#d97706' }}>
                <CheckCircle2 size={13} /> Accept TK Data
              </button>
            )}
            {canWrite && pastUploads.some(u => u.status === 'ACCEPTED') && (
              <button onClick={async (e) => {
                if (!confirm('Finalize all accepted TK data? Finalized data will be used for Payslip Generation.')) return
                const btn = e.currentTarget
                btn.disabled = true
                btn.textContent = 'Finalizing...'
                btn.style.background = '#9ca3af'
                // Find all unique uploadIds from current records that are ACCEPTED
                const uploadIds = new Set<string>()
                for (const r of tkRecords) {
                  if (r.upload?.status === 'ACCEPTED' && r.upload?.id) uploadIds.add(r.upload.id)
                }
                // Also include pastUploads with ACCEPTED status
                for (const u of pastUploads) {
                  if (u.status === 'ACCEPTED') uploadIds.add(u.id)
                }
                for (const uid of uploadIds) {
                  await fetch('/api/payroll/timekeeping/upload-status', {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uploadId: uid, status: 'FINALIZED' }),
                  })
                }
                fetchPastUploads()
                fetchTimekeeping()
                setError('')
              }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium text-white transition-all hover:opacity-80 active:scale-[0.97]" style={{ background: '#16a34a' }}>
                <CheckCircle2 size={13} /> Finalize TK Data
              </button>
            )}
            {canWrite && pastUploads.length > 0 && pastUploads.every(u => u.status === 'FINALIZED') && (
              <span className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium text-white" style={{ background: '#059669' }}>
                <CheckCircle2 size={13} /> TK Data Finalized
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--off-white)' }}>
                  <SortTh field="tkEmp" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Employee</SortTh>
                  <SortTh field="tkDate" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Date</SortTh>
                  <SortTh field="tkIn" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Time In</SortTh>
                  <SortTh field="tkOut" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Time Out</SortTh>
                  <SortTh field="tkHours" className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Hours</SortTh>
                  <SortTh field="tkLate" className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Late (min)</SortTh>
                  <SortTh field="tkUT" className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>UT (min)</SortTh>
                  <SortTh field="tkOT" className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>OT (min)</SortTh>
                  <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Flags</th>
                  <SortTh field="tkSource" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Source</SortTh>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Remarks</th>
                  {canWrite && <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {tkRecords.length === 0 ? (
                  <tr><td colSpan={canWrite ? 12 : 11} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No timekeeping records for selected period</td></tr>
                ) : sortRows(tkRecords, (r) => {
                  if (sortField === 'tkEmp') return `${r.employee.lastName} ${r.employee.firstName}`
                  if (sortField === 'tkDate') return r.date
                  if (sortField === 'tkIn') return r.timeIn
                  if (sortField === 'tkOut') return r.timeOut
                  if (sortField === 'tkHours') return toNum(r.hoursWorked)
                  if (sortField === 'tkLate') return r.lateMinutes
                  if (sortField === 'tkUT') return r.undertimeMinutes
                  if (sortField === 'tkOT') return r.overtimeMinutes
                  if (sortField === 'tkSource') return r.source
                  return null
                }).map(r => tkEditId === r.id ? (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)', background: '#f0fdf4' }}>
                    <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{r.employee.firstName} {r.employee.lastName}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{fmtDate(r.date)}</td>
                    <td className="px-2 py-1"><input type="datetime-local" value={tkEditForm.timeIn} onChange={e => setTkEditForm(f => ({ ...f, timeIn: e.target.value }))} className="px-1.5 py-1 rounded border text-xs w-[155px]" style={{ borderColor: 'var(--light-gray)' }} /></td>
                    <td className="px-2 py-1"><input type="datetime-local" value={tkEditForm.timeOut} onChange={e => setTkEditForm(f => ({ ...f, timeOut: e.target.value }))} className="px-1.5 py-1 rounded border text-xs w-[155px]" style={{ borderColor: 'var(--light-gray)' }} /></td>
                    <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: 'var(--mid-gray)' }}>auto</td>
                    <td className="px-2 py-1"><input type="number" value={tkEditForm.lateMinutes} onChange={e => setTkEditForm(f => ({ ...f, lateMinutes: e.target.value }))} className="px-1.5 py-1 rounded border text-xs text-right w-16" style={{ borderColor: 'var(--light-gray)' }} /></td>
                    <td className="px-2 py-1"><input type="number" value={tkEditForm.undertimeMinutes} onChange={e => setTkEditForm(f => ({ ...f, undertimeMinutes: e.target.value }))} className="px-1.5 py-1 rounded border text-xs text-right w-16" style={{ borderColor: 'var(--light-gray)' }} /></td>
                    <td className="px-2 py-1"><input type="number" value={tkEditForm.overtimeMinutes} onChange={e => setTkEditForm(f => ({ ...f, overtimeMinutes: e.target.value }))} className="px-1.5 py-1 rounded border text-xs text-right w-16" style={{ borderColor: 'var(--light-gray)' }} /></td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {r.isRestDay && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">Rest</span>}
                        {r.isHoliday && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">{r.holidayType === 'REGULAR' ? 'Reg Hol' : 'Spec Hol'}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[10px]" style={{ color: 'var(--mid-gray)' }}>{r.source}</td>
                    <td className="px-2 py-1"><input type="text" value={tkEditForm.remarks} onChange={e => setTkEditForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Remarks" className="px-1.5 py-1 rounded border text-xs w-24" style={{ borderColor: 'var(--light-gray)' }} /></td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={saveTkEdit} disabled={tkEditSaving} className="p-1 rounded hover:bg-green-100 text-green-600" title="Save"><Save size={14} /></button>
                        <button onClick={() => setTkEditId('')} className="p-1 rounded hover:bg-gray-100" style={{ color: 'var(--mid-gray)' }} title="Cancel"><X size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ) : (() => {
                  const isConflict = r.source === 'BIOMETRIC_CONFLICT'
                  const isFiling = r.source === 'FILING'
                  const hasMissingTime = (!r.timeIn || !r.timeOut) && (r.timeIn || r.timeOut)
                  const rowBg = isConflict ? '#fef9c3' : isFiling ? '#eff6ff' : hasMissingTime ? '#fff1f2' : undefined
                  const approvedReqs = hasMissingTime ? getApprovedRequestsForRecord(r) : []
                  return (
                  <tr key={r.id} className="border-t transition-colors hover:bg-gray-50/50" style={{ borderColor: 'var(--light-gray)', background: rowBg }}>
                    <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>{r.employee.firstName} {r.employee.lastName}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>{fmtDate(r.date)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: r.timeIn ? 'var(--charcoal)' : '#dc2626' }}>
                      {r.timeIn ? fmtTime(r.timeIn) : <span className="italic">Missing</span>}
                    </td>
                    <td className="px-3 py-2 font-mono" style={{ color: r.timeOut ? 'var(--charcoal)' : '#dc2626' }}>
                      {r.timeOut ? fmtTime(r.timeOut) : <span className="italic">Missing</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--charcoal)' }}>{toNum(r.hoursWorked).toFixed(1)}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: r.lateMinutes > 0 ? '#dc2626' : 'var(--mid-gray)' }}>{r.lateMinutes || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: r.undertimeMinutes > 0 ? '#dc2626' : 'var(--mid-gray)' }}>{r.undertimeMinutes || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: r.overtimeMinutes > 0 ? '#059669' : 'var(--mid-gray)' }}>{r.overtimeMinutes || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {r.isRestDay && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">Rest</span>}
                        {r.isHoliday && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">{r.holidayType === 'REGULAR' ? 'Reg Hol' : 'Spec Hol'}</span>}
                        {isConflict && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-200 text-amber-800">Multi-entry</span>}
                        {hasMissingTime && approvedReqs.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                            Req: {approvedReqs.map(rq => rq.requestType).join(', ')}
                          </span>
                        )}
                        {r.dtrProof && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">DTR</span>}
                        {isFiling && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">Filed</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[10px]" style={{ color: isConflict ? '#92400e' : isFiling ? '#1d4ed8' : 'var(--mid-gray)' }}>{r.source === 'BIOMETRIC_CONFLICT' ? 'CONFLICT' : r.source === 'FILING' ? 'FILING' : r.source}</td>
                    <td className="px-3 py-2 text-[10px]" style={{ color: 'var(--mid-gray)' }}>{r.remarks || '—'}</td>
                    {canWrite && (
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {isConflict && (
                            <button onClick={() => openConflictModal(r)} className="p-1 rounded hover:bg-amber-100 text-amber-600" title="Resolve conflict">
                              <AlertCircle size={13} />
                            </button>
                          )}
                          {hasMissingTime && (
                            <button onClick={() => openDtrModal(r)} className="p-1 rounded hover:bg-red-100 text-red-500" title="Set missing time">
                              <Clock size={13} />
                            </button>
                          )}
                          <button onClick={() => startTkEdit(r)} className="p-1 rounded hover:bg-blue-50" style={{ color: 'var(--teal)' }} title="Edit"><Pencil size={13} /></button>
                          <button onClick={() => deleteTkRecord(r.id)} disabled={tkDeleting === r.id} className="p-1 rounded hover:bg-red-50 text-red-500" title="Delete">
                            {tkDeleting === r.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  )
                })())}
              </tbody>
            </table>
          </div>

          {/* Conflict Resolution Modal */}
          {conflictRecord && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Resolve Time Conflict</h3>
                  <button onClick={() => setConflictRecord(null)}><X size={16} /></button>
                </div>
                <div className="mb-3">
                  <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                    <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{conflictRecord.employee.firstName} {conflictRecord.employee.lastName}</span>
                    {' '}&mdash; {fmtDate(conflictRecord.date)}
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: '#92400e' }}>
                    Multiple clock entries detected ({conflictRecord.conflictData?.totalEvents || 0} events). Select the correct Time In and Time Out.
                  </p>
                </div>

                {conflictRecord.conflictData && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--charcoal)' }}>
                        Clock IN entries ({conflictRecord.conflictData.ins.length}):
                      </label>
                      <div className="space-y-1">
                        {conflictRecord.conflictData.ins.map((ts, i) => (
                          <label key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors text-xs"
                            style={{ borderColor: conflictSelectedIn === ts ? 'var(--teal)' : 'var(--light-gray)', background: conflictSelectedIn === ts ? '#f0fdfa' : undefined }}>
                            <input type="radio" name="conflictIn" value={ts} checked={conflictSelectedIn === ts}
                              onChange={() => setConflictSelectedIn(ts)} />
                            <span className="font-mono">{fmtTime(ts)}</span>
                            <span style={{ color: 'var(--mid-gray)' }}>({new Date(ts).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })})</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--charcoal)' }}>
                        Clock OUT entries ({conflictRecord.conflictData.outs.length}):
                      </label>
                      <div className="space-y-1">
                        {conflictRecord.conflictData.outs.map((ts, i) => (
                          <label key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors text-xs"
                            style={{ borderColor: conflictSelectedOut === ts ? 'var(--teal)' : 'var(--light-gray)', background: conflictSelectedOut === ts ? '#f0fdfa' : undefined }}>
                            <input type="radio" name="conflictOut" value={ts} checked={conflictSelectedOut === ts}
                              onChange={() => setConflictSelectedOut(ts)} />
                            <span className="font-mono">{fmtTime(ts)}</span>
                            <span style={{ color: 'var(--mid-gray)' }}>({new Date(ts).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })})</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-4">
                  <button onClick={saveConflictResolution} disabled={conflictSaving || !conflictSelectedIn || !conflictSelectedOut}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--teal)' }}>
                    {conflictSaving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    Resolve Conflict
                  </button>
                  <button onClick={() => setConflictRecord(null)}
                    className="px-4 py-2.5 rounded-xl text-xs font-medium border transition-all hover:bg-gray-50"
                    style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* DTR Upload / Missing Time Modal */}
          {dtrRecord && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Set Missing Time</h3>
                  <button onClick={() => { setDtrRecord(null); setDtrProofData('') }}><X size={16} /></button>
                </div>
                <div className="mb-3">
                  <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                    <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{dtrRecord.employee.firstName} {dtrRecord.employee.lastName}</span>
                    {' '}&mdash; {fmtDate(dtrRecord.date)}
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: '#dc2626' }}>
                    {!dtrRecord.timeIn && !dtrRecord.timeOut ? 'Both Time In and Time Out are missing.' :
                     !dtrRecord.timeIn ? 'Time In is missing.' : 'Time Out is missing.'}
                  </p>
                </div>

                {/* Approved Requests */}
                {(() => {
                  const reqs = getApprovedRequestsForRecord(dtrRecord)
                  if (reqs.length === 0) return null
                  return (
                    <div className="mb-3 rounded-lg p-3" style={{ background: '#f0fdf4' }}>
                      <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#059669' }}>Approved Requests for this date:</p>
                      <div className="space-y-1">
                        {reqs.map((rq, i) => (
                          <button key={i} onClick={() => autoFillFromRequest(rq)}
                            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-xs hover:bg-green-50 transition-colors text-left"
                            style={{ borderColor: '#bbf7d0' }}>
                            <CheckCircle2 size={12} className="text-green-600 flex-shrink-0" />
                            <span className="font-medium text-green-800">{rq.requestType}{rq.leaveType ? ` (${rq.leaveType})` : ''}</span>
                            <span className="text-green-600 ml-auto text-[10px]">Click to auto-fill</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Time In</label>
                    <input type="datetime-local" value={dtrTimeIn} onChange={e => setDtrTimeIn(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200"
                      style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Time Out</label>
                    <input type="datetime-local" value={dtrTimeOut} onChange={e => setDtrTimeOut(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200"
                      style={{ borderColor: 'var(--light-gray)' }} />
                  </div>

                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>
                      DTR Photo Proof <span className="text-red-500">*</span>
                    </label>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--mid-gray)' }}>
                      Upload a photo of the Daily Time Record (DTR) as proof for manual entry.
                    </p>
                    <input ref={dtrFileRef} type="file" accept="image/*" onChange={handleDtrFileChange}
                      className="hidden" />
                    <button onClick={() => dtrFileRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium border w-full justify-center transition-all hover:bg-gray-50"
                      style={{ borderColor: dtrProofData ? '#059669' : 'var(--light-gray)', color: dtrProofData ? '#059669' : 'var(--mid-gray)' }}>
                      {dtrProofData ? <CheckCircle2 size={13} /> : <Upload size={13} />}
                      {dtrProofData ? 'DTR Photo Uploaded' : 'Choose DTR Photo'}
                    </button>
                    {dtrProofData && dtrProofData.startsWith('data:image') && (
                      <div className="mt-2 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={dtrProofData} alt="DTR Proof" className="w-full max-h-48 object-contain" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <button onClick={saveDtrEntry} disabled={dtrSaving || (!dtrTimeIn && !dtrTimeOut)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--teal)' }}>
                    {dtrSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Save Entry
                  </button>
                  <button onClick={() => { setDtrRecord(null); setDtrProofData('') }}
                    className="px-4 py-2.5 rounded-xl text-xs font-medium border transition-all hover:bg-gray-50"
                    style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
         TAB: BENEFITS SETTING
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === 'benefits' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Employee Benefits (SSS, PhilHealth, Pag-IBIG)</p>
            </div>
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
                  <SortTh field="benEmp" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Employee</SortTh>
                  <SortTh field="benSSS" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>SSS (EE / ER)</SortTh>
                  <SortTh field="benPhil" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>PhilHealth (EE / ER)</SortTh>
                  <SortTh field="benPag" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Pag-IBIG (EE / ER)</SortTh>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr><td colSpan={canWrite ? 6 : 5} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No employees</td></tr>
                ) : sortRows(filteredEmployees, (e) => {
                  if (sortField === 'benEmp') return `${e.lastName} ${e.firstName}`
                  if (sortField === 'benSSS') return toNum(e.benefits.find(b => b.benefitType === 'SSS')?.employeeShare)
                  if (sortField === 'benPhil') return toNum(e.benefits.find(b => b.benefitType === 'PHILHEALTH')?.employeeShare)
                  if (sortField === 'benPag') return toNum(e.benefits.find(b => b.benefitType === 'PAGIBIG')?.employeeShare)
                  return null
                }).map(emp => {
                  const sss = emp.benefits.find(b => b.benefitType === 'SSS')
                  const phil = emp.benefits.find(b => b.benefitType === 'PHILHEALTH')
                  const pag = emp.benefits.find(b => b.benefitType === 'PAGIBIG')
                  return (
                    <tr key={emp.id} className="border-t transition-colors hover:bg-gray-50/50" style={{ borderColor: 'var(--light-gray)' }}>
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
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="">Select employee...</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Benefit Type</label>
                    <select value={benefitType} onChange={e => setBenefitType(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }}>
                      {BENEFIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Employee Share (Monthly)</label>
                    <input type="number" value={benefitEmpShare} onChange={e => setBenefitEmpShare(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Employer Share (Monthly)</label>
                    <input type="number" value={benefitErShare} onChange={e => setBenefitErShare(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
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
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }}>
                      {BENEFIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Employee Share (Monthly)</label>
                    <input type="number" value={bulkBenefitEmpShare} onChange={e => setBulkBenefitEmpShare(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Employer Share (Monthly)</label>
                    <input type="number" value={bulkBenefitErShare} onChange={e => setBulkBenefitErShare(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
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
         TAB: LEAVE SETTING
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === 'leave-settings' && (
        <div className="space-y-4">

          {/* ── Leave Quotas ── */}
          <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Leave Quotas (days per year)</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>Set the maximum days allowed per leave type. Enter 0 for unlimited.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs" style={{ color: 'var(--mid-gray)' }}>Year</label>
                  <select value={leaveYear} onChange={e => setLeaveYear(parseInt(e.target.value))}
                    className="px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                    {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <button onClick={fetchLeaveSettings} disabled={leaveLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                  {leaveLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Refresh
                </button>
                {canWrite && (
                  <button onClick={saveLeaveMaxDays} disabled={leaveSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                    style={{ background: leaveSaved ? '#16a34a' : leaveSaving ? 'var(--mid-gray)' : 'var(--teal)' }}>
                    {leaveSaving ? <Loader2 size={12} className="animate-spin" /> : leaveSaved ? <CheckCircle2 size={12} /> : <Save size={12} />}
                    {leaveSaved ? 'Saved!' : 'Save Quotas'}
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {LEAVE_TYPES.map(lt => (
                <div key={lt.value} className="rounded-xl border p-3 space-y-1.5" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--charcoal)' }}>{lt.label}</p>
                  {canWrite ? (
                    <div className="flex items-center gap-1">
                      <input type="number" min="0" step="1"
                        value={leaveMaxDays[lt.value] ?? 0}
                        onChange={e => setLeaveMaxDays(prev => ({ ...prev, [lt.value]: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-2 py-1 rounded-lg border text-xs text-center font-mono"
                        style={{ borderColor: 'var(--light-gray)' }} />
                      <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>days</span>
                    </div>
                  ) : (
                    <p className="text-xs font-mono font-semibold" style={{ color: 'var(--teal)' }}>
                      {leaveMaxDays[lt.value] === 0 ? '∞' : `${leaveMaxDays[lt.value]} days`}
                    </p>
                  )}
                  {leaveMaxDays[lt.value] === 0 && (
                    <p className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>Unlimited</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Employee Leave Balance Table ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>
              Employee Leave Balances — {leaveYear}
              {leaveEmployees.length > 0 && <span className="font-normal ml-1" style={{ color: 'var(--mid-gray)' }}>({leaveEmployees.length} employee{leaveEmployees.length !== 1 ? 's' : ''})</span>}
            </p>

            {leaveLoading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-xs" style={{ color: 'var(--mid-gray)' }}>
                <Loader2 size={14} className="animate-spin" /> Loading...
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
                <table className="w-full text-xs" style={{ minWidth: '900px' }}>
                  <thead>
                    <tr style={{ background: 'var(--off-white)' }}>
                      <th className="text-left px-3 py-2.5 font-semibold sticky left-0 z-10" style={{ color: 'var(--charcoal)', background: 'var(--off-white)', minWidth: '160px' }}>Employee</th>
                      {LEAVE_TYPES.map(lt => (
                        <th key={lt.value} className="text-center px-2 py-2.5 font-semibold" style={{ color: 'var(--charcoal)', minWidth: '80px' }}>
                          <span className="block">{lt.value}</span>
                          <span className="block text-[10px] font-normal" style={{ color: 'var(--mid-gray)' }}>
                            {leaveMaxDays[lt.value] === 0 ? '∞' : `/${leaveMaxDays[lt.value]}d`}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leaveEmployees.length === 0 ? (
                      <tr><td colSpan={LEAVE_TYPES.length + 1} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No employees found for this branch.</td></tr>
                    ) : leaveEmployees.map(emp => (
                      <tr key={emp.id} className="border-t hover:bg-gray-50/50" style={{ borderColor: 'var(--light-gray)' }}>
                        <td className="px-3 py-2.5 font-medium sticky left-0 bg-white" style={{ color: 'var(--charcoal)' }}>
                          {emp.firstName} {emp.lastName}
                          <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>{emp.branch}</span>
                        </td>
                        {LEAVE_TYPES.map(lt => {
                          const used = emp.used[lt.value] || 0
                          const max = leaveMaxDays[lt.value] ?? 0
                          const remaining = emp.remaining[lt.value] ?? 0
                          const isUnlimited = max === 0
                          const pct = isUnlimited ? 0 : max > 0 ? used / max : 0
                          const bgColor = isUnlimited ? 'var(--off-white)'
                            : used === 0 ? '#f0fdf4'
                            : pct >= 1 ? '#fef2f2'
                            : pct >= 0.7 ? '#fffbeb'
                            : '#f0fdf4'
                          const textColor = isUnlimited ? 'var(--mid-gray)'
                            : used === 0 ? '#15803d'
                            : pct >= 1 ? '#dc2626'
                            : pct >= 0.7 ? '#d97706'
                            : '#15803d'
                          return (
                            <td key={lt.value} className="px-2 py-2.5 text-center">
                              {isUnlimited ? (
                                <span className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>—</span>
                              ) : (
                                <span className="inline-flex flex-col items-center gap-0.5">
                                  <span className="px-2 py-0.5 rounded-lg text-[11px] font-semibold font-mono"
                                    style={{ background: bgColor, color: textColor }}>
                                    {remaining}d left
                                  </span>
                                  {used > 0 && (
                                    <span className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>{used} used</span>
                                  )}
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
         TAB: ALLOWANCE/DEDUCTION
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === 'adjustments' && (
        <div className="space-y-3">
          <div className="flex items-center flex-wrap gap-2">
            <button onClick={async () => {
              if (!branch) return
              setAdjLoading(true)
              const cp = cutoffPeriod
              try {
                // Fetch ALL employees for this branch (not filtered by search/dept)
                const allBranchEmps: Employee[] = await (await fetch(`/api/payroll/employees?branch=${branch}`)).json()
                const r = await fetch(`/api/payroll/cutoff-adjustments?cutoffPeriod=${cp}&branch=${branch}`)
                const data = await r.json()
                const existing = Array.isArray(data) ? data : []
                // Group existing adjustments by employee (multiple rows per employee)
                const existByEmp = new Map<string, { allowance: number; allowanceType: string; allowanceLabel: string; deduction: number; deductionLabel: string }[]>()
                for (const a of existing) {
                  if (!existByEmp.has(a.employeeId)) existByEmp.set(a.employeeId, [])
                  existByEmp.get(a.employeeId)!.push(a)
                }
                const rows: AdjustmentRow[] = []
                let rk = 0
                for (const emp of allBranchEmps) {
                  const empAdjs = existByEmp.get(emp.id)
                  if (empAdjs && empAdjs.length > 0) {
                    for (const ex of empAdjs) {
                      rows.push({
                        employeeId: emp.id,
                        employeeName: `${emp.firstName} ${emp.lastName}`,
                        allowance: toNum(ex.allowance),
                        allowanceType: ex.allowanceType || 'NON_TAXABLE',
                        allowanceLabel: ex.allowanceLabel || '',
                        deduction: toNum(ex.deduction),
                        deductionLabel: ex.deductionLabel || '',
                        rowKey: `r${rk++}`,
                      })
                    }
                  } else {
                    rows.push({
                      employeeId: emp.id,
                      employeeName: `${emp.firstName} ${emp.lastName}`,
                      allowance: 0, allowanceType: 'NON_TAXABLE', allowanceLabel: '',
                      deduction: 0, deductionLabel: '',
                      rowKey: `r${rk++}`,
                    })
                  }
                }
                setAdjRows(rows)
                setAdjSaved(false)
              } catch { /* ignore */ }
              setAdjLoading(false)
            }} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium text-white transition-all hover:opacity-90" style={{ background: 'var(--teal)' }}>
              <Search size={13} /> Load
            </button>
            <button onClick={async () => {
              if (!branch) return
              setAdjLoading(true)
              const cp = cutoffPeriod
              try {
                // Fetch ALL employees for this branch
                const allBranchEmps: Employee[] = await (await fetch(`/api/payroll/employees?branch=${branch}`)).json()
                const r = await fetch(`/api/payroll/cutoff-adjustments?cutoffPeriod=${cp}&branch=${branch}`, { method: 'PUT' })
                const data = await r.json()
                const prevByEmp = new Map<string, { allowance: number; allowanceType: string; allowanceLabel: string; deduction: number; deductionLabel: string }[]>()
                for (const a of (data.adjustments || [])) {
                  if (!prevByEmp.has(a.employeeId)) prevByEmp.set(a.employeeId, [])
                  prevByEmp.get(a.employeeId)!.push(a)
                }
                const rows: AdjustmentRow[] = []
                let rk = 0
                for (const emp of allBranchEmps) {
                  const empAdjs = prevByEmp.get(emp.id)
                  if (empAdjs && empAdjs.length > 0) {
                    for (const ex of empAdjs) {
                      rows.push({
                        employeeId: emp.id,
                        employeeName: `${emp.firstName} ${emp.lastName}`,
                        allowance: toNum(ex.allowance),
                        allowanceType: ex.allowanceType || 'NON_TAXABLE',
                        allowanceLabel: ex.allowanceLabel || '',
                        deduction: toNum(ex.deduction),
                        deductionLabel: ex.deductionLabel || '',
                        rowKey: `r${rk++}`,
                      })
                    }
                  } else {
                    rows.push({
                      employeeId: emp.id,
                      employeeName: `${emp.firstName} ${emp.lastName}`,
                      allowance: 0, allowanceType: 'NON_TAXABLE', allowanceLabel: '',
                      deduction: 0, deductionLabel: '',
                      rowKey: `r${rk++}`,
                    })
                  }
                }
                setAdjRows(rows)
                setAdjSaved(false)
              } catch { /* ignore */ }
              setAdjLoading(false)
            }} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all hover:opacity-80" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
              <Download size={13} /> Pre-fill from Previous
            </button>
          </div>

          {adjLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--teal)' }} /></div>
          ) : adjRows.length === 0 ? (
            <p className="text-center py-8 text-xs" style={{ color: 'var(--mid-gray)' }}>Select a branch and click Load to view adjustments for this cutoff.</p>
          ) : (
            <>
              {selectedAdjEmpIds.size > 0 && canWrite && (
                <div className="flex items-center gap-2">
                  <button onClick={() => { setBulkAdj({}); setShowBulkAdjModal(true) }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white" style={{ background: '#7c3aed' }}>
                    <DollarSign size={13} /> Set for Selected ({selectedAdjEmpIds.size})
                  </button>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--off-white)' }}>
                      {canWrite && (
                        <th className="text-center px-2 py-2.5">
                          <input type="checkbox" checked={adjRows.length > 0 && selectedAdjEmpIds.size === adjRows.length}
                            onChange={() => {
                              if (selectedAdjEmpIds.size === adjRows.length) setSelectedAdjEmpIds(new Set())
                              else setSelectedAdjEmpIds(new Set(adjRows.map(r => r.employeeId)))
                            }} />
                        </th>
                      )}
                      <SortTh field="adjEmp" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Employee</SortTh>
                      <SortTh field="adjAllow" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Allowance</SortTh>
                      <SortTh field="adjType" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Type</SortTh>
                      <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Allowance Label</th>
                      <SortTh field="adjDed" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Deduction</SortTh>
                      <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Deduction Label</th>
                      {canWrite && <th className="px-2 py-2.5 w-8"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const sorted = sortRows(adjRows, (r) => {
                        if (sortField === 'adjEmp') return r.employeeName
                        if (sortField === 'adjAllow') return r.allowance
                        if (sortField === 'adjType') return r.allowanceType
                        if (sortField === 'adjDed') return r.deduction
                        return null
                      })
                      // Track which employee names have already been shown
                      const shownEmps = new Set<string>()
                      return sorted.map((row) => {
                        const actualIdx = adjRows.findIndex(r => r.rowKey === row.rowKey)
                        const updateRow = (field: string, value: unknown) => {
                          setAdjRows(prev => prev.map(r => r.rowKey === row.rowKey ? { ...r, [field]: value } : r))
                          setAdjSaved(false)
                        }
                        const isFirstForEmp = !shownEmps.has(row.employeeId)
                        if (isFirstForEmp) shownEmps.add(row.employeeId)
                        const empRowCount = adjRows.filter(r => r.employeeId === row.employeeId).length
                        return (
                          <tr key={row.rowKey} className="border-t transition-colors hover:bg-gray-50/50" style={{ borderColor: 'var(--light-gray)' }}>
                            {canWrite && (
                              <td className="text-center px-2 py-2">
                                {isFirstForEmp && (
                                  <input type="checkbox" checked={selectedAdjEmpIds.has(row.employeeId)}
                                    onChange={() => {
                                      const next = new Set(selectedAdjEmpIds)
                                      if (next.has(row.employeeId)) next.delete(row.employeeId); else next.add(row.employeeId)
                                      setSelectedAdjEmpIds(next)
                                    }} />
                                )}
                              </td>
                            )}
                            <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>
                              {isFirstForEmp ? (row.employeeName || row.employeeId) : ''}
                            </td>
                            <td className="px-2 py-1">
                              <input type="number" min={0} step="0.01" value={row.allowance || ''} onChange={e => updateRow('allowance', parseFloat(e.target.value) || 0)}
                                className="w-24 px-2 py-1.5 rounded border text-xs text-right" style={{ borderColor: 'var(--light-gray)' }} />
                            </td>
                            <td className="px-2 py-1">
                              <select value={row.allowanceType} onChange={e => updateRow('allowanceType', e.target.value)}
                                className="px-2 py-1.5 rounded border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                                <option value="NON_TAXABLE">Non-Taxable</option>
                                <option value="TAXABLE">Taxable</option>
                              </select>
                            </td>
                            <td className="px-2 py-1">
                              <input type="text" value={row.allowanceLabel} onChange={e => updateRow('allowanceLabel', e.target.value)}
                                placeholder="e.g. De Minimis"
                                className="w-28 px-2 py-1.5 rounded border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
                            </td>
                            <td className="px-2 py-1">
                              <input type="number" min={0} step="0.01" value={row.deduction || ''} onChange={e => updateRow('deduction', parseFloat(e.target.value) || 0)}
                                className="w-24 px-2 py-1.5 rounded border text-xs text-right" style={{ borderColor: 'var(--light-gray)' }} />
                            </td>
                            <td className="px-2 py-1">
                              <input type="text" value={row.deductionLabel} onChange={e => updateRow('deductionLabel', e.target.value)}
                                placeholder="e.g. Cash Advance"
                                className="w-28 px-2 py-1.5 rounded border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
                            </td>
                            {canWrite && (
                              <td className="px-1 py-1">
                                <div className="flex items-center gap-0.5">
                                  {isFirstForEmp && (
                                    <button onClick={() => {
                                      const newRow: AdjustmentRow = {
                                        employeeId: row.employeeId,
                                        employeeName: row.employeeName,
                                        allowance: 0, allowanceType: 'NON_TAXABLE', allowanceLabel: '',
                                        deduction: 0, deductionLabel: '',
                                        rowKey: `r${Date.now()}`,
                                      }
                                      // Insert after last row of this employee
                                      const lastIdx = adjRows.reduce((acc, r, i) => r.employeeId === row.employeeId ? i : acc, actualIdx)
                                      setAdjRows(prev => [...prev.slice(0, lastIdx + 1), newRow, ...prev.slice(lastIdx + 1)])
                                      setAdjSaved(false)
                                    }} className="p-0.5 rounded hover:bg-green-50" title="Add another line">
                                      <Plus size={13} className="text-green-600" />
                                    </button>
                                  )}
                                  {empRowCount > 1 && (
                                    <button onClick={() => {
                                      setAdjRows(prev => prev.filter(r => r.rowKey !== row.rowKey))
                                      setAdjSaved(false)
                                    }} className="p-0.5 rounded hover:bg-red-50" title="Remove this line">
                                      <X size={13} className="text-red-400" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              </div>

              {canWrite && (
                <div className="flex items-center justify-end gap-3">
                  {adjSaved && (
                    <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#16a34a' }}>
                      <CheckCircle2 size={14} /> Saved
                    </span>
                  )}
                  <button onClick={async () => {
                    setAdjSaving(true)
                    const cp = cutoffPeriod
                    try {
                      await fetch('/api/payroll/cutoff-adjustments', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ cutoffPeriod: cp, branch, adjustments: adjRows }),
                      })
                      setAdjSaved(true)
                    } catch { setError('Failed to save adjustments') }
                    setAdjSaving(false)
                  }} disabled={adjSaving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white transition-colors hover:opacity-80 active:scale-[0.97]"
                    style={{ background: 'var(--teal)' }}>
                    {adjSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Adjustments
                  </button>
                </div>
              )}
            </>
          )}

          {/* Bulk Adjustment Modal */}
          {showBulkAdjModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowBulkAdjModal(false)}>
              <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--charcoal)' }}>Bulk Set Allowance/Deduction</h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-medium mb-1 block">Allowance Amount</label>
                    <input type="number" min={0} step="0.01" value={bulkAdj.allowance || ''} onChange={e => setBulkAdj(prev => ({ ...prev, allowance: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block">Type</label>
                    <select value={bulkAdj.allowanceType || 'NON_TAXABLE'} onChange={e => setBulkAdj(prev => ({ ...prev, allowanceType: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
                      <option value="NON_TAXABLE">Non-Taxable</option>
                      <option value="TAXABLE">Taxable</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block">Allowance Label</label>
                    <input type="text" value={bulkAdj.allowanceLabel || ''} onChange={e => setBulkAdj(prev => ({ ...prev, allowanceLabel: e.target.value }))}
                      placeholder="e.g. De Minimis"
                      className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block">Deduction Amount</label>
                    <input type="number" min={0} step="0.01" value={bulkAdj.deduction || ''} onChange={e => setBulkAdj(prev => ({ ...prev, deduction: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block">Deduction Label</label>
                    <input type="text" value={bulkAdj.deductionLabel || ''} onChange={e => setBulkAdj(prev => ({ ...prev, deductionLabel: e.target.value }))}
                      placeholder="e.g. Cash Advance"
                      className="w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowBulkAdjModal(false)} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ color: 'var(--mid-gray)' }}>Cancel</button>
                  <button onClick={() => {
                    setAdjRows(prev => prev.map(r => selectedAdjEmpIds.has(r.employeeId) ? {
                      ...r,
                      allowance: bulkAdj.allowance ?? r.allowance,
                      allowanceType: bulkAdj.allowanceType || r.allowanceType,
                      allowanceLabel: bulkAdj.allowanceLabel ?? r.allowanceLabel,
                      deduction: bulkAdj.deduction ?? r.deduction,
                      deductionLabel: bulkAdj.deductionLabel ?? r.deductionLabel,
                    } : r))
                    setAdjSaved(false)
                    setShowBulkAdjModal(false)
                  }} className="px-4 py-2 rounded-lg text-xs font-medium text-white" style={{ background: '#7c3aed' }}>
                    Apply to Selected
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
          <div className="flex items-center gap-2 flex-wrap">
            <select value={holidayYear} onChange={e => setHolidayYear(parseInt(e.target.value))}
              className="px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select value={holidayBranchFilter} onChange={e => setHolidayBranchFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
              <option value="">All Branches</option>
              <option value="SBEA">SBEA</option>
              <option value="SBGH">SBGH</option>
              <option value="VERDANA">Verdana</option>
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
                  <SortTh field="holDate" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Date</SortTh>
                  <SortTh field="holName" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Holiday</SortTh>
                  <SortTh field="holType" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Type</SortTh>
                  <SortTh field="holBranch" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Branch</SortTh>
                  <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Recurring</th>
                  {canWrite && <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}></th>}
                </tr>
              </thead>
              <tbody>
                {holidays.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No holidays for {holidayYear}</td></tr>
                ) : sortRows(holidays, (h) => {
                  if (sortField === 'holDate') return h.date
                  if (sortField === 'holName') return h.name
                  if (sortField === 'holType') return h.holidayType
                  if (sortField === 'holBranch') return h.branch
                  return null
                }).map(h => (
                  <tr key={h.id} className="border-t transition-colors hover:bg-gray-50/50" style={{ borderColor: 'var(--light-gray)' }}>
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
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Date *</label>
                    <input type="date" value={holidayForm.date} onChange={e => setHolidayForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }} />
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Type *</label>
                    <select value={holidayForm.holidayType} onChange={e => setHolidayForm(f => ({ ...f, holidayType: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }}>
                      {HOLIDAY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-medium mb-1 block" style={{ color: 'var(--charcoal)' }}>Branch</label>
                    <select value={holidayForm.branch} onChange={e => setHolidayForm(f => ({ ...f, branch: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-200 hover:border-gray-400" style={{ borderColor: 'var(--light-gray)' }}>
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
          {(() => {
            const allLocked = payslips.length > 0 && payslips.every(p => p.status === 'LOCKED')
            return (
          <div className="flex items-center flex-wrap gap-2">
            {canWrite && !allLocked && (
              <>
                <button onClick={generatePayslips} disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white"
                  style={{ background: generating ? 'var(--mid-gray)' : 'var(--teal)' }}>
                  {generating ? <Loader2 size={13} className="animate-spin" /> : <DollarSign size={13} />}
                  {payslips.length > 0 ? 'Regenerate All' : 'Generate Payslips'}
                </button>
                <button onClick={createBankFile}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border"
                  style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                  <Download size={13} /> Create Bank File
                </button>
                {payslips.some(p => p.status === 'DRAFT') && (
                  <button onClick={finalizePayslips}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border"
                    style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                    <CheckCircle2 size={13} /> Finalize All
                  </button>
                )}
                {payslips.length > 0 && payslips.every(p => p.status === 'FINAL') && (
                  <button onClick={lockAndFinalizeEmployees} disabled={lockingPayroll}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                    style={{ background: '#dc2626' }}>
                    {lockingPayroll ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
                    {lockingPayroll ? 'Locking...' : 'Lock & Finalize Payroll'}
                  </button>
                )}
              </>
            )}
            {canWrite && allLocked && (
              <button onClick={unlockEmployeePayroll} disabled={unlockingPayroll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border disabled:opacity-50"
                style={{ borderColor: '#4338ca', color: '#4338ca' }}>
                {unlockingPayroll ? <Loader2 size={13} className="animate-spin" /> : <ShieldOff size={13} />}
                {unlockingPayroll ? 'Unlocking...' : 'Unlock Payroll'}
              </button>
            )}
            {payslips.length > 0 && (
              <button onClick={downloadAllPayslipPdfs} disabled={downloadingAllPdfs}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border disabled:opacity-50"
                style={{ borderColor: 'var(--charcoal)', color: 'var(--charcoal)' }}>
                {downloadingAllPdfs ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
                {downloadingAllPdfs ? 'Generating...' : 'Download All PDFs'}
              </button>
            )}
            {payslips.length > 0 && (
              <button onClick={emailAllPayslips} disabled={emailingAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: '#7c3aed' }}>
                {emailingAll ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                {emailingAll ? 'Sending...' : 'Email All'}
              </button>
            )}
            {payslips.length > 0 && (
              <button onClick={generateEmployeePayreg} disabled={generatingPayreg}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border disabled:opacity-50"
                style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                {generatingPayreg ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                {generatingPayreg ? 'Generating...' : 'Generate Payreg'}
              </button>
            )}
          </div>
            )
          })()}

          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            Cutoff: {MONTHS[cutoffMonth - 1]} {cutoffYear} — {cutoffHalf === 1 ? '1st Half' : '2nd Half'}
            {payslips.length > 0 && ` • ${payslips.length} payslip(s)`}
          </p>

          {/* Payslip Table */}
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--off-white)' }}>
                  <SortTh field="psEmp" className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Employee</SortTh>
                  <SortTh field="psDays" className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Days</SortTh>
                  <SortTh field="psBasic" className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Basic</SortTh>
                  <SortTh field="psOT" className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>OT</SortTh>
                  <SortTh field="psHoliday" className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Holiday</SortTh>
                  <SortTh field="psGross" className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Gross</SortTh>
                  <SortTh field="psDed" className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Deductions</SortTh>
                  <SortTh field="psTax" className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Tax</SortTh>
                  <SortTh field="psNet" className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Net Pay</SortTh>
                  <SortTh field="psStatus" className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Status</SortTh>
                  {canWrite && <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}></th>}
                  <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}></th>
                </tr>
              </thead>
              <tbody>
                {payslips.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-8" style={{ color: 'var(--mid-gray)' }}>No payslips generated for this period. Click &quot;Generate Payslips&quot; to compute.</td></tr>
                ) : sortRows(payslips, (p) => {
                  if (sortField === 'psEmp') return `${p.employee.lastName} ${p.employee.firstName}`
                  if (sortField === 'psDays') return toNum(p.daysWorked)
                  if (sortField === 'psBasic') return toNum(p.basicPay)
                  if (sortField === 'psOT') return toNum(p.overtimePay)
                  if (sortField === 'psHoliday') return toNum(p.holidayPay)
                  if (sortField === 'psGross') return toNum(p.grossPay)
                  if (sortField === 'psDed') return toNum(p.totalDeductions)
                  if (sortField === 'psTax') return toNum(p.taxDeduction)
                  if (sortField === 'psNet') return toNum(p.netPay)
                  if (sortField === 'psStatus') return p.status
                  return null
                }).map(p => (
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
                      <td className="px-3 py-2.5 text-right font-mono" style={{ color: '#d97706' }}>{formatCurrency(toNum(p.taxDeduction))}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(toNum(p.netPay))}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: p.status === 'LOCKED' ? '#e0e7ff' : p.status === 'FINAL' ? '#dcfce7' : '#fef3c7', color: p.status === 'LOCKED' ? '#4338ca' : p.status === 'FINAL' ? '#059669' : '#d97706' }}>
                          {p.status}
                        </span>
                      </td>
                      {canWrite && (
                        <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex flex-col items-center gap-1">
                          {p.status !== 'LOCKED' && (
                            <button onClick={() => regeneratePayslip(p)} disabled={regeneratingId === p.id || togglingTaxId === p.id}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border transition-all hover:opacity-80 disabled:opacity-40"
                              style={{ borderColor: '#0d9488', color: '#0d9488' }}
                              title="Re-run computation from latest timekeeping data">
                              {regeneratingId === p.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                              {regeneratingId === p.id ? '…' : 'Regen'}
                            </button>
                          )}
                          {p.status !== 'LOCKED' && cutoffPeriod.endsWith('-1') && (
                            <button onClick={() => toggleComputeTaxNow(p)} disabled={togglingTaxId === p.id || regeneratingId === p.id}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border transition-all hover:opacity-80 disabled:opacity-40"
                              style={{ borderColor: p.computeTaxNow ? '#d97706' : '#9ca3af', color: p.computeTaxNow ? '#d97706' : '#9ca3af', background: p.computeTaxNow ? '#fef3c7' : 'transparent' }}
                              title={p.computeTaxNow ? 'Withholding tax is being deducted this cutoff (click to remove)' : 'Click to compute withholding tax now (for resignations)'}>
                              {togglingTaxId === p.id ? <Loader2 size={11} className="animate-spin" /> : <DollarSign size={11} />}
                              {p.computeTaxNow ? 'Tax ON' : 'Tax OFF'}
                            </button>
                          )}
                          </div>
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-center">
                        {expandedPayslip === p.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                    </tr>
                    {expandedPayslip === p.id && (
                      <tr key={`${p.id}-detail`}>
                        <td colSpan={canWrite ? 12 : 11} className="px-6 py-4" style={{ background: 'var(--off-white)' }}>
                          <div className="grid grid-cols-3 gap-4 text-xs">
                            <div>
                              <p className="font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Earnings</p>
                              <div className="space-y-1">
                                {/* Clickable earning items — click label to see daily breakdown */}
                                {([
                                  { key: 'basicPay', label: 'Basic Pay', value: p.basicPay },
                                  { key: 'overtimePay', label: 'Overtime', value: p.overtimePay },
                                  { key: 'holidayPay', label: 'Holiday Pay', value: p.holidayPay },
                                  { key: 'nightDiffPay', label: 'Night Diff', value: p.nightDiffPay },
                                  { key: 'restDayPay', label: 'Rest Day', value: p.restDayPay },
                                ] as const).map(item => (
                                  <div key={item.key} className="flex justify-between items-center">
                                    <button
                                      onClick={e => { e.stopPropagation(); setBreakdownModal({ payslip: p, type: item.key }) }}
                                      className="flex items-center gap-1 text-left hover:underline"
                                      style={{ color: 'var(--teal)' }}
                                      title="Click to see daily breakdown">
                                      {item.label}
                                      <Eye size={10} style={{ opacity: 0.6 }} />
                                    </button>
                                    <span className="font-mono">{formatCurrency(toNum(item.value))}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between border-t pt-1 font-bold" style={{ borderColor: 'var(--light-gray)' }}><span>Gross Pay</span><span className="font-mono">{formatCurrency(toNum(p.grossPay))}</span></div>
                              </div>
                            </div>
                            <div>
                              <p className="font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Deductions</p>
                              <div className="space-y-1">
                                <div className="flex justify-between"><span>SSS</span><span className="font-mono">{formatCurrency(toNum(p.sssDeduction))}</span></div>
                                <div className="flex justify-between"><span>PhilHealth</span><span className="font-mono">{formatCurrency(toNum(p.philhealthDeduction))}</span></div>
                                <div className="flex justify-between"><span>Pag-IBIG</span><span className="font-mono">{formatCurrency(toNum(p.pagibigDeduction))}</span></div>
                                <div className="flex justify-between items-center">
                                  <span>
                                    Tax
                                    {cutoffPeriod.endsWith('-1') && !p.computeTaxNow && (
                                      <span className="ml-1 text-[9px]" style={{ color: '#9ca3af' }}>(deducted on 2nd cutoff)</span>
                                    )}
                                  </span>
                                  <span className="font-mono">{formatCurrency(toNum(p.taxDeduction))}</span>
                                </div>
                                <div className="flex justify-between"><span>Undertime</span><span className="font-mono">{formatCurrency(toNum(p.undertimeDeduction))}</span></div>
                                <div className="flex justify-between border-t pt-1 font-bold" style={{ borderColor: 'var(--light-gray)' }}><span>Total</span><span className="font-mono">{formatCurrency(toNum(p.totalDeductions))}</span></div>
                              </div>
                            </div>
                            <div>
                              <p className="font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Summary</p>
                              <div className="space-y-1">
                                {([
                                  { key: 'daysWorked' as const, label: 'Days Worked', value: toNum(p.daysWorked).toFixed(0) },
                                  { key: 'hoursWorked' as const, label: 'Hours Worked', value: (() => { const m = Math.round(toNum(p.hoursWorked) * 60); const h = Math.floor(m / 60); return `${h}h ${String(m % 60).padStart(2,'0')}m` })() },
                                  { key: 'otHours' as const, label: 'OT Hours', value: (() => { const m = Math.round(toNum(p.overtimeHours) * 60); const h = Math.floor(m / 60); return m > 0 ? `${h}h ${String(m % 60).padStart(2,'0')}m` : '—' })() },
                                  { key: 'late' as const, label: 'Late', value: (() => { const tot = toNum(p.lateMinutes); if (!tot) return '—'; const h = Math.floor(tot / 60); const m = tot % 60; return h > 0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m` })() },
                                  { key: 'undertime' as const, label: 'Undertime', value: (() => { const tot = toNum(p.undertimeMinutes); if (!tot) return '—'; const h = Math.floor(tot / 60); const m = tot % 60; return h > 0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m` })() },
                                ]).map(item => (
                                  <div key={item.key} className="flex justify-between items-center">
                                    <button
                                      onClick={e => { e.stopPropagation(); setBreakdownModal({ payslip: p, type: item.key }) }}
                                      className="flex items-center gap-1 text-left hover:underline"
                                      style={{ color: 'var(--teal)' }}
                                      title="Click to see daily breakdown">
                                      {item.label}
                                      <Eye size={10} style={{ opacity: 0.6 }} />
                                    </button>
                                    <span className="font-mono">{item.value}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between"><span>Rate Type</span><span>{p.employee.rateType === 'DAILY' ? 'Daily' : 'Monthly'}</span></div>
                                <div className="flex justify-between"><span>Rate</span><span className="font-mono">{formatCurrency(toNum(p.employee.rateType === 'DAILY' ? p.employee.dailyRate : p.employee.monthlyRate))}</span></div>
                              </div>
                            </div>
                          </div>
                          {/* PDF, Email & Regenerate Actions */}
                          <div className="flex items-center gap-2 mt-4 pt-3 border-t flex-wrap" style={{ borderColor: 'var(--light-gray)' }}>
                            {canWrite && p.status !== 'LOCKED' && (
                              <button onClick={e => { e.stopPropagation(); regeneratePayslip(p) }} disabled={regeneratingId === p.id || togglingTaxId === p.id}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border disabled:opacity-50 transition-all hover:opacity-90"
                                style={{ borderColor: '#0d9488', color: '#0d9488' }}
                                title="Re-run computation from latest timekeeping and schedule data">
                                {regeneratingId === p.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                                {regeneratingId === p.id ? 'Regenerating…' : 'Regenerate Payslip'}
                              </button>
                            )}
                            {canWrite && p.status !== 'LOCKED' && cutoffPeriod.endsWith('-1') && (
                              <button onClick={e => { e.stopPropagation(); toggleComputeTaxNow(p) }} disabled={togglingTaxId === p.id || regeneratingId === p.id}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border disabled:opacity-50 transition-all hover:opacity-90"
                                style={{ borderColor: p.computeTaxNow ? '#d97706' : '#9ca3af', color: p.computeTaxNow ? '#d97706' : '#6b7280', background: p.computeTaxNow ? '#fef3c7' : 'transparent' }}
                                title={p.computeTaxNow ? 'Withholding tax computed this cutoff — click to remove (will set tax back to ₱0)' : 'Compute withholding tax now (use for resignations — employee will not receive a 2nd cutoff)'}>
                                {togglingTaxId === p.id ? <Loader2 size={13} className="animate-spin" /> : <DollarSign size={13} />}
                                {togglingTaxId === p.id ? 'Computing…' : p.computeTaxNow ? 'Compute WHT Now: ON' : 'Compute WHT Now: OFF'}
                              </button>
                            )}
                            <button onClick={() => downloadPayslipPdf(p)} disabled={pdfGenerating === p.id}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white transition-all hover:opacity-90 active:scale-[0.97]"
                              style={{ background: 'var(--teal)' }}>
                              {pdfGenerating === p.id ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
                              Download PDF
                            </button>
                            <button onClick={() => emailPayslip(p)} disabled={emailSending === p.id || !p.employee.email || emailSent[p.id]}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white transition-all hover:opacity-90 active:scale-[0.97]"
                              style={{ background: emailSent[p.id] ? '#059669' : p.employee.email ? '#7c3aed' : '#9ca3af' }}
                              title={p.employee.email ? `Email to ${p.employee.email}` : 'No email address'}>
                              {emailSending === p.id ? <Loader2 size={13} className="animate-spin" /> : emailSent[p.id] ? <CheckCircle2 size={13} /> : <Mail size={13} />}
                              {emailSent[p.id] ? 'Sent' : 'Email Employee'}
                            </button>
                            {p.pdfUrl && (
                              <a href={p.pdfUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium border transition-all hover:bg-gray-50"
                                style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                                <Eye size={13} /> View Stored PDF
                              </a>
                            )}
                            {!p.employee.email && <span className="text-[10px]" style={{ color: '#d97706' }}>No email on file</span>}
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
                    <td className="px-3 py-2.5 text-right font-mono" style={{ color: '#d97706' }}>{formatCurrency(payslips.reduce((s, p) => s + toNum(p.taxDeduction), 0))}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(payslips.reduce((s, p) => s + toNum(p.netPay), 0))}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          LATES TAB
          ══════════════════════════════════════════════════════════════ */}
      {subTab === 'lates' && (() => {
        const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const fmtD = (s: string) => { const [,m,d] = s.split('-'); return `${MONTH_ABBR[parseInt(m)-1]} ${parseInt(d)}` }
        const fmtDOW = (s: string) => { const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; const dt = new Date(s + 'T00:00:00Z'); return days[dt.getUTCDay()] }
        const fmtMin = (min: number) => { const h = Math.floor(min / 60); const m = min % 60; return h > 0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m` }

        const filtered = latesData.filter(e =>
          !latesEmpFilter || `${e.firstName} ${e.lastName}`.toLowerCase().includes(latesEmpFilter.toLowerCase())
        )

        // Severity badge — based on BEYOND-GRACE lates only (within-grace lates are forgiven)
        const badge = (beyondGrace: number) => {
          if (beyondGrace >= 6) return { label: 'High Risk', bg: '#fee2e2', color: '#dc2626' }
          if (beyondGrace >= 4) return { label: 'Warning', bg: '#ffedd5', color: '#ea580c' }
          if (beyondGrace >= 2) return { label: 'Watch', bg: '#fef3c7', color: '#d97706' }
          if (beyondGrace >= 1) return { label: 'Low', bg: '#f0fdf4', color: '#16a34a' }
          return { label: 'Within Grace', bg: '#eff6ff', color: '#3b82f6' }
        }

        return (
          <div className="space-y-4">
            {/* Controls */}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>From</label>
                <input type="date" value={latesDateFrom} onChange={e => setLatesDateFrom(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>To</label>
                <input type="date" value={latesDateTo} onChange={e => setLatesDateTo(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
              </div>
              <button onClick={() => fetchLates(latesDateFrom, latesDateTo)} disabled={latesLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                style={{ background: 'var(--teal)' }}>
                {latesLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {latesLoading ? 'Loading…' : 'Load'}
              </button>
              {latesLoaded && (
                <div className="relative ml-1">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
                  <input value={latesEmpFilter} onChange={e => setLatesEmpFilter(e.target.value)}
                    placeholder="Filter employee…"
                    className="pl-7 pr-3 py-1.5 rounded-lg border text-xs w-44" style={{ borderColor: 'var(--light-gray)' }} />
                </div>
              )}
              {latesLoaded && latesGrace > 0 && (
                <span className="text-[10px] px-2 py-1 rounded-lg" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                  Grace: {latesGrace} min
                </span>
              )}
            </div>

            {/* Stats row */}
            {latesLoaded && !latesLoading && (
              <div className="flex flex-wrap gap-3">
                {[
                  { label: 'Employees with Lates', value: filtered.length, color: 'var(--charcoal)' },
                  { label: 'Total Late Incidents', value: filtered.reduce((s, e) => s + e.lateCount, 0), color: '#dc2626' },
                  { label: 'Beyond Grace', value: filtered.reduce((s, e) => s + e.beyondGraceCount, 0), color: '#ea580c' },
                  { label: 'Within Grace Only', value: filtered.reduce((s, e) => s + e.withinGraceCount, 0), color: '#d97706' },
                ].map(s => (
                  <div key={s.label} className="px-4 py-2.5 rounded-xl text-center" style={{ background: 'var(--off-white)', minWidth: 120 }}>
                    <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Table */}
            {!latesLoaded ? (
              <div className="py-16 text-center text-sm rounded-xl" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                <AlertCircle size={28} className="mx-auto mb-2 opacity-30" />
                <p>Select a date range and click <strong>Load</strong> to see late records.</p>
              </div>
            ) : latesLoading ? (
              <div className="py-16 text-center"><Loader2 size={24} className="animate-spin mx-auto" style={{ color: 'var(--teal)' }} /></div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-sm rounded-xl" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                <CheckCircle2 size={28} className="mx-auto mb-2" style={{ color: '#16a34a', opacity: 0.5 }} />
                <p>No late arrivals recorded for this period.</p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--light-gray)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--off-white)' }}>
                      <th className="text-left px-4 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Employee</th>
                      <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Dept</th>
                      <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Late Count</th>
                      <th className="text-center px-3 py-2.5 font-semibold" style={{ color: '#ea580c' }}>Beyond Grace</th>
                      <th className="text-center px-3 py-2.5 font-semibold" style={{ color: '#d97706' }}>Within Grace</th>
                      <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Total Late Time</th>
                      <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--charcoal)' }}>Risk Level <span className="font-normal text-[10px]" style={{ color: 'var(--mid-gray)' }}>(excl. grace)</span></th>
                      <th className="px-3 py-2.5 w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(emp => {
                      const b = badge(emp.beyondGraceCount)
                      const isOpen = latesExpanded === emp.id
                      return (
                        <>
                          <tr key={emp.id}
                            className="border-t hover:bg-gray-50 cursor-pointer"
                            style={{ borderColor: 'var(--light-gray)' }}
                            onClick={() => setLatesExpanded(isOpen ? '' : emp.id)}>
                            <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--charcoal)' }}>
                              {emp.firstName} {emp.lastName}
                            </td>
                            <td className="px-3 py-2.5" style={{ color: 'var(--mid-gray)' }}>{emp.department}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="font-bold text-sm" style={{ color: '#dc2626' }}>{emp.lateCount}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center font-mono" style={{ color: '#ea580c' }}>
                              {emp.beyondGraceCount > 0 ? emp.beyondGraceCount : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center font-mono" style={{ color: '#d97706' }}>
                              {emp.withinGraceCount > 0 ? emp.withinGraceCount : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--charcoal)' }}>
                              {fmtMin(emp.totalLateMinutes)}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                style={{ background: b.bg, color: b.color }}>
                                {b.label}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center" style={{ color: 'var(--mid-gray)' }}>
                              {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr key={`${emp.id}-detail`}>
                              <td colSpan={8} className="px-0 py-0" style={{ background: 'var(--off-white)' }}>
                                <div className="px-8 py-3">
                                  <table className="w-full text-[11px]">
                                    <thead>
                                      <tr>
                                        <th className="text-left py-1.5 font-semibold pr-6" style={{ color: 'var(--mid-gray)' }}>Date</th>
                                        <th className="text-left py-1.5 font-semibold pr-6" style={{ color: 'var(--mid-gray)' }}>Day</th>
                                        <th className="text-center py-1.5 font-semibold pr-6" style={{ color: 'var(--mid-gray)' }}>Sched In</th>
                                        <th className="text-center py-1.5 font-semibold pr-6" style={{ color: 'var(--mid-gray)' }}>Actual In</th>
                                        <th className="text-right py-1.5 font-semibold pr-6" style={{ color: 'var(--mid-gray)' }}>Late</th>
                                        <th className="text-center py-1.5 font-semibold" style={{ color: 'var(--mid-gray)' }}>Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {emp.lates.map((l, i) => (
                                        <tr key={i} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                                          <td className="py-1.5 pr-6 font-medium" style={{ color: 'var(--charcoal)' }}>{fmtD(l.date)}</td>
                                          <td className="py-1.5 pr-6" style={{ color: 'var(--mid-gray)' }}>{fmtDOW(l.date)}</td>
                                          <td className="py-1.5 pr-6 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>{fmtHHMM(l.scheduledIn)}</td>
                                          <td className="py-1.5 pr-6 text-center font-mono" style={{ color: l.withinGrace ? '#d97706' : '#dc2626', fontWeight: 600 }}>{fmtHHMM(l.timeIn)}</td>
                                          <td className="py-1.5 pr-6 text-right font-mono" style={{ color: l.withinGrace ? '#d97706' : '#dc2626' }}>{fmtMin(l.lateMinutes)}</td>
                                          <td className="py-1.5 text-center">
                                            {l.withinGrace
                                              ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: '#fef3c7', color: '#d97706' }}>Within Grace</span>
                                              : <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: '#fee2e2', color: '#dc2626' }}>Late +{fmtMin(l.effectiveLate)}</span>
                                            }
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t font-semibold" style={{ borderColor: 'var(--light-gray)' }}>
                                        <td colSpan={4} className="py-1.5 pr-6" style={{ color: 'var(--charcoal)' }}>
                                          Total — {emp.lateCount} incident{emp.lateCount !== 1 ? 's' : ''}
                                        </td>
                                        <td className="py-1.5 pr-6 text-right font-mono" style={{ color: '#dc2626' }}>{fmtMin(emp.totalLateMinutes)}</td>
                                        <td></td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })()}

      {/* ══════════════════════════════════════════════════════════════
          PAY BREAKDOWN MODAL
          ══════════════════════════════════════════════════════════════ */}
      {breakdownModal && (() => {
        const { payslip: bp, type } = breakdownModal
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bd = bp.details?.dailyBreakdown as Record<string, any[]> | null | undefined

        // Map modal type → source array in dailyBreakdown
        const srcKey: Record<string, string> = {
          basicPay: 'basicPay', overtimePay: 'overtimePay', holidayPay: 'holidayPay',
          nightDiffPay: 'nightDiffPay', restDayPay: 'restDayPay',
          daysWorked: 'basicPay', hoursWorked: 'basicPay',
          otHours: 'overtimePay', late: 'lateDeduction', undertime: 'undertimeDeduction',
        }
        const rows = bd?.[srcKey[type]] ?? []

        const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const fmtD = (s: string) => { const [,m,d] = s.split('-'); return `${MONTH_ABBR[parseInt(m)-1]} ${parseInt(d)}` }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fmtDOW = (s: string) => { const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; const dt = new Date(s + 'T00:00:00Z'); return days[dt.getUTCDay()] }
        const fc = formatCurrency
        const fmtMin = (min: number) => { const h = Math.floor(min / 60); const m = min % 60; return h > 0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m` }
        const fmtHrs = (hrs: number) => { const tot = Math.round(hrs * 60); const h = Math.floor(tot / 60); const m = tot % 60; return `${h}h ${String(m).padStart(2,'0')}m` }

        const titles: Record<string, string> = {
          basicPay: 'Basic Pay', overtimePay: 'Overtime Pay',
          holidayPay: 'Holiday Pay', nightDiffPay: 'Night Differential', restDayPay: 'Rest Day Pay',
          daysWorked: 'Days Worked', hoursWorked: 'Hours Worked',
          otHours: 'Overtime Hours', late: 'Late', undertime: 'Undertime',
        }

        // Summary totals for footer
        const totalDaysWorked = rows.filter((r: { date?: string }) => r.date).length
        const totalHrsWorked = rows.reduce((s: number, r: { hours?: number }) => s + Number(r.hours || 0), 0)
        const totalOTMin = rows.reduce((s: number, r: { roundedMinutes?: number }) => s + Number(r.roundedMinutes || 0), 0)
        const totalLateMin = rows.reduce((s: number, r: { effectiveLate?: number }) => s + Number(r.effectiveLate || 0), 0)
        const totalUTMin = rows.reduce((s: number, r: { undertimeMinutes?: number }) => s + Number(r.undertimeMinutes || 0), 0)

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setBreakdownModal(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--light-gray)' }}>
                <div>
                  <p className="font-bold text-sm" style={{ color: 'var(--charcoal)' }}>{titles[type]} — Daily Breakdown</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                    {bp.employee.firstName} {bp.employee.lastName} &middot; {bp.cutoffPeriod}
                  </p>
                </div>
                <button onClick={() => setBreakdownModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                  <X size={15} />
                </button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto flex-1 px-5 py-4">
                {rows.length === 0 ? (
                  <div className="py-10 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
                    <p>No daily breakdown available for this payslip.</p>
                    <p className="text-xs mt-1">Click <strong>Regenerate Payslip</strong> to compute the per-day breakdown.</p>
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'var(--off-white)' }}>
                        <th className="text-left px-3 py-2 font-semibold rounded-tl-lg" style={{ color: 'var(--charcoal)' }}>Date</th>

                        {/* ── Days Worked ── */}
                        {type === 'daysWorked' && (
                          <th className="text-center px-3 py-2 font-semibold rounded-tr-lg" style={{ color: 'var(--charcoal)' }}>Status</th>
                        )}

                        {/* ── Hours Worked ── */}
                        {type === 'hoursWorked' && <>
                          <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Time In</th>
                          <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Time Out</th>
                          <th className="text-right px-3 py-2 font-semibold rounded-tr-lg" style={{ color: 'var(--charcoal)' }}>Hours</th>
                        </>}

                        {/* ── OT Hours ── */}
                        {type === 'otHours' && <>
                          <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Time In</th>
                          <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Time Out</th>
                          <th className="text-right px-3 py-2 font-semibold rounded-tr-lg" style={{ color: 'var(--charcoal)' }}>OT</th>
                        </>}

                        {/* ── Late ── */}
                        {type === 'late' && <>
                          <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Time In</th>
                          <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Time Out</th>
                          <th className="text-right px-3 py-2 font-semibold rounded-tr-lg" style={{ color: 'var(--charcoal)' }}>Late</th>
                        </>}

                        {/* ── Undertime ── */}
                        {type === 'undertime' && <>
                          <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Time In</th>
                          <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Time Out</th>
                          <th className="text-right px-3 py-2 font-semibold rounded-tr-lg" style={{ color: 'var(--charcoal)' }}>Undertime</th>
                        </>}

                        {/* ── Earnings types (existing) ── */}
                        {type === 'basicPay' && <>
                          <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Time In</th>
                          <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Time Out</th>
                          <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Hrs Worked</th>
                          <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Daily Rate</th>
                          <th className="text-right px-3 py-2 font-semibold rounded-tr-lg" style={{ color: 'var(--charcoal)' }}>Amount</th>
                        </>}
                        {type === 'overtimePay' && <>
                          <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Sched Out</th>
                          <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Actual Out</th>
                          <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>OT Hrs</th>
                          <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Rate ×{rows[0]?.multiplier ?? ''}</th>
                          <th className="text-right px-3 py-2 font-semibold rounded-tr-lg" style={{ color: 'var(--charcoal)' }}>Amount</th>
                        </>}
                        {(type === 'holidayPay' || type === 'restDayPay') && <>
                          <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Time In</th>
                          <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Time Out</th>
                          <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>{type === 'holidayPay' ? 'Holiday' : 'Type'}</th>
                          <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Rate</th>
                          <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Day Pay</th>
                          <th className="text-right px-3 py-2 font-semibold rounded-tr-lg" style={{ color: 'var(--charcoal)' }}>Premium</th>
                        </>}
                        {type === 'nightDiffPay' && <>
                          <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Time In</th>
                          <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--charcoal)' }}>Time Out</th>
                          <th className="text-right px-3 py-2 font-semibold rounded-tr-lg" style={{ color: 'var(--charcoal)' }}>Amount</th>
                        </>}
                      </tr>
                    </thead>
                    <tbody>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {rows.map((r: any, i: number) => (
                        <tr key={i} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                          <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>
                            {r.date ? <>{fmtD(r.date)} <span className="text-[10px] font-normal" style={{ color: 'var(--mid-gray)' }}>{fmtDOW(r.date)}</span></> : <span style={{ color: 'var(--mid-gray)' }}>—</span>}
                          </td>

                          {/* Days Worked */}
                          {type === 'daysWorked' && (
                            <td className="px-3 py-2 text-center">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#dcfce7', color: '#059669' }}>Present</span>
                            </td>
                          )}

                          {/* Hours Worked */}
                          {type === 'hoursWorked' && <>
                            <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>{fmtHHMM(r.timeIn)}</td>
                            <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>{fmtHHMM(r.timeOut)}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{fmtHrs(Number(r.hours || 0))}</td>
                          </>}

                          {/* OT Hours */}
                          {type === 'otHours' && <>
                            <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>{fmtHHMM(r.timeIn)}</td>
                            <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>{fmtHHMM(r.timeOut)}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: '#7c3aed' }}>
                              {fmtMin(Number(r.roundedMinutes || 0))}
                              {Number(r.roundedMinutes) < Number(r.rawMinutes) && (
                                <span className="text-[10px] ml-1 font-normal" style={{ color: '#d97706' }} title={`Raw: ${r.rawMinutes}m, rounded down`}>↓</span>
                              )}
                            </td>
                          </>}

                          {/* Late */}
                          {type === 'late' && <>
                            <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>
                              {fmtHHMM(r.timeIn)}
                              {r.scheduledIn && <span className="block text-[10px]" style={{ color: '#d97706' }}>sched {fmtHHMM(r.scheduledIn)}</span>}
                            </td>
                            <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>{fmtHHMM(r.timeOut)}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: '#dc2626' }}>
                              {fmtMin(Number(r.effectiveLate || 0))}
                              {Number(r.gracePeriod) > 0 && Number(r.lateMinutes) !== Number(r.effectiveLate) && (
                                <span className="block text-[10px] font-normal" style={{ color: 'var(--mid-gray)' }}>raw {fmtMin(Number(r.lateMinutes))}, –{r.gracePeriod}m grace</span>
                              )}
                            </td>
                          </>}

                          {/* Undertime */}
                          {type === 'undertime' && <>
                            <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>{fmtHHMM(r.timeIn)}</td>
                            <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>
                              {fmtHHMM(r.timeOut)}
                              {r.scheduledOut && <span className="block text-[10px]" style={{ color: '#d97706' }}>sched {fmtHHMM(r.scheduledOut)}</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: '#dc2626' }}>{fmtMin(Number(r.undertimeMinutes || 0))}</td>
                          </>}

                          {/* ── Existing earnings rows ── */}
                          {type === 'basicPay' && <>
                            <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>{fmtHHMM(r.timeIn)}</td>
                            <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>{fmtHHMM(r.timeOut)}</td>
                            <td className="px-3 py-2 text-right font-mono">{Number(r.hours).toFixed(1)}</td>
                            <td className="px-3 py-2 text-right font-mono">{fc(r.dailyRate)}/day</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{fc(r.amount)}</td>
                          </>}
                          {type === 'overtimePay' && <>
                            <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>{fmtHHMM(r.scheduledOut)}</td>
                            <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>{fmtHHMM(r.timeOut)}</td>
                            <td className="px-3 py-2 text-right font-mono">{Number(r.otHours).toFixed(2)} hr{Number(r.roundedMinutes) < Number(r.rawMinutes) ? <span className="text-[10px] ml-1" style={{ color: '#d97706' }} title={`Rounded down from ${r.rawMinutes} min`}>↓{r.rawMinutes}m</span> : null}</td>
                            <td className="px-3 py-2 text-right font-mono">{fc(Number(r.hourlyRate) * Number(r.multiplier))}/hr</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{fc(r.amount)}</td>
                          </>}
                          {(type === 'holidayPay' || type === 'restDayPay') && <>
                            <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>{fmtHHMM(r.timeIn)}</td>
                            <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>{fmtHHMM(r.timeOut)}</td>
                            <td className="px-3 py-2" style={{ color: 'var(--mid-gray)' }}>
                              {type === 'holidayPay'
                                ? (r.holidayType === 'REGULAR' ? 'Regular Holiday' : 'Special Non-Working')
                                : 'Rest Day'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{Number(r.holidayRate ?? r.restDayRate).toFixed(2)}×</td>
                            <td className="px-3 py-2 text-right font-mono">{fc(r.totalDayPay)}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{fc(r.amount)}</td>
                          </>}
                          {type === 'nightDiffPay' && <>
                            <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>{fmtHHMM(r.timeIn)}</td>
                            <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--mid-gray)' }}>{fmtHHMM(r.timeOut)}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{fc(r.amount)}</td>
                          </>}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t font-bold" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                        {type === 'daysWorked' && <>
                          <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>Total</td>
                          <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--deep-teal)' }}>{totalDaysWorked} day{totalDaysWorked !== 1 ? 's' : ''}</td>
                        </>}
                        {type === 'hoursWorked' && <>
                          <td className="px-3 py-2" colSpan={3} style={{ color: 'var(--charcoal)' }}>Total ({totalDaysWorked} day{totalDaysWorked !== 1 ? 's' : ''})</td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--deep-teal)' }}>{fmtHrs(totalHrsWorked)}</td>
                        </>}
                        {type === 'otHours' && <>
                          <td className="px-3 py-2" colSpan={3} style={{ color: 'var(--charcoal)' }}>Total ({rows.length} day{rows.length !== 1 ? 's' : ''})</td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: '#7c3aed' }}>{fmtMin(totalOTMin)}</td>
                        </>}
                        {type === 'late' && <>
                          <td className="px-3 py-2" colSpan={3} style={{ color: 'var(--charcoal)' }}>Total ({rows.length} day{rows.length !== 1 ? 's' : ''} late)</td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: '#dc2626' }}>{fmtMin(totalLateMin)}</td>
                        </>}
                        {type === 'undertime' && <>
                          <td className="px-3 py-2" colSpan={3} style={{ color: 'var(--charcoal)' }}>Total ({rows.length} day{rows.length !== 1 ? 's' : ''})</td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: '#dc2626' }}>{fmtMin(totalUTMin)}</td>
                        </>}
                        {['basicPay','overtimePay','holidayPay','nightDiffPay','restDayPay'].includes(type) && <>
                          <td className="px-3 py-2" colSpan={type === 'basicPay' ? 5 : type === 'overtimePay' ? 5 : type === 'nightDiffPay' ? 3 : 6}
                            style={{ color: 'var(--charcoal)' }}>
                            Total ({rows.length} day{rows.length !== 1 ? 's' : ''})
                          </td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--deep-teal)' }}>
                            {fc(rows.reduce((s: number, r: { amount?: number }) => s + Number(r.amount), 0))}
                          </td>
                        </>}
                      </tr>
                    </tfoot>
                  </table>
                )}

                {/* Formula hint */}
                {rows.length > 0 && type === 'basicPay' && (
                  <p className="text-[10px] mt-3 px-1" style={{ color: 'var(--mid-gray)' }}>
                    Each day = 1 × Daily Rate regardless of exact hours worked (daily-rate employees get paid per day present).
                  </p>
                )}
                {rows.length > 0 && (type === 'otHours' || type === 'overtimePay') && (
                  <p className="text-[10px] mt-3 px-1" style={{ color: 'var(--mid-gray)' }}>
                    OT starts after the employee completes their full scheduled hours (time-out baseline shifts by late arrival). Rounded down to nearest interval. Only days with an approved OT request are counted.
                  </p>
                )}
                {rows.length > 0 && type === 'late' && (
                  <p className="text-[10px] mt-3 px-1" style={{ color: 'var(--mid-gray)' }}>
                    Grace period minutes are deducted before computing the deductible late. The required time-out still shifts by the full late arrival.
                  </p>
                )}
                {rows.length > 0 && type === 'undertime' && (
                  <p className="text-[10px] mt-3 px-1" style={{ color: 'var(--mid-gray)' }}>
                    Undertime = minutes short of the required time-out (scheduled out + late arrival). Employee must complete full scheduled hours before leaving.
                  </p>
                )}
                {rows.length > 0 && (type === 'holidayPay' || type === 'restDayPay') && (
                  <p className="text-[10px] mt-3 px-1" style={{ color: 'var(--mid-gray)' }}>
                    Premium shown = Day Pay − Base Daily Rate (the extra amount on top of regular pay).
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
