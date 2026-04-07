'use client'

import { useState, useEffect } from 'react'

interface Employee {
  id: string
  firstName: string
  lastName: string
  department: string
  branch: string
}

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

const COE_PURPOSES = [
  { value: 'Employment Verification', label: 'Employment Verification' },
  { value: 'Bank/Loan Application', label: 'Bank/Loan Application' },
  { value: 'Government Transaction', label: 'Government Transaction' },
  { value: 'Visa/Travel Application', label: 'Visa/Travel Application' },
  { value: 'School/Educational Purposes', label: 'School/Educational Purposes' },
  { value: 'Other', label: 'Other (please specify)' },
]

export default function EmployeeRequestPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [requestType, setRequestType] = useState('')
  const [leaveType, setLeaveType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [coePurpose, setCoePurpose] = useState('')
  const [coeCustomPurpose, setCoeCustomPurpose] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/public/employees')
      .then(r => r.json())
      .then(data => setEmployees(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!employeeId || !requestType) return
    setSubmitting(true)
    setError('')

    try {
      // For COE requests, store the selected purpose in the reason field
      const finalReason = requestType === 'CERTIFICATE_OF_EMPLOYMENT'
        ? (coePurpose === 'Other' ? coeCustomPurpose : coePurpose) || null
        : reason || null

      const res = await fetch('/api/payroll/employee-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          requestType,
          leaveType: requestType === 'LEAVE' ? leaveType : null,
          startDate: startDate || null,
          endDate: endDate || null,
          reason: finalReason,
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

  const filteredEmployees = employees.filter(e =>
    !employeeSearch || `${e.firstName} ${e.lastName}`.toLowerCase().includes(employeeSearch.toLowerCase())
  )

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
            onClick={() => { setSubmitted(false); setRequestType(''); setLeaveType(''); setStartDate(''); setEndDate(''); setReason(''); setCoePurpose(''); setCoeCustomPurpose('') }}
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
          <h1 className="text-2xl font-bold" style={{ color: '#1a1a2e' }}>Employee Request</h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Submit a leave, overtime, or other request</p>
        </div>

        {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Employee search */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>Your Name</label>
            <input
              type="text"
              value={employeeSearch}
              onChange={(e) => { setEmployeeSearch(e.target.value); if (!e.target.value) setEmployeeId('') }}
              placeholder="Search your name..."
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ borderColor: employeeId ? '#0d9488' : '#e5e7eb', background: employeeId ? '#f0fdfa' : 'white' }}
            />
            {employeeSearch && !employeeId && (
              <div className="mt-1 bg-white border rounded-xl shadow-lg max-h-40 overflow-y-auto" style={{ borderColor: '#e5e7eb' }}>
                {filteredEmployees.slice(0, 10).map(e => (
                  <button key={e.id} type="button"
                    onClick={() => { setEmployeeId(e.id); setEmployeeSearch(`${e.firstName} ${e.lastName}`) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" style={{ color: '#1a1a2e' }}>
                    <strong>{e.firstName} {e.lastName}</strong>
                    <span className="ml-2 text-xs" style={{ color: '#6b7280' }}>{e.department} — {e.branch}</span>
                  </button>
                ))}
                {filteredEmployees.length === 0 && (
                  <p className="px-3 py-2 text-xs" style={{ color: '#6b7280' }}>No matching employees</p>
                )}
              </div>
            )}
          </div>

          {/* Request Type */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>Request Type</label>
            <select value={requestType} onChange={(e) => setRequestType(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: '#e5e7eb' }}>
              <option value="">Select request type...</option>
              {REQUEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
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

          {/* Dates */}
          {['LEAVE', 'OVERTIME', 'UNDERTIME', 'CHANGE_SCHEDULE'].includes(requestType) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: '#e5e7eb' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: '#e5e7eb' }} />
              </div>
            </div>
          )}

          {/* COE Purpose (only for Certificate of Employment) */}
          {requestType === 'CERTIFICATE_OF_EMPLOYMENT' && (
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

          {/* Reason (hide for COE since purpose replaces it) */}
          {requestType !== 'CERTIFICATE_OF_EMPLOYMENT' && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#1a1a2e' }}>Reason / Details</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                placeholder="Please provide details for your request..."
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: '#e5e7eb' }} />
            </div>
          )}

          <button type="submit" disabled={submitting || !employeeId || !requestType}
            className="w-full py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-colors"
            style={{ background: '#0d9488' }}>
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  )
}
