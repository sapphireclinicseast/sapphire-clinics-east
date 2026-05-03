// Shared PDF generators for Peer Evaluation and Customer Survey per-staff results.
// Uses jsPDF — dynamically imported on the client so it is never bundled server-side.

export interface PeerEvalPDFInput {
  assesseeName: string
  department: string
  branch?: string
  overallAvg: number
  questions: Record<string, string> // qKey -> question label
  averages: Record<string, number>  // qKey -> avg score
  responses: Array<{
    assessorName: string
    submittedAt: string
    overallAvg: number
    scores: Record<string, number>
    strengths: string | null
    improvements: string | null
  }>
}

export interface SurveyPDFInput {
  staffName: string
  department: string
  branch: string
  avgRating: number
  sessionsTotal: number
  sessionsRescheduled: number
  sessionsCancelled: number
  compositeScore: number
  surveyCount: number
  monthlyRatings: { month: string; avgRating: number }[]
  feedback: { strengths: string[]; improvements: string[]; other: string[] }
  filterMonthLabel?: string
}

function colorForScore(score: number, max = 5): [number, number, number] {
  const ratio = score / max
  if (ratio >= 0.9) return [5, 150, 105]   // emerald
  if (ratio >= 0.7) return [2, 132, 199]   // sky
  if (ratio >= 0.5) return [217, 119, 6]   // amber
  return [220, 38, 38]                      // red
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')
}

