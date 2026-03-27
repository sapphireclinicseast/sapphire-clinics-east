'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

// ── SPED16 Options ──────────────────────────────────────────────────────────

const SESSION_TYPES = [
  'One-on-one Session',
  'Group Session',
  'PTC',
  'Classroom Observation',
]

const PLAN_OPTIONS = [
  'Continue sessions',
  'Modify/add activities',
  'Caregiver education/coaching',
  'Update home program',
]

// ── SPED18 Options ──────────────────────────────────────────────────────────

const CIRCLE_TIME_OPTIONS = [
  'Prayer',
  'Greetings',
  'Weather',
  'Days of the week',
  'Months of the year',
]

const SKILL_AREAS = ['Cognitive', 'Fine Motor', 'Social Behavior']

const OBSERVATION_FOCUS = [
  'Stayed focused throughout',
  'Required frequent reminders to stay on task',
  'Worked independently',
  'Needed step-by-step guidance',
  'Made noticeable progress',
  'Responded to prompts',
]

const OBSERVATION_MOTOR = [
  'Demonstrated proper hand positioning',
  'Needed reminders about grip/posture',
  'Showed improved dexterity',
  'Complained of hand fatigue',
  'Expressed frustration with fine motor tasks',
]

const OBSERVATION_SOCIAL_A = [
  'Made appropriate eye contact',
  'Avoided eye contact',
]

const OBSERVATION_SOCIAL_B = [
  'Took turns appropriately',
  'Had difficulty waiting for turns',
]

const OBSERVATION_COMM_A = [
  'Used clear communication',
  'Spoke quietly/mumbled',
  'Initiated conversation',
]

const OBSERVATION_COMM_B = [
  'Showed empathy/understanding',
  'Displayed a negative attitude toward peer interaction',
]

// ── Types ───────────────────────────────────────────────────────────────────

interface SPED16Data {
  sessionType: string[]
  sessionTypeOther: string
  strengths: string
  challenges: string
  observedBehavior: string
  recommendations: string
  selectedPlans: string[]
  othersDetails: string
}

interface SPED18Data {
  sessionType: string[]
  sessionTypeOther: string
  circleTime: string[]
  skillAreas: string[]
  activities: string
  observations: string[]
  observationOther: string
  remarks: string
}

export interface SPEDFormData {
  formType: 'SPED16' | 'SPED18'
  data: SPED16Data | SPED18Data
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
  formVariant: 'SPED16' | 'SPED18'
  patientName: string
  sessionDate: string
  onSubmit: (data: SPEDFormData) => Promise<void>
  submitting: boolean
  onCancel: () => void
  initialData?: SPEDFormData | null
  clinicianSettings?: ClinicianSettingsData | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function CollapsibleSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-[var(--light-gray)] rounded-xl overflow-hidden mb-4">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--off-white)] hover:bg-gray-100 transition-colors">
        <span className="text-[13px] font-bold text-[var(--deep-teal)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>{title}</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  )
}

