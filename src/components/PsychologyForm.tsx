'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

// ── Checkbox options from the PDF form ──────────────────────────────────────

const PRESENTING_CONCERNS = [
  'School/Work-Related Individual Issues',
  'School/Work-Related Interpersonal Issues',
  'School/Work-Related Organizational Issues',
  'Time Management and Effectiveness Skills',
  'Career',
  'Respect Issues: Bullying/Discrimination/Racism/Harassment',
  'Stress and Coping',
  'Burnout',
  "Child/Adolescent's Issues",
  'Parenting',
  'Family Issues',
  'Harm: Child Protection/VAWC/Domestic Violence/Abuse',
  'Physical Health (eating problem, sleeping problem, medical, exercise and diet etc.)',
  'Psychological Issues (Depression, Anxiety, Trauma, Grief, etc.)',
  'Clinical/Psychiatric Issues (PDs, Bipolar, Schizophrenia, etc.)',
  'Suicidality, Self-Harm or active Psychosis',
  'Legal Issues',
  'Financial Issues',
  'Addiction/s',
  'Neurodevelopmental Disorders (ADHD, ASD, LD)',
  'Neurocognitive Disorders (Dementia)',
]

const SYMPTOMS_WORK = [
  'Absenteeism and Tardiness',
  'Difficulty Functioning at Work/School',
  'Lack of Motivation',
  'Career Uncertainty',
  'Interpersonal Conflict at Work/School',
  'Unethical Business Behavior',
  'Feeling Dissatisfied with Work/School',
]

const SYMPTOMS_INTERPERSONAL = [
  'Difficulty Setting Boundaries',
  'Conflict with Partner',
  'Conflict with Family Member',
  'Other Interpersonal Conflict',
  'Difficulty Maintaining Social Relationships',
  'Social Skills Difficulty',
]

const SYMPTOMS_DEPRESSION = [
  'Isolation/Withdrawal',
  'Sleeping Problem/Change in Sleep Habit',
  'Change in Appetite',
  'Helplessness',
  'Hopelessness',
  'Meaningless in Life',
  'Intrusive Negative Thoughts/Self-Critical Thoughts',
  'Feeling of Worthlessness/Low Esteem',
  'Fatigue',
  'Numb/Empty Feeling',
  'Irritability',
  'Aggressiveness',
  'Apathy',
  'Sudden Mood Shifts',
  'Loneliness',
]

const SYMPTOMS_ANXIETY = [
  'Panic Attacks',
  'Nervousness',
  'Excessive Worrying',
  'Fearfulness',
  'Obsessive Thinking/Intrusive Thoughts',
]

const SYMPTOMS_STRESS = [
  'Constant feeling of Stress',
  'Lowered Immunity',
  'Feeling Tired/Exhausted most of the time',
  'Frequent Headaches and Muscle Pains',
  'Change in Appetite',
]

const SYMPTOMS_SUICIDALITY = [
  'Suicidal Ideation',
  'Self-Harm Behaviors',
]

const SYMPTOMS_OCD = [
  'Obsessive Thoughts',
  'Restlessness',
  'Compulsion',
  'Avoidance of Social Situations due to fear of being judged',
]

const SYMPTOMS_SLEEP = [
  'Intrusive Thoughts/Have unwanted Memories',
  'Frequent Nightmares',
  'Vivid Flashbacks',
  'Hypervigilance',
  'Paranoia',
  'Apathy',
]

// ── Types ───────────────────────────────────────────────────────────────────

interface Section1Data {
  modality: 'Online' | 'Face to Face' | ''
  emergencyContact: string
}

interface Section2Data {
  presentingConcerns: string[]
  presentingConcernsOther: string
  symptomsWork: string[]
  symptomsInterpersonal: string[]
  symptomsDepression: string[]
  symptomsAnxiety: string[]
  symptomsStress: string[]
  symptomsSuicidality: string[]
  symptomsOCD: string[]
  symptomsSleep: string[]
  otherPresentingSymptoms: string
  otherObservations: string
  precipitatingFactors: string
  psychosocialHistory: string
  familyHistoryMentalIllness: string
  previousCounseling: string
  psychiatricHistory: string
  treatmentPlan: string
  goals: string
  plansAndRecommendations: string
}

