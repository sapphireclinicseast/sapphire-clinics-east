// Structured schemas for the rehab-doctor (MD) documents. One schema drives both
// the in-app form UI and the generated PDF. Logo and form numbers are omitted.
// Faithful to the source templates (MD01 / MD02 / MD04 / MD07).
import type { FormSchema, Field } from './schemas'

export type DoctorDocType = 'MD_INITIAL' | 'MD_FOLLOWUP' | 'MED_CERT' | 'PRESCRIPTION'

export const DOCTOR_DOC_LABEL: Record<DoctorDocType, string> = {
  MD_INITIAL: 'Initial Evaluation',
  MD_FOLLOWUP: 'Follow-up',
  MED_CERT: 'Medical Certificate',
  PRESCRIPTION: 'Prescription',
}

const DISCLAIMER = 'This patient form is confidential and intended solely for the patient, their family, legal guardian, and relevant health professionals overseeing the patient’s treatment. Unauthorized access, disclosure, or use of this information is strictly prohibited.'

const PAIN_BETTER = ['Bending', 'Movement', 'Rest', 'Better in AM', 'Sitting', 'Standing', 'Heat', 'Better as day progresses', 'Rising', 'Walking', 'Ice', 'Better in PM', 'Changing positions', 'Lying', 'Medication', 'N/A cast just removed']
const PAIN_WORSE = ['Bending', 'Movement', 'Rest', 'Sneeze', 'Sitting', 'Standing', 'Heat', 'Deep breath', 'Rising', 'Walking', 'Ice', 'Medication', 'Prolonged positioning', 'Lying', 'Worse in AM', 'Worse in PM', 'Worse as day progresses', 'N/A cast just removed']
const MODALITIES = ['HMP', 'IRR', 'TENS', 'FES', 'ES', 'Ultrasound', 'Underwater', 'Phonophoresis', 'Shockwave', 'TECAR', 'Traction', 'Paraffin', 'Laser', 'Cryotherapy', 'Muscle percussion']
const THERA_EX = ['PROM', 'AAROM', 'AROM', 'Isometric exercise', 'Rotator cuff strengthening', 'Progressive resistive ex', 'Stretching', 'Muscle energy technique', 'Peripheral joint mobilization']
const HEAD_TRUNK = ['Calliet neck', 'Core stabilization', 'Lumbar stabilization', 'Bilateral leg raising', 'McKenzie exercise', 'Crunches', 'Quadratus lumborum activation', 'William flexion exercise', 'Ambling walk', 'Schroth']
const UPPER_EX = ['Pendulum', 'Arm resto', 'Scapular stabilization', 'Rotator cuff strengthening', 'Towel exercise', 'Periscapular muscle activation']
const LOWER_EX = ['Bike ergo', 'VMO setting', 'Quadriceps setting', 'Hamstring setting', 'Hamstring curls', 'Gluteal setting', 'Straight leg raising', 'Mini squats', 'Deep squats', 'Forward lunges', 'Knee high', 'Calf raises']
const NEURO_EX = ['PNF', 'Functional exercise for UE', 'Functional exercise for LE', 'Sit-to-stand exercise', 'Standing/balance tolerance', 'Parallel bars / stair / ramp / gait training']
const CARDIO_EX = ['Breathing exercise', 'Treadmill', 'Stepper']
const SPECIALIZED = ['Dry needling', 'Dry needling c IRR', 'Soft tissue mobilization', 'Peripheral joint mobilization', 'Myofascial release', 'Spinal manipulation', 'Pelvic manipulation']
const OT_INT = ['ADL/IADL training', 'FMS and dexterity training', 'GMS and motor control training', 'Balance and coordination training', 'Sensory & perceptual interventions', 'Fatigue management', 'Joint protection techniques', 'Proper body mechanics', 'Cognitive stimulation techniques', 'Environmental modification techniques', 'Behavioral management', 'Dysphagia evaluation and intervention', 'Work rehabilitation', 'Prevocational training']
const ST_INT = ['Jaw exercises', 'Tongue exercises', 'Lip exercises', 'Following commands', 'Identifying objects', 'Answering questions', 'Repetition', 'Naming', 'Syllable level', 'Word level', 'Sentence level', 'Paragraph level', 'Swallowing / OPM exercises']

