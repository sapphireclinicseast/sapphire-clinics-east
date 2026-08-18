import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, branchFromAddress } from '@/lib/email'
import { loadEmailLogo, emailHeader } from '@/lib/email-branding'
import { toPatientBranchCode } from '@/lib/branch-label'
import { readFile } from 'fs/promises'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
import { existsSync } from 'fs'
import path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

function renderNotesHtml(notesStr: string): string {
  try {
    const data = JSON.parse(notesStr)

    // OT Daily Notes
    if (data.formType === 'OT_DAILY_NOTES') {
      const s = (label: string, content: string) => `
        <h3 style="font-size: 13px; color: #4a8073; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 0.5px;">${label}</h3>
        <div style="background: #edf3d9; border-left: 3px solid #cf9d88; padding: 10px; border-radius: 6px; font-size: 13px; margin-bottom: 8px;">${content}</div>`
      const pills = (items: string[]) => items.map(i => `<span style="display:inline-block;background:#c69849;color:#ffffff;padding:2px 8px;border-radius:4px;font-size:11px;margin:2px;">${escapeHtml(i)}</span>`).join(' ')

      let html = '<h3 style="font-size: 14px; color: #4a8073; margin-bottom: 8px;">OT Daily Notes</h3>'
      if (data.subjective?.sessionType?.length) html += s('Subjective — Session Type', pills(data.subjective.sessionType) + (data.subjective.sessionTypeOther ? `<br/>Other: ${escapeHtml(data.subjective.sessionTypeOther)}` : ''))
      if (data.objective?.targets?.length) html += s('Objective — Targeted Areas', pills(data.objective.targets) + (data.objective.targetsOther ? `<br/>Other: ${escapeHtml(data.objective.targetsOther)}` : ''))
      if (data.activitiesAndPerformance) html += s('Activities and Performance', escapeHtml(data.activitiesAndPerformance))
      if (data.assessment) {
        let assess = ''
        if (data.assessment.taskExecution) assess += `<strong>Task/Skills Execution:</strong> ${escapeHtml(data.assessment.taskExecution)}<br/>`
        if (data.assessment.overallParticipation) assess += `<strong>Overall Participation:</strong> ${escapeHtml(data.assessment.overallParticipation)}<br/>`
        if (data.assessment.didWellIn) assess += `<strong>Did well in:</strong> ${escapeHtml(data.assessment.didWellIn)}<br/>`
        if (data.assessment.needsImprovementIn) assess += `<strong>Needs improvement in:</strong> ${escapeHtml(data.assessment.needsImprovementIn)}`
        if (assess) html += s('Assessment', assess)
      }
      if (data.plan?.selectedPlans?.length) {
        let planHtml = pills(data.plan.selectedPlans)
        if (data.plan.continueManagementDetails) planHtml += `<br/><strong>Continue mgmt:</strong> ${escapeHtml(data.plan.continueManagementDetails)}`
        if (data.plan.modifyActivitiesDetails) planHtml += `<br/><strong>Modify activities:</strong> ${escapeHtml(data.plan.modifyActivitiesDetails)}`
        if (data.plan.othersDetails) planHtml += `<br/><strong>Others:</strong> ${escapeHtml(data.plan.othersDetails)}`
        html += s('Plan', planHtml)
      }
      if (data.clinicianInfo?.licNo || data.clinicianInfo?.ptrNo) {
        let info = ''
        if (data.clinicianInfo.licNo) info += `<strong>PRC Lic No:</strong> ${escapeHtml(data.clinicianInfo.licNo)} `
        if (data.clinicianInfo.ptrNo) info += `<strong>PTR No:</strong> ${escapeHtml(data.clinicianInfo.ptrNo)}`
        html += s('Clinician Information', info)
      }
      return html
    }

    // Psychology notes
    if (data.formType?.startsWith('PSYCH_')) {
      const s = (label: string, content: string) => `
        <h3 style="font-size: 13px; color: #4a8073; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 0.5px;">${label}</h3>
        <div style="background: #edf3d9; border-left: 3px solid #cf9d88; padding: 10px; border-radius: 6px; font-size: 13px; margin-bottom: 8px;">${content}</div>`
      const pills = (items: string[]) => items.map(i => `<span style="display:inline-block;background:#c69849;color:#ffffff;padding:2px 8px;border-radius:4px;font-size:11px;margin:2px;">${escapeHtml(i)}</span>`).join(' ')

      let html = `<h3 style="font-size: 14px; color: #4a8073; margin-bottom: 8px;">${data.formType === 'PSYCH_INITIAL' ? 'Initial Assessment' : 'Progress Notes'}</h3>`
      if (data.section1) {
        let info = ''
        if (data.section1.modality) info += `<strong>Modality:</strong> ${escapeHtml(data.section1.modality)}<br/>`
        if (data.section1.emergencyContact) info += `<strong>Emergency Contact:</strong> ${escapeHtml(data.section1.emergencyContact)}`
        if (info) html += s('Client Information', info)
      }
      if (data.section2) {
        if (data.section2.presentingConcerns?.length) html += s('Presenting Concerns', pills(data.section2.presentingConcerns))
        if (data.section2.treatmentPlan) html += s('Treatment Plan', escapeHtml(data.section2.treatmentPlan))
        if (data.section2.goals) html += s('Goals', escapeHtml(data.section2.goals))
        if (data.section2.plansAndRecommendations) html += s('Plans & Recommendations', escapeHtml(data.section2.plansAndRecommendations))
      }
      if (data.section3) {
        if (data.section3.subjectiveData) html += s('Subjective Data', escapeHtml(data.section3.subjectiveData))
        if (data.section3.psychoEmotionalFunctioning) html += s('Psycho-Emotional Functioning', escapeHtml(data.section3.psychoEmotionalFunctioning))
        if (data.section3.recommendations) html += s('Recommendations', escapeHtml(data.section3.recommendations))
      }
      return html
    }

    // SLP Daily Notes
    if (data.formType === 'SLP_DAILY_NOTES') {
      const s = (label: string, content: string) => `
        <h3 style="font-size: 13px; color: #4a8073; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 0.5px;">${label}</h3>
        <div style="background: #edf3d9; border-left: 3px solid #cf9d88; padding: 10px; border-radius: 6px; font-size: 13px; margin-bottom: 8px;">${content}</div>`
      const pills = (items: string[]) => items.map(i => `<span style="display:inline-block;background:#c69849;color:#ffffff;padding:2px 8px;border-radius:4px;font-size:11px;margin:2px;">${escapeHtml(i)}</span>`).join(' ')

      let html = '<h3 style="font-size: 14px; color: #4a8073; margin-bottom: 8px;">SLP Daily Notes</h3>'
      if (data.subjective?.branch) html += `<p style="font-size:12px;color:#4a8073;margin-bottom:8px;">Branch: <strong>${escapeHtml(data.subjective.branch)}</strong></p>`
      if (data.subjective?.sessionType?.length) html += s('Subjective (S) — Session Type', pills(data.subjective.sessionType) + (data.subjective.sessionTypeOther ? `<br/>Other: ${escapeHtml(data.subjective.sessionTypeOther)}` : ''))
      if (data.subjective?.additionalNotes) html += s('Subjective Notes', escapeHtml(data.subjective.additionalNotes))
      if (data.objective?.targets?.length) html += s('Objective (O) — Targeted Areas', pills(data.objective.targets) + (data.objective.targetsOther ? `<br/>Other: ${escapeHtml(data.objective.targetsOther)}` : ''))
      if (data.patientAssessment) html += s('Patient Assessment / Performance (A)', escapeHtml(data.patientAssessment))
      if (data.plan?.selectedPlans?.length) {
        let planHtml = pills(data.plan.selectedPlans)
        if (data.plan.continueManagementDetails) planHtml += `<br/><strong>Continue mgmt:</strong> ${escapeHtml(data.plan.continueManagementDetails)}`
        if (data.plan.modifyActivitiesDetails) planHtml += `<br/><strong>Modify activities:</strong> ${escapeHtml(data.plan.modifyActivitiesDetails)}`
        if (data.plan.othersDetails) planHtml += `<br/><strong>Others:</strong> ${escapeHtml(data.plan.othersDetails)}`
        html += s('Plan (P)', planHtml)
      }
      if (data.clinicianInfo?.licNo || data.clinicianInfo?.ptrNo) {
        let info = ''
        if (data.clinicianInfo.licNo) info += `<strong>PRC Lic No:</strong> ${escapeHtml(data.clinicianInfo.licNo)} `
        if (data.clinicianInfo.ptrNo) info += `<strong>PTR No:</strong> ${escapeHtml(data.clinicianInfo.ptrNo)}`
        html += s('Clinician Information', info)
      }
      return html
    }

    // SPED16 / SPED18
    if (data.formType === 'SPED16' || data.formType === 'SPED18') {
      const s = (label: string, content: string) => `
        <h3 style="font-size: 13px; color: #4a8073; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 0.5px;">${label}</h3>
        <div style="background: #edf3d9; border-left: 3px solid #cf9d88; padding: 10px; border-radius: 6px; font-size: 13px; margin-bottom: 8px;">${content}</div>`
      const pills = (items: string[]) => items.map(i => `<span style="display:inline-block;background:#c69849;color:#ffffff;padding:2px 8px;border-radius:4px;font-size:11px;margin:2px;">${escapeHtml(i)}</span>`).join(' ')

      let html = `<h3 style="font-size: 14px; color: #4a8073; margin-bottom: 8px;">${data.formType === 'SPED16' ? 'SPED16' : 'SPED18'} — Daily Notes</h3>`
      const d = data.data
      if (d.sessionType?.length) html += s('Subjective — Session Type', pills(d.sessionType) + (d.sessionTypeOther ? `<br/>Other: ${escapeHtml(d.sessionTypeOther)}` : ''))

      if (data.formType === 'SPED16') {
        if (d.strengths || d.challenges) {
          let perf = ''
          if (d.strengths) perf += `<strong>Strengths:</strong> ${escapeHtml(d.strengths)}<br/>`
          if (d.challenges) perf += `<strong>Challenges:</strong> ${escapeHtml(d.challenges)}`
          html += s('Present Level of Performance', perf)
        }
        if (d.observedBehavior) html += s('Observed Behavior', escapeHtml(d.observedBehavior))
        if (d.recommendations) html += s('Recommendations', escapeHtml(d.recommendations))
        if (d.selectedPlans?.length) {
          let planHtml = pills(d.selectedPlans)
          if (d.othersDetails) planHtml += `<br/><strong>Others:</strong> ${escapeHtml(d.othersDetails)}`
          html += s('Plan', planHtml)
        }
      } else {
        // SPED18
        if (d.circleTime?.length) html += s('Circle Time', pills(d.circleTime))
        if (d.skillAreas?.length) html += s('Skill Areas', pills(d.skillAreas))
        if (d.activities) html += s('Activities', escapeHtml(d.activities))
        if (d.observations?.length) html += s('Observation', pills(d.observations) + (d.observationOther ? `<br/>Other: ${escapeHtml(d.observationOther)}` : ''))
        if (d.remarks) html += s('Remarks', escapeHtml(d.remarks))
      }

      if (data.clinicianInfo?.licNo || data.clinicianInfo?.ptrNo) {
        let info = ''
        if (data.clinicianInfo.licNo) info += `<strong>PRC Lic No:</strong> ${escapeHtml(data.clinicianInfo.licNo)} `
        if (data.clinicianInfo.ptrNo) info += `<strong>PTR No:</strong> ${escapeHtml(data.clinicianInfo.ptrNo)}`
        html += s('Clinician Information', info)
      }
      return html
    }

    // PT Session Notes
    if (data.formType === 'PT_SESSION_NOTES') {
      const s = (label: string, content: string) => `
        <h3 style="font-size: 13px; color: #4a8073; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 0.5px;">${label}</h3>
        <div style="background: #edf3d9; border-left: 3px solid #cf9d88; padding: 10px; border-radius: 6px; font-size: 13px; margin-bottom: 8px;">${content}</div>`

      let html = `<h3 style="font-size: 14px; color: #4a8073; margin-bottom: 8px;">PT Session Notes</h3>`
      if (data.branch) html += `<p style="font-size:12px;color:#4a8073;margin-bottom:8px;">Branch: <strong>${escapeHtml(data.branch)}</strong></p>`

      // Patient info
      let patientInfo = ''
      if (data.diagnosis) patientInfo += `<strong>Diagnosis:</strong> ${escapeHtml(data.diagnosis)}<br/>`
      if (data.sessionNumber) patientInfo += `<strong>Session #:</strong> ${escapeHtml(data.sessionNumber)}<br/>`
      if (data.precautions) patientInfo += `<strong>Precautions:</strong> ${escapeHtml(data.precautions)}<br/>`
      if (data.patientSituation) patientInfo += `<strong>Patient Situation:</strong> ${escapeHtml(data.patientSituation)}`
      if (patientInfo) html += s('Patient Information', patientInfo)

      // Subjective
      let subj = ''
      if (data.subjective) subj += `<strong>S:</strong> ${escapeHtml(data.subjective)}<br/>`
      if (data.chiefComplaint) subj += `<strong>C/c:</strong> ${escapeHtml(data.chiefComplaint)}`
      if (subj) html += s('Subjective (S)', subj)

      // Objective
      const o = data.objective
      if (o?.bp || o?.hr || o?.o2sat || o?.ps) {
        let vitals = ''
        if (o.bp) vitals += `<strong>BP:</strong> ${escapeHtml(o.bp)} &nbsp;`
        if (o.hr) vitals += `<strong>HR:</strong> ${escapeHtml(o.hr)} &nbsp;`
        if (o.o2sat) vitals += `<strong>O2sat:</strong> ${escapeHtml(o.o2sat)} &nbsp;`
        if (o.ps) vitals += `<strong>PS:</strong> ${escapeHtml(o.ps)}`
        html += s('Objective (O) — Vital Signs', vitals)
      }

      // Assessment
      if (data.assessment) html += s('Assessment (A)', escapeHtml(data.assessment))

      // PT Management
      if (data.ptManagement?.length) {
        const mgmt = data.ptManagement.map((m: string, i: number) => `${i + 1}. ${escapeHtml(m)}`).join('<br/>')
        html += s('PT Management', mgmt)
      }

      // Clinician info
      if (data.clinicianInfo?.licNo || data.clinicianInfo?.ptrNo) {
        let info = ''
        if (data.clinicianInfo.licNo) info += `<strong>PRC Lic No:</strong> ${escapeHtml(data.clinicianInfo.licNo)} `
        if (data.clinicianInfo.ptrNo) info += `<strong>PTR No:</strong> ${escapeHtml(data.clinicianInfo.ptrNo)}`
        html += s('Clinician Information', info)
      }
      return html
    }
  } catch {}

  // Fallback: plain text notes
  return `
    <h3 style="font-size: 14px; color: #4a8073;">Session Notes</h3>
    <div style="background: #edf3d9; padding: 12px; border-radius: 8px; font-size: 14px; white-space: pre-wrap;">${escapeHtml(notesStr)}</div>
  `
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Interns cannot send session notes to patients — only their supervisor
  // sends (and the supervisor's licence appears on what is sent).
  if (session.user.accountType === 'INTERN') {
    return NextResponse.json(
      { error: 'Interns cannot send notes. Ask your supervisor to review and send this note.' },
      { status: 403 },
    )
  }

  const { id } = await params

  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: {
      patient: true,
      staff: true,
      sessionNote: true,
    },
  })

  if (!schedule) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (!schedule.sessionNote) return NextResponse.json({ error: 'No session note to send' }, { status: 400 })
  if (!schedule.patient?.email) return NextResponse.json({ error: 'Patient has no email address' }, { status: 400 })
  // Initial Evaluations are NOT sent via this notes email (it has no
  // attachment and only references "see uploaded IE report"). The patient
  // must receive the IE through "Send Email to Patient" on the uploaded IE
  // document, which attaches the actual report. Block here so the notes
  // email can never go out for an IE session, regardless of caller.
  if (schedule.sessionNote.isInitialEvaluation) {
    return NextResponse.json(
      { error: 'Initial Evaluations are sent via "Send Email to Patient" on the uploaded IE document (which includes the report attachment). The notes email is disabled for IE sessions.' },
      { status: 400 },
    )
  }
  // Allow resending — no longer block if already sent

  // Resolve branch-specific CC from BranchCCEmail (same pattern as IE send-to-patient).
  // Falls back through patient.branch → patient.branches[0] → staff.branch (with legacy
  // SBEA/SBGH alias normalisation, since older Staff rows use those codes).
  const rawBranch =
    schedule.patient.branch ??
    schedule.patient.branches?.[0] ??
    (schedule.staff?.branch ? toPatientBranchCode(schedule.staff.branch) : null)
  let ccEmail: string | null = null
  if (rawBranch) {
    // @ts-ignore — branchCCEmail not in PrismaClient typings until generate
    const ccRow = await prisma.branchCCEmail.findUnique({ where: { branch: rawBranch } })
    ccEmail = ccRow?.email ?? null
  }

  try {
    const patientName = `${schedule.patient.firstName} ${schedule.patient.lastName}`
    const therapistName = `${schedule.staff.firstName} ${schedule.staff.lastName}`
    const sessionDate = new Date(schedule.date).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })

    // Read attachments from disk
    const emailAttachments: { filename: string; content: Buffer }[] = []
    const noteAttachments = (schedule.sessionNote.attachments as any[] | null) ?? []

    for (const att of noteAttachments) {
      const fullPath = path.join(UPLOAD_DIR, att.filePath)
      if (existsSync(fullPath)) {
        const content = await readFile(fullPath)
        emailAttachments.push({
          filename: att.fileName,
          content,
        })
      }
    }

    const attachmentListHtml = emailAttachments.length > 0 ? `
      <h3 style="font-size: 14px; color: #4a8073; margin-top: 16px;">Attachments</h3>
      <p style="font-size: 13px; color: #244952;">${emailAttachments.length} file(s) attached to this email.</p>
    ` : ''

    const logo = await loadEmailLogo()

    const html = `
      <div style="font-family: 'Montserrat', 'Arimo', Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #244952;">
        ${emailHeader('Session Notes', 'Sapphire Clinics East, Inc.', !!logo)}
        <div style="background: white; padding: 24px; border: 1px solid #d9e3c6; border-top: none; border-radius: 0 0 12px 12px;">
          <p>Dear <strong>${escapeHtml(patientName)}</strong>,</p>
          <p>Here are the notes from your session:</p>
          <div style="background: #edf3d9; border-left: 4px solid #c69849; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
            <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
              <tr><td style="padding: 4px 0; color: #4a8073;">Date</td><td>${sessionDate}</td></tr>
              <tr><td style="padding: 4px 0; color: #4a8073;">Time</td><td>${schedule.startTime} - ${schedule.endTime}</td></tr>
              <tr><td style="padding: 4px 0; color: #4a8073;">Session Type</td><td>${schedule.sessionType}</td></tr>
              <tr><td style="padding: 4px 0; color: #4a8073;">Clinician</td><td>${therapistName} (${schedule.staff.department})</td></tr>
            </table>
          </div>
          ${schedule.sessionNote.notes ? renderNotesHtml(schedule.sessionNote.notes) : ''}
          ${attachmentListHtml}
          <p style="font-size: 13px; color: #4a8073; margin-top: 24px;">
            This is an automated message from SCEI Staff Portal. Please contact your clinician directly if you have questions.
          </p>
        </div>
      </div>
    `

    await sendEmail({
      to: schedule.patient.email,
      cc: ccEmail ? [ccEmail] : undefined,
      from: branchFromAddress(rawBranch),
      subject: `Session Notes - ${sessionDate}`,
      html,
      attachments: emailAttachments,
      inlineImages: logo ? [logo] : undefined,
    })

    await prisma.sessionNote.update({
      where: { id: schedule.sessionNote.id },
      data: { emailSentAt: new Date(), emailSentTo: schedule.patient.email },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Email send error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
