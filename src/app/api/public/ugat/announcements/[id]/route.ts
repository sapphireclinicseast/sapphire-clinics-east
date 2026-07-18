// GET /api/public/ugat/announcements/[id]   (public)
// Full body (sanitized rich HTML, may include inline images) of a single
// PUBLISHED announcement — fetched on demand when a visitor opens one from the
// landing-page board.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const a = await prisma.ugatAnnouncement.findFirst({
      where: { id, published: true },
      select: { id: true, title: true, details: true, createdAt: true },
    })
    if (!a) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    return NextResponse.json({ announcement: a })
  } catch {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
}
