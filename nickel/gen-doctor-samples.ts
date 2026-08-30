import { writeFileSync } from 'node:fs'
import { doctorSchemaFor, type DoctorDocType } from './src/lib/forms/doctor-schemas.ts'
import { generateFormPdf } from './src/lib/forms/pdf.ts'

const meta = {
  patientName: 'Maria Santos', patientDob: '1985-03-12',
  therapistName: 'Dr. Ramon Bautista, MD, FPARM', license: '0098765', ptr: '3456789',
  preparedByLabel: 'Physician:', generatedOn: '2026-08-30',
}

const D: Record<DoctorDocType, Record<string, unknown>> = {
  MD_INITIAL: {
    date: '2026-08-30', sex: 'Female', workingImpression: 'Chronic mechanical low back pain',
    referringPhysician: 'Dr. A. Cruz', physicianInCharge: 'Dr. Ramon Bautista',
    consultType: 'Initial consult', consultSpecialization: 'Rehabilitation Medicine',
    chiefComplaint: 'Low back pain radiating to the right buttock for 6 weeks.',
    precautions: 'No high-impact loading; monitor for red-flag neuro signs.',
    hpi: 'Gradual onset after prolonged desk work. Worse with sitting, relieved by walking.',
    sourceReliability: 'Patient, reliable',
    painBest: '3', painWorst: '8',
    painBetter: ['Movement', 'Walking', 'Changing positions'],
    painWorse: ['Sitting', 'Bending', 'Prolonged positioning'],
    objectiveFindings: 'Paraspinal tenderness L4–S1. SLR negative. Reduced lumbar flexion.',
    diagnosis: 'Mechanical low back pain, no radiculopathy.',
    management: ['For Physical Therapy'],
    ptDurationFrequency: '2x/week for 6 weeks',
    modalities: ['HMP', 'TENS'],
    therapeuticExercises: ['AROM', 'Stretching', 'Progressive resistive ex'],
    headNeckTrunk: ['Core stabilization', 'Lumbar stabilization', 'William flexion exercise'],
    otherManagement: 'Ergonomic advice; reassess in 2 weeks.',
  },
  MD_FOLLOWUP: {
    date: '2026-08-30', sex: 'Female', workingImpression: 'Chronic mechanical low back pain',
    physicianInCharge: 'Dr. Ramon Bautista', consultType: 'Follow-up consult', consultSpecialization: 'Rehabilitation Medicine',
    chiefComplaint: 'Improved back pain, mild residual stiffness.',
    hpi: 'Completed 6 PT sessions. Sitting tolerance improved.',
    painBest: '1', painWorst: '4', painBetter: ['Movement', 'Rest'], painWorse: ['Sitting'],
    objectiveFindings: 'Improved lumbar flexion; no paraspinal tenderness.',
    diagnosis: 'Resolving mechanical low back pain.', improvements: 'Pain 8→4, sitting tolerance doubled, returned to work.',
    forDischarge: 'Continue treatment', management: ['For Physical Therapy'],
    ptDurationFrequency: '1x/week for 3 weeks', therapeuticExercises: ['Progressive resistive ex'],
    otherManagement: 'Progress to independent home program next visit.',
  },
  MED_CERT: {
    date: '2026-08-30', age: '41', sex: 'Female', address: '12 Mabini St., Pasig City', contact: '0917-555-1234', hmo: 'Maxicare',
    diagnosis: 'Acute lumbar strain', treatmentGiven: 'Physical therapy and analgesics', prescribedMedication: 'Paracetamol 500mg PRN',
    examinedOn: '2026-08-30', recommendations: 'Light duties; avoid heavy lifting for 2 weeks.',
    restDays: '3', restFrom: '2026-08-31', restTo: '2026-09-02',
    additionalInfo: 'Fit to return to work with restrictions.',
    issuedFor: 'employment leave application',
  },
  PRESCRIPTION: {
    branch: 'East', date: '2026-08-30', sexAge: 'Female / 41', diagnosis: 'Mechanical low back pain',
    rx: 'Naproxen 500 mg tab\n  Sig: 1 tab twice daily after meals x 7 days (#14)\n\nParacetamol 500 mg tab\n  Sig: 1 tab every 6 hours as needed for pain (#20)\n\nHome exercise program as instructed by physical therapist.',
  },
}

const outDir = process.argv[2] || '.'
const JOBS: { name: string; type: DoctorDocType }[] = [
  { name: 'MD01-Initial-Evaluation', type: 'MD_INITIAL' },
  { name: 'MD02-Follow-up', type: 'MD_FOLLOWUP' },
  { name: 'MD04-Medical-Certificate', type: 'MED_CERT' },
  { name: 'MD07-Prescription', type: 'PRESCRIPTION' },
]
for (const j of JOBS) {
  const uri = await generateFormPdf(doctorSchemaFor(j.type), D[j.type], meta)
  writeFileSync(`${outDir}/${j.name}.pdf`, Buffer.from(uri.split(',')[1], 'base64'))
  console.log('wrote', j.name)
}
