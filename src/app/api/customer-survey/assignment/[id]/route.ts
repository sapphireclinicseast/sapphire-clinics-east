import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ── Survey form schemas (HR10, HR11, HR12, HR16) ─────────────────────────────
// Based on actual SCEI Typeform survey definitions
const SURVEY_SCHEMAS: Record<string, object> = {
  HR10: {
    title: 'HR10 — Pedia Patient Satisfaction Survey Form',
    description: 'Thank you for taking this short survey to help us assess our services.\nNOTE: This is only for parents and guardians of PEDIA PATIENTS/CLIENTS.',
    privacy: 'All information disclosed in this assessment will be treated with strict confidentiality in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173). While summary results may be shared with the assessed individual for the purpose of professional development, the identity of the assessor will remain anonymous and will not be disclosed.',
    thankYou: {
      title: 'Thank you for helping us improve by answering this short survey.',
      description: 'We look forward to having you with us again!\n\nFor customer feedback, you may also email customerfeedback@sapphireclinicseast.org',
    },
    sections: [
      {
        title: 'Therapist Assessment',
        questions: [
          { id: 'q1', text: "To what extent do you agree that your child's teacher/therapist has effectively addressed their educational and/or therapeutic needs?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Disagree', right: 'Strongly Agree' } },
          { id: 'q2', text: "How would you rate the consistency and effectiveness of communication and collaboration between you and the teachers/therapists regarding your child's progress and needs?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Disagree', right: 'Strongly Agree' } },
          { id: 'q3', text: "To what extent do you agree that your child has shown improvement in managing their emotions and self-regulation?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Disagree', right: 'Strongly Agree' } },
          { id: 'q4', text: "How would you rate the quality of your child's interaction with peers or other individuals while in the program?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Disagree', right: 'Strongly Agree' } },
          { id: 'q5', text: "To what extent do you agree that your child's social or communication skills have developed positively during their time in the program?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Disagree', right: 'Strongly Agree' } },
          { id: 'q6', text: "To what extent do you agree that your child has demonstrated improvement in their behavior and/or ability to follow instructions?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Disagree', right: 'Strongly Agree' } },
          { id: 'q7', text: "To what extent do you agree that your child has shown improvement in their academic, communication, or functional skills while enrolled in this program?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Disagree', right: 'Strongly Agree' } },
          { id: 'q8', text: "How well do you feel informed about your child's Individualized Education Plan (IEP) or Therapy Goals and progress?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Disagree', right: 'Strongly Agree' } },
        ],
      },
      {
        title: 'Additional Feedback',
        questions: [
          { id: 'q9', text: 'Strengths and Accomplishments', type: 'text' },
          { id: 'q10', text: 'Performance Areas that Need Improvement', type: 'text' },
        ],
      },
    ],
  },
  HR11: {
    title: 'HR11 — Adult Patient Satisfaction Survey Form',
    description: 'Thank you for taking this short survey to help us assess our services.\nNOTE: This is only for ADULT PATIENTS/CLIENTS.',
    privacy: 'All information disclosed in this assessment will be treated with strict confidentiality in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173). While summary results may be shared with the assessed individual for the purpose of professional development, the identity of the assessor will remain anonymous and will not be disclosed.',
    thankYou: {
      title: 'Thank you for helping us improve by answering this short survey.',
      description: 'We look forward to having you with us again!\n\nFor customer feedback, you may also email customerfeedback@sapphireclinicseast.org',
    },
    sections: [
      {
        title: 'Therapist Assessment',
        questions: [
          { id: 'q1', text: "How satisfied are you with the therapist's ability to assess and understand your specific needs and concerns?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
          { id: 'q2', text: "To what extent are you satisfied with the therapist's development of a personalized treatment plan tailored to your goals?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
          { id: 'q3', text: "How well did the therapist explain the goals and techniques of your treatment in a way that you could understand?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Disagree', right: 'Strongly Agree' } },
          { id: 'q4', text: "How effective do you feel the therapy sessions have been in addressing your issues and contributing to your improvement?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Disagree', right: 'Strongly Agree' } },
          { id: 'q5', text: "How satisfied are you with the therapist's ability to adapt the treatment approach based on your feedback and progress?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
          { id: 'q6', text: "How would you rate the therapist's communication skills and ability to build a positive, trusting relationship with you?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Disagree', right: 'Strongly Agree' } },
          { id: 'q7', text: "To what extent did the therapist listen to and address any concerns or questions you had during the therapy sessions?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Disagree', right: 'Strongly Agree' } },
          { id: 'q8', text: "How satisfied are you with the level of respect, professionalism, and empathy shown by the therapist throughout your treatment?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
          { id: 'q9', text: "How would you rate the therapist's punctuality and the efficient use of time during your sessions?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Disagree', right: 'Strongly Agree' } },
          { id: 'q10', text: "If a home exercise program was provided, how clear and easy to follow were the instructions given by the therapist?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Very Difficult', right: 'Very Easy' } },
          { id: 'q11', text: "Overall, how satisfied are you with the therapist's service and the care you received during your sessions?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Very Dissatisfied', right: 'Very Satisfied' } },
          { id: 'q12', text: "How likely are you to continue therapy or recommend this therapist to others based on your experience?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Unlikely', right: 'Strongly Likely' } },
        ],
      },
      {
        title: 'Additional Feedback',
        questions: [
          { id: 'q13', text: 'Strengths and Accomplishments', type: 'text' },
          { id: 'q14', text: 'Performance Areas that Need Improvement', type: 'text' },
        ],
      },
    ],
  },
  HR12: {
    title: 'HR12 — Admin Satisfaction Survey Form',
    description: 'Thank you for taking this short survey to help us assess our services.\nNOTE: This is only for the assessment of our front desk officers.',
    privacy: 'All information disclosed in this assessment will be treated with strict confidentiality in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173). While summary results may be shared with the assessed individual for the purpose of professional development, the identity of the assessor will remain anonymous and will not be disclosed.',
    thankYou: {
      title: 'Thank you for helping us improve by answering this short survey.',
      description: 'We look forward to having you with us again!\n\nFor customer feedback, you may also email customerfeedback@sapphireclinicseast.org',
    },
    sections: [
      {
        title: 'Front Desk Assessment',
        questions: [
          { id: 'q1', text: "How satisfied are you with the staff's willingness to assist with your inquiries or concerns?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
          { id: 'q2', text: "How satisfied are you with the warmth and friendliness of the greeting you received upon entering the clinic?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
          { id: 'q3', text: "How would you rate the efficiency of the staff in handling your appointments, scheduling, and payment processes?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Disagree', right: 'Strongly Agree' } },
          { id: 'q4', text: "To what extent are you satisfied with the professionalism and respect shown by the administrative staff during your interactions?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
          { id: 'q5', text: "How satisfied are you with the cleanliness and orderliness of the reception and waiting areas?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
          { id: 'q6', text: "How satisfied are you with the clarity and helpfulness of the information provided by the administrative staff?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
          { id: 'q7', text: "How would you rate the staff's responsiveness to your questions, whether in person, by phone, or by email?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Disagree', right: 'Strongly Agree' } },
          { id: 'q8', text: "Overall, how satisfied are you with the service and support provided by the administrative staff during your visit?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Strongly Dissatisfied', right: 'Strongly Satisfied' } },
          { id: 'q9', text: "Based on your experience with the administrative staff, how likely are you to recommend our clinic to others?", type: 'rating', scale: { steps: 6, startAtOne: false, left: 'Will Not Recommend', right: 'Will Recommend' } },
        ],
      },
      {
        title: 'Additional Feedback',
        questions: [
          { id: 'q10', text: 'Additional Comments or Suggestions', type: 'text' },
        ],
      },
    ],
  },
  HR16: {
    title: 'HR16 — Group Therapy Satisfaction Survey Form',
    description: 'Thank you for taking this short survey to help us assess our services. This form is intended for both PEDIA & ADULT Group Therapy Sessions.',
    privacy: 'All information disclosed in this assessment will be treated with strict confidentiality in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173). While summary results may be shared with the assessed individual for the purpose of professional development, the identity of the assessor will remain anonymous and will not be disclosed.',
    thankYou: {
      title: 'Thank you for helping us improve by answering this short survey.',
      description: 'We look forward to having you with us again!\n\nFor customer feedback, you may also email customerfeedback@sapphireclinicseast.org',
    },
    // HR16 has pedia and adult variants — the API picks the right one based on patient age
    variants: {
      pedia: {
        label: 'Pedia Group Sessions',
        sections: [
          {
            title: 'Group Therapy Assessment',
            questions: [
              { id: 'q1', text: "The patient looked forward to attending group sessions.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q2', text: "The group activities were appropriate for the child's age and needs.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q3', text: "The child was able to participate and engage in the group.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q4', text: "I noticed improvements in the child's communication or interaction with others.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q5', text: "I observed changes in the child's behavior or emotional regulation at home.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q6', text: "The group sessions helped develop the child's functional skills (e.g., motor, play, or self-regulation skills).", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q7', text: "The therapists facilitated the sessions well and supported each child.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q8', text: "I received sufficient communication and updates about my child's participation.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q9', text: "The goals of the group therapy were explained clearly.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q10', text: "I would recommend this group therapy program to other parents.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
            ],
          },
          {
            title: 'Additional Feedback',
            questions: [
              { id: 'q11', text: 'Additional Comments / Observations / Suggestions', type: 'text' },
            ],
          },
        ],
      },
      adult: {
        label: 'Adult Group Sessions',
        sections: [
          {
            title: 'Group Therapy Assessment',
            questions: [
              { id: 'q1', text: "I looked forward to attending the group therapy sessions.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q2', text: "The group activities were appropriate and aligned with my therapy goals and physical/functional needs.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q3', text: "I felt comfortable and supported while participating in the group sessions.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q4', text: "I noticed improvements in my physical abilities or functional performance (e.g., mobility, strength, coordination, independence).", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q5', text: "I observed positive changes in how I manage daily activities or physical challenges outside of the sessions.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q6', text: "The sessions helped me develop practical skills for daily living (e.g., self-care, work-related tasks, home management).", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q7', text: "The therapists facilitated the sessions effectively and created a safe, motivating environment.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q8', text: "I received sufficient information and updates about the structure, goals, and progress of the sessions.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q9', text: "The objectives of the group therapy program were clearly explained and aligned with my rehabilitation needs.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
              { id: 'q10', text: "I would recommend this group therapy program to other adults with similar goals.", type: 'rating', scale: { steps: 5, startAtOne: true, left: 'Strongly Disagree', right: 'Strongly Agree' } },
            ],
          },
          {
            title: 'Additional Feedback',
            questions: [
              { id: 'q11', text: 'Additional Comments / Observations / Suggestions', type: 'text' },
            ],
          },
        ],
      },
    },
  },
}

// ── GET /api/customer-survey/assignment/[id] — Public, no auth ───────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const assignment = await prisma.surveyAssignment.findUnique({
    where: { id },
    include: {
      staff: true,
      response: true,
    },
  })

  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  if (assignment.response) {
    return NextResponse.json({ error: 'This survey has already been completed' }, { status: 410 })
  }

  if (assignment.status === 'EXPIRED' || assignment.expiresAt < new Date()) {
    if (assignment.status !== 'EXPIRED') {
      await prisma.surveyAssignment.update({ where: { id }, data: { status: 'EXPIRED' } })
    }
    return NextResponse.json({ error: 'This survey has expired' }, { status: 410 })
  }

  // Mark as in progress
  if (assignment.status === 'PENDING') {
    await prisma.surveyAssignment.update({ where: { id }, data: { status: 'IN_PROGRESS' } })
  }

  let schema = SURVEY_SCHEMAS[assignment.surveyType] ?? SURVEY_SCHEMAS.HR11

  // HR16: resolve pedia/adult variant based on patient age
  if (assignment.surveyType === 'HR16' && 'variants' in schema) {
    const hr16 = schema as { title: string; description: string; privacy: string; thankYou: object; variants: Record<string, { label: string; sections: object[] }> }
    const isPedia = (assignment.patientAge ?? 0) < 18
    const variant = isPedia ? hr16.variants.pedia : hr16.variants.adult
    schema = {
      title: hr16.title,
      description: hr16.description,
      privacy: hr16.privacy,
      thankYou: hr16.thankYou,
      variant: variant.label,
      sections: variant.sections,
    }
  }

  return NextResponse.json({
    id: assignment.id,
    surveyType: assignment.surveyType,
    schema,
    staffName: `${assignment.staff.firstName} ${assignment.staff.lastName}`,
    staffRole: assignment.staff.department,
    branch: assignment.branch,
    patientName: assignment.patientName,
    patientAge: assignment.patientAge,
    sessionType: assignment.sessionType,
  })
}
