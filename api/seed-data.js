#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
//  Seed staff roster + survey schemas into the database
//
//  Run once after setting up the database:
//    cd /var/www/sapphireclinicseast.org/api
//    node seed-data.js
// ══════════════════════════════════════════════════════════════════

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.SURVEY_DB_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'surveys.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Clinical Staff (from HR10/HR11 Typeform JSONs) ────────────────
// All are at Sandbox East Pasig unless noted. Branch assignment
// will be updated as staff are distributed across branches.
const clinicalStaff = [
  // Occupational Therapists
  { name: 'Agatha A. Escobar, MMHOA, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Alyssa Bianca T. Prado, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Amie Denise G. Casibo, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Angelika Pauline Calsa, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Anna Rosario Go, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Arianne Elliah Freshia Tumala, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Caitlynn Billedo, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Corinth Shekainah M. Miranda, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Eloisa Valencia, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Eunice De la Fuente, MMHOA, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Gabrielle T. Sulit, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Heather Daphne D. Midel, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Ivan Neil B. Gomez, PhD, MaED, OTRP, OT, OTR', role: 'OT', branch: 'east_pasig' },
  { name: 'Janna Christine Libago, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Jerome Falsis, OTRP, CSRS', role: 'OT', branch: 'east_pasig' },
  { name: 'Jessica Royo, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Lenz Earl Q. Lim, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Patricia Lorraine Mercado, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Reine Alyson A. Pestañas, OTRP', role: 'OT', branch: 'east_pasig' },
  { name: 'Suzette Marie Ragonton Esguerra, MBA, MAEd, OTRP', role: 'OT', branch: 'east_pasig' },

  // Psychologists
  { name: 'Adrian Rigor, MA, RPm, RPsy', role: 'PSYCH', branch: 'east_pasig' },
  { name: 'Albert Go, RPsy', role: 'PSYCH', branch: 'east_pasig' },
  { name: 'Carmelle Montalbo, MA, RPsy, RPm', role: 'PSYCH', branch: 'east_pasig' },
  { name: 'Caryl Joyce Boncodin, MP, RPsy, RPm', role: 'PSYCH', branch: 'east_pasig' },
  { name: 'Dwayne Ranay, MP, RPsy', role: 'PSYCH', branch: 'east_pasig' },
  { name: 'Frednick Luis Asistio, MSc, RPsy, RPm', role: 'PSYCH', branch: 'east_pasig' },
  { name: 'Jayvee Cebu, MSc, LPT, RPm, RPsy', role: 'PSYCH', branch: 'east_pasig' },
  { name: 'Jessica Camille De Guzman, MPsy, RPsy, RPm', role: 'PSYCH', branch: 'east_pasig' },
  { name: 'Khristian Rose Mari Cadeliña, RPsy', role: 'PSYCH', branch: 'east_pasig' },
  { name: 'Kirstien Rose Mari Cadiao, RPm, RPsy', role: 'PSYCH', branch: 'east_pasig' },
  { name: 'Marie Christine Chua, MP, RPm, RPsy', role: 'PSYCH', branch: 'east_pasig' },
  { name: 'Pamela Rose Madeja Rosana, RPsy, LPT, MP', role: 'PSYCH', branch: 'east_pasig' },
  { name: 'Relyssa Julia T. Solomon, MA, RPsy', role: 'PSYCH', branch: 'east_pasig' },
  { name: 'Vincent Bren Senseng Tajor, MA, RPsy', role: 'PSYCH', branch: 'east_pasig' },
  { name: 'Wealyn Sarmiento Reña, MA, RPsy, RPm', role: 'PSYCH', branch: 'east_pasig' },

  // Physical Therapists
  { name: 'Denise Veronica A. Salao, PTRP', role: 'PT', branch: 'east_pasig' },
  { name: 'Janine Patricia M. Sadiz, PTRP', role: 'PT', branch: 'east_pasig' },
  { name: 'Mary Helen Kagaoan, PTRP', role: 'PT', branch: 'east_pasig' },
  { name: 'Trisha Bautista, PTRP', role: 'PT', branch: 'east_pasig' },

  // Speech-Language Pathologists
  { name: 'Angeri Johann de Borja, RSLP', role: 'SLP', branch: 'east_pasig' },
  { name: 'Francesca Pauline Abrugar Santos, RSLP', role: 'SLP', branch: 'east_pasig' },
  { name: 'Marian Juliet Manrique, RSLP', role: 'SLP', branch: 'east_pasig' },
  { name: 'Raymond Angelo Gonzales, MEd, RSLP', role: 'SLP', branch: 'east_pasig' },
  { name: 'Sheena Therese Daya, RSLP', role: 'SLP', branch: 'east_pasig' },

  // Special Education Teachers (HR10 only — pedia)
  { name: 'Camille Gutierrez Cruz, LPT', role: 'SPED', branch: 'east_pasig' },
  { name: 'Mikee Carbonera, LPT', role: 'SPED', branch: 'east_pasig' },
  { name: 'Sophia Bianca Laurilla, LPT', role: 'SPED', branch: 'east_pasig' },
  { name: 'Stephanie Rose Cristi, LPT', role: 'SPED', branch: 'east_pasig' },
];

