// Structured schemas for the PT documentation forms. One schema drives both the
// in-app form UI and the generated PDF. Logo and form numbers are intentionally
// omitted (per product requirement). Fields are faithful to the source templates.

export type FieldType = 'text' | 'textarea' | 'date' | 'number' | 'select' | 'checkbox'
export interface Field { key: string; label: string; type?: FieldType; options?: string[]; full?: boolean }
export interface TableSpec { key: string; columns: string[]; rows?: number }
export interface Section { title?: string; note?: string; fields?: Field[]; table?: TableSpec }
export interface FormSchema { title: string; sections: Section[] }

const DISCLAIMER = 'This document is confidential and intended solely for the patient, their family or legal guardian, and the health professionals overseeing the patient’s care.'

const VITALS: Section = {
  title: 'Vital Signs',
  table: { key: 'vitals', columns: ['Measure', 'Before', 'After'], rows: 4 },
}
const SOAP_HEADER: Field[] = [
  { key: 'diagnosis', label: 'Working impression / Diagnosis', full: true },
  { key: 'precautions', label: 'Precautions', full: true },
  { key: 'referringPhysician', label: 'Referring physician' },
  { key: 'ptInCharge', label: 'Physical therapist-in-charge' },
]

// ── Adult Initial Evaluation (PT02) ──────────────────────────────────────────
const ADULT_IE: FormSchema = {
  title: 'Physical Therapy — Initial Evaluation',
  sections: [
    { note: DISCLAIMER },
    { title: 'Personal Information', fields: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'sex', label: 'Sex', type: 'select', options: ['Male', 'Female'] },
      ...SOAP_HEADER,
    ] },
    { title: 'Subjective (S)', fields: [
      { key: 'chiefComplaint', label: 'Chief complaint', type: 'textarea', full: true },
      { key: 'goals', label: 'Goals & attitude towards therapy', type: 'textarea', full: true },
      { key: 'hpi', label: 'History of present illness (HPI)', type: 'textarea', full: true },
      { key: 'pmhx', label: 'Past medical history', type: 'textarea', full: true },
      { key: 'fmhx', label: 'Family medical history', type: 'textarea', full: true },
      { key: 'socialHistory', label: 'Personal / social history (work, family, hobbies, allergies, alcohol, smoking)', type: 'textarea', full: true },
      { key: 'environmental', label: 'Environmental history', type: 'textarea', full: true },
    ] },
    { title: 'Medications', table: { key: 'medications', columns: ['Medication', 'Dosage / frequency', 'Purpose'], rows: 4 } },
    { title: 'Objective (O)' , fields: [] },
    VITALS,
    { fields: [
      { key: 'ocularInspection', label: 'Ocular inspection', type: 'textarea', full: true },
      { key: 'palpation', label: 'Palpation', type: 'textarea', full: true },
      { key: 'posture', label: 'Postural assessment (anterior / lateral / posterior)', type: 'textarea', full: true },
    ] },
    { title: 'Range of Motion (ROM)', table: { key: 'rom', columns: ['Joint / motion', 'AROM', 'PROM', 'Normal', 'End-feel'], rows: 5 } },
    { title: 'Manual Muscle Testing (MMT)', table: { key: 'mmt', columns: ['Muscle group', 'Grade (0–5)'], rows: 5 } },
    { fields: [
      { key: 'specialTests', label: 'Special tests', type: 'textarea', full: true },
      { key: 'functionalTests', label: 'Functional / balance / gait', type: 'textarea', full: true },
    ] },
    { title: 'Assessment (A)', fields: [
      { key: 'ptDiagnosis', label: 'PT diagnosis / problem list', type: 'textarea', full: true },
      { key: 'stg', label: 'Short-term goals', type: 'textarea', full: true },
      { key: 'ltg', label: 'Long-term goals', type: 'textarea', full: true },
    ] },
    { title: 'Plan (P)', fields: [
      { key: 'plan', label: 'PT management / plan of care', type: 'textarea', full: true },
      { key: 'frequency', label: 'Frequency & duration' },
    ] },
  ],
}

