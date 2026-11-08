// GET /api/public/hatch.png — the diagonal hatching used for an hour a
// consultant does not work.
//
// Google Sheets cannot fill a cell with a pattern. The nearest thing to the
// hub's own striped "Unavailable" cell is an image stretched across the cell
// with =IMAGE(url, 2), and =IMAGE needs something it can fetch over HTTP: it
// takes no data URIs, and a cell cannot hold an inline SVG.
//
// An earlier version drew the stripes as text — a run of slash characters —
// which reads as hatching from a distance but is obviously typed up close.
//
// Public, and nothing to protect: it is eight grey lines on a grey square,
// identical for every branch and every clinic. Cached hard, because one URL
// serves several hundred cells on a single tab and Google will fetch it on
// behalf of every viewer.

import { NextResponse } from 'next/server'
import sharp from 'sharp'

export const dynamic = 'force-static'
export const revalidate = 86400

// Sized to roughly one cell — 120px wide, three rows of a slot tall — so the
// stretch in =IMAGE(…, 2) is close to 1:1 and the stripes stay at 45° rather
// than being flattened into near-horizontal smears.
const W = 240
const H = 126
const STEP = 14

export async function GET() {
  const lines: string[] = []
  // Drawn from well off the left edge to past the right, so the diagonals run
  // clean off both sides instead of starting and stopping inside the cell.
  for (let x = -H; x < W + H; x += STEP) {
    lines.push(`<line x1="${x}" y1="${H}" x2="${x + H}" y2="0" stroke="#D2D7DC" stroke-width="7" />`)
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#EDEFF1" />
    ${lines.join('')}
  </svg>`

  const png = await sharp(Buffer.from(svg)).png().toBuffer()

  return new NextResponse(png as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
