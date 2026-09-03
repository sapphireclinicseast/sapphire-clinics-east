// GET /api/loa/form-link — the standing LOA form's URL and its QR code.
//
// One permanent link rather than a token per patient: front desk print the QR
// once for the counter and send the same URL to anyone. Nothing here is
// per-patient, so there is no record to create and nothing expires — which is
// also why the old one-time invite no longer left an empty "UNSPECIFIED" row
// behind every time someone asked for a link.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import QRCode from 'qrcode'
import { LOA_READ_ROLES } from '@/lib/loa-access'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!LOA_READ_ROLES.includes(role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://operations.sapphireclinicseast.org'
  const url = `${baseUrl}/loa`

  const qrDataUrl = await QRCode.toDataURL(url, {
    // Bigger than the per-patient QRs: this one gets printed and stuck to a
    // counter, so it has to survive being scanned from a arm's length away.
    width: 600,
    margin: 2,
    color: { dark: '#1C2B30', light: '#FFFFFF' },
  })

  return NextResponse.json({ url, qrDataUrl })
}
