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

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

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
    await prisma.order.update({ where: { id: orderId }, data: { arProofUrl: null } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('AR proof DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
