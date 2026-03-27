'use client'

import type { SPEDFormData } from './SPEDNoteForm'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h4 className="text-[12px] text-purple-600 uppercase font-bold tracking-wider mb-2" style={{ fontFamily: 'var(--font-display)' }}>{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      {label && <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-0.5">{label}</p>}
      <p className="text-[13px] text-[var(--charcoal)] whitespace-pre-wrap bg-[var(--off-white)] p-3 rounded-lg border border-[var(--light-gray)]">{value}</p>
    </div>
  )
}

function CheckedItems({ label, items, color = 'purple' }: { label: string; items: string[]; color?: string }) {
  if (!items || items.length === 0) return null
  const bgColor = color === 'purple' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-violet-50 text-violet-700 border-violet-200'
  return (
    <div>
      <p className="text-[11px] text-[var(--mid-gray)] uppercase font-semibold tracking-wider mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className={`text-[11px] ${bgColor} px-2 py-1 rounded-md font-medium border`}>{item}</span>
        ))}
      </div>
    </div>
  )
}

export default function SPEDNoteDisplay({ data }: { data: SPEDFormData }) {
  const isSPED16 = data.formType === 'SPED16'

  return (
    <div className="space-y-1">
      {/* Badge */}
      <div className="mb-3">
        <span className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase ${isSPED16 ? 'bg-purple-100 text-purple-700' : 'bg-violet-100 text-violet-700'}`}>
          {isSPED16 ? 'SPED16 — Daily Notes' : 'SPED18 — Daily Notes'}
        </span>
      </div>

      {isSPED16 ? <SPED16Display data={data.data as any} /> : <SPED18Display data={data.data as any} />}

      {/* Clinician Info & Signature */}
      {(data.clinicianInfo?.licNo || data.clinicianInfo?.ptrNo || data.clinicianInfo?.signatureDataUrl) && (
        <Section title="Clinician Information">
          <div className="flex gap-4 text-[13px] mb-2">
            {data.clinicianInfo?.licNo && <span><strong>PRC Lic No:</strong> {data.clinicianInfo.licNo}</span>}
            {data.clinicianInfo?.ptrNo && <span><strong>PTR No:</strong> {data.clinicianInfo.ptrNo}</span>}
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

function SPED16Display({ data }: { data: any }) {
  return (
    <>
      <Section title="Subjective">
        <CheckedItems label="Session Type" items={data.sessionType ?? []} />
        {data.sessionTypeOther && <Field label="Other" value={data.sessionTypeOther} />}
      </Section>

      {(data.strengths || data.challenges) && (
        <Section title="Present Level of Performance">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.strengths && <Field label="Strengths" value={data.strengths} />}
            {data.challenges && <Field label="Challenges" value={data.challenges} />}
          </div>
        </Section>
      )}

      {data.observedBehavior && (
        <Section title="Observed Behavior">
          <Field label="" value={data.observedBehavior} />
        </Section>
      )}

      {data.recommendations && (
        <Section title="Recommendations">
          <Field label="" value={data.recommendations} />
        </Section>
      )}

      <Section title="Plan">
        <CheckedItems label="Selected Plans" items={data.selectedPlans ?? []} />
        {data.othersDetails && <Field label="Others" value={data.othersDetails} />}
      </Section>
    </>
  )
}

function SPED18Display({ data }: { data: any }) {
  return (
    <>
      <Section title="Subjective">
        <CheckedItems label="Session Type" items={data.sessionType ?? []} color="violet" />
        {data.sessionTypeOther && <Field label="Other" value={data.sessionTypeOther} />}
      </Section>

      <Section title="Today's Activities">
        {data.circleTime?.length > 0 && <CheckedItems label="Circle Time" items={data.circleTime} color="violet" />}
        {data.skillAreas?.length > 0 && <CheckedItems label="Skill Areas" items={data.skillAreas} color="violet" />}
        {data.activities && <Field label="Activities" value={data.activities} />}
      </Section>

      {data.observations?.length > 0 && (
        <Section title="Observation">
          <CheckedItems label="" items={data.observations} color="violet" />
          {data.observationOther && <Field label="Other Observations" value={data.observationOther} />}
        </Section>
      )}

      {data.remarks && (
        <Section title="Remarks">
          <Field label="" value={data.remarks} />
        </Section>
      )}
    </>
  )
}
