'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

// ── Options from the SLP Daily Notes PDF ────────────────────────────────────

const SESSION_TYPES = [
  'Basic Session',
  'Evaluation Session',
  'Specialized Session',
  'Group Session',
  'PTC',
]

const BRANCHES = ['East', 'Greenhills']

const OBJECTIVE_TARGETS = [
  'Receptive Language',
  'Vocabulary Building',
  'Auditory Processing (Following directions)',
  'Auditory processing (Answering questions)',
  'Expressive Language — Content',
  'Expressive Language — Form',
  'Expressive Language — Use',
  'Higher Language',
  'Pragmatic Language',
  'Narratives',
  'Play',
  'Precursory Skills',
  'Hearing',
  'Articulation',
  'Phonology',
  'Feeding/Swallowing',
  'Voice',
  'Fluency',
  'Oral Peripheral Mechanism',
]

const PLAN_OPTIONS = [
  'Continue management',
  'Modify/add activities',
  'Caregiver education/coaching',
  'Update home program',
]

// ── Types ───────────────────────────────────────────────────────────────────

export interface SLPFormData {
  formType: 'SLP_DAILY_NOTES'
  subjective: {
    sessionType: string[]
    sessionTypeOther: string
    branch: string
    additionalNotes: string
  }
  objective: {
    targets: string[]
    targetsOther: string
  }
  patientAssessment: string
  plan: {
    selectedPlans: string[]
    continueManagementDetails: string
    modifyActivitiesDetails: string
    othersDetails: string
  }
  clinicianInfo: {
    licNo: string
    ptrNo: string
    signatureDataUrl?: string | null
  }
}

interface ClinicianSettingsData {
  licenseNo?: string | null
  ptrNo?: string | null
  signatureDataUrl?: string | null
}

interface Props {
  patientName: string
  sessionDate: string
  onSubmit: (data: SLPFormData) => Promise<void>
  submitting: boolean
  onCancel: () => void
  initialData?: SLPFormData | null
  clinicianSettings?: ClinicianSettingsData | null
}

// ── Collapsible Section ─────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-[var(--light-gray)] rounded-xl overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--off-white)] hover:bg-gray-100 transition-colors"
      >
        <span className="text-[13px] font-bold text-[var(--deep-teal)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>
          {title}
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  )
}

// ── Checkbox Group ──────────────────────────────────────────────────────────