function CheckboxGroup({ options, selected, onChange, columns = 2 }: { options: string[]; selected: string[]; onChange: (v: string[]) => void; columns?: number }) {
  const toggle = (opt: string) => onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
  return (
    <div className={`grid gap-2 ${columns === 3 ? 'grid-cols-1 sm:grid-cols-3' : columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
      {options.map((opt) => (
        <label key={opt} className="flex items-start gap-2 cursor-pointer group">
          <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="mt-0.5 accent-[var(--teal)] w-4 h-4" />
          <span className="text-[13px] text-[var(--charcoal)] group-hover:text-[var(--deep-teal)] leading-tight">{opt}</span>
        </label>
      ))}
    </div>
  )
}

// ── SPED16 Form ─────────────────────────────────────────────────────────────

function SPED16Form({ patientName, sessionDate, initialData, clinicianSettings, onSubmit, submitting, onCancel }: Omit<Props, 'formVariant'>) {
  const init = initialData?.formType === 'SPED16' ? initialData.data as SPED16Data : null

  const [sessionType, setSessionType] = useState<string[]>(init?.sessionType ?? [])
  const [sessionTypeOther, setSessionTypeOther] = useState(init?.sessionTypeOther ?? '')
  const [strengths, setStrengths] = useState(init?.strengths ?? '')
  const [challenges, setChallenges] = useState(init?.challenges ?? '')
  const [observedBehavior, setObservedBehavior] = useState(init?.observedBehavior ?? '')
  const [recommendations, setRecommendations] = useState(init?.recommendations ?? '')
  const [selectedPlans, setSelectedPlans] = useState<string[]>(init?.selectedPlans ?? [])
  const [othersDetails, setOthersDetails] = useState(init?.othersDetails ?? '')
  const [licNo, setLicNo] = useState(initialData?.clinicianInfo?.licNo ?? clinicianSettings?.licenseNo ?? '')
  const [ptrNo, setPtrNo] = useState(initialData?.clinicianInfo?.ptrNo ?? clinicianSettings?.ptrNo ?? '')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(initialData?.clinicianInfo?.signatureDataUrl ?? clinicianSettings?.signatureDataUrl ?? null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({
      formType: 'SPED16',
      data: { sessionType, sessionTypeOther, strengths, challenges, observedBehavior, recommendations, selectedPlans, othersDetails },
      clinicianInfo: { licNo, ptrNo, signatureDataUrl },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="text-center mb-4">
        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-purple-100 text-purple-700 mb-2">SPED16 — Daily Notes</span>
        <p className="text-[13px] text-[var(--mid-gray)]"><strong>{patientName}</strong> · {sessionDate}</p>
      </div>

      <CollapsibleSection title="Subjective">
        <p className="text-[13px] text-[var(--mid-gray)] mb-3 italic"><strong>{patientName}</strong> was seen and managed today for SPED session.</p>
        <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">Session Type</label>
        <CheckboxGroup options={SESSION_TYPES} selected={sessionType} onChange={setSessionType} />
        <div className="mt-3">
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Others</label>
          <input value={sessionTypeOther} onChange={(e) => setSessionTypeOther(e.target.value)} className="input text-[13px]" placeholder="Specify..." />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Present Level of Performance">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Strengths</label>
            <textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} className="input text-[13px] min-h-[120px] resize-y" placeholder="Patient's strengths..." />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Challenges</label>
            <textarea value={challenges} onChange={(e) => setChallenges(e.target.value)} className="input text-[13px] min-h-[120px] resize-y" placeholder="Patient's challenges..." />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Observed Behavior">
        <textarea value={observedBehavior} onChange={(e) => setObservedBehavior(e.target.value)} className="input text-[13px] min-h-[120px] resize-y" placeholder="Describe observed behavior during the session..." />
      </CollapsibleSection>

      <CollapsibleSection title="Recommendations">
        <textarea value={recommendations} onChange={(e) => setRecommendations(e.target.value)} className="input text-[13px] min-h-[100px] resize-y" placeholder="Recommendations..." />
      </CollapsibleSection>

      <CollapsibleSection title="Plan">
        <CheckboxGroup options={PLAN_OPTIONS} selected={selectedPlans} onChange={setSelectedPlans} />
        <div className="mt-3">
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Others</label>
          <input value={othersDetails} onChange={(e) => setOthersDetails(e.target.value)} className="input text-[13px]" placeholder="Other plans..." />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Clinician Information & Signature" defaultOpen={false}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">PRC License No.</label>
            <input value={licNo} onChange={(e) => setLicNo(e.target.value)} className="input text-[13px]" placeholder="PRC License No." />
            {clinicianSettings?.licenseNo && !initialData?.clinicianInfo?.licNo && <p className="text-[10px] text-green-600 mt-0.5">Auto-filled from Settings</p>}
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">PTR No.</label>
            <input value={ptrNo} onChange={(e) => setPtrNo(e.target.value)} className="input text-[13px]" placeholder="PTR No." />
            {clinicianSettings?.ptrNo && !initialData?.clinicianInfo?.ptrNo && <p className="text-[10px] text-green-600 mt-0.5">Auto-filled from Settings</p>}
          </div>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">Signature</label>
          {signatureDataUrl ? (
            <div className="border border-[var(--light-gray)] rounded-xl p-3 bg-white">
              <img src={signatureDataUrl} alt="Signature" className="max-h-24 mx-auto" />
              <div className="flex justify-center gap-3 mt-2">
                {clinicianSettings?.signatureDataUrl && <p className="text-[10px] text-green-600">Auto-filled from Settings</p>}
                <button type="button" onClick={() => setSignatureDataUrl(null)} className="text-[11px] text-red-500 hover:text-red-700 font-medium">Remove</button>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-[var(--light-gray)] rounded-xl p-6 text-center">
              <p className="text-[12px] text-[var(--mid-gray)]">No signature set. Go to <strong>Settings</strong> to set up your digital signature.</p>
            </div>
          )}
        </div>
      </CollapsibleSection>

      <div className="flex gap-3 pt-4">
        <button type="submit" disabled={submitting} className="btn-primary flex-1 flex items-center justify-center gap-2 !py-3 !rounded-xl">
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          {submitting ? 'Saving...' : 'Save & Complete'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary !py-3 !px-6 !rounded-xl">Cancel</button>
      </div>
    </form>
  )
}

// ── SPED18 Form ─────────────────────────────────────────────────────────────

function SPED18Form({ patientName, sessionDate, initialData, clinicianSettings, onSubmit, submitting, onCancel }: Omit<Props, 'formVariant'>) {
  const init = initialData?.formType === 'SPED18' ? initialData.data as SPED18Data : null

  const [sessionType, setSessionType] = useState<string[]>(init?.sessionType ?? [])
  const [sessionTypeOther, setSessionTypeOther] = useState(init?.sessionTypeOther ?? '')
  const [circleTime, setCircleTime] = useState<string[]>(init?.circleTime ?? [])
  const [skillAreas, setSkillAreas] = useState<string[]>(init?.skillAreas ?? [])
  const [activities, setActivities] = useState(init?.activities ?? '')
  const [observations, setObservations] = useState<string[]>(init?.observations ?? [])
  const [observationOther, setObservationOther] = useState(init?.observationOther ?? '')
  const [remarks, setRemarks] = useState(init?.remarks ?? '')
  const [licNo, setLicNo] = useState(initialData?.clinicianInfo?.licNo ?? clinicianSettings?.licenseNo ?? '')
  const [ptrNo, setPtrNo] = useState(initialData?.clinicianInfo?.ptrNo ?? clinicianSettings?.ptrNo ?? '')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(initialData?.clinicianInfo?.signatureDataUrl ?? clinicianSettings?.signatureDataUrl ?? null)

  const allObservationOptions = [...OBSERVATION_FOCUS, ...OBSERVATION_MOTOR, ...OBSERVATION_SOCIAL_A, ...OBSERVATION_SOCIAL_B, ...OBSERVATION_COMM_A, ...OBSERVATION_COMM_B]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({
      formType: 'SPED18',
      data: { sessionType, sessionTypeOther, circleTime, skillAreas, activities, observations, observationOther, remarks },
      clinicianInfo: { licNo, ptrNo, signatureDataUrl },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="text-center mb-4">
        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-violet-100 text-violet-700 mb-2">SPED18 — Daily Notes</span>
        <p className="text-[13px] text-[var(--mid-gray)]"><strong>{patientName}</strong> · {sessionDate}</p>
      </div>

      <CollapsibleSection title="Subjective">
        <p className="text-[13px] text-[var(--mid-gray)] mb-3 italic"><strong>{patientName}</strong> was seen and managed today for SPED session.</p>
        <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">Session Type</label>
        <CheckboxGroup options={SESSION_TYPES} selected={sessionType} onChange={setSessionType} />
        <div className="mt-3">
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Others</label>
          <input value={sessionTypeOther} onChange={(e) => setSessionTypeOther(e.target.value)} className="input text-[13px]" placeholder="Specify..." />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Today's Activities">
        <div className="mb-3">
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">Circle Time</label>
          <CheckboxGroup options={CIRCLE_TIME_OPTIONS} selected={circleTime} onChange={setCircleTime} columns={3} />
        </div>
        <div className="mb-3">
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">Skill Areas</label>
          <CheckboxGroup options={SKILL_AREAS} selected={skillAreas} onChange={setSkillAreas} columns={3} />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Activities</label>
          <textarea value={activities} onChange={(e) => setActivities(e.target.value)} className="input text-[13px] min-h-[120px] resize-y" placeholder="Describe activities performed..." />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Observation">
        <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-2">Focus & Task Behavior</p>
        <CheckboxGroup options={OBSERVATION_FOCUS} selected={observations} onChange={setObservations} />
        <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-2 mt-4">Fine Motor Skills</p>
        <CheckboxGroup options={OBSERVATION_MOTOR} selected={observations} onChange={setObservations} />
        <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-2 mt-4">Social — Eye Contact</p>
        <CheckboxGroup options={OBSERVATION_SOCIAL_A} selected={observations} onChange={setObservations} />
        <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-2 mt-4">Social — Turn Taking</p>
        <CheckboxGroup options={OBSERVATION_SOCIAL_B} selected={observations} onChange={setObservations} />
        <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-2 mt-4">Communication</p>
        <CheckboxGroup options={OBSERVATION_COMM_A} selected={observations} onChange={setObservations} />
        <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-2 mt-4">Empathy & Peer Interaction</p>
        <CheckboxGroup options={OBSERVATION_COMM_B} selected={observations} onChange={setObservations} />
        <div className="mt-3">
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-1">Other Observations</label>
          <input value={observationOther} onChange={(e) => setObservationOther(e.target.value)} className="input text-[13px]" placeholder="Other observations..." />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Remarks">
        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="input text-[13px] min-h-[100px] resize-y" placeholder="Additional remarks..." />
      </CollapsibleSection>

      <CollapsibleSection title="Clinician Information & Signature" defaultOpen={false}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">PRC License No.</label>
            <input value={licNo} onChange={(e) => setLicNo(e.target.value)} className="input text-[13px]" placeholder="PRC License No." />
            {clinicianSettings?.licenseNo && !initialData?.clinicianInfo?.licNo && <p className="text-[10px] text-green-600 mt-0.5">Auto-filled from Settings</p>}
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">PTR No.</label>
            <input value={ptrNo} onChange={(e) => setPtrNo(e.target.value)} className="input text-[13px]" placeholder="PTR No." />
            {clinicianSettings?.ptrNo && !initialData?.clinicianInfo?.ptrNo && <p className="text-[10px] text-green-600 mt-0.5">Auto-filled from Settings</p>}
          </div>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">Signature</label>
          {signatureDataUrl ? (
            <div className="border border-[var(--light-gray)] rounded-xl p-3 bg-white">
              <img src={signatureDataUrl} alt="Signature" className="max-h-24 mx-auto" />
              <div className="flex justify-center gap-3 mt-2">
                {clinicianSettings?.signatureDataUrl && <p className="text-[10px] text-green-600">Auto-filled from Settings</p>}
                <button type="button" onClick={() => setSignatureDataUrl(null)} className="text-[11px] text-red-500 hover:text-red-700 font-medium">Remove</button>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-[var(--light-gray)] rounded-xl p-6 text-center">
              <p className="text-[12px] text-[var(--mid-gray)]">No signature set. Go to <strong>Settings</strong> to set up your digital signature.</p>
            </div>
          )}
        </div>
      </CollapsibleSection>

      <div className="flex gap-3 pt-4">
        <button type="submit" disabled={submitting} className="btn-primary flex-1 flex items-center justify-center gap-2 !py-3 !rounded-xl">
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          {submitting ? 'Saving...' : 'Save & Complete'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary !py-3 !px-6 !rounded-xl">Cancel</button>
      </div>
    </form>
  )
}

// ── Main Export ──────────────────────────────────────────────────────────────

export default function SPEDNoteForm(props: Props) {
  if (props.formVariant === 'SPED18') return <SPED18Form {...props} />
  return <SPED16Form {...props} />
}
