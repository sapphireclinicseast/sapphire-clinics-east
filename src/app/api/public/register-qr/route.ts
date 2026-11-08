// GET /api/public/register-qr?branch=east — the patient self-registration QR,
// as a PNG.
//
// Exists because the decking Google Sheets need to SHOW this QR, and a
// spreadsheet can only display an image it can fetch from a URL
// (=IMAGE(...) takes no data URIs). The Patient CRM builds the same QR in the
// browser as a data URL, which a sheet cannot use.
//
// Public on purpose, and safe to be: it encodes nothing but the address of the
// public registration page, which anyone may open. It is the same link front
// desk already print and hand to families.
//
// The branch is matched against a fixed list rather than interpolated. Without
// that this would be an open QR generator — anyone could hand out a code in the
// clinic's name pointing at a URL of their choosing, which is a phishing tool,
// not a feature.

import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'

export const dynamic = 'force-dynamic'

/** The same friendly aliases the CRM's QR modal uses, so both encode one URL. */
const BRANCHES: Record<string, string> = {
  east: 'east',
  greenhills: 'greenhills',
  verdana: 'verdana',
}

const ORIGIN = process.env.NEXTAUTH_URL?.replace(/\/$/, '')
  || 'https://operations.sapphireclinicseast.org'

export async function GET(req: NextRequest) {
  const asked = (new URL(req.url).searchParams.get('branch') ?? '').toLowerCase().trim()
  const branch = BRANCHES[asked]
  if (asked && !branch) {
    return NextResponse.json({ error: 'Unknown branch' }, { status: 400 })
  }

  const target = branch
    ? `${ORIGIN}/patient-register?branch=${encodeURIComponent(branch)}`
    : `${ORIGIN}/patient-register`

  // Same colours and sizing as the CRM modal, so the code in the sheet and the
  // one front desk print are visibly the same artefact.
  const png = await QRCode.toBuffer(target, {
    width: 360,
    margin: 2,
    color: { dark: '#244952', light: '#ffffff' },
  })

  return new NextResponse(png as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      // The registration URL does not change, and Google's image fetcher is
      // aggressive — a day of caching keeps the sheet quick without ever
      // showing a stale address.
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