function CheckboxGroup({
  options,
  selected,
  onChange,
  columns = 3,
}: {
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
  columns?: number
}) {
  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
  }
  return (
    <div className={`grid gap-2 ${columns === 3 ? 'grid-cols-1 sm:grid-cols-3' : columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
      {options.map((opt) => (
        <label key={opt} className="flex items-start gap-2 cursor-pointer group">
          <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)}
            className="mt-0.5 accent-[var(--teal)] w-4 h-4" />
          <span className="text-[13px] text-[var(--charcoal)] group-hover:text-[var(--deep-teal)] leading-tight">{opt}</span>
        </label>
      ))}
    </div>
  )
}

// ── Main SLP Form ───────────────────────────────────────────────────────────

export default function SLPNoteForm({ patientName, sessionDate, onSubmit, submitting, onCancel, initialData, clinicianSettings }: Props) {
  const init = initialData

  const [sessionType, setSessionType] = useState<string[]>(init?.subjective?.sessionType ?? [])
  const [sessionTypeOther, setSessionTypeOther] = useState(init?.subjective?.sessionTypeOther ?? '')
  const [branch, setBranch] = useState(init?.subjective?.branch ?? '')
  const [additionalNotes, setAdditionalNotes] = useState(init?.subjective?.additionalNotes ?? '')

  const [targets, setTargets] = useState<string[]>(init?.objective?.targets ?? [])
  const [targetsOther, setTargetsOther] = useState(init?.objective?.targetsOther ?? '')

  const [patientAssessment, setPatientAssessment] = useState(init?.patientAssessment ?? '')

  const [selectedPlans, setSelectedPlans] = useState<string[]>(init?.plan?.selectedPlans ?? [])
  const [continueManagementDetails, setContinueManagementDetails] = useState(init?.plan?.continueManagementDetails ?? '')
  const [modifyActivitiesDetails, setModifyActivitiesDetails] = useState(init?.plan?.modifyActivitiesDetails ?? '')
  const [othersDetails, setOthersDetails] = useState(init?.plan?.othersDetails ?? '')

  const [licNo, setLicNo] = useState(init?.clinicianInfo?.licNo ?? clinicianSettings?.licenseNo ?? '')
  const [ptrNo, setPtrNo] = useState(init?.clinicianInfo?.ptrNo ?? clinicianSettings?.ptrNo ?? '')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(
    init?.clinicianInfo?.signatureDataUrl ?? clinicianSettings?.signatureDataUrl ?? null
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const data: SLPFormData = {
      formType: 'SLP_DAILY_NOTES',
      subjective: { sessionType, sessionTypeOther, branch, additionalNotes },
      objective: { targets, targetsOther },
      patientAssessment,
      plan: { selectedPlans, continueManagementDetails, modifyActivitiesDetails, othersDetails },
      clinicianInfo: { licNo, ptrNo, signatureDataUrl },
    }
    await onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {/* Header */}
      <div className="text-center mb-4">
        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-blue-100 text-blue-700 mb-2">
          SLP Daily Notes
        </span>
        <p className="text-[13px] text-[var(--mid-gray)]">
          <strong>{patientName}</strong> · {sessionDate}
        </p>
      </div>

      {/* Section 1: Subjective */}
      <CollapsibleSection title="Subjective (S)">
        <p className="text-[13px] text-[var(--mid-gray)] mb-3 italic">
          <strong>{patientName}</strong> was seen and managed today for speech-language therapy.
        </p>

        <div className="mb-3">
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">Branch</label>
          <div className="flex flex-wrap gap-3">
            {BRANCHES.map((b) => (
              <label key={b} className="flex items-center gap-2 cursor-pointer group">
                <input type="radio" name="branch" checked={branch === b} onChange={() => setBranch(b)}
                  className="accent-[var(--teal)] w-4 h-4" />
                <span className="text-[13px] text-[var(--charcoal)] group-hover:text-[var(--deep-teal)]">{b}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">Session Type</label>
        <CheckboxGroup options={SESSION_TYPES} selected={sessionType} onChange={setSessionType} columns={2} />
        <div className="mt-3">
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Others</label>
          <input value={sessionTypeOther} onChange={(e) => setSessionTypeOther(e.target.value)}
            className="input text-[13px]" placeholder="Specify other session type..." />
        </div>

        <div className="mt-3">
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Additional Subjective Notes</label>
          <textarea value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)}
            className="input text-[13px] min-h-[80px] resize-y" placeholder="Additional subjective observations..." />
        </div>
      </CollapsibleSection>

      {/* Section 2: Objective */}
      <CollapsibleSection title="Objective (O) — The following were targeted">
        <CheckboxGroup options={OBJECTIVE_TARGETS} selected={targets} onChange={setTargets} columns={3} />
        <div className="mt-3">
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Others</label>
          <input value={targetsOther} onChange={(e) => setTargetsOther(e.target.value)}
            className="input text-[13px]" placeholder="Specify other targets..." />
        </div>
      </CollapsibleSection>

      {/* Section 3: Patient Assessment/Performance */}
      <CollapsibleSection title="Patient Assessment / Performance (A)">
        <textarea value={patientAssessment} onChange={(e) => setPatientAssessment(e.target.value)}
          className="input text-[13px] min-h-[120px] resize-y"
          placeholder="Describe patient assessment and performance during the session..." />
      </CollapsibleSection>

      {/* Section 4: Plan */}
      <CollapsibleSection title="Plan (P)">
        <CheckboxGroup options={PLAN_OPTIONS} selected={selectedPlans} onChange={setSelectedPlans} columns={2} />

        {selectedPlans.includes('Continue management') && (
          <div className="mt-3">
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">Continue Management Details</label>
            <textarea value={continueManagementDetails} onChange={(e) => setContinueManagementDetails(e.target.value)}
              className="input text-[13px] min-h-[60px] resize-y" placeholder="Details..." />
          </div>
        )}

        {selectedPlans.includes('Modify/add activities') && (
          <div className="mt-3">
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">Modify/Add Activities Details</label>
            <textarea value={modifyActivitiesDetails} onChange={(e) => setModifyActivitiesDetails(e.target.value)}
              className="input text-[13px] min-h-[60px] resize-y" placeholder="Details..." />
          </div>
        )}

        <div className="mt-3">
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Others</label>
          <input value={othersDetails} onChange={(e) => setOthersDetails(e.target.value)}
            className="input text-[13px]" placeholder="Other plans..." />
        </div>
      </CollapsibleSection>

      {/* Section 5: Clinician Info & Signature */}
      <CollapsibleSection title="Clinician Information & Signature" defaultOpen={false}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">PRC License No.</label>
            <input value={licNo} onChange={(e) => setLicNo(e.target.value)}
              className="input text-[13px]" placeholder="PRC License No." />
            {clinicianSettings?.licenseNo && !init?.clinicianInfo?.licNo && (
              <p className="text-[10px] text-green-600 mt-0.5">Auto-filled from Settings</p>
            )}
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">PTR No.</label>
            <input value={ptrNo} onChange={(e) => setPtrNo(e.target.value)}
              className="input text-[13px]" placeholder="PTR No." />
            {clinicianSettings?.ptrNo && !init?.clinicianInfo?.ptrNo && (
              <p className="text-[10px] text-green-600 mt-0.5">Auto-filled from Settings</p>
            )}
          </div>
        </div>

        {/* Signature */}
        <div>
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">Signature</label>
          {signatureDataUrl ? (
            <div className="border border-[var(--light-gray)] rounded-xl p-3 bg-white">
              <img src={signatureDataUrl} alt="Signature" className="max-h-24 mx-auto" />
              <div className="flex justify-center gap-3 mt-2">
                {clinicianSettings?.signatureDataUrl && (
                  <p className="text-[10px] text-green-600">Auto-filled from Settings</p>
                )}
                <button type="button" onClick={() => setSignatureDataUrl(null)}
                  className="text-[11px] text-red-500 hover:text-red-700 font-medium">
                  Remove Signature
                </button>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-[var(--light-gray)] rounded-xl p-6 text-center">
              <p className="text-[12px] text-[var(--mid-gray)] mb-2">No signature set</p>
              <p className="text-[11px] text-[var(--mid-gray)]">
                Go to <strong>Settings</strong> in the sidebar to set up your digital signature
              </p>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button type="submit" disabled={submitting}
          className="btn-primary flex-1 flex items-center justify-center gap-2 !py-3 !rounded-xl">
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          {submitting ? 'Saving...' : 'Save & Complete'}
        </button>
        <button type="button" onClick={onCancel}
          className="btn-secondary !py-3 !px-6 !rounded-xl">
          Cancel
        </button>
      </div>
    </form>
  )
}
