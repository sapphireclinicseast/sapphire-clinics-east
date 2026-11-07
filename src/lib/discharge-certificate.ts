// Stamps a discharge certificate onto the clinic's artwork.
//
// Nothing is drawn from scratch: public/certificates/aura-discharge-certificate-a4.pdf
// is loaded and the patient's details are placed onto its blanks, so the brand
// can redraw the certificate without anyone touching this file.
//
// It lives under public/ because the production image is Next's standalone
// output — only public/, .next/standalone, .next/static and prisma are copied
// into the runner, and public/ is the one copied straight from the build
// context (see docker/Dockerfile, which notes that a builder-stage COPY can
// silently omit newly-added files). The trade-off is that a blank template is
// downloadable; it carries no patient data and no signature, and the artwork is
// on every certificate already handed out.
//
// Every coordinate below is in PDF points with a BOTTOM-LEFT origin, which is
// what pdf-lib uses. The template's own text sits at TOP-origin positions (what
// pdftotext reports), so each anchor is written as `H - <top>` to keep the
// arithmetic visible rather than leaving a pile of unexplained numbers.

import fs from 'fs/promises'
import path from 'path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const TEMPLATE_PATH = path.join(
  process.cwd(), 'public', 'certificates', 'aura-discharge-certificate-a4.pdf',
)

/* A4 landscape, as the artwork was drawn. Checked at load rather than trusted —
   a redrawn template on a different page size would otherwise put every field
   in the wrong place, silently. */
const EXPECTED_W = 842.9
const EXPECTED_H = 595.9

const INK = rgb(0.078, 0.247, 0.251)       // deep teal, matching the artwork
const INK_SOFT = rgb(0.255, 0.333, 0.345)

/* Anchors measured from the artwork, as distances from the TOP of the page.
   What was measured is the typeset label under each blank — those cannot drift
   — and each field is placed a few points above its own label. */
const TOP = {
  patientName: 314.0,  // clear of the rule at ~320; label sits at 325.0
  service: 384.0,      // above the "SERVICE / PROGRAM" label at 393.0
  awardedOn: 473.5,    // baseline of the "Awarded on ______" line
  signName: 504.0,     // clear above the signature rules (~512); labels at 516.4
}

/* Horizontal extents of each blank, again from the artwork. */
const X = {
  centre: 421.7,        // the artwork's own centre line
  dateFrom: 400.0,      // the rule after "Awarded on"
  dateTo: 512.0,
  therapistMid: 260.8,  // centre of "ATTENDING THERAPIST"
  managerMid: 581.1,    // centre of "CLINIC MANAGER"
  blockHalf: 92.0,      // half-width available to a signature block
}

export interface CertificateInput {
  patientName: string
  service: string
  /** Already worded for print, e.g. "7 November 2026". */
  awardedOn: string
  therapistName?: string
  therapistSignature?: Buffer | null
  managerName?: string
  managerSignature?: Buffer | null
}

/** Largest size at or below `start` that keeps `text` inside `maxWidth`. */
function fitSize(
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  text: string, maxWidth: number, start: number, min = 7,
): number {
  let size = start
  while (size > min && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5
  return size
}

/**
 * Renders one certificate.
 *
 * A signatory with no signature image still gets their printed name, leaving
 * the rule clear to be signed by hand. That is the point of "signature over
 * printed name" — an unsigned certificate is a printable form, not a failure.
 */
export async function buildDischargeCertificate(input: CertificateInput): Promise<Buffer> {
  const pdf = await PDFDocument.load(await fs.readFile(TEMPLATE_PATH))
  const page = pdf.getPage(0)
  const W = page.getWidth()
  const H = page.getHeight()

  if (Math.abs(W - EXPECTED_W) > 2 || Math.abs(H - EXPECTED_H) > 2) {
    throw new Error(
      `Certificate template is ${W.toFixed(0)}x${H.toFixed(0)}pt but the field positions ` +
      `were measured on ${EXPECTED_W}x${EXPECTED_H}pt. Re-measure the anchors in ` +
      `src/lib/discharge-certificate.ts before using the new artwork.`,
    )
  }

  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)

  const drawCentred = (
    text: string, font: typeof bold, size: number, centreX: number, y: number,
    color: ReturnType<typeof rgb>,
  ) => {
    const w = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: centreX - w / 2, y, size, font, color })
  }

  // ── Patient name ── the largest line, so it gets the most room and shrinks
  // before it ever reaches the rule's ends.
  if (input.patientName) {
    const size = fitSize(bold, input.patientName, 420, 26, 12)
    drawCentred(input.patientName, bold, size, X.centre, H - TOP.patientName, INK)
  }

  if (input.service) {
    const size = fitSize(bold, input.service, 380, 17, 9)
    drawCentred(input.service, bold, size, X.centre, H - TOP.service, INK)
  }

  // ── Awarded on ── centred within the rule that follows the words.
  if (input.awardedOn) {
    const mid = (X.dateFrom + X.dateTo) / 2
    const size = fitSize(regular, input.awardedOn, X.dateTo - X.dateFrom - 6, 13, 8)
    drawCentred(input.awardedOn, regular, size, mid, H - TOP.awardedOn, INK)
  }

  // ── Signatories ── the printed name sits on the rule and the signature is
  // drawn above it, overlapping slightly, which is how a signed form looks and
  // what the "SIGNATURE OVER PRINTED NAME" label asks for.
  const blocks = [
    { name: input.therapistName, image: input.therapistSignature, midX: X.therapistMid },
    { name: input.managerName, image: input.managerSignature, midX: X.managerMid },
  ]
  for (const b of blocks) {
    const baseline = H - TOP.signName

    if (b.name) {
      const size = fitSize(bold, b.name, X.blockHalf * 2, 11, 6.5)
      drawCentred(b.name, bold, size, b.midX, baseline, INK_SOFT)
    }

    if (b.image) {
      let img = null
      try {
        // Sniff rather than trust an extension: these arrive as uploads.
        img = b.image[0] === 0x89
          ? await pdf.embedPng(b.image)
          : await pdf.embedJpg(b.image)
      } catch {
        img = null  // an unreadable signature must not cost the whole certificate
      }
      if (img) {
        // Boxed, so a tall scan and a wide one both land on the rule rather
        // than running into the paragraph above.
        const dims = img.scaleToFit(X.blockHalf * 1.7, 34)
        page.drawImage(img, {
          x: b.midX - dims.width / 2,
          y: baseline + 4,
          width: dims.width,
          height: dims.height,
          opacity: 0.95,
        })
      }
    }
  }

  return Buffer.from(await pdf.save())
}

/** "7 November 2026" from an ISO date, without a timezone shifting the day. */
export function formatAwardDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!m) return ''
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December']
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}
