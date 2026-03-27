'use client'

import type { SLPFormData } from './SLPNoteForm'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h4 className="text-[12px] text-blue-600 uppercase font-bold tracking-wider mb-2" style={{ fontFamily: 'var(--font-display)' }}>
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
      {label && <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-0.5">{label}</p>}
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
          <span key={item} className="text-[11px] bg-blue-50 text-blue-700 px-2 py-1 rounded-md font-medium border border-blue-200">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function SLPNoteDisplay({ data }: { data: SLPFormData }) {
  return (
    <div className="space-y-1">
      {/* Badge */}
      <div className="mb-3">
        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-blue-100 text-blue-700">
          SLP Daily Notes
        </span>
        {data.subjective?.branch && (
          <span className="inline-block ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
            {data.subjective.branch}
          </span>
        )}
      </div>

      {/* Subjective */}
      <Section title="Subjective (S)">
        <CheckedItems label="Session Type" items={data.subjective?.sessionType ?? []} />
        {data.subjective?.sessionTypeOther && (
          <Field label="Other Session Type" value={data.subjective.sessionTypeOther} />
        )}
        {data.subjective?.additionalNotes && (
          <Field label="Additional Notes" value={data.subjective.additionalNotes} />
        )}
      </Section>

      {/* Objective */}
      <Section title="Objective (O) — Targeted Areas">
        <CheckedItems label="Targets" items={data.objective?.targets ?? []} />
        {data.objective?.targetsOther && (
          <Field label="Other Targets" value={data.objective.targetsOther} />
        )}
      </Section>

      {/* Patient Assessment */}
      {data.patientAssessment && (
        <Section title="Patient Assessment / Performance (A)">
          <Field label="" value={data.patientAssessment} />
        </Section>
      )}

      {/* Plan */}
      <Section title="Plan (P)">
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

      {/* Clinician Info & Signature */}
      {(data.clinicianInfo?.licNo || data.clinicianInfo?.ptrNo || data.clinicianInfo?.signatureDataUrl) && (
        <Section title="Clinician Information">
          <div className="flex gap-4 text-[13px] mb-2">
            {data.clinicianInfo?.licNo && (
              <span><strong>PRC Lic No:</strong> {data.clinicianInfo.licNo}</span>
            )}
            {data.clinicianInfo?.ptrNo && (
              <span><strong>PTR No:</strong> {data.clinicianInfo.ptrNo}</span>
            )}
          </div>
          {data.clinicianInfo?.signatureDataUrl && (
            <div>
              <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-1">Signature</p>
              <div className="bg-white border border-[var(--light-gray)] rounded-lg p-2 inline-block">
                <img src={data.clinicianInfo.signatureDataUrl} alt="Clinician Signature" className="max-h-20" />
              </div>
            </div>
          )}
        </Section>
      )}
    </div>
  )
}