// ── Admin / Front Desk Staff (from HR12 Typeform JSON) ────────────
const adminStaff = [
  { name: 'Julie Ann Osorio', role: 'FRONT_DESK', branch: 'east_pasig' },
  { name: 'Jahzeel Villanueva-Santos', role: 'FRONT_DESK', branch: 'east_pasig' },
  { name: 'Joyce-Anne Dela Cruz', role: 'FRONT_DESK', branch: 'greenhills' },
  { name: 'Faith Caagay', role: 'FRONT_DESK', branch: 'greenhills' },
];

// ── Survey Schemas ────────────────────────────────────────────────

const HR10_SCHEMA = {
  id: 'HR10',
  title: 'Pedia Patient Satisfaction Survey',
  welcomeNote: 'Thank you for taking this short survey to help us assess our services.\nNOTE: This is only for parents and guardians of PEDIA PATIENTS/CLIENTS.',
  privacyNote: 'All information disclosed in this assessment will be treated with strict confidentiality in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173). While summary results may be shared with the assessed individual for the purpose of professional development, the identity of the assessor will remain anonymous and will not be disclosed.',
  sections: [
    {
      title: 'Branch Information',
      fields: [
        { name: 'branch', type: 'select', label: 'Please choose the SANDBOX BRANCH', required: false, prefill: true, options: ['Sandbox East Pasig', 'Sandbox Greenhills San Juan', 'Sandbox Activefun BGC', 'Sandbox Prime BGC', 'Sandbox Clark Pampanga'] }
      ]
    },
    {
      title: 'Parent/Guardian Information',
      fields: [
        { name: 'guardian_first_name', type: 'text', label: 'First Name', required: false },
        { name: 'guardian_last_name', type: 'text', label: 'Last Name', required: false },
        { name: 'guardian_phone', type: 'tel', label: 'Phone Number', required: false },
        { name: 'guardian_email', type: 'email', label: 'Email', required: false }
      ]
    },
    {
      title: 'Patient (Pedia) Information',
      fields: [
        { name: 'patient_first_name', type: 'text', label: 'First Name', required: false, prefill: true },
        { name: 'patient_last_name', type: 'text', label: 'Last Name', required: false, prefill: true }
      ]
    },
    {
      title: 'Therapist/Teacher',
      fields: [
        { name: 'therapist', type: 'dropdown', label: 'Please choose the name of the Therapist/Teacher to be assessed', required: false, prefill: true, options_from: 'staff_clinical_pedia' }
      ]
    },
    {
      title: 'Rating Questions',
      description: 'Please rate the following on a scale of 0 to 5 (0 = Strongly Disagree, 5 = Strongly Agree)',
      fields: [
        { name: 'q1', type: 'opinion_scale', label: "To what extent do you agree that your child's teacher/therapist has effectively addressed their educational and/or therapeutic needs?", required: false, scale: { min: 0, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'q2', type: 'opinion_scale', label: "How would you rate the consistency and effectiveness of communication and collaboration between you and the teachers/therapists regarding your child's progress and needs?", required: false, scale: { min: 0, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'q3', type: 'opinion_scale', label: 'To what extent do you agree that your child has shown improvement in managing their emotions and self-regulation?', required: false, scale: { min: 0, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'q4', type: 'opinion_scale', label: "How would you rate the quality of your child's interaction with peers or other individuals while in the program?", required: false, scale: { min: 0, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'q5', type: 'opinion_scale', label: "To what extent do you agree that your child's social or communication skills have developed positively during their time in the program?", required: false, scale: { min: 0, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'q6', type: 'opinion_scale', label: 'To what extent do you agree that your child has demonstrated improvement in their behavior and/or ability to follow instructions?', required: false, scale: { min: 0, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'q7', type: 'opinion_scale', label: 'To what extent do you agree that your child has shown improvement in their academic, communication, or functional skills while enrolled in this program?', required: false, scale: { min: 0, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'q8', type: 'opinion_scale', label: "How well do you feel informed about your child's Individualized Education Plan (IEP) or Therapy Goals and progress?", required: false, scale: { min: 0, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } }
      ]
    },
    {
      title: 'Additional Feedback',
      fields: [
        { name: 'strengths', type: 'textarea', label: 'Strengths and Accomplishments', required: false },
        { name: 'improvements', type: 'textarea', label: 'Performance Areas that Need Improvement', required: false }
      ]
    }
  ],
  thankYou: {
    title: 'Thank you for helping us improve by answering this short survey.',
    description: 'We look forward to having you with us again!\n\nFor customer feedback, you may also email customerfeedback@sapphireclinicseast.org'
  }
};

const HR11_SCHEMA = {
  id: 'HR11',
  title: 'Adult Patient Satisfaction Survey',
  welcomeNote: 'Thank you for taking this short survey to help us assess our services.\nNOTE: This is only for ADULT PATIENTS/CLIENTS.',
  privacyNote: 'All information disclosed in this assessment will be treated with strict confidentiality in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173). While summary results may be shared with the assessed individual for the purpose of professional development, the identity of the assessor will remain anonymous and will not be disclosed.',
  sections: [
    {
      title: 'Branch Information',
      fields: [
        { name: 'branch', type: 'select', label: 'Please choose the SANDBOX BRANCH', required: false, prefill: true, options: ['Sandbox East Pasig', 'Sandbox Greenhills San Juan', 'Sandbox Activefun BGC', 'Sandbox Prime BGC', 'Sandbox Clark Pampanga'] }
      ]
    },
    {
      title: 'Patient Information',
      fields: [
        { name: 'patient_first_name', type: 'text', label: 'First Name', required: false, prefill: true },
        { name: 'patient_last_name', type: 'text', label: 'Last Name', required: false, prefill: true },
        { name: 'patient_phone', type: 'tel', label: 'Phone Number', required: false },
        { name: 'patient_email', type: 'email', label: 'Email', required: false }
      ]
    },
    {
      title: 'Therapist',
      fields: [
        { name: 'therapist', type: 'dropdown', label: 'Please choose the name of the Therapist to be assessed', required: false, prefill: true, options_from: 'staff_clinical_adult' }
      ]
    },
    {
      title: 'Rating Questions',
      description: 'Please rate the following on a scale of 0 to 5',
      fields: [
        { name: 'q1', type: 'opinion_scale', label: "How satisfied are you with the therapist's ability to assess and understand your specific needs and concerns?", required: false, scale: { min: 0, max: 5, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
        { name: 'q2', type: 'opinion_scale', label: "To what extent are you satisfied with the therapist's development of a personalized treatment plan tailored to your goals?", required: false, scale: { min: 0, max: 5, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
        { name: 'q3', type: 'opinion_scale', label: 'How well did the therapist explain the goals and techniques of your treatment in a way that you could understand?', required: false, scale: { min: 0, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'q4', type: 'opinion_scale', label: 'How effective do you feel the therapy sessions have been in addressing your issues and contributing to your improvement?', required: false, scale: { min: 0, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'q5', type: 'opinion_scale', label: "How satisfied are you with the therapist's ability to adapt the treatment approach based on your feedback and progress?", required: false, scale: { min: 0, max: 5, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
        { name: 'q6', type: 'opinion_scale', label: "How would you rate the therapist's communication skills and ability to build a positive, trusting relationship with you?", required: false, scale: { min: 0, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'q7', type: 'opinion_scale', label: 'To what extent did the therapist listen to and address any concerns or questions you had during the therapy sessions?', required: false, scale: { min: 0, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'q8', type: 'opinion_scale', label: 'How satisfied are you with the level of respect, professionalism, and empathy shown by the therapist throughout your treatment?', required: false, scale: { min: 0, max: 5, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
        { name: 'q9', type: 'opinion_scale', label: "How would you rate the therapist's punctuality and the efficient use of time during your sessions?", required: false, scale: { min: 0, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'q10', type: 'opinion_scale', label: 'If a home exercise program was provided, how clear and easy to follow were the instructions given by the therapist?', required: false, scale: { min: 0, max: 5, left: 'Very Difficult', right: 'Very Easy' } },
        { name: 'q11', type: 'opinion_scale', label: 'Overall, how satisfied are you with the therapist\'s service and the care you received during your sessions?', required: false, scale: { min: 0, max: 5, left: 'Very Dissatisfied', right: 'Very Satisfied' } },
        { name: 'q12', type: 'opinion_scale', label: 'How likely are you to continue therapy or recommend this therapist to others based on your experience?', required: false, scale: { min: 0, max: 5, left: 'Strongly Unlikely', right: 'Strongly Likely' } }
      ]
    },
    {
      title: 'Additional Feedback',
      fields: [
        { name: 'strengths', type: 'textarea', label: 'Strengths and Accomplishments', required: false },
        { name: 'improvements', type: 'textarea', label: 'Performance Areas that Need Improvement', required: false }
      ]
    }
  ],
  thankYou: {
    title: 'Thank you for helping us improve by answering this short survey.',
    description: 'We look forward to having you with us again!\n\nFor customer feedback, you may also email customerfeedback@sapphireclinicseast.org'
  }
};

const HR12_SCHEMA = {
  id: 'HR12',
  title: 'Admin Satisfaction Survey',
  welcomeNote: 'Thank you for taking this short survey to help us assess our services.\nNOTE: This is only for the assessment of our front desk officers.',
  privacyNote: 'All information disclosed in this assessment will be treated with strict confidentiality in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173). While summary results may be shared with the assessed individual for the purpose of professional development, the identity of the assessor will remain anonymous and will not be disclosed.',
  sections: [
    {
      title: 'Assessor Information',
      fields: [
        { name: 'assessor_first_name', type: 'text', label: 'First Name', required: false },
        { name: 'assessor_last_name', type: 'text', label: 'Last Name', required: false },
        { name: 'assessor_phone', type: 'tel', label: 'Phone Number', required: false },
        { name: 'assessor_email', type: 'email', label: 'Email', required: false }
      ]
    },
    {
      title: 'Branch Information',
      fields: [
        { name: 'branch', type: 'select', label: 'Please choose the SANDBOX BRANCH', required: true, prefill: true, options: ['Sandbox East Pasig', 'Sandbox Greenhills San Juan', 'Sandbox Activefun BGC', 'Sandbox Prime BGC', 'Sandbox Clark Pampanga'] }
      ]
    },
    {
      title: 'Front Desk Officer',
      fields: [
        {
          name: 'front_desk_officer', type: 'conditional_dropdown', label: 'Please put name of Front Desk Officer to be assessed',
          required: false, prefill: true,
          conditions: {
            'Sandbox East Pasig': { type: 'dropdown', options: ['Julie Ann Osorio', 'Jahzeel Villanueva-Santos'] },
            'Sandbox Greenhills San Juan': { type: 'dropdown', options: ['Joyce-Anne Dela Cruz', 'Faith Caagay'] },
            '_default': { type: 'text', placeholder: 'Enter name of Front Desk Officer' }
          },
          depends_on: 'branch'
        }
      ]
    },
    {
      title: 'Rating Questions',
      description: 'Please rate the following on a scale of 0 to 5',
      fields: [
        { name: 'q1', type: 'opinion_scale', label: "How satisfied are you with the staff's willingness to assist with your inquiries or concerns?", required: false, scale: { min: 0, max: 5, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
        { name: 'q2', type: 'opinion_scale', label: 'How satisfied are you with the warmth and friendliness of the greeting you received upon entering the clinic?', required: false, scale: { min: 0, max: 5, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
        { name: 'q3', type: 'opinion_scale', label: 'How would you rate the efficiency of the staff in handling your appointments, scheduling, and payment processes?', required: false, scale: { min: 0, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'q4', type: 'opinion_scale', label: 'To what extent are you satisfied with the professionalism and respect shown by the administrative staff during your interactions?', required: false, scale: { min: 0, max: 5, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
        { name: 'q5', type: 'opinion_scale', label: 'How satisfied are you with the cleanliness and orderliness of the reception and waiting areas?', required: false, scale: { min: 0, max: 5, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
        { name: 'q6', type: 'opinion_scale', label: 'How satisfied are you with the clarity and helpfulness of the information provided by the administrative staff?', required: false, scale: { min: 0, max: 5, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
        { name: 'q7', type: 'opinion_scale', label: "How would you rate the staff's responsiveness to your questions, whether in person, by phone, or by email?", required: false, scale: { min: 0, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'q8', type: 'opinion_scale', label: 'Overall, how satisfied are you with the service and support provided by the administrative staff during your visit?', required: false, scale: { min: 0, max: 5, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
        { name: 'q9', type: 'opinion_scale', label: 'Based on your experience with the administrative staff, how likely are you to recommend our clinic to others?', required: false, scale: { min: 0, max: 5, left: 'Will Not Recommend', right: 'Will Recommend' } }
      ]
    },
    {
      title: 'Additional Feedback',
      fields: [
        { name: 'comments', type: 'textarea', label: 'Additional Comments or Suggestions', required: false }
      ]
    }
  ],
  thankYou: {
    title: 'Thank you for helping us improve by answering this short survey.',
    description: 'We look forward to having you with us again!\n\nFor customer feedback, you may also email customerfeedback@sapphireclinicseast.org'
  }
};

const HR16_SCHEMA = {
  id: 'HR16',
  title: 'Group Therapy Satisfaction Survey',
  welcomeNote: 'Thank you for taking this short survey to help us assess our services. This form is intended for both PEDIA & ADULT Group Therapy Sessions.',
  privacyNote: 'All information disclosed in this assessment will be treated with strict confidentiality in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173). While summary results may be shared with the assessed individual for the purpose of professional development, the identity of the assessor will remain anonymous and will not be disclosed.',
  sections: [
    {
      title: 'Branch Information',
      fields: [
        { name: 'branch', type: 'select', label: 'Please choose the SANDBOX BRANCH', required: false, prefill: true, options: ['Sandbox East Pasig', 'Sandbox Greenhills San Juan', 'Sandbox Activefun BGC', 'Sandbox Prime BGC', 'Sandbox Clark Pampanga'] }
      ]
    },
    {
      title: 'Patient Information',
      description: 'Put your name (if adult patient) or child\'s name (if pedia).',
      fields: [
        { name: 'patient_first_name', type: 'text', label: 'First Name', required: false, prefill: true },
        { name: 'patient_last_name', type: 'text', label: 'Last Name', required: false, prefill: true }
      ]
    },
    {
      title: 'Session Type',
      fields: [
        { name: 'group_type', type: 'select', label: 'Please choose whether the group class was for children (Pedia) or adults (Adult)', required: true, options: ['Pedia Group Sessions', 'Adult Group Sessions'] }
      ]
    },
    // ── PEDIA SECTION ──
    {
      title: 'Pedia Group Therapy Service',
      condition: { field: 'group_type', value: 'Pedia Group Sessions' },
      fields: [
        { name: 'pedia_service', type: 'select', label: 'What group therapy service did the patient avail?', required: true, options: ['Social Class (Mighty Kids)'] }
      ]
    },
    {
      title: 'Parent/Guardian Information',
      condition: { field: 'group_type', value: 'Pedia Group Sessions' },
      fields: [
        { name: 'guardian_first_name', type: 'text', label: 'First Name', required: false },
        { name: 'guardian_last_name', type: 'text', label: 'Last Name', required: false },
        { name: 'guardian_phone', type: 'tel', label: 'Phone Number', required: false },
        { name: 'guardian_email', type: 'email', label: 'Email', required: false }
      ]
    },
    {
      title: 'Pedia Group Therapy Rating',
      condition: { field: 'group_type', value: 'Pedia Group Sessions' },
      description: 'Please rate the following on a scale of 1 to 5 (1 = Strongly Disagree, 5 = Strongly Agree)',
      fields: [
        { name: 'pq1', type: 'opinion_scale', label: 'The patient looked forward to attending group sessions.', required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'pq2', type: 'opinion_scale', label: "The group activities were appropriate for the child's age and needs.", required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'pq3', type: 'opinion_scale', label: 'The child was able to participate and engage in the group.', required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'pq4', type: 'opinion_scale', label: "I noticed improvements in the child's communication or interaction with others.", required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'pq5', type: 'opinion_scale', label: "I observed changes in the child's behavior or emotional regulation at home.", required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'pq6', type: 'opinion_scale', label: "The group sessions helped develop the child's functional skills (e.g., motor, play, or self-regulation skills).", required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'pq7', type: 'opinion_scale', label: 'The therapists facilitated the sessions well and supported each child.', required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'pq8', type: 'opinion_scale', label: "I received sufficient communication and updates about my child's participation.", required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'pq9', type: 'opinion_scale', label: 'The goals of the group therapy were explained clearly.', required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'pq10', type: 'opinion_scale', label: 'I would recommend this group therapy program to other parents.', required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } }
      ]
    },
    // ── ADULT SECTION ──
    {
      title: 'Adult Group Therapy Service',
      condition: { field: 'group_type', value: 'Adult Group Sessions' },
      fields: [
        { name: 'adult_service', type: 'select', label: 'What group therapy service did the patient avail?', required: true, options: ['Adult Group Therapy Program'] }
      ]
    },
    {
      title: 'Adult Group Therapy Rating',
      condition: { field: 'group_type', value: 'Adult Group Sessions' },
      description: 'Please rate the following on a scale of 1 to 5 (1 = Strongly Disagree, 5 = Strongly Agree)',
      fields: [
        { name: 'aq1', type: 'opinion_scale', label: 'I looked forward to attending the group therapy sessions.', required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'aq2', type: 'opinion_scale', label: 'The group activities were appropriate and aligned with my therapy goals and physical/functional needs.', required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'aq3', type: 'opinion_scale', label: 'I felt comfortable and supported while participating in the group sessions.', required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'aq4', type: 'opinion_scale', label: 'I noticed improvements in my physical abilities or functional performance (e.g., mobility, strength, coordination, independence).', required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'aq5', type: 'opinion_scale', label: 'I observed positive changes in how I manage daily activities or physical challenges outside of the sessions.', required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'aq6', type: 'opinion_scale', label: 'The sessions helped me develop practical skills for daily living (e.g., self-care, work-related tasks, home management).', required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'aq7', type: 'opinion_scale', label: 'The therapists facilitated the sessions effectively and created a safe, motivating environment.', required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'aq8', type: 'opinion_scale', label: 'I received sufficient information and updates about the structure, goals, and progress of the sessions.', required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'aq9', type: 'opinion_scale', label: 'The objectives of the group therapy program were clearly explained and aligned with my rehabilitation needs.', required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        { name: 'aq10', type: 'opinion_scale', label: 'I would recommend this group therapy program to other adults with similar goals.', required: true, scale: { min: 1, max: 5, left: 'Strongly Disagree', right: 'Strongly Agree' } }
      ]
    },
    {
      title: 'Additional Feedback',
      fields: [
        { name: 'comments', type: 'textarea', label: 'Additional Comments / Observations / Suggestions', required: false }
      ]
    }
  ],
  thankYou: {
    title: 'Thank you for helping us improve by answering this short survey.',
    description: 'We look forward to having you with us again!\n\nFor customer feedback, you may also email customerfeedback@sapphireclinicseast.org'
  }
};

// ── Seed Function ─────────────────────────────────────────────────
function seed() {
  console.log('Seeding database...');

  const year = new Date().getFullYear();

  const insertStaff = db.prepare(`
    INSERT OR IGNORE INTO staff (name, role, branch, staff_type)
    VALUES (?, ?, ?, ?)
  `);

  const insertTarget = db.prepare(`
    INSERT OR IGNORE INTO assessment_targets (staff_id, year, target_count)
    VALUES (?, ?, ?)
  `);

  const insertSurveyType = db.prepare(`
    INSERT OR REPLACE INTO survey_types (id, title, description, schema_json, target_group)
    VALUES (?, ?, ?, ?, ?)
  `);

  const seedAll = db.transaction(() => {
    // Seed clinical staff
    for (const s of clinicalStaff) {
      insertStaff.run(s.name, s.role, s.branch, 'clinical');
    }

    // Seed admin staff
    for (const s of adminStaff) {
      insertStaff.run(s.name, s.role, s.branch, 'admin');
    }

    // Create assessment targets for current year
    const allStaff = db.prepare('SELECT id, staff_type FROM staff WHERE is_active = 1').all();
    for (const s of allStaff) {
      const target = s.staff_type === 'clinical' ? 4 : 10;
      insertTarget.run(s.id, year, target);
    }

    // Seed survey types
    insertSurveyType.run('HR10', 'Pedia Patient Satisfaction Survey', 'For pediatric patients (0-17 years old)', JSON.stringify(HR10_SCHEMA), 'pedia');
    insertSurveyType.run('HR11', 'Adult Patient Satisfaction Survey', 'For adult patients (18+ years old)', JSON.stringify(HR11_SCHEMA), 'adult');
    insertSurveyType.run('HR12', 'Admin Satisfaction Survey', 'For assessing front desk officers', JSON.stringify(HR12_SCHEMA), 'admin');
    insertSurveyType.run('HR16', 'Group Therapy Satisfaction Survey', 'For group therapy sessions (pedia & adult)', JSON.stringify(HR16_SCHEMA), 'group');
  });

  seedAll();

  const staffCount = db.prepare('SELECT COUNT(*) as count FROM staff').get();
  const targetCount = db.prepare('SELECT COUNT(*) as count FROM assessment_targets').get();
  const surveyCount = db.prepare('SELECT COUNT(*) as count FROM survey_types').get();

  console.log(`Seeded ${staffCount.count} staff members`);
  console.log(`Created ${targetCount.count} assessment targets for ${year}`);
  console.log(`Seeded ${surveyCount.count} survey types`);
  console.log('Done!');
}

seed();
db.close();
