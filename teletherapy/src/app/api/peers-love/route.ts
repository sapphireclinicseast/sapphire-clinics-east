import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// "What your Peers Love About You" — surfaces ONLY the free-text `strengths`
// from Peer Evaluation responses (HR08/HR09) where the signed-in user is the
// person being evaluated (assesseeId). Improvements are never returned here.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Every staffId this person owns (interbranch), so feedback from any branch
  // they work in shows up. Falls back to the primary staffId.
  const ownStaffIds = (session.user.branches ?? []).map((b) => b.staffId)
  if (ownStaffIds.length === 0 && session.user.staffId) ownStaffIds.push(session.user.staffId)

  // Optional branch-switch param — must be one of the user's own staffIds.
  const requested = req.nextUrl.searchParams.get('staffId')
  const assesseeFilter =
    requested && ownStaffIds.includes(requested) ? [requested] : ownStaffIds

  if (assesseeFilter.length === 0) {
    return NextResponse.json({ strengths: [] })
  }

  try {
    // @ts-ignore — PeerEvalResponse table is owned by the Marketing Hub
    // NOTE: do NOT select `formType` — it's a Postgres enum OWNED by the
    // Marketing Hub (HR08_ADMIN / HR08_PEER / HR09_CLINICAL / HR09_ADMIN). If
    // that enum gains a value our generated client doesn't know, selecting it
    // makes Prisma throw on deserialization and the whole query fails (→ no
    // strengths shown — the exact bug this fixes). We only need the text.
    const responses = await prisma.peerEvalResponse.findMany({
      where: { assesseeId: { in: assesseeFilter } },
      select: { id: true, strengths: true, branch: true, submittedAt: true },
      orderBy: { submittedAt: 'desc' },
      take: 200,
    })

    const strengths = responses
      .filter((r: { strengths: string | null }) => typeof r.strengths === 'string' && r.strengths.trim().length > 3)
      .map((r: { id: string; strengths: string | null; branch: string; submittedAt: Date }) => ({
        id: r.id,
        text: (r.strengths as string).trim(),
        branch: r.branch,
        submittedAt: r.submittedAt,
      }))

    return NextResponse.json({ strengths })
  } catch {
    return NextResponse.json({ strengths: [], error: 'Peer evaluation data unavailable' })
  }
}