export async function generatePeerEvalResultPDF(input: PeerEvalPDFInput): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const margin = 16
  const usable = W - margin * 2
  let y = margin

  const newPageIfNeeded = (n: number) => {
    if (y + n > H - 18) { doc.addPage(); y = margin }
  }

  // Header bar
  doc.setFillColor(237, 104, 35) // orange
  doc.rect(0, 0, W, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14); doc.setFont('helvetica', 'bold')
  doc.text('Peer Evaluation Results', margin, 11)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text('SAPPHIRE Clinics', margin, 18)

  y = 32

  // Assessee info block
  doc.setTextColor(17, 24, 39)
  doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text(input.assesseeName, margin, y)
  y += 5
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.setTextColor(107, 114, 128)
  const subtitle = [input.department, input.branch, `${input.responses.length} evaluation${input.responses.length !== 1 ? 's' : ''}`]
    .filter(Boolean).join('  ·  ')
  doc.text(subtitle, margin, y)
  y += 3

  // Overall score (top-right)
  const [or, og, ob] = colorForScore(input.overallAvg)
  doc.setFontSize(18); doc.setFont('helvetica', 'bold')
  doc.setTextColor(or, og, ob)
  doc.text(`${input.overallAvg.toFixed(2)} / 5`, W - margin, 32, { align: 'right' })
  doc.setFontSize(7); doc.setFont('helvetica', 'normal')
  doc.setTextColor(156, 163, 175)
  doc.text('OVERALL AVERAGE', W - margin, 37, { align: 'right' })

  // Divider
  y += 5
  doc.setDrawColor(229, 231, 235); doc.line(margin, y, W - margin, y)
  y += 5

  // Average scores section
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(55, 65, 81)
  doc.text('AVERAGE SCORES PER CRITERION', margin, y)
  y += 5

  const qKeys = Object.keys(input.questions)
  const labelW = 74
  const scoreW = 14
  const barH = 4
  const barW = usable - labelW - scoreW - 4

  for (const key of qKeys) {
    newPageIfNeeded(12)
    const v = input.averages[key] ?? 0
    const [r, g, b] = colorForScore(v)
    doc.setFontSize(7); doc.setFont('helvetica', 'bold')
    doc.setTextColor(156, 163, 175)
    doc.text(key.toUpperCase(), margin, y + 3)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81); doc.setFontSize(7.3)
    const lines = doc.splitTextToSize(input.questions[key], labelW - 12)
    doc.text(lines, margin + 10, y + 3)
    const rowH = Math.max(8, lines.length * 3.4 + 2)
    // bar
    const barX = margin + labelW
    doc.setFillColor(229, 231, 235); doc.roundedRect(barX, y + 1, barW, barH, 1.2, 1.2, 'F')
    const fill = Math.max(0, (v / 5) * barW)
    if (fill > 0) { doc.setFillColor(r, g, b); doc.roundedRect(barX, y + 1, fill, barH, 1.2, 1.2, 'F') }
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(r, g, b)
    doc.text(v.toFixed(2), barX + barW + 2, y + 4)
    y += rowH
  }

  // Individual assessments
  y += 3
  newPageIfNeeded(12)
  doc.setDrawColor(229, 231, 235); doc.line(margin, y, W - margin, y)
  y += 5
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(55, 65, 81)
  doc.text(`INDIVIDUAL ASSESSMENTS (${input.responses.length})`, margin, y)
  y += 5

  for (const resp of input.responses) {
    newPageIfNeeded(32)
    // assessor card header
    doc.setFillColor(249, 250, 251)
    doc.roundedRect(margin, y, usable, 8, 1.5, 1.5, 'F')
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(17, 24, 39)
    doc.text(resp.assessorName, margin + 3, y + 5.5)
    const [rr, rg, rb] = colorForScore(resp.overallAvg)
    doc.setTextColor(rr, rg, rb)
    doc.text(`${resp.overallAvg.toFixed(2)} / 5`, W - margin - 3, y + 5.5, { align: 'right' })
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(156, 163, 175)
    doc.text(new Date(resp.submittedAt).toLocaleDateString(), W - margin - 22, y + 5.5, { align: 'right' })
    y += 10

    // per-question mini bars
    for (const key of qKeys) {
      newPageIfNeeded(6)
      const val = resp.scores[key] ?? 0
      const [vr, vg, vb] = colorForScore(val)
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(156, 163, 175)
      doc.text(key.toUpperCase(), margin + 3, y + 2.5)
      const mX = margin + 15, mW = usable - 30
      doc.setFillColor(229, 231, 235); doc.roundedRect(mX, y, mW, 3, 0.8, 0.8, 'F')
      const mFill = Math.max(0, (val / 5) * mW)
      if (mFill > 0) { doc.setFillColor(vr, vg, vb); doc.roundedRect(mX, y, mFill, 3, 0.8, 0.8, 'F') }
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(vr, vg, vb)
      doc.text(String(val), margin + usable - 5, y + 2.5)
      y += 5
    }

    if (resp.strengths) {
      newPageIfNeeded(12)
      y += 1
      const lines = doc.splitTextToSize(resp.strengths, usable - 14)
      const h = Math.max(9, lines.length * 3.3 + 6)
      doc.setFillColor(240, 253, 244); doc.roundedRect(margin + 3, y, usable - 6, h, 1.5, 1.5, 'F')
      doc.setFillColor(74, 222, 128); doc.rect(margin + 3, y + 1, 1, h - 2, 'F')
      doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(6, 95, 70)
      doc.text('STRENGTHS', margin + 7, y + 4)
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(22, 101, 52)
      doc.text(lines, margin + 7, y + 8)
      y += h + 1
    }
    if (resp.improvements) {
      newPageIfNeeded(12)
      y += 1
      const lines = doc.splitTextToSize(resp.improvements, usable - 14)
      const h = Math.max(9, lines.length * 3.3 + 6)
      doc.setFillColor(255, 251, 235); doc.roundedRect(margin + 3, y, usable - 6, h, 1.5, 1.5, 'F')
      doc.setFillColor(251, 191, 36); doc.rect(margin + 3, y + 1, 1, h - 2, 'F')
      doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(146, 64, 14)
      doc.text('AREAS FOR IMPROVEMENT', margin + 7, y + 4)
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(146, 64, 14)
      doc.text(lines, margin + 7, y + 8)
      y += h + 1
    }
    y += 3
  }

  // Footer on every page
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(156, 163, 175)
    doc.text(`Generated ${new Date().toLocaleDateString()} — SAPPHIRE Clinics`, margin, H - 8)
    doc.text(`Page ${i} of ${pages}`, W - margin, H - 8, { align: 'right' })
  }

  doc.save(`PeerEval_${sanitizeFilename(input.assesseeName)}_${new Date().getFullYear()}.pdf`)
}