// ── Pedia Initial Evaluation / Re-evaluation (PT10) ──────────────────────────
const PEDIA_IE: FormSchema = {
  title: 'Pediatric Physical Therapy — Evaluation',
  sections: [
    { note: DISCLAIMER },
    { title: 'Personal Information', fields: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'gestationalAge', label: 'Gestational age' },
      { key: 'sex', label: 'Sex', type: 'select', options: ['Male', 'Female'] },
      ...SOAP_HEADER,
    ] },
    { title: 'Subjective (S)', fields: [
      { key: 'chiefComplaint', label: 'Chief complaint', type: 'textarea', full: true },
      { key: 'caregiverGoal', label: 'Caregiver’s goal', type: 'textarea', full: true },
      { key: 'hpi', label: 'History of present illness (HPI)', type: 'textarea', full: true },
    ] },
    { title: 'Patient History', table: { key: 'conditions', columns: ['Condition', 'Yes / No', 'Details'], rows: 7 } },
    { title: 'Developmental Milestones', table: { key: 'milestones', columns: ['Skill', 'Age achieved', 'Notes'], rows: 6 } },
    { title: 'Medications', table: { key: 'medications', columns: ['Medication', 'Dosage / frequency', 'Purpose'], rows: 3 } },
    { title: 'Objective (O)', fields: [] },
    VITALS,
    { fields: [
      { key: 'ocularInspection', label: 'Ocular inspection', type: 'textarea', full: true },
      { key: 'muscleTone', label: 'Muscle tone / reflexes', type: 'textarea', full: true },
      { key: 'rom', label: 'Range of motion', type: 'textarea', full: true },
      { key: 'gmfm', label: 'Gross motor function / posture / balance', type: 'textarea', full: true },
    ] },
    { title: 'Assessment (A)', fields: [
      { key: 'ptDiagnosis', label: 'PT diagnosis / problem list', type: 'textarea', full: true },
      { key: 'goals', label: 'Goals (short- and long-term)', type: 'textarea', full: true },
    ] },
    { title: 'Plan (P)', fields: [
      { key: 'plan', label: 'PT management / plan of care', type: 'textarea', full: true },
      { key: 'frequency', label: 'Frequency & duration' },
    ] },
  ],
}

// ── Adult Re-evaluation (PT07) ───────────────────────────────────────────────
const ADULT_REEVAL: FormSchema = {
  title: 'Physical Therapy — Re-evaluation',
  sections: [
    { note: DISCLAIMER },
    { title: 'Personal Information', fields: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'sex', label: 'Sex', type: 'select', options: ['Male', 'Female'] },
      ...SOAP_HEADER,
    ] },
    { title: 'Subjective (S)', fields: [
      { key: 'chiefComplaint', label: 'Chief complaint', type: 'textarea', full: true },
      { key: 'goals', label: 'Goals & attitude towards therapy', type: 'textarea', full: true },
      { key: 'interval', label: 'Interval history since last visit', type: 'textarea', full: true },
    ] },
    { title: 'Objective (O)', fields: [] },
    VITALS,
    { fields: [
      { key: 'ocularInspection', label: 'Ocular inspection & palpation', type: 'textarea', full: true },
      { key: 'posture', label: 'Postural assessment', type: 'textarea', full: true },
    ] },
    { title: 'Range of Motion (ROM)', table: { key: 'rom', columns: ['Joint / motion', 'AROM', 'PROM', 'Normal', 'End-feel'], rows: 4 } },
    { title: 'Manual Muscle Testing (MMT)', table: { key: 'mmt', columns: ['Muscle group', 'Grade (0–5)'], rows: 4 } },
    { title: 'Assessment (A)', fields: [
      { key: 'progress', label: 'Progress vs. previous goals', type: 'textarea', full: true },
      { key: 'updatedGoals', label: 'Updated goals', type: 'textarea', full: true },
    ] },
    { title: 'Plan (P)', fields: [
      { key: 'plan', label: 'Updated plan of care', type: 'textarea', full: true },
    ] },
  ],
}

