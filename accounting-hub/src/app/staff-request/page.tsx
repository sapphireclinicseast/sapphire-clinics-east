'use client'

import { useState, useEffect } from 'react'

interface Employee {
  id: string
  firstName: string
  lastName: string
  department: string
  branch: string
  scheduleIn: string
  scheduleOut: string
  daySchedules: Record<string, { in: string; out: string }> | null
  restDay: string
}

interface Consultant {
  id: string
  name: string
  department: string
  branch: string
}

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

const COE_PURPOSES = [
  { value: 'Employment Verification', label: 'Employment Verification' },
  { value: 'Bank/Loan Application', label: 'Bank/Loan Application' },
  { value: 'Government Transaction', label: 'Government Transaction' },
  { value: 'Visa/Travel Application', label: 'Visa/Travel Application' },
  { value: 'School/Educational Purposes', label: 'School/Educational Purposes' },
  { value: 'Other', label: 'Other (please specify)' },
]

// Display branch codes under the new brand: SBEA→AHEA, SBGH→AHGH, VERDANA→VER
const BRANCH_CODE_LABELS: Record<string, string> = {
  SBEA: 'AHEA', SBGH: 'AHGH', VERDANA: 'VER', VDNA: 'VER',
}
const branchCodeLabel = (b: string) => BRANCH_CODE_LABELS[(b || '').toUpperCase()] || b

