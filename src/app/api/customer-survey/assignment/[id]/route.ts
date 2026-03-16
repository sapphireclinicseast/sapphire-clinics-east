import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ── Survey form schemas (HR10, HR11, HR12, HR16) ─────────────────────────────
const SURVEY_SCHEMAS: Record<string, object> = {
  HR10: {
    title: 'Patient Satisfaction Survey — Pediatric (HR-10)',
    description: 'Please rate your child\'s therapy experience.',
    sections: [
      {
        title: 'Therapist Assessment',
        questions: [
          { id: 'q1', text: 'The therapist was friendly and approachable.', type: 'rating' },
          { id: 'q2', text: 'The therapist explained the session activities clearly.', type: 'rating' },
          { id: 'q3', text: 'My child felt comfortable during the session.', type: 'rating' },
          { id: 'q4', text: 'I am satisfied with my child\'s progress.', type: 'rating' },
          { id: 'q5', text: 'The session started and ended on time.', type: 'rating' },
        ],
      },
      {
        title: 'Front Desk Assessment',
        questions: [
          { id: 'q6', text: 'The front desk staff was courteous and helpful.', type: 'rating' },
          { id: 'q7', text: 'The check-in process was smooth and efficient.', type: 'rating' },
          { id: 'q8', text: 'The waiting area was clean and comfortable.', type: 'rating' },
        ],
      },
      {
        title: 'Additional Feedback',
        questions: [
          { id: 'q9', text: 'What did you like most about today\'s visit?', type: 'text' },
          { id: 'q10', text: 'Any suggestions for improvement?', type: 'text' },
        ],
      },
    ],
    scale: { min: 1, max: 5, labels: ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'] },
  },
  HR11: {
    title: 'Patient Satisfaction Survey — Adult (HR-11)',
    description: 'Please rate your therapy experience.',
    sections: [
      {
        title: 'Therapist Assessment',
        questions: [
          { id: 'q1', text: 'The therapist was professional and respectful.', type: 'rating' },
          { id: 'q2', text: 'The therapist clearly explained the treatment plan.', type: 'rating' },
          { id: 'q3', text: 'I felt comfortable and safe during the session.', type: 'rating' },
          { id: 'q4', text: 'I am satisfied with my therapy progress.', type: 'rating' },
          { id: 'q5', text: 'The session was conducted within the scheduled time.', type: 'rating' },
        ],
      },
      {
        title: 'Front Desk Assessment',
        questions: [
          { id: 'q6', text: 'The front desk staff was courteous and helpful.', type: 'rating' },
          { id: 'q7', text: 'The check-in process was smooth and efficient.', type: 'rating' },
          { id: 'q8', text: 'The clinic environment was clean and welcoming.', type: 'rating' },
        ],
      },
      {
        title: 'Additional Feedback',
        questions: [
          { id: 'q9', text: 'What did you like most about today\'s visit?', type: 'text' },
          { id: 'q10', text: 'Any suggestions for improvement?', type: 'text' },
        ],
      },
    ],
    scale: { min: 1, max: 5, labels: ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'] },
  },
  HR12: {
    title: 'Administrative Satisfaction Survey (HR-12)',
    description: 'Please rate the front desk and administrative services.',
    sections: [
      {
        title: 'Front Desk Experience',
        questions: [
          { id: 'q1', text: 'The front desk staff greeted me promptly.', type: 'rating' },
          { id: 'q2', text: 'The front desk staff was knowledgeable and helpful.', type: 'rating' },
          { id: 'q3', text: 'Appointment scheduling was convenient.', type: 'rating' },
          { id: 'q4', text: 'Billing and payment processes were clear.', type: 'rating' },
          { id: 'q5', text: 'Overall, I am satisfied with the administrative services.', type: 'rating' },
        ],
      },
      {
        title: 'Additional Feedback',
        questions: [
          { id: 'q6', text: 'Any suggestions to improve our administrative services?', type: 'text' },
        ],
      },
    ],
    scale: { min: 1, max: 5, labels: ['Very Dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very Satisfied'] },
  },
  HR16: {
    title: 'Group Therapy Satisfaction Survey (HR-16)',
    description: 'Please rate the group therapy session.',
    sections: [
      {
        title: 'Session Assessment',
        questions: [
          { id: 'q1', text: 'The group session was well-organized.', type: 'rating' },
          { id: 'q2', text: 'The therapist facilitated the group effectively.', type: 'rating' },
          { id: 'q3', text: 'My child/I benefited from the group activities.', type: 'rating' },
          { id: 'q4', text: 'The group size was appropriate.', type: 'rating' },
          { id: 'q5', text: 'I would recommend group therapy to others.', type: 'rating' },
        ],
      },
      {
        title: 'Additional Feedback',
        questions: [
          { id: 'q6', text: 'What did you enjoy most about the group session?', type: 'text' },
          { id: 'q7', text: 'Any suggestions for future group sessions?', type: 'text' },
        ],
      },
    ],
    scale: { min: 1, max: 5, labels: ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'] },
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

  const schema = SURVEY_SCHEMAS[assignment.surveyType] ?? SURVEY_SCHEMAS.HR11

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
