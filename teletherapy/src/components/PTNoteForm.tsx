'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'

const BRANCHES = ['East', 'Greenhills']

export interface PTFormData {
  formType: 'PT_SESSION_NOTES'
  branch: string
  diagnosis: string
  precautions: string
  patientSituation: string
  sessionNumber: string
  subjective: string
  chiefComplaint: string
  objective: {
    bp: string
    hr: string
    o2sat: string
    ps: string
  }
  assessment: string
  ptManagement: string[]
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
  onSubmit: (data: PTFormData) => Promise<void>
  submitting: boolean
  onCancel: () => void
  initialData?: PTFormData | null
  clinicianSettings?: ClinicianSettingsData | null
}

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

export default function PTNoteForm({ patientName, sessionDate, onSubmit, submitting, onCancel, initialData, clinicianSettings }: Props) {
  const [branch, setBranch] = useState(initialData?.branch ?? 'East')
  const [diagnosis, setDiagnosis] = useState(initialData?.diagnosis ?? '')
  const [precautions, setPrecautions] = useState(initialData?.precautions ?? '')
  const [patientSituation, setPatientSituation] = useState(initialData?.patientSituation ?? '')
  const [sessionNumber, setSessionNumber] = useState(initialData?.sessionNumber ?? '')
  const [subjective, setSubjective] = useState(initialData?.subjective ?? '')
  const [chiefComplaint, setChiefComplaint] = useState(initialData?.chiefComplaint ?? '')
  const [bp, setBP] = useState(initialData?.objective?.bp ?? '')
  const [hr, setHR] = useState(initialData?.objective?.hr ?? '')
  const [o2sat, setO2sat] = useState(initialData?.objective?.o2sat ?? '')
  const [ps, setPS] = useState(initialData?.objective?.ps ?? '')
  const [assessment, setAssessment] = useState(initialData?.assessment ?? '')
  const [ptManagement, setPtManagement] = useState<string[]>(
    initialData?.ptManagement?.length ? initialData.ptManagement : ['', '', '', '', '']
  )
  const [licNo, setLicNo] = useState(initialData?.clinicianInfo?.licNo ?? clinicianSettings?.licenseNo ?? '')
  const [ptrNo, setPtrNo] = useState(initialData?.clinicianInfo?.ptrNo ?? clinicianSettings?.ptrNo ?? '')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(
    initialData?.clinicianInfo?.signatureDataUrl ?? clinicianSettings?.signatureDataUrl ?? null
  )

  function updateManagement(index: number, value: string) {
    const updated = [...ptManagement]
    updated[index] = value
    setPtManagement(updated)
  }

  function addManagementRow() {
    if (ptManagement.length < 10) setPtManagement([...ptManagement, ''])
  }

  function removeManagementRow(index: number) {
    if (ptManagement.length > 1) setPtManagement(ptManagement.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({
      formType: 'PT_SESSION_NOTES',
      branch,
      diagnosis,
      precautions,
      patientSituation,
      sessionNumber,
      subjective,
      chiefComplaint,
      objective: { bp, hr, o2sat, ps },
      assessment,
      ptManagement: ptManagement.filter((m) => m.trim()),
      clinicianInfo: { licNo, ptrNo, signatureDataUrl },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="text-center mb-4">
        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-blue-100 text-blue-700 mb-2">
          PT Session Notes
        </span>
        <p className="text-[13px] text-[var(--mid-gray)]"><strong>{patientName}</strong> · {sessionDate}</p>
      </div>

      <CollapsibleSection title="Patient Information">
        <div className="mb-3">
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] uppercase tracking-wider mb-2">Branch</label>
          <div className="flex gap-2 flex-wrap">
            {BRANCHES.map((b) => (
              <label key={b} className="flex items-center gap-1.5 cursor-pointer group">
                <input type="radio" name="branch" value={b} checked={branch === b} onChange={() => setBranch(b)}
                  className="accent-[var(--teal)] w-4 h-4" />
                <span className="text-[13px] text-[var(--charcoal)] group-hover:text-[var(--deep-teal)]">{b}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">Diagnosis</label>
            <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="input text-[13px]" placeholder="Diagnosis" />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">Session #</label>
            <input value={sessionNumber} onChange={(e) => setSessionNumber(e.target.value)} className="input text-[13px]" placeholder="Session number" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">Precautions</label>
            <input value={precautions} onChange={(e) => setPrecautions(e.target.value)} className="input text-[13px]" placeholder="Precautions" />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">Patient Situation</label>
            <input value={patientSituation} onChange={(e) => setPatientSituation(e.target.value)} className="input text-[13px]" placeholder="Patient situation" />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Subjective (S)">
        <div className="mb-3">
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">Subjective</label>
          <textarea value={subjective} onChange={(e) => setSubjective(e.target.value)}
            className="input text-[13px] min-h-[80px] resize-y" placeholder="Subjective findings..." />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">C/c (Chief Complaint)</label>
          <textarea value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)}
            className="input text-[13px] min-h-[60px] resize-y" placeholder="Chief complaint..." />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Objective (O) — Vital Signs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">BP</label>
            <input value={bp} onChange={(e) => setBP(e.target.value)} className="input text-[13px]" placeholder="e.g. 120/80" />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">HR</label>
            <input value={hr} onChange={(e) => setHR(e.target.value)} className="input text-[13px]" placeholder="e.g. 72 bpm" />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">O2sat</label>
            <input value={o2sat} onChange={(e) => setO2sat(e.target.value)} className="input text-[13px]" placeholder="e.g. 98%" />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[var(--charcoal)] mb-1">PS (Pain Scale)</label>
            <input value={ps} onChange={(e) => setPS(e.target.value)} className="input text-[13px]" placeholder="e.g. 3/10" />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Assessment (A)">
        <textarea value={assessment} onChange={(e) => setAssessment(e.target.value)}
          className="input text-[13px] min-h-[100px] resize-y" placeholder="Assessment..." />
      </CollapsibleSection>

      <CollapsibleSection title="PT Management">
        <div className="space-y-2">
          {ptManagement.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[12px] text-[var(--mid-gray)] font-mono w-6 text-right">{i + 1}.</span>
              <input value={item} onChange={(e) => updateManagement(i, e.target.value)}
                className="input text-[13px] flex-1" placeholder={`Management step ${i + 1}`} />
              {ptManagement.length > 1 && (
                <button type="button" onClick={() => removeManagementRow(i)} className="p-1.5 text-red-400 hover:text-red-600 transition-colors">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {ptManagement.length < 10 && (
            <button type="button" onClick={addManagementRow}
              className="flex items-center gap-1.5 text-[12px] text-[var(--teal)] hover:text-[var(--deep-teal)] font-medium mt-2 transition-colors">
              <Plus size={14} /> Add step
            </button>
          )}
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