export default function StaffRequestPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [nameSearch, setNameSearch] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [consultantId, setConsultantId] = useState('')
  const [requestType, setRequestType] = useState('')
  const [leaveType, setLeaveType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [isHalfDay, setIsHalfDay] = useState(false)
  const [halfDayPeriod, setHalfDayPeriod] = useState<'MORNING' | 'AFTERNOON' | ''>('')
  const [coePurpose, setCoePurpose] = useState('')
  const [coeCustomPurpose, setCoeCustomPurpose] = useState('')
  const [requestedTime, setRequestedTime] = useState('')
  const [dtrPhoto, setDtrPhoto] = useState<string | null>(null)
  const [dtrFileName, setDtrFileName] = useState('')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleDayType, setScheduleDayType] = useState<'working' | 'rest' | ''>('')
  const [changeToWorkingDay, setChangeToWorkingDay] = useState<boolean | null>(null)
  const [scheduleIn, setScheduleIn] = useState('')
  const [scheduleOut, setScheduleOut] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/public/employees?includeConsultants=true')
      .then(r => r.json())
      .then(data => {
        if (data.employees) {
          setEmployees(Array.isArray(data.employees) ? data.employees : [])
          setConsultants(Array.isArray(data.consultants) ? data.consultants : [])
        } else {
          // Fallback: old API format (array of employees)
          setEmployees(Array.isArray(data) ? data : [])
        }
      })
      .catch(() => {})
  }, [])

  const isChangeSchedule = requestType === 'CHANGE_SCHEDULE'

  // Auto-detect if a date is a rest day or working day for the selected employee
  const selectedEmployee = employees.find(e => e.id === employeeId)
  const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

  function detectDayType(dateStr: string) {
    if (!dateStr || !selectedEmployee) { setScheduleDayType(''); setChangeToWorkingDay(null); return }
    const date = new Date(dateStr + 'T00:00:00')
    const dayName = DAY_NAMES[date.getDay()]
    const restDays = (selectedEmployee.restDay || '').toUpperCase().split(',').map(d => d.trim())
    const isRest = restDays.includes(dayName)
    setScheduleDayType(isRest ? 'rest' : 'working')
    setChangeToWorkingDay(isRest ? true : false) // default: flip to opposite
  }

  const isCOC = requestType === 'CERTIFICATE_OF_CONSULTATION'
  const isCOE = requestType === 'CERTIFICATE_OF_EMPLOYMENT'
  const isCertificate = isCOE || isCOC
  const isChangeTime = requestType === 'CHANGE_TIME_IN' || requestType === 'CHANGE_TIME_OUT'

  // For COC: search consultants. For everything else: search employees.
  const filteredEmployees = employees.filter(e =>
    !nameSearch || `${e.firstName} ${e.lastName}`.toLowerCase().includes(nameSearch.toLowerCase())
  )

  const filteredConsultants = consultants.filter(c =>
    !nameSearch || c.name.toLowerCase().includes(nameSearch.toLowerCase())
  )

  // Reset selection when switching request type
  const handleRequestTypeChange = (val: string) => {
    setRequestType(val)
    // Clear name selection when switching between COC and other types
    if ((val === 'CERTIFICATE_OF_CONSULTATION') !== isCOC) {
      setNameSearch('')
      setEmployeeId('')
      setConsultantId('')
    }
  }

  function handleDtrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('Photo must be under 5MB'); return }
    setDtrFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => setDtrPhoto(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if ((!employeeId && !consultantId) || !requestType) return
    setSubmitting(true)
    setError('')

    try {
      const finalReason = isCertificate
        ? (coePurpose === 'Other' ? coeCustomPurpose : coePurpose) || null
        : reason || null

      const res = await fetch('/api/payroll/employee-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: employeeId || null,
          consultantId: consultantId || null,
          requestType,
          leaveType: requestType === 'LEAVE' ? leaveType : null,
          isHalfDay: requestType === 'LEAVE' ? isHalfDay : false,
          halfDayPeriod: requestType === 'LEAVE' && isHalfDay ? halfDayPeriod : null,
          startDate: requestType === 'CHANGE_SCHEDULE' ? scheduleDate : (startDate || null),
          endDate: endDate || null,
          reason: finalReason,
          requestedTimeIn: requestType === 'CHANGE_TIME_IN' ? requestedTime : null,
          requestedTimeOut: requestType === 'CHANGE_TIME_OUT' ? requestedTime : null,
          attachment: isChangeTime ? dtrPhoto : null,
          requestedScheduleIn: requestType === 'CHANGE_SCHEDULE' && changeToWorkingDay ? scheduleIn : null,
          requestedScheduleOut: requestType === 'CHANGE_SCHEDULE' && changeToWorkingDay ? scheduleOut : null,
          changeToWorkingDay: requestType === 'CHANGE_SCHEDULE' ? changeToWorkingDay : null,
        }),
      })
      if (res.ok) {
        setSubmitted(true)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to submit request')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#f8faf9' }}>
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: '#e6f7f2' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: '#1a1a2e' }}>Request Submitted</h2>
          <p className="text-sm mb-6" style={{ color: '#6b7280' }}>
            Your request has been submitted successfully and is pending review.
          </p>
          <button
            onClick={() => { setSubmitted(false); setRequestType(''); setLeaveType(''); setIsHalfDay(false); setHalfDayPeriod(''); setStartDate(''); setEndDate(''); setReason(''); setCoePurpose(''); setCoeCustomPurpose(''); setNameSearch(''); setEmployeeId(''); setConsultantId(''); setRequestedTime(''); setDtrPhoto(null); setDtrFileName(''); setScheduleDate(''); setScheduleDayType(''); setChangeToWorkingDay(null); setScheduleIn(''); setScheduleOut('') }}
            className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ background: '#0d9488' }}
          >
            Submit Another Request
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#f8faf9' }}>
      <div className="bg-white rounded-2xl shadow-lg p-6 max-w-lg w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold" style={{ color: '#1a1a2e' }}>Staff Request</h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Submit a leave, overtime, or other request</p>
        </div>

        {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Request Type - moved before name so COC mode can change the search */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>Request Type</label>
            <select value={requestType} onChange={(e) => handleRequestTypeChange(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: '#e5e7eb' }}>
              <option value="">Select request type...</option>
              {REQUEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Name search — employees or consultants depending on type */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>
              Your Name {isCOC && <span className="text-[10px] font-normal" style={{ color: '#6b7280' }}>(Clinician / Consultant)</span>}
            </label>
            <input
              type="text"
              value={nameSearch}
              onChange={(e) => { setNameSearch(e.target.value); if (!e.target.value) { setEmployeeId(''); setConsultantId('') } }}
              placeholder={isCOC ? 'Search consultant name...' : 'Search your name...'}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ borderColor: (employeeId || consultantId) ? '#0d9488' : '#e5e7eb', background: (employeeId || consultantId) ? '#f0fdfa' : 'white' }}
            />
            {nameSearch && !employeeId && !consultantId && (
              <div className="mt-1 bg-white border rounded-xl shadow-lg max-h-40 overflow-y-auto" style={{ borderColor: '#e5e7eb' }}>
                {isCOC ? (
                  <>
                    {filteredConsultants.slice(0, 10).map(c => (
                      <button key={c.id} type="button"
                        onClick={() => { setConsultantId(c.id); setNameSearch(c.name) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" style={{ color: '#1a1a2e' }}>
                        <strong>{c.name}</strong>
                        <span className="ml-2 text-xs" style={{ color: '#6b7280' }}>{c.department} — {branchCodeLabel(c.branch)}</span>
                      </button>
                    ))}
                    {filteredConsultants.length === 0 && (
                      <p className="px-3 py-2 text-xs" style={{ color: '#6b7280' }}>No matching consultants</p>
                    )}
                  </>
                ) : (
                  <>
                    {filteredEmployees.slice(0, 10).map(e => (
                      <button key={e.id} type="button"
                        onClick={() => { setEmployeeId(e.id); setNameSearch(`${e.firstName} ${e.lastName}`) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" style={{ color: '#1a1a2e' }}>
                        <strong>{e.firstName} {e.lastName}</strong>
                        <span className="ml-2 text-xs" style={{ color: '#6b7280' }}>{e.department} — {branchCodeLabel(e.branch)}</span>
                      </button>
                    ))}
                    {filteredEmployees.length === 0 && (
                      <p className="px-3 py-2 text-xs" style={{ color: '#6b7280' }}>No matching employees</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Leave Type (only for LEAVE) */}
          {requestType === 'LEAVE' && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>Leave Type</label>
              <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} required
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: '#e5e7eb' }}>
                <option value="">Select leave type...</option>
                {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          )}

          {/* Dates (not for CHANGE_SCHEDULE — that has its own section) */}
          {['LEAVE', 'OVERTIME', 'UNDERTIME'].includes(requestType) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: '#e5e7eb' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>End Date</label>
                <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); if (e.target.value && e.target.value !== startDate) { setIsHalfDay(false); setHalfDayPeriod('') } }}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: '#e5e7eb' }} />
              </div>
            </div>
          )}

          {/* Half-day option — only for single-day LEAVE */}
          {requestType === 'LEAVE' && startDate && (!endDate || endDate === startDate) && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isHalfDay}
                  onChange={(e) => { setIsHalfDay(e.target.checked); if (!e.target.checked) setHalfDayPeriod('') }}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: '#0d9488' }}
                />
                <span className="text-sm font-medium" style={{ color: '#1a1a2e' }}>Half-day leave</span>
              </label>
              {isHalfDay && (
                <div className="flex gap-2 mt-2">
                  {(['MORNING', 'AFTERNOON'] as const).map(period => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => setHalfDayPeriod(period)}
                      className="flex-1 px-3 py-2 rounded-xl border text-sm font-medium transition-colors"
                      style={{
                        borderColor: halfDayPeriod === period ? '#0d9488' : '#e5e7eb',
                        background: halfDayPeriod === period ? '#f0fdfa' : 'white',
                        color: halfDayPeriod === period ? '#0d9488' : '#6b7280',
                      }}
                    >
                      {period.charAt(0) + period.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Change Schedule fields */}
          {isChangeSchedule && employeeId && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>Change Schedule Date</label>
                <input type="date" value={scheduleDate} onChange={(e) => { setScheduleDate(e.target.value); detectDayType(e.target.value) }} required
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: '#e5e7eb' }} />
              </div>

              {scheduleDayType && (
                <div className="p-3 rounded-xl text-sm" style={{ background: scheduleDayType === 'rest' ? '#fef3c7' : '#e0f2fe', color: scheduleDayType === 'rest' ? '#92400e' : '#0c4a6e' }}>
                  <p className="font-semibold text-xs mb-1">
                    {new Date(scheduleDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                  <p className="text-xs">
                    This day is currently a <strong>{scheduleDayType === 'rest' ? 'Rest Day' : 'Working Day'}</strong> for you.
                  </p>
                </div>
              )}

              {scheduleDayType && (
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>Change to:</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setChangeToWorkingDay(true)}
                      className="flex-1 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors"
                      style={{
                        borderColor: changeToWorkingDay === true ? '#0d9488' : '#e5e7eb',
                        background: changeToWorkingDay === true ? '#f0fdfa' : 'white',
                        color: changeToWorkingDay === true ? '#0d9488' : '#6b7280',
                      }}>
                      Working Day
                    </button>
                    <button type="button" onClick={() => setChangeToWorkingDay(false)}
                      className="flex-1 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors"
                      style={{
                        borderColor: changeToWorkingDay === false ? '#dc2626' : '#e5e7eb',
                        background: changeToWorkingDay === false ? '#fef2f2' : 'white',
                        color: changeToWorkingDay === false ? '#dc2626' : '#6b7280',
                      }}>
                      Rest Day
                    </button>
                  </div>
                </div>
              )}

              {changeToWorkingDay === true && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>Schedule Time In</label>
                    <input type="time" value={scheduleIn} onChange={(e) => setScheduleIn(e.target.value)} required
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: '#e5e7eb' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>Schedule Time Out</label>
                    <input type="time" value={scheduleOut} onChange={(e) => setScheduleOut(e.target.value)} required
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: '#e5e7eb' }} />
                  </div>
                </div>
              )}
            </>
          )}

          {isChangeSchedule && !employeeId && requestType === 'CHANGE_SCHEDULE' && (
            <p className="text-xs italic" style={{ color: '#d97706' }}>Please select your name first to see schedule options.</p>
          )}

          {/* Change Time In / Change Time Out fields */}
          {isChangeTime && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: '#e5e7eb' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>
                  {requestType === 'CHANGE_TIME_IN' ? 'Requested Time In' : 'Requested Time Out'}
                </label>
                <input type="time" value={requestedTime} onChange={(e) => setRequestedTime(e.target.value)} required
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: '#e5e7eb' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>
                  Upload DTR Photo <span className="text-[10px] font-normal" style={{ color: '#6b7280' }}>(required)</span>
                </label>
                <label
                  className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border text-sm cursor-pointer"
                  style={{ borderColor: dtrPhoto ? '#0d9488' : '#e5e7eb', background: dtrPhoto ? '#f0fdfa' : 'white' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={dtrPhoto ? '#0d9488' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span style={{ color: dtrPhoto ? '#0d9488' : '#6b7280' }}>
                    {dtrFileName || 'Choose photo...'}
                  </span>
                  <input type="file" accept="image/*" onChange={handleDtrUpload} className="hidden" />
                </label>
                {dtrPhoto && (
                  <div className="mt-2 rounded-xl overflow-hidden border" style={{ borderColor: '#e5e7eb' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={dtrPhoto} alt="DTR Photo" className="w-full max-h-48 object-contain bg-gray-50" />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Purpose (for COE and COC) */}
          {isCertificate && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>Purpose</label>
              <select value={coePurpose} onChange={(e) => setCoePurpose(e.target.value)} required
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: '#e5e7eb' }}>
                <option value="">Select purpose...</option>
                {COE_PURPOSES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              {coePurpose === 'Other' && (
                <input
                  type="text"
                  value={coeCustomPurpose}
                  onChange={(e) => setCoeCustomPurpose(e.target.value)}
                  placeholder="Please specify the purpose..."
                  required
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none mt-2"
                  style={{ borderColor: '#e5e7eb' }}
                />
              )}
            </div>
          )}

          {/* Reason (hide for certificates since purpose replaces it) */}
          {!isCertificate && requestType && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>Reason / Details</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                placeholder="Please provide details for your request..."
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: '#e5e7eb' }} />
            </div>
          )}

          <button type="submit" disabled={submitting || (!employeeId && !consultantId) || !requestType}
            className="w-full py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-colors"
            style={{ background: '#0d9488' }}>
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  )
}