const PERSONAL: Field[] = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'sex', label: 'Sex', type: 'select', options: ['Male', 'Female'] },
  { key: 'workingImpression', label: 'Working impression / Diagnosis', full: true },
  { key: 'referringPhysician', label: 'Referring physician' },
  { key: 'physicianInCharge', label: 'Physician-in-charge' },
  { key: 'consultType', label: 'Consult type', type: 'select', options: ['Initial consult', 'Follow-up consult'] },
  { key: 'consultSpecialization', label: 'Consult specialization', type: 'select', options: ['Rehabilitation Medicine', 'Orthopedics', 'Developmental Pediatrics', 'Geriatrics', 'Others'] },
]

const OBJECTIVE_PAIN: Field[] = [
  { key: 'painBest', label: 'Pain at best (0–10)', type: 'number' },
  { key: 'painWorst', label: 'Pain at worst (0–10)', type: 'number' },
  { key: 'painBetter', label: 'What makes it better', type: 'checkgroup', options: PAIN_BETTER },
  { key: 'painWorse', label: 'What makes it worse', type: 'checkgroup', options: PAIN_WORSE },
  { key: 'objectiveFindings', label: 'Objective findings', type: 'textarea', full: true },
]

const MANAGEMENT: Field[] = [
  { key: 'management', label: 'Management', type: 'checkgroup', options: ['Medications (if needed)', 'For Physical Therapy', 'For Occupational Therapy', 'For Speech Therapy'] },
  { key: 'ptDurationFrequency', label: 'PT — duration & frequency of treatment' },
  { key: 'modalities', label: 'Modalities', type: 'checkgroup', options: MODALITIES },
  { key: 'therapeuticExercises', label: 'Therapeutic exercises', type: 'checkgroup', options: THERA_EX },
  { key: 'headNeckTrunk', label: 'Head, neck & trunk exercises', type: 'checkgroup', options: HEAD_TRUNK },
  { key: 'upperExtremity', label: 'Upper extremities exercises', type: 'checkgroup', options: UPPER_EX },
  { key: 'lowerExtremity', label: 'Lower extremities exercises', type: 'checkgroup', options: LOWER_EX },
  { key: 'neurologic', label: 'Neurologic exercise', type: 'checkgroup', options: NEURO_EX },
  { key: 'cardiopulmonary', label: 'Cardiopulmonary exercises', type: 'checkgroup', options: CARDIO_EX },
  { key: 'specialized', label: 'Specialized treatment', type: 'checkgroup', options: SPECIALIZED },
  { key: 'otDurationFrequency', label: 'OT — duration & frequency of treatment' },
  { key: 'otInterventions', label: 'Occupational therapy interventions', type: 'checkgroup', options: OT_INT },
  { key: 'stDurationFrequency', label: 'ST — duration & frequency of treatment' },
  { key: 'stInterventions', label: 'Speech therapy interventions', type: 'checkgroup', options: ST_INT },
  { key: 'otherManagement', label: 'Other management / remarks', type: 'textarea', full: true },
]

// ── MD01 Initial Evaluation ──────────────────────────────────────────────────
const MD_INITIAL: FormSchema = {
  title: 'Medical Department — Initial Evaluation',
  sections: [
    { note: DISCLAIMER },
    { title: 'Personal Information', fields: PERSONAL },
    { title: 'Subjective (S)', fields: [
      { key: 'chiefComplaint', label: 'Chief complaint', type: 'textarea', full: true },
      { key: 'precautions', label: 'Precautions', type: 'textarea', full: true },
      { key: 'hpi', label: 'History of present illness (HPI)', type: 'textarea', full: true },
      { key: 'sourceReliability', label: 'Source / reliability' },
    ] },
    { title: 'Objective (O)', fields: OBJECTIVE_PAIN },
    { title: 'Assessment (A)', fields: [{ key: 'diagnosis', label: 'Diagnosis', type: 'textarea', full: true }] },
    { title: 'Plan (P) — Management', fields: MANAGEMENT },
  ],
}

