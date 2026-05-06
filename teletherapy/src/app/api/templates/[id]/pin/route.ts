/**
 * POST   /api/templates/[id]/pin   — pin this HR template for the user
 * DELETE /api/templates/[id]/pin   — unpin
 *
 * Pins are stored per-clinician in TherapistAccount.pinnedTemplateIds
 * (JSON array of HR template ID strings). They live in the teletherapy
 * DB and never leave this user's account, so each clinician maintains
 * a unique pinned set.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function readPinnedIds(accountId: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acct = await prisma.therapistAccount.findUnique({
    where: { id: accountId },
    select: { pinnedTemplateIds: true } as any,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (acct as any)?.pinnedTemplateIds
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string')
}

async function writePinnedIds(accountId: string, ids: string[]) {
  await prisma.therapistAccount.update({
    where: { id: accountId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { pinnedTemplateIds: ids } as any,
  })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing template id' }, { status: 400 })

  const ids = await readPinnedIds(session.user.id)
  if (!ids.includes(id)) {
    ids.push(id)
    await writePinnedIds(session.user.id, ids)
  }
  return NextResponse.json({ pinned: true, count: ids.length })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const ids = (await readPinnedIds(session.user.id)).filter((x) => x !== id)
  await writePinnedIds(session.user.id, ids)
  return NextResponse.json({ pinned: false, count: ids.length })
}
