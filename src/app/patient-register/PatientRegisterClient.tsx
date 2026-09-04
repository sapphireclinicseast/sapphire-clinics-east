'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, Loader2, Upload, FileText, X } from 'lucide-react'

const BRANCHES = [
  { value: 'SANDBOX_EAST',       label: 'Aura Health East' },
  { value: 'SANDBOX_GREENHILLS', label: 'Aura Health Greenhills' },
  { value: 'VERDANA_STORE',      label: 'Verdana Rehab Store' },
]

interface FormState {
  firstName: string
  lastName: string
  email: string
  phone: string
  dob: string
  sex: string
  civilStatus: string
  religion: string
  nationality: string
  address: string
  city: string
  diagnosis: string
  pwdSeniorId: string
  branches: string[]
}

const EMPTY: FormState = {
  firstName: '', lastName: '', email: '', phone: '', dob: '',
  sex: '', civilStatus: '', religion: '', nationality: '',
  address: '', city: '', diagnosis: '', pwdSeniorId: '', branches: [],
}

export default function PatientRegisterClient({ defaultBranch }: { defaultBranch: string }) {
  const initial: FormState = { ...EMPTY, branches: defaultBranch ? [defaultBranch] : [] }
  const [form, setForm] = useState<FormState>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [submitStage, setSubmitStage] = useState<'idle' | 'creating' | 'uploading'>('idle')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [referralFile, setReferralFile] = useState<File | null>(null)
  const [pwdIdFile, setPwdIdFile] = useState<File | null>(null)
  const referralInputRef = useRef<HTMLInputElement>(null)
  const pwdIdInputRef = useRef<HTMLInputElement>(null)

  function upd<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function toggleBranch(b: string) {
    setForm(f => ({
      ...f,
      branches: f.branches.includes(b)
        ? f.branches.filter(x => x !== b)
        : [...f.branches, b],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First name and last name are required.')
      return
    }
    if (!form.dob) {
      setError('Date of birth is required.')
      return
    }
    if (form.branches.length === 0) {
      setError('Please select at least one branch.')
      return
    }
    setSubmitting(true)
    setSubmitStage('creating')
    try {
      const res = await fetch('/api/public/patient-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Registration failed. Please try again.')
        return
      }

      // Upload documents if provided
      if ((referralFile || pwdIdFile) && data.id) {
        setSubmitStage('uploading')
        const uploadFile = async (file: File, docType: string) => {
          const fd = new FormData()
          fd.append('patientId', data.id)
          fd.append('docType', docType)
          fd.append('file', file)
          await fetch('/api/public/patient-register/upload', { method: 'POST', body: fd })
        }
        if (referralFile) await uploadFile(referralFile, 'referral')
        if (pwdIdFile)   await uploadFile(pwdIdFile, 'pwd-id')
      }

      setSuccess(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
      setSubmitStage('idle')
    }
  }

  if (success) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', padding: '32px 20px' }}>
            <CheckCircle2 size={64} style={{ color: '#10b981', margin: '0 auto 16px' }} />
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', marginBottom: 8 }}>
              Registration Successful!
            </h1>
            <p style={{ color: '#6b7280', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
              Thank you for registering, <strong>{form.firstName} {form.lastName}</strong>.
              Your information has been submitted. Please proceed to the front desk for verification,
              or wait for a staff member to assist you.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1a7b8a 0%, #0f5f6b 100%)', padding: '28px 24px', color: '#fff', textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', opacity: 0.8, marginBottom: 4, textTransform: 'uppercase' }}>
            Sapphire Clinics East Inc.
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Patient Registration</h1>
          <p style={{ fontSize: '0.82rem', marginTop: 6, opacity: 0.85 }}>
            Please fill out your information below
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px' }}>
          <SectionTitle>Personal Information</SectionTitle>
          <Grid>
            <Field label="First Name *"   value={form.firstName}   onChange={v => upd('firstName', v)} required />
            <Field label="Last Name *"    value={form.lastName}    onChange={v => upd('lastName', v)} required />
            <Field label="Date of Birth *" type="date" value={form.dob} onChange={v => upd('dob', v)} required />
            <Field label="Sex" value={form.sex} onChange={v => upd('sex', v)} placeholder="Male / Female" />
            <Field label="Civil Status"   value={form.civilStatus} onChange={v => upd('civilStatus', v)} placeholder="Single / Married / …" />
            <Field label="Nationality"    value={form.nationality} onChange={v => upd('nationality', v)} />
            <Field label="Religion"       value={form.religion}    onChange={v => upd('religion', v)} />
            <Field label="PWD/Senior ID Number" value={form.pwdSeniorId} onChange={v => upd('pwdSeniorId', v)} placeholder="Optional" />
          </Grid>

          <SectionTitle>Contact & Address</SectionTitle>
          <Grid>
            <Field label="Email" type="email" value={form.email} onChange={v => upd('email', v)} />
            <Field label="Cellphone No." value={form.phone} onChange={v => upd('phone', v)} placeholder="09XX XXX XXXX" />
            <Field label="Barangay / Address" value={form.address} onChange={v => upd('address', v)} />
            <Field label="City" value={form.city} onChange={v => upd('city', v)} />
          </Grid>

          <SectionTitle>Clinical Details</SectionTitle>
          <Grid>
            <Field label="Diagnosis / Reason for Visit" value={form.diagnosis} onChange={v => upd('diagnosis', v)} placeholder="Optional — e.g. Speech delay, Knee pain, …" full />
          </Grid>

          <SectionTitle>Branch(es) *</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {BRANCHES.map(b => (
              <label key={b.value} style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                padding: '12px 14px', borderRadius: 10,
                border: `1.5px solid ${form.branches.includes(b.value) ? '#1a7b8a' : '#e5e7eb'}`,
                background: form.branches.includes(b.value) ? '#f0f9fa' : '#fff',
                transition: 'all 0.15s',
              }}>
                <input
                  type="checkbox"
                  checked={form.branches.includes(b.value)}
                  onChange={() => toggleBranch(b.value)}
                  style={{ accentColor: '#1a7b8a', width: 16, height: 16 }}
                />
                <span style={{ fontSize: '0.9rem', fontWeight: form.branches.includes(b.value) ? 700 : 500, color: '#374151' }}>
                  {b.label}
                </span>
              </label>
            ))}
          </div>

          {/* ── Documents (optional) ─────────────────────────────────────── */}
          <SectionTitle>Documents (Optional)</SectionTitle>
          <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 12, lineHeight: 1.5 }}>
            You may upload a photo or scan of your documents now, or bring them to the clinic.
          </p>

          {/* Doctor's Referral */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', marginBottom: 2 }}>
              Doctor&apos;s Referral
            </label>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: 6, lineHeight: 1.5 }}>
              e.g. doctor&apos;s prescription, medical abstract, medical certificate, or doctor&apos;s report
            </p>
            {referralFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#f0f9fa', border: '1.5px solid #1a7b8a', borderRadius: 8 }}>
                <FileText size={14} style={{ color: '#1a7b8a', flexShrink: 0 }} />
                <span style={{ fontSize: '0.82rem', color: '#111827', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{referralFile.name}</span>
                <button type="button" onClick={() => setReferralFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', lineHeight: 0, flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => referralInputRef.current?.click()}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1.5px dashed #d1d5db', background: '#f9fafb', color: '#374151', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
                <Upload size={14} /> Upload Doctor&apos;s Referral
              </button>
            )}
            <input ref={referralInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) setReferralFile(f); e.target.value = '' }} />
          </div>

          {/* PWD / Senior ID */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
              PWD ID / Senior ID Photo
            </label>
            {pwdIdFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#f0f9fa', border: '1.5px solid #1a7b8a', borderRadius: 8 }}>
                <FileText size={14} style={{ color: '#1a7b8a', flexShrink: 0 }} />
                <span style={{ fontSize: '0.82rem', color: '#111827', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pwdIdFile.name}</span>
                <button type="button" onClick={() => setPwdIdFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', lineHeight: 0, flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => pwdIdInputRef.current?.click()}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, border: '1.5px dashed #d1d5db', background: '#f9fafb', color: '#374151', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
                <Upload size={14} /> Upload PWD ID / Senior ID Photo
              </button>
            )}
            <input ref={pwdIdInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) setPwdIdFile(f); e.target.value = '' }} />
          </div>

          {error && (
            <div style={{
              padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, color: '#b91c1c', fontSize: '0.85rem', marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%', padding: '14px', borderRadius: 10, border: 'none',
              background: submitting ? '#9ca3af' : '#1a7b8a', color: '#fff',
              fontSize: '0.95rem', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.15s',
            }}
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {submitting
              ? submitStage === 'uploading' ? 'Uploading documents…' : 'Submitting…'
              : 'Submit Registration'}
          </button>

          <p style={{ marginTop: 14, fontSize: '0.72rem', color: '#9ca3af', textAlign: 'center', lineHeight: 1.5 }}>
            By submitting, you consent to Sapphire Clinics East Inc. using your information
            for patient care and administration, compliant with the Data Privacy Act of 2012.
            A staff member will verify your details.
          </p>
        </form>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '0.7rem', fontWeight: 700, color: '#6b7280',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      marginTop: 20, marginBottom: 10, paddingBottom: 4,
      borderBottom: '1px solid #e5e7eb',
    }}>{children}</div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 12, marginBottom: 4,
    }}>{children}</div>
  )
}

function Field({
  label, value, onChange, type = 'text', placeholder = '', required = false, full = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  required?: boolean
  full?: boolean
}) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 8,
          border: '1.5px solid #d1d5db', fontSize: '0.88rem',
          outline: 'none', color: '#111827',
        }}
      />
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #f0f9fa 0%, #ffffff 100%)',
  padding: '24px 16px',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  fontFamily: 'system-ui, -apple-system, sans-serif',
}

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 640,
  background: '#fff',
  borderRadius: 16,
  overflow: 'hidden',
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
}