// ── MD02 Follow-up ───────────────────────────────────────────────────────────
const MD_FOLLOWUP: FormSchema = {
  title: 'Medical Department — Follow-up',
  sections: [
    { note: DISCLAIMER },
    { title: 'Personal Information', fields: PERSONAL },
    { title: 'Subjective (S)', fields: [
      { key: 'chiefComplaint', label: 'Chief complaint', type: 'textarea', full: true },
      { key: 'precautions', label: 'Precautions', type: 'textarea', full: true },
      { key: 'hpi', label: 'History of present illness (HPI)', type: 'textarea', full: true },
      { key: 'sourceReliability', label: 'Source / reliability' },
    ] },
    { title: 'Objective (O)', fields: OBJECTIVE_PAIN },
    { title: 'Assessment (A)', fields: [
      { key: 'diagnosis', label: 'Diagnosis', type: 'textarea', full: true },
      { key: 'improvements', label: 'Improvements noted', type: 'textarea', full: true },
    ] },
    { title: 'Plan (P) — Management', fields: [
      { key: 'forDischarge', label: 'Disposition', type: 'select', options: ['Continue treatment', 'For discharge'] },
      ...MANAGEMENT,
    ] },
  ],
}

// ── MD04 Medical Certificate ─────────────────────────────────────────────────
const MED_CERT: FormSchema = {
  title: 'Medical Certificate',
  sections: [
    { title: 'Personal Information', fields: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'age', label: 'Age at consult' },
      { key: 'sex', label: 'Sex', type: 'select', options: ['Male', 'Female'] },
      { key: 'address', label: 'Address', full: true },
      { key: 'contact', label: 'Contact number / email' },
      { key: 'hmo', label: 'HMO (if applicable)' },
    ] },
    { title: 'Medical Information', fields: [
      { key: 'diagnosis', label: 'Diagnosis', type: 'textarea', full: true },
      { key: 'treatmentGiven', label: 'Treatment given', type: 'textarea', full: true },
      { key: 'prescribedMedication', label: 'Prescribed medication (if applicable)', type: 'textarea', full: true },
    ] },
    { title: 'Medical Recommendation', fields: [
      { key: 'examinedOn', label: 'Examined & treated on', type: 'date' },
      { key: 'recommendations', label: 'Medical recommendations / instructions', type: 'textarea', full: true },
      { key: 'restDays', label: 'Duration of rest / leave (days)' },
      { key: 'restFrom', label: 'Rest from', type: 'date' },
      { key: 'restTo', label: 'Rest to', type: 'date' },
      { key: 'additionalInfo', label: 'Additional information (if any)', type: 'textarea', full: true },
      { key: 'issuedFor', label: 'This certificate is issued upon the patient’s request for', type: 'textarea', full: true },
    ] },
  ],
}

// ── MD07 Prescription Pad ────────────────────────────────────────────────────
const PRESCRIPTION: FormSchema = {
  title: 'Doctor’s Prescription',
  sections: [
    { title: 'Prescription', fields: [
      { key: 'branch', label: 'Branch', type: 'select', options: ['East', 'Greenhills'] },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'sexAge', label: 'Sex / Age' },
      { key: 'diagnosis', label: 'Diagnosis', full: true },
    ] },
    { title: '℞', fields: [{ key: 'rx', label: 'Rx', type: 'textarea', full: true }] },
  ],
}

export function doctorSchemaFor(t: DoctorDocType): FormSchema {
  switch (t) {
    case 'MD_INITIAL': return MD_INITIAL
    case 'MD_FOLLOWUP': return MD_FOLLOWUP
    case 'MED_CERT': return MED_CERT
    case 'PRESCRIPTION': return PRESCRIPTION
  }
}
