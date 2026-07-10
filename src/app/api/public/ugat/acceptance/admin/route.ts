// Admin acceptance actions.
//   POST  { scholarId }                 → "send contract" (unlock signing) + email
//   PATCH { scholarId, hardCopySigned } → mark the in-person hard copy signed

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, isAdminRole } from '@/lib/ugat-auth'
import { sendUgatContractEmail } from '@/lib/ugat-email'

export const dynamic = 'force-dynamic'

const PUBLIC_URL = process.env.UGAT_PUBLIC_URL || 'https://scholarship.sapphireclinicseast.org'

export async function POST(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  let body: { scholarId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const scholarId = String(body.scholarId || '')
  if (!scholarId) return NextResponse.json({ error: 'scholarId is required.' }, { status: 400 })

  const scholar = await prisma.ugatScholar.findUnique({ where: { id: scholarId }, select: { status: true, firstName: true, personalEmail: true, professionalEmail: true } })
  if (!scholar) return NextResponse.json({ error: 'Scholar not found.' }, { status: 404 })
  if (scholar.status !== 'ACCEPTED') return NextResponse.json({ error: 'Only accepted fellows can be sent a contract.' }, { status: 400 })

  await prisma.ugatAcceptance.upsert({
    where: { scholarId },
    create: { scholarId, contractSentAt: new Date() },
    update: { contractSentAt: new Date() },
  })

  try {
    await sendUgatContractEmail({
      to: [...new Set([scholar.personalEmail, scholar.professionalEmail].filter(Boolean))],
      firstName: scholar.firstName,
      signUrl: `${PUBLIC_URL}/ugatfellow`,
    })
  } catch (e) {
    console.error('[ugat] contract email failed:', e)
    return NextResponse.json({ ok: true, emailSent: false })
  }
  return NextResponse.json({ ok: true, emailSent: true })
}

export async function PATCH(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  let body: { scholarId?: string; hardCopySigned?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const scholarId = String(body.scholarId || '')
  if (!scholarId) return NextResponse.json({ error: 'scholarId is required.' }, { status: 400 })

  await prisma.ugatAcceptance.upsert({
    where: { scholarId },
    create: { scholarId, hardCopySignedAt: body.hardCopySigned ? new Date() : null, hardCopyMarkedBy: body.hardCopySigned ? (tok.username || 'admin') : null },
    update: { hardCopySignedAt: body.hardCopySigned ? new Date() : null, hardCopyMarkedBy: body.hardCopySigned ? (tok.username || 'admin') : null },
  })
  return NextResponse.json({ ok: true })
}