export async function generateSurveyResultPDF(input: SurveyPDFInput): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const margin = 16
  const usable = W - margin * 2
  let y = margin

  const newPage = (n: number) => {
    if (y + n > H - 18) { doc.addPage(); y = margin }
  }

  // Header bar
  doc.setFillColor(15, 118, 110) // teal
  doc.rect(0, 0, W, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14); doc.setFont('helvetica', 'bold')
  doc.text('Customer Satisfaction Results', margin, 11)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text('SAPPHIRE Clinics', margin, 18)
  y = 32

  // Staff info
  doc.setTextColor(17, 24, 39); doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text(input.staffName, margin, y)
  y += 5
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128)
  doc.text(`${input.department}  ·  ${input.branch}${input.filterMonthLabel ? '  ·  ' + input.filterMonthLabel : ''}`, margin, y)
  y += 3

  // Composite score top-right
  doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 118, 110)
  doc.text(String(input.compositeScore), W - margin, 32, { align: 'right' })
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(156, 163, 175)
  doc.text('COMPOSITE SCORE', W - margin, 37, { align: 'right' })

  // Divider
  y += 5; doc.setDrawColor(229, 231, 235); doc.line(margin, y, W - margin, y); y += 5

  // KPI grid (5 cells)
  const kpis: [string, string, [number, number, number]][] = [
    ['AVG RATING', `${input.avgRating.toFixed(2)} / 5`, [245, 158, 11]],
    ['SESSIONS', String(input.sessionsTotal), [15, 118, 110]],
    ['RESCHEDULED', String(input.sessionsRescheduled), [245, 158, 11]],
    ['CANCELLED', String(input.sessionsCancelled), [239, 68, 68]],
    ['SURVEYS', String(input.surveyCount), [99, 102, 241]],
  ]
  const kW = (usable - 8) / kpis.length
  const kH = 16
  kpis.forEach(([label, val, [r, g, b]], i) => {
    const x = margin + i * (kW + 2)
    doc.setFillColor(249, 250, 251)
    doc.roundedRect(x, y, kW, kH, 2, 2, 'F')
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(r, g, b)
    doc.text(val, x + kW / 2, y + 8, { align: 'center' })
    doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(107, 114, 128)
    doc.text(label, x + kW / 2, y + 13, { align: 'center' })
  })
  y += kH + 6

  // Monthly ratings
  if (input.monthlyRatings.length > 0) {
    newPage(30)
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(55, 65, 81)
    doc.text('MONTHLY AVERAGE RATINGS', margin, y); y += 4
    for (const m of input.monthlyRatings) {
      newPage(7)
      const [r, g, b] = colorForScore(m.avgRating)
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81)
      doc.text(m.month, margin, y + 3)
      const bX = margin + 38, bW2 = usable - 54
      doc.setFillColor(229, 231, 235); doc.roundedRect(bX, y, bW2, 4, 1.2, 1.2, 'F')
      const fill = Math.max(0, (m.avgRating / 5) * bW2)
      if (fill > 0) { doc.setFillColor(r, g, b); doc.roundedRect(bX, y, fill, 4, 1.2, 1.2, 'F') }
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(r, g, b)
      doc.text(m.avgRating.toFixed(2), margin + usable - 10, y + 3)
      y += 6
    }
    y += 3
  }

  // Feedback sections
  const sections: [string, string[], [number, number, number], [number, number, number], [number, number, number]][] = [
    ['STRENGTHS', input.feedback.strengths, [240, 253, 244], [74, 222, 128], [22, 101, 52]],
    ['AREAS FOR IMPROVEMENT', input.feedback.improvements, [255, 251, 235], [251, 191, 36], [146, 64, 14]],
    ['OTHER COMMENTS', input.feedback.other, [241, 245, 249], [148, 163, 184], [71, 85, 105]],
  ]

  for (const [title, items, [bg_r, bg_g, bg_b], [ac_r, ac_g, ac_b], [tx_r, tx_g, tx_b]] of sections) {
    if (items.length === 0) continue
    newPage(14)
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(55, 65, 81)
    doc.text(title, margin, y); y += 4
    for (const item of items) {
      const lines = doc.splitTextToSize(item, usable - 14)
      const h = Math.max(8, lines.length * 3.3 + 4)
      newPage(h + 2)
      doc.setFillColor(bg_r, bg_g, bg_b); doc.roundedRect(margin, y, usable, h, 1.5, 1.5, 'F')
      doc.setFillColor(ac_r, ac_g, ac_b); doc.rect(margin, y + 1, 1, h - 2, 'F')
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(tx_r, tx_g, tx_b)
      doc.text(lines, margin + 5, y + 5)
      y += h + 1
    }
    y += 3
  }

  // Footer
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(156, 163, 175)
    doc.text(`Generated ${new Date().toLocaleDateString()} — SAPPHIRE Clinics`, margin, H - 8)
    doc.text(`Page ${i} of ${pages}`, W - margin, H - 8, { align: 'right' })
  }

  doc.save(`SurveyResults_${sanitizeFilename(input.staffName)}_${new Date().getFullYear()}.pdf`)
}
