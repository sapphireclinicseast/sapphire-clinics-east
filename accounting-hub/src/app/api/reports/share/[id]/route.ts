import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SHARE_ROLES } from '@/lib/reports/share'

// Turn a shared report link off. Kept (not deleted) so the list still shows
// who it was for and how often it was opened.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role || ''
  if (!session?.user || !SHARE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const link = await prisma.reportShareLink.findUnique({ where: { id } })
  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  if (!link.revokedAt) await prisma.reportShareLink.update({ where: { id }, data: { revokedAt: new Date() } })
  return NextResponse.json({ ok: true })
}
