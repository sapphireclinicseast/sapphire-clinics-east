/**
 * Per-transaction (Order) AR proof attachment.
 *
 * PATCH { orderId, arProofUrl }  — attach or update the proof URL
 * DELETE ?orderId=xxx            — clear the proof URL
 *
 * Expected to be called after uploading the file via POST /api/upload
 * which returns { url } already used elsewhere (wallet attachmentUrl,
 * payment proofs, etc.).
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

// arProofUrl entries: a plain URL string, or { url, locked }. A locked file is
// deletion-proof: it must be explicitly unlocked (a PATCH that keeps the url,
// locked:false) before a later PATCH may drop it — one request can never do both.
const parseEntries = (raw: string | null | undefined): { url: string; locked: boolean }[] => {
  if (!raw) return []
  try {
    const p = JSON.parse(raw)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Array.isArray(p)) return p.map((e: any) => typeof e === 'string' ? { url: e, locked: false } : e?.url ? { url: String(e.url), locked: !!e.locked } : null).filter(Boolean) as { url: string; locked: boolean }[]
  } catch { /* plain URL */ }
  return [{ url: raw, locked: false }]
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { orderId, arProofUrl } = await req.json()
    if (!orderId || arProofUrl === undefined) {
      return NextResponse.json({ error: 'orderId and arProofUrl are required' }, { status: 400 })
    }
    const existing = await prisma.order.findUnique({ where: { id: orderId }, select: { arProofUrl: true } })
    if (!existing) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    const newUrls = new Set(parseEntries(arProofUrl || null).map(e => e.url))
    const droppedLocked = parseEntries(existing.arProofUrl).filter(e => e.locked && !newUrls.has(e.url))
    if (droppedLocked.length > 0) {
      return NextResponse.json({ error: `${droppedLocked.length} file${droppedLocked.length === 1 ? ' is' : 's are'} locked — unlock ${droppedLocked.length === 1 ? 'it' : 'them'} first before removing.` }, { status: 409 })
    }
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { arProofUrl: arProofUrl || null },
      select: { id: true, arProofUrl: true },
    })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('AR proof PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const orderId = searchParams.get('orderId')
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })
  try {
    const existing = await prisma.order.findUnique({ where: { id: orderId }, select: { arProofUrl: true } })
    if (existing && parseEntries(existing.arProofUrl).some(e => e.locked)) {
      return NextResponse.json({ error: 'A locked proof file is attached — unlock it first before clearing.' }, { status: 409 })
    }
    await prisma.order.update({ where: { id: orderId }, data: { arProofUrl: null } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('AR proof DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
