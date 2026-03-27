'use client'

import type { OTFormData } from './OTNoteForm'

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
          <span key={item} className="text-[11px] bg-orange-50 text-orange-700 px-2 py-1 rounded-md font-medium border border-orange-200">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function RadioValue({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-2">
      <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider">{label}:</p>
      <span className="text-[12px] bg-[var(--pale-teal)] text-[var(--deep-teal)] px-2 py-0.5 rounded-md font-semibold">{value}</span>
    </div>
  )
}

export default function OTNoteDisplay({ data }: { data: OTFormData }) {
  return (
    <div className="space-y-1">
      {/* Badge */}
      <div className="mb-3">
        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-orange-100 text-orange-700">
          OT Daily Notes
        </span>
      </div>

      {/* Subjective */}
      <Section title="Subjective">
        <CheckedItems label="Session Type" items={data.subjective?.sessionType ?? []} />
        {data.subjective?.sessionTypeOther && (
          <Field label="Other Session Type" value={data.subjective.sessionTypeOther} />
        )}
      </Section>

      {/* Objective */}
      <Section title="Objective — Targeted Areas">
        <CheckedItems label="Targets" items={data.objective?.targets ?? []} />
        {data.objective?.targetsOther && (
          <Field label="Other Targets" value={data.objective.targetsOther} />
        )}
      </Section>

      {/* Activities and Performance */}
      {data.activitiesAndPerformance && (
        <Section title="Activities and Performance">
          <Field label="" value={data.activitiesAndPerformance} />
        </Section>
      )}

      {/* Assessment */}
      <Section title="Assessment">
        <RadioValue label="Task/Skills Execution" value={data.assessment?.taskExecution} />
        <RadioValue label="Overall Participation" value={data.assessment?.overallParticipation} />
        {data.assessment?.didWellIn && (
          <Field label="Did Well In" value={data.assessment.didWellIn} />
        )}
        {data.assessment?.needsImprovementIn && (
          <Field label="Needs Improvement In" value={data.assessment.needsImprovementIn} />
        )}
      </Section>

      {/* Plan */}
      <Section title="Plan">
        <CheckedItems label="Selected Plans" items={data.plan?.selectedPlans ?? []} />
        {data.plan?.continueManagementDetails && (
          <Field label="Continue Management" value={data.plan.continueManagementDetails} />
        )}
        {data.plan?.modifyActivitiesDetails && (
          <Field label="Modify/Add Activities" value={data.plan.modifyActivitiesDetails} />
        )}
        {data.plan?.othersDetails && (
          <Field label="Others" value={data.plan.othersDetails} />
        )}
      </Section>

      {/* Clinician Info */}
      {(data.clinicianInfo?.licNo || data.clinicianInfo?.ptrNo) && (
        <Section title="Clinician Information">
          <div className="flex gap-4 text-[13px]">
            {data.clinicianInfo?.licNo && (
              <span><strong>Lic No:</strong> {data.clinicianInfo.licNo}</span>
            )}
            {data.clinicianInfo?.ptrNo && (
              <span><strong>PTR No:</strong> {data.clinicianInfo.ptrNo}</span>
            )}
          </div>
        </Section>
      )}
    </div>
  )
}
