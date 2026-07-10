// GET /api/public/ugat/announcements   (public)
// Published landing-page announcements, newest first. Managed by admins in the
// portal's Announcements section (/announcements/admin).

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const announcements = await prisma.ugatAnnouncement.findMany({
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, details: true, createdAt: true },
      take: 20,
    })
    return NextResponse.json({ announcements })
  } catch {
    return NextResponse.json({ announcements: [] })
  }
}