interface Section3Data {
  preSessionNotes: string
  subjectiveData: string
  goals: string
  psychoEmotionalFunctioning: string
  protectiveFactors: string
  recommendations: string
  nextSchedule: string
}

export interface PsychFormData {
  formType: 'PSYCH_INITIAL' | 'PSYCH_PROGRESS'
  section1: Section1Data
  section2?: Section2Data
  section3?: Section3Data
  clinicianInfo?: {
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
  isFirstSession: boolean
  patientName: string
  patientAge: string | null
  sessionDate: string
  onSubmit: (data: PsychFormData) => Promise<void>
  submitting: boolean
  onCancel: () => void
  initialData?: PsychFormData | null
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
        className="w-full flex items-center justify-between px-5 py-3 bg-[var(--off-white)] hover:bg-[var(--light-gray)] transition-colors"
      >
        <span className="font-semibold text-[14px] text-[var(--charcoal)]" style={{ fontFamily: 'var(--font-display)' }}>
          {title}
        </span>
        {open ? <ChevronUp size={16} className="text-[var(--mid-gray)]" /> : <ChevronDown size={16} className="text-[var(--mid-gray)]" />}
      </button>
      {open && <div className="p-5 space-y-5">{children}</div>}
    </div>
  )
}

// ── Checkbox Group ──────────────────────────────────────────────────────────

function CheckboxGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (val: string[]) => void
}) {
  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
  }

  return (
    <div>
      <p className="text-[13px] font-semibold text-[var(--charcoal)] mb-2">{label}</p>
      <div className="grid grid-cols-1 gap-1.5">
        {options.map((opt) => (
          <label key={opt} className="flex items-start gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
              className="mt-0.5 w-4 h-4 rounded border-[var(--light-gray)] text-[var(--teal)] focus:ring-[var(--teal)] shrink-0"
            />
            <span className="text-[13px] text-[var(--charcoal)] group-hover:text-[var(--teal)] transition-colors leading-snug">
              {opt}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

// ── Text Field ──────────────────────────────────────────────────────────────

function TextField({
  label,
  value,
  onChange,
  required = false,
  rows = 3,
  placeholder,
}: {
  label: string
  value: string
  onChange: (val: string) => void
  required?: boolean
  rows?: number
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="input resize-y !rounded-xl text-[13px]"
      />
    </div>
  )
}

// ── Main Form ───────────────────────────────────────────────────────────────

export default function PsychologyForm({
  isFirstSession,
  patientName,
  patientAge,
  sessionDate,
  onSubmit,
  submitting,
  onCancel,
  initialData,
  clinicianSettings,
}: Props) {
  const [section1, setSection1] = useState<Section1Data>(
    initialData?.section1 ?? { modality: 'Online', emergencyContact: '' }
  )

  const [section2, setSection2] = useState<Section2Data>(
    initialData?.section2 ?? {
      presentingConcerns: [],
      presentingConcernsOther: '',
      symptomsWork: [],
      symptomsInterpersonal: [],
      symptomsDepression: [],
      symptomsAnxiety: [],
      symptomsStress: [],
      symptomsSuicidality: [],
      symptomsOCD: [],
      symptomsSleep: [],
      otherPresentingSymptoms: '',
      otherObservations: '',
      precipitatingFactors: '',
      psychosocialHistory: '',
      familyHistoryMentalIllness: '',
      previousCounseling: '',
      psychiatricHistory: '',
      treatmentPlan: '',
      goals: '',
      plansAndRecommendations: '',
    }
  )

  const [section3, setSection3] = useState<Section3Data>(
    initialData?.section3 ?? {
      preSessionNotes: '',
      subjectiveData: '',
      goals: '',
      psychoEmotionalFunctioning: '',
      protectiveFactors: '',
      recommendations: '',
      nextSchedule: '',
    }
  )

  const [licNo, setLicNo] = useState(initialData?.clinicianInfo?.licNo ?? clinicianSettings?.licenseNo ?? '')
  const [ptrNo, setPtrNo] = useState(initialData?.clinicianInfo?.ptrNo ?? clinicianSettings?.ptrNo ?? '')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(initialData?.clinicianInfo?.signatureDataUrl ?? clinicianSettings?.signatureDataUrl ?? null)

  const s2 = (key: keyof Section2Data, val: any) => setSection2((p) => ({ ...p, [key]: val }))
  const s3 = (key: keyof Section3Data, val: string) => setSection3((p) => ({ ...p, [key]: val }))

  function handleSubmit() {
    const data: PsychFormData = {
      formType: isFirstSession ? 'PSYCH_INITIAL' : 'PSYCH_PROGRESS',
      section1,
      ...(isFirstSession ? { section2 } : { section3 }),
      clinicianInfo: { licNo, ptrNo, signatureDataUrl },
    }
    onSubmit(data)
  }

  return (
    <div>
      {/* Header */}
      <div className="bg-[var(--off-white)] rounded-xl p-4 mb-5 border border-[var(--light-gray)]">
        <h3 className="font-bold text-[15px] text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
          Sandbox Psychology Session Notes
        </h3>
        <p className="text-[12px] text-[var(--mid-gray)] mb-3">
          {isFirstSession ? 'Initial Assessment Form' : 'Progress Notes'} — {patientName}
        </p>
        <div className="grid grid-cols-3 gap-3 text-[12px]">
          <div>
            <span className="text-[var(--mid-gray)]">Client: </span>
            <span className="font-medium text-[var(--charcoal)]">{patientName}</span>
          </div>
          <div>
            <span className="text-[var(--mid-gray)]">Age: </span>
            <span className="font-medium text-[var(--charcoal)]">{patientAge ?? 'N/A'}</span>
          </div>
          <div>
            <span className="text-[var(--mid-gray)]">Date: </span>
            <span className="font-medium text-[var(--charcoal)]">{sessionDate}</span>
          </div>
        </div>
      </div>

      {/* Section 1: Client Information */}
      <CollapsibleSection title="Section 1 — Client Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-1.5">
              Modality <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-4">
              {(['Online', 'Face to Face'] as const).map((opt) => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="modality"
                    checked={section1.modality === opt}
                    onChange={() => setSection1((p) => ({ ...p, modality: opt }))}
                    className="w-4 h-4 text-[var(--teal)] focus:ring-[var(--teal)]"
                  />
                  <span className="text-[13px] text-[var(--charcoal)]">{opt}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[var(--charcoal)] mb-1.5">Emergency Contact</label>
            <input
              type="text"
              value={section1.emergencyContact}
              onChange={(e) => setSection1((p) => ({ ...p, emergencyContact: e.target.value }))}
              className="input !rounded-xl text-[13px]"
              placeholder="Name and contact number"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 2: Initial Assessment (first session only) */}
      {isFirstSession && (
        <CollapsibleSection title="Section 2 — Initial Assessment">
          <CheckboxGroup label="Presenting Problem/Concern *" options={PRESENTING_CONCERNS} selected={section2.presentingConcerns} onChange={(v) => s2('presentingConcerns', v)} />
          <TextField label="Other Presenting Concern" value={section2.presentingConcernsOther} onChange={(v) => s2('presentingConcernsOther', v)} rows={2} />

          <div className="border-t border-[var(--light-gray)] pt-4">
            <p className="text-[14px] font-bold text-[var(--charcoal)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>Presenting Symptoms</p>
            <div className="space-y-4">
              <CheckboxGroup label="School/Work-Related Issues" options={SYMPTOMS_WORK} selected={section2.symptomsWork} onChange={(v) => s2('symptomsWork', v)} />
              <CheckboxGroup label="Interpersonal/Relational Issues" options={SYMPTOMS_INTERPERSONAL} selected={section2.symptomsInterpersonal} onChange={(v) => s2('symptomsInterpersonal', v)} />
              <CheckboxGroup label="Depression" options={SYMPTOMS_DEPRESSION} selected={section2.symptomsDepression} onChange={(v) => s2('symptomsDepression', v)} />
              <CheckboxGroup label="Anxiety" options={SYMPTOMS_ANXIETY} selected={section2.symptomsAnxiety} onChange={(v) => s2('symptomsAnxiety', v)} />
              <CheckboxGroup label="Stress, Burnout, Trauma" options={SYMPTOMS_STRESS} selected={section2.symptomsStress} onChange={(v) => s2('symptomsStress', v)} />
              <CheckboxGroup label="Suicidality/Self-Harm" options={SYMPTOMS_SUICIDALITY} selected={section2.symptomsSuicidality} onChange={(v) => s2('symptomsSuicidality', v)} />
              <CheckboxGroup label="Obsessive Compulsive Behavior" options={SYMPTOMS_OCD} selected={section2.symptomsOCD} onChange={(v) => s2('symptomsOCD', v)} />
              <CheckboxGroup label="Change in Sleep Habits/Sleep Disturbance" options={SYMPTOMS_SLEEP} selected={section2.symptomsSleep} onChange={(v) => s2('symptomsSleep', v)} />
            </div>
          </div>

          <TextField label="Other Presenting Symptoms" value={section2.otherPresentingSymptoms} onChange={(v) => s2('otherPresentingSymptoms', v)} />
          <TextField label="Other Prominent Observations or Concerns" value={section2.otherObservations} onChange={(v) => s2('otherObservations', v)} />
          <TextField label="Precipitating Factors" value={section2.precipitatingFactors} onChange={(v) => s2('precipitatingFactors', v)} />
          <TextField label="Psychosocial History and Contextual Factors" value={section2.psychosocialHistory} onChange={(v) => s2('psychosocialHistory', v)} required placeholder="Themes, Losses, Trauma, Transitions etc." />
          <TextField label="Family History of Mental Illness" value={section2.familyHistoryMentalIllness} onChange={(v) => s2('familyHistoryMentalIllness', v)} />
          <TextField label="History of Previous Counseling/Psychotherapy" value={section2.previousCounseling} onChange={(v) => s2('previousCounseling', v)} />
          <TextField label="Psychiatric History of Client" value={section2.psychiatricHistory} onChange={(v) => s2('psychiatricHistory', v)} />
          <TextField label="Treatment Plan" value={section2.treatmentPlan} onChange={(v) => s2('treatmentPlan', v)} required />
          <TextField label="Goals" value={section2.goals} onChange={(v) => s2('goals', v)} required />
          <TextField label="Plans and Recommendations" value={section2.plansAndRecommendations} onChange={(v) => s2('plansAndRecommendations', v)} required />
        </CollapsibleSection>
      )}

      {/* Section 3: Progress Notes (succeeding sessions only) */}
      {!isFirstSession && (
        <CollapsibleSection title="Section 3 — Progress Notes">
          <TextField label="Pre-session Notes" value={section3.preSessionNotes} onChange={(v) => s3('preSessionNotes', v)} required />
          <TextField label="Subjective Data" value={section3.subjectiveData} onChange={(v) => s3('subjectiveData', v)} required rows={4} />
          <TextField label="Goals" value={section3.goals} onChange={(v) => s3('goals', v)} required rows={4} />
          <TextField label="Psycho-Emotional Functioning" value={section3.psychoEmotionalFunctioning} onChange={(v) => s3('psychoEmotionalFunctioning', v)} required rows={4} />
          <TextField label="Protective Factors" value={section3.protectiveFactors} onChange={(v) => s3('protectiveFactors', v)} />
          <TextField label="Recommendations" value={section3.recommendations} onChange={(v) => s3('recommendations', v)} required rows={4} />
          <TextField label="Next Schedule" value={section3.nextSchedule} onChange={(v) => s3('nextSchedule', v)} />
        </CollapsibleSection>
      )}

      {/* Clinician Information & Signature */}
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

      {/* Submit */}
      <div className="flex gap-3 mt-5">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="btn-primary flex-1 py-3 rounded-xl !bg-gradient-to-r !from-green-600 !to-green-700 !shadow-[0_2px_8px_rgba(22,163,74,0.3)]"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          Save & Complete
        </button>
        <button onClick={onCancel} className="btn-secondary px-6 rounded-xl">
          Cancel
        </button>
      </div>
    </div>
  )
}