// ── Adult Treatment / Session Notes (PT08) ───────────────────────────────────
const ADULT_TREATMENT: FormSchema = {
  title: 'PT Session Notes',
  sections: [
    { fields: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'sessionNo', label: 'Session #' },
      { key: 'diagnosis', label: 'Diagnosis' },
      { key: 'precautions', label: 'Precautions' },
    ] },
    { title: 'Subjective (S)', fields: [{ key: 's', label: 'Chief complaint / subjective', type: 'textarea', full: true }] },
    { title: 'Objective (O)', fields: [
      { key: 'bp', label: 'BP' }, { key: 'hr', label: 'HR' }, { key: 'o2', label: 'O₂ sat' }, { key: 'ps', label: 'Pain scale' },
      { key: 'o', label: 'Objective findings', type: 'textarea', full: true },
    ] },
    { title: 'Assessment (A)', fields: [{ key: 'a', label: 'Assessment', type: 'textarea', full: true }] },
    { title: 'PT Management', fields: [{ key: 'management', label: 'Interventions performed', type: 'textarea', full: true }] },
  ],
}

// ── Pedia Treatment / Session Notes (PT12) ───────────────────────────────────
const PEDIA_TREATMENT: FormSchema = { ...ADULT_TREATMENT, title: 'PT Pedia Session Notes' }

// ── Progress Report (PT06) ───────────────────────────────────────────────────
const PROGRESS_REPORT: FormSchema = {
  title: 'Physical Therapy — Progress Report',
  sections: [
    { note: DISCLAIMER },
    { title: 'Personal Information', fields: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'diagnosis', label: 'Working impression / Diagnosis', full: true },
      { key: 'precautions', label: 'Precautions', full: true },
      { key: 'referringPhysician', label: 'Referring physician' },
      { key: 'ptInCharge', label: 'Physical therapist-in-charge' },
    ] },
    { title: 'Problems Identified', fields: [{ key: 'problems', label: 'Current problem list', type: 'textarea', full: true }] },
    { title: 'Intervention', fields: [{ key: 'intervention', label: 'Interventions & program for the duration treated', type: 'textarea', full: true }] },
    { title: 'Problems Solved', fields: [{ key: 'solved', label: 'Developments / resolved PT problems', type: 'textarea', full: true }] },
    { title: 'Recommendations', fields: [{ key: 'recommendations', label: 'Newly identified problems & referrals', type: 'textarea', full: true }] },
  ],
}

// ── Home Exercise Program (PT04) ─────────────────────────────────────────────
const HEP: FormSchema = {
  title: 'Home Exercise Program',
  sections: [
    { note: DISCLAIMER },
    { title: 'Personal Information', fields: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'diagnosis', label: 'Working impression / Diagnosis', full: true },
      { key: 'precautions', label: 'Precautions', full: true },
      { key: 'ptInCharge', label: 'Physical therapist-in-charge' },
    ] },
    { title: 'Exercise Program', table: { key: 'exercises', columns: ['Phase', 'Exercise', 'Instruction', 'Parameters'], rows: 6 } },
    { fields: [{ key: 'notes', label: 'Additional notes / precautions', type: 'textarea', full: true }] },
  ],
}

export type DocType = 'INITIAL_EVAL' | 'RE_EVAL' | 'TREATMENT' | 'PROGRESS_REPORT' | 'HEP'
export type DocVariant = 'ADULT' | 'PEDIA'

// Pick the correct template for a session type + patient age band.
export function schemaFor(type: DocType, variant: DocVariant): FormSchema {
  const pedia = variant === 'PEDIA'
  switch (type) {
    case 'INITIAL_EVAL': return pedia ? PEDIA_IE : ADULT_IE
    case 'RE_EVAL': return pedia ? PEDIA_IE : ADULT_REEVAL // pedia re-eval reuses the pedia form (PT10)
    case 'TREATMENT': return pedia ? PEDIA_TREATMENT : ADULT_TREATMENT
    case 'PROGRESS_REPORT': return PROGRESS_REPORT
    case 'HEP': return HEP
  }
}

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  INITIAL_EVAL: 'Initial Evaluation',
  RE_EVAL: 'Re-evaluation',
  TREATMENT: 'Treatment Session',
  PROGRESS_REPORT: 'Progress Report',
  HEP: 'Home Exercise Program',
}

// Adult vs pedia: pediatric if under 18 at the time of service.
export function variantForAge(dob: Date | null | undefined): DocVariant {
  if (!dob) return 'ADULT'
  const now = new Date()
  let age = now.getUTCFullYear() - dob.getUTCFullYear()
  const m = now.getUTCMonth() - dob.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--
  return age < 18 ? 'PEDIA' : 'ADULT'
}
