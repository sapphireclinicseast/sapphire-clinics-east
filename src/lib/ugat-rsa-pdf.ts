// Generates the signed UGAT Fellowship Agreement as a PDF (jsPDF,
// server-side — same pattern as the sample seeder). Content comes from the
// shared source of truth in ugat-loan-agreement.ts, so the PDF and the
// on-screen reader never drift. The CEO signature is auto-embedded, the
// fellow's e-signature + signing timestamp are stamped on every body page,
// and Annex A (the sample reimbursement computation) is appended.

import { CEO_SIGNATURE_PNG_B64 } from './ugat-ceo-signature'
import { loanAgreementBlocks, loanSubtitle, annexIntro, annexNote, annexTables } from './ugat-loan-agreement'

type PdfInput = {
  track?: string | null
  fellowName: string
  program: string
  school: string
  monthly?: number | null
  months?: number | null
  comakerName: string
  signaturePng?: Buffer | null
  signatureMime?: string | null
  dateSigned: Date
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
const fmtDateTime = (d: Date) =>
  d.toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) + ' PHT'

export async function generateSignedRsaPdf(input: PdfInput): Promise<Buffer | null> {
  try {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const M = 20
    const W = 170
    const BOTTOM = 244 // leave room at the foot of each body page for the e-sign stamp
    let y = 20

    const isTindig = input.track === 'TINDIG'
    const m = input.monthly && input.months ? input.monthly : null
    const n = input.monthly && input.months ? input.months : null
    const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = 20 } }

    const ceoDataUrl = CEO_SIGNATURE_PNG_B64 ? `data:image/png;base64,${CEO_SIGNATURE_PNG_B64}` : null
    const fellowMime = (input.signatureMime || 'image/png').includes('jpeg') ? 'JPEG' : 'PNG'
    const fellowDataUrl = input.signaturePng ? `data:${input.signatureMime || 'image/png'};base64,${input.signaturePng.toString('base64')}` : null
    const stampTime = fmtDateTime(input.dateSigned)
    const fellowShort = (input.fellowName || 'The Fellow').split(/\s+/).slice(0, 3).join(' ')

    const heading = (t: string) => {
      ensure(9); y += 2
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5)
      doc.text(t, M, y); y += 5
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    }
    const para = (t: string, opts?: { center?: boolean; bold?: boolean; size?: number; gap?: number; x?: number; w?: number }) => {
      doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal')
      doc.setFontSize(opts?.size ?? 9)
      const width = opts?.w ?? W
      const lines = doc.splitTextToSize(t, width) as string[]
      for (const ln of lines) { ensure(4.6); if (opts?.center) doc.text(ln, 105, y, { align: 'center' }); else doc.text(ln, opts?.x ?? M, y); y += 4.4 }
      y += opts?.gap ?? 2
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    }
    // Paragraph with a bold lead-in (e.g. "2.1 Grant of Loan.") that hangs on the
    // first line and the remainder wraps at full width.
    const paraLead = (lead: string, text: string) => {
      doc.setFontSize(9)
      ensure(4.6)
      doc.setFont('helvetica', 'bold')
      const lw = doc.getTextWidth(lead + '  ')
      doc.text(lead, M, y)
      doc.setFont('helvetica', 'normal')
      const firstArr = doc.splitTextToSize(text, W - lw) as string[]
      const first = firstArr[0] || ''
      doc.text(first, M + lw, y); y += 4.4
      const rest = text.slice(first.length).replace(/^\s+/, '')
      if (rest) for (const ln of doc.splitTextToSize(rest, W) as string[]) { ensure(4.6); doc.text(ln, M, y); y += 4.4 }
      y += 2
    }
    const drawTable = (headers: string[], rows: string[][]) => {
      const c = headers.length
      const colW = W / c
      const rowH = 7
      const headH = 9
      ensure(headH + rows.length * rowH + 2)
      doc.setFontSize(6.8); doc.setFont('helvetica', 'bold')
      for (let j = 0; j < c; j++) {
        const x = M + j * colW
        doc.setDrawColor(170); doc.setFillColor(237, 243, 217)
        doc.rect(x, y, colW, headH, 'FD')
        let ty = y + 3.4
        for (const ln of doc.splitTextToSize(headers[j], colW - 3) as string[]) { doc.text(ln, x + colW / 2, ty, { align: 'center' }); ty += 2.7 }
      }
      y += headH
      doc.setFont('helvetica', 'normal')
      for (const row of rows) {
        const isTotal = /^total$/i.test(row[0])
        doc.setFont('helvetica', isTotal ? 'bold' : 'normal')
        for (let j = 0; j < c; j++) {
          const x = M + j * colW
          doc.setDrawColor(205); doc.rect(x, y, colW, rowH)
          const val = row[j] ?? ''
          if (j === 0) doc.text(val, x + colW / 2, y + 4.6, { align: 'center' })
          else doc.text(val, x + colW - 2, y + 4.6, { align: 'right' })
        }
        y += rowH
      }
      doc.setFont('helvetica', 'normal')
      y += 4
    }

    // ── Header ──
    para('SAPPHIRE CLINICS EAST INCORPORATED', { center: true, bold: true, size: 12, gap: 0.5 })
    para(`UGAT FELLOWSHIP PROGRAM — ${isTindig ? 'TINDIG' : 'ARAL'} TRACK`, { center: true, bold: true, size: 10, gap: 0.5 })
    para('UGAT FELLOWSHIP AGREEMENT', { center: true, bold: true, size: 11, gap: 0.5 })
    para('(Educational Assistance with Full Condonation through Professional Service)', { center: true, size: 8, gap: 0.5 })
    para(loanSubtitle(isTindig), { center: true, size: 8, gap: 3 })
    if (isTindig) para('Your award: review-support of up to PHP 30,000 (review fees, or PHP 5,000/month for 6 months), treated as a simple, fully-condonable loan — you pay nothing if you serve 1,500 hours (Option A), else repay only what you received, interest-free (Option B). Interest / a penalty applies only on default or restructuring.', { size: 8.5, gap: 3 })
    else para(`Your award: a monthly allowance of ${m ? `PHP ${m.toLocaleString()} for ${n} months (about PHP ${(m * (n || 0)).toLocaleString()})` : 'a monthly allowance'}, treated as a simple, fully-condonable loan — you pay nothing if you serve 1,500 hours (Option A), else repay only what you received, interest-free (Option B). Interest / a penalty applies only on default or restructuring.`, { size: 8.5, gap: 3 })

    // ── Body (shared source of truth) ──
    const blocks = loanAgreementBlocks({ track: input.track, fellowName: input.fellowName, program: input.program, school: input.school, monthly: input.monthly, months: input.months, comakerName: input.comakerName })
    for (const b of blocks) {
      if ('h' in b) heading(b.h)
      else if ('li' in b) para('•  ' + b.li, { x: M + 3, w: W - 3 })
      else if (b.lead) paraLead(b.lead, b.text)
      else para(b.text)
    }

    // ── Signature block (this page onward = signature page; not stamped) ──
    ensure(60); y += 4
    const sigStartPage = doc.getNumberOfPages()
    doc.setDrawColor(150); doc.line(M, y, M + W, y); y += 6
    para('IN WITNESS WHEREOF, the Parties have signed this Agreement.', { bold: true, gap: 3 })

    ensure(34)
    para('For SAPPHIRE CLINICS EAST INC.:', { bold: true, gap: 1 })
    if (ceoDataUrl) { try { doc.addImage(ceoDataUrl, 'PNG', M, y, 46, 25); y += 26 } catch { /* skip */ } }
    para('Hannah Jara — CEO and President', { gap: 5 })

    ensure(46)
    para('THE APPLICANT:', { bold: true, gap: 1 })
    para(input.fellowName || '____________', { gap: 1 })
    if (fellowDataUrl) { try { doc.addImage(fellowDataUrl, fellowMime, M, y, 55, 20); y += 22 } catch { /* skip */ } }
    para('Signature over printed name', { size: 8, gap: 5 })

    ensure(16)
    para('THE CO-MAKER:', { bold: true, gap: 1 })
    para(input.comakerName || '____________', { gap: 1 })
    para('Signature over printed name', { size: 8, gap: 5 })

    ensure(14)
    doc.setDrawColor(150); doc.line(M, y, M + W, y); y += 5
    para(`Signed electronically (soft copy) by the APPLICANT on ${fmtDate(input.dateSigned)}. This soft copy will be countersigned in person (hard copy) with the CO-MAKER at an Aura Health Rehab branch, before witnesses and a Notary Public, to complete execution.`, { size: 8 })

    // ── Annex A (fresh page) ──
    doc.addPage(); y = 20
    para('ANNEX “A”', { center: true, bold: true, size: 12, gap: 0.5 })
    para('SAMPLE REPAYMENT COMPUTATION — REPAYMENT OPTION (OPTION B)', { center: true, bold: true, size: 9.5, gap: 3 })
    para(annexIntro(isTindig), { size: 8.5, gap: 3 })
    for (const tbl of annexTables(isTindig)) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
      ensure(6); doc.text(tbl.caption, M, y); y += 5
      doc.setFont('helvetica', 'normal')
      drawTable(tbl.headers, tbl.rows)
    }
    para(`Note: ${annexNote}`, { size: 8 })

    // ── Per-page e-sign stamp on every body (non-signature) page ──
    const drawStamp = (p: number) => {
      doc.setPage(p)
      const rx = 192
      doc.setDrawColor(205); doc.setLineWidth(0.3); doc.roundedRect(118, 249, 76, 36, 2, 2)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(5.6); doc.setTextColor(120)
      doc.text('ELECTRONICALLY SIGNED', rx, 253, { align: 'right' })
      doc.setFont('helvetica', 'normal'); doc.setTextColor(70)
      if (ceoDataUrl) { try { doc.addImage(ceoDataUrl, 'PNG', 121, 254, 24, 13) } catch { /* skip */ } }
      doc.setFontSize(6); doc.text('Hannah Jara · CEO', rx, 259, { align: 'right' }); doc.text(stampTime, rx, 262, { align: 'right' })
      if (fellowDataUrl) { try { doc.addImage(fellowDataUrl, fellowMime, 121, 269, 24, 10) } catch { /* skip */ } }
      doc.text(fellowShort, rx, 273, { align: 'right' }); doc.text(stampTime, rx, 276, { align: 'right' })
      doc.setTextColor(0); doc.setLineWidth(0.2)
    }
    for (let p = 1; p < sigStartPage; p++) drawStamp(p)

    return Buffer.from(doc.output('arraybuffer'))
  } catch (e) {
    console.error('[ugat] Fellowship Agreement PDF generation failed:', e)
    return null
  }
}
