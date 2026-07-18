// Marketing assets (admin). Powers the portal's Marketing section — currently
// the downloadable UGAT brochure.
//   GET                                          → { brochure: {filename, size, updatedAt} | null }
//   POST   { filename, mimeType, dataBase64 }     → upload / replace the brochure (full admin)
//   DELETE                                        → remove the brochure (full admin)

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, isAdminRole, canViewAdmin } from '@/lib/ugat-auth'

export const dynamic = 'force-dynamic'

const BROCHURE = 'BROCHURE'
const MAX_BYTES = 12 * 1024 * 1024 // 12 MB

export async function GET(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !canViewAdmin(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  const a = await prisma.ugatMarketingAsset.findUnique({ where: { kind: BROCHURE }, select: { filename: true, updatedAt: true, data: true } })
  return NextResponse.json({ brochure: a ? { filename: a.filename, size: a.data.length, updatedAt: a.updatedAt } : null })
}

export async function POST(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  let body: { filename?: string; mimeType?: string; dataBase64?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }

  const filename = String(body.filename || 'UGAT-Brochure.pdf').trim().slice(0, 160)
  const mimeType = String(body.mimeType || '')
  const b64 = String(body.dataBase64 || '')
  if (mimeType !== 'application/pdf' && !/\.pdf$/i.test(filename)) {
    return NextResponse.json({ error: 'Please upload a PDF file.' }, { status: 400 })
  }
  let buf: Buffer
  try { buf = Buffer.from(b64.replace(/^data:[^,]*,/, ''), 'base64') } catch { return NextResponse.json({ error: 'Could not read the file.' }, { status: 400 }) }
  if (buf.length === 0) return NextResponse.json({ error: 'The file is empty.' }, { status: 400 })
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: 'File is too large (max 12 MB).' }, { status: 400 })

  const bytes = new Uint8Array(buf)
  await prisma.ugatMarketingAsset.upsert({
    where: { kind: BROCHURE },
    create: { kind: BROCHURE, filename, mimeType: 'application/pdf', data: bytes, uploadedBy: tok.username || null },
    update: { filename, mimeType: 'application/pdf', data: bytes, uploadedBy: tok.username || null },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })
  await prisma.ugatMarketingAsset.delete({ where: { kind: BROCHURE } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
