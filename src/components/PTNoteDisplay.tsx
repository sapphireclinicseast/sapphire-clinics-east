'use client'

import type { PTFormData } from './PTNoteForm'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h4 className="text-[12px] text-blue-600 uppercase font-bold tracking-wider mb-2" style={{ fontFamily: 'var(--font-display)' }}>{title}</h4>
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

export default function PTNoteDisplay({ data }: { data: PTFormData }) {
  return (
    <div className="space-y-1">
      {/* Badge */}
      <div className="mb-3">
        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-blue-100 text-blue-700">
          PT Session Notes
        </span>
        {data.branch && (
          <span className="inline-block ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 uppercase">
            {data.branch}
          </span>
        )}
      </div>

      {/* Patient Info */}
      {(data.diagnosis || data.precautions || data.patientSituation || data.sessionNumber) && (
        <Section title="Patient Information">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[13px]">
            {data.diagnosis && <div><span className="text-[var(--mid-gray)]">Diagnosis:</span> <strong>{data.diagnosis}</strong></div>}
            {data.sessionNumber && <div><span className="text-[var(--mid-gray)]">Session #:</span> <strong>{data.sessionNumber}</strong></div>}
            {data.precautions && <div><span className="text-[var(--mid-gray)]">Precautions:</span> <strong>{data.precautions}</strong></div>}
            {data.patientSituation && <div><span className="text-[var(--mid-gray)]">Patient Situation:</span> <strong>{data.patientSituation}</strong></div>}
          </div>
        </Section>
      )}

      {/* Subjective */}
      {(data.subjective || data.chiefComplaint) && (
        <Section title="Subjective (S)">
          {data.subjective && <Field label="Subjective" value={data.subjective} />}
          {data.chiefComplaint && <Field label="C/c (Chief Complaint)" value={data.chiefComplaint} />}
        </Section>
      )}

      {/* Objective */}
      {(data.objective?.bp || data.objective?.hr || data.objective?.o2sat || data.objective?.ps) && (
        <Section title="Objective (O) — Vital Signs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {data.objective.bp && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <p className="text-[10px] text-blue-500 uppercase font-bold tracking-wider">BP</p>
                <p className="text-[15px] font-bold text-blue-700">{data.objective.bp}</p>
              </div>
            )}
            {data.objective.hr && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                <p className="text-[10px] text-red-500 uppercase font-bold tracking-wider">HR</p>
                <p className="text-[15px] font-bold text-red-700">{data.objective.hr}</p>
              </div>
            )}
            {data.objective.o2sat && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <p className="text-[10px] text-green-500 uppercase font-bold tracking-wider">O2sat</p>
                <p className="text-[15px] font-bold text-green-700">{data.objective.o2sat}</p>
              </div>
            )}
            {data.objective.ps && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                <p className="text-[10px] text-amber-500 uppercase font-bold tracking-wider">Pain Scale</p>
                <p className="text-[15px] font-bold text-amber-700">{data.objective.ps}</p>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Assessment */}
      {data.assessment && (
        <Section title="Assessment (A)">
          <Field label="" value={data.assessment} />
        </Section>
      )}

      {/* PT Management */}
      {data.ptManagement?.length > 0 && (
        <Section title="PT Management">
          <div className="bg-[var(--off-white)] border border-[var(--light-gray)] rounded-lg p-3">
            <ol className="list-decimal list-inside space-y-1">
              {data.ptManagement.map((item, i) => (
                <li key={i} className="text-[13px] text-[var(--charcoal)]">{item}</li>
              ))}
            </ol>
          </div>
        </Section>
      )}

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
