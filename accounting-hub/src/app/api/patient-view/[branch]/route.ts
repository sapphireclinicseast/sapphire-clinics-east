import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolvePatientViewBranch, COMPLAINT_FORM_URL, REWARD_POINTS_URL } from '@/lib/patient-view'
import { fetchSurveyInvitations, matchInvitation } from '@/lib/patient-view-survey'

/**
 * GET /api/patient-view/[branch]
 *
 * Feeds the patient-facing tablet. Deliberately PUBLIC — the device has no one
 * to log in as — so it returns only what a person standing at the counter may
 * see, and nothing that identifies who is being billed what.
 *
 * Today's survey invitations come from the Operations Hub, which owns the
 * selection — see fetchSurveyInvitations for why this proxies rather than
 * re-implementing it.
 */

export const dynamic = 'force-dynamic'

/** How long a live checkout stays up without being refreshed. */
const CHECKOUT_TTL_MS = 5 * 60_000
/** A settled sale clears sooner — the next patient should not read the last
 *  one's bill, and by then it is only a thank-you. The FEEDBACK flash (the
 *  survey invitation left up after the till closed the bill) is on the same
 *  short clock: it carries a name, and the invitee is standing right there. */
const COMPLETED_TTL_MS = 90_000

export async function GET(_req: Request, { params }: { params: Promise<{ branch: string }> }) {
  const { branch: slug } = await params
  const branch = resolvePatientViewBranch(slug)
  if (!branch) {
    return NextResponse.json({ error: 'Unknown branch' }, { status: 404 })
  }

  const { invitations, error: surveyError } = await fetchSurveyInvitations(branch)

  // What the till is showing right now, if anything. Stale rows are ignored
  // rather than trusted: a browser closed mid-sale would otherwise leave a
  // patient's bill on the screen indefinitely.
  let checkout: unknown = null
  try {
    const row = await prisma.patientViewCheckout.findUnique({
      where: { branch: branch.branch },
      select: { active: true, payload: true, updatedAt: true },
    })
    const p0 = row?.payload as Record<string, unknown> | null
    const ttl = p0?.status === 'COMPLETED' || p0?.status === 'FEEDBACK' ? COMPLETED_TTL_MS : CHECKOUT_TTL_MS
    const fresh = row && Date.now() - new Date(row.updatedAt).getTime() < ttl
    if (row?.active && fresh) {
      const p = p0
      // Match this patient against today's invitations, so a completed sale can
      // ask them directly instead of making them find their own name in a list.
      // The CRM id is authoritative; the name is a fallback for walk-ins typed
      // in by hand, normalised because O'CONNOR and OCONNOR are one person.
      const invite = matchInvitation(invitations, p?.patientId, p?.patientName)
      checkout = { ...(p || {}), surveyInvite: invite ? { name: invite.name, surveyUrl: invite.surveyUrl } : null }
    }
  } catch {
    // Table not yet applied, or the DB is briefly unavailable — the tablet
    // falls back to the welcome screen rather than erroring.
  }

  return NextResponse.json({
    checkout,
    branch: { slug: branch.slug, name: branch.name, shortName: branch.shortName },
    survey: { count: invitations.length, invitations, error: surveyError },
    complaintFormUrl: COMPLAINT_FORM_URL,
    rewardPointsUrl: REWARD_POINTS_URL,
    serverTime: new Date().toISOString(),
  })
}
