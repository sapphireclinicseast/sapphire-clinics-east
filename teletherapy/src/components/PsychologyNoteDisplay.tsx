'use client'

import type { PsychFormData } from './PsychologyForm'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h4 className="text-[12px] text-[var(--teal)] uppercase font-bold tracking-wider mb-2" style={{ fontFamily: 'var(--font-display)' }}>
        {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-0.5">{label}</p>
      <p className="text-[13px] text-[var(--charcoal)] whitespace-pre-wrap bg-[var(--off-white)] p-3 rounded-lg border border-[var(--light-gray)]">
        {value}
      </p>
    </div>
  )
}

function CheckedItems({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="text-[11px] bg-[var(--pale-teal)] text-[var(--deep-teal)] px-2 py-1 rounded-md font-medium">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function PsychologyNoteDisplay({ data }: { data: PsychFormData }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
          {data.formType === 'PSYCH_INITIAL' ? 'Initial Assessment' : 'Progress Notes'}
        </span>
      </div>

      {/* Section 1 */}
      <Section title="Client Information">
        <div className="grid grid-cols-2 gap-2 text-[13px]">
          <div><span className="text-[var(--mid-gray)]">Modality: </span><span className="font-medium">{data.section1.modality}</span></div>
          {data.section1.emergencyContact && (
            <div><span className="text-[var(--mid-gray)]">Emergency Contact: </span><span className="font-medium">{data.section1.emergencyContact}</span></div>
          )}
        </div>
      </Section>

      {/* Section 2 */}
      {data.section2 && (
        <Section title="Initial Assessment">
          <CheckedItems label="Presenting Concerns" items={data.section2.presentingConcerns} />
          {data.section2.presentingConcernsOther && <Field label="Other Concerns" value={data.section2.presentingConcernsOther} />}
          <CheckedItems label="Work/School Symptoms" items={data.section2.symptomsWork} />
          <CheckedItems label="Interpersonal Symptoms" items={data.section2.symptomsInterpersonal} />
          <CheckedItems label="Depression Symptoms" items={data.section2.symptomsDepression} />
          <CheckedItems label="Anxiety Symptoms" items={data.section2.symptomsAnxiety} />
          <CheckedItems label="Stress/Burnout/Trauma" items={data.section2.symptomsStress} />
          <CheckedItems label="Suicidality/Self-Harm" items={data.section2.symptomsSuicidality} />
          <CheckedItems label="OCD Symptoms" items={data.section2.symptomsOCD} />
          <CheckedItems label="Sleep Disturbance" items={data.section2.symptomsSleep} />
          <Field label="Other Presenting Symptoms" value={data.section2.otherPresentingSymptoms} />
          <Field label="Other Observations" value={data.section2.otherObservations} />
          <Field label="Precipitating Factors" value={data.section2.precipitatingFactors} />
          <Field label="Psychosocial History" value={data.section2.psychosocialHistory} />
          <Field label="Family History of Mental Illness" value={data.section2.familyHistoryMentalIllness} />
          <Field label="Previous Counseling/Psychotherapy" value={data.section2.previousCounseling} />
          <Field label="Psychiatric History" value={data.section2.psychiatricHistory} />
          <Field label="Treatment Plan" value={data.section2.treatmentPlan} />
          <Field label="Goals" value={data.section2.goals} />
          <Field label="Plans and Recommendations" value={data.section2.plansAndRecommendations} />
        </Section>
      )}

      {/* Section 3 */}
      {data.section3 && (
        <Section title="Progress Notes">
          <Field label="Pre-session Notes" value={data.section3.preSessionNotes} />
          <Field label="Subjective Data" value={data.section3.subjectiveData} />
          <Field label="Goals" value={data.section3.goals} />
          <Field label="Psycho-Emotional Functioning" value={data.section3.psychoEmotionalFunctioning} />
          <Field label="Protective Factors" value={data.section3.protectiveFactors} />
          <Field label="Recommendations" value={data.section3.recommendations} />
          <Field label="Next Schedule" value={data.section3.nextSchedule} />
        </Section>
      )}
    </div>
  )
}
