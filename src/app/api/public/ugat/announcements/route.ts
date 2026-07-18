// GET /api/public/ugat/announcements   (public)
// Published landing-page announcement HEADERS, newest first (title + date only —
// no body). The board shows titles; clicking one fetches its full body from
// /announcements/[id]. Keeping bodies (which may embed images) out of this list
// keeps the landing payload light. Managed by admins in the portal.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const announcements = await prisma.ugatAnnouncement.findMany({
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, createdAt: true },
      take: 20,
    })
    return NextResponse.json({ announcements })
  } catch {
    return NextResponse.json({ announcements: [] })
  }
}
