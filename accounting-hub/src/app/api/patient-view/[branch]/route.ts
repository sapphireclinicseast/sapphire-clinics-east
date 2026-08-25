import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolvePatientViewBranch, COMPLAINT_FORM_URL, REWARD_POINTS_URL } from '@/lib/patient-view'

/**
 * GET /api/patient-view/[branch]
 *
 * Feeds the patient-facing tablet. Deliberately PUBLIC — the device has no one
 * to log in as — so it returns only what a person standing at the counter may
 * see, and nothing that identifies who is being billed what.
 *
 * Today's survey invitations come from the Operations Hub, which owns the
 * selection. This proxies rather than re-implementing it: two copies of "who
 * was chosen today" would eventually disagree, and the survey results are
 * scored against the Hub's list, not ours.
 */

const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

export const dynamic = 'force-dynamic'

/** How long a live checkout stays up without being refreshed. */
const CHECKOUT_TTL_MS = 5 * 60_000
/** A settled sale clears sooner — the next patient should not read the last
 *  one's bill, and by then it is only a thank-you. */
const COMPLETED_TTL_MS = 90_000

interface DailyTarget {
  assignmentId?: string
  patientId?: string
  patientName?: string
  staffName?: string
  department?: string
  startTime?: string
  status?: string
  surveyUrl?: string
}

export async function GET(_req: Request, { params }: { params: Promise<{ branch: string }> }) {
  const { branch: slug } = await params
  const branch = resolvePatientViewBranch(slug)
  if (!branch) {
    return NextResponse.json({ error: 'Unknown branch' }, { status: 404 })
  }

  let invitations: { id: string; patientId: string; name: string; clinician: string; time: string; surveyUrl: string }[] = []
  let surveyError: string | null = null

  try {
    // daily-targets authenticates on ?token=, not an Authorization header: with
    // a header alone it falls through to session auth and 400s with "branch
    // could not be determined from your role". Server-to-server over HTTPS, so
    // the key is not exposed to the tablet.
    const url = `${MARKETING_HUB_URL}/api/customer-survey/daily-targets`
      + `?branch=${encodeURIComponent(branch.surveyCode)}`
      + `&token=${encodeURIComponent(EXTERNAL_API_KEY)}`
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const d = await res.json()
      const rows: DailyTarget[] = Array.isArray(d) ? d : (d.targets || [])
      invitations = rows
        // Only those still awaiting a response — someone who has already
        // answered should not be invited a second time from the counter.
        .filter(t => t.surveyUrl && String(t.status || 'PENDING').toUpperCase() !== 'COMPLETED')
        .map(t => ({
          id: String(t.assignmentId || t.patientId || t.patientName || ''),
          patientId: String(t.patientId || ''),
          name: String(t.patientName || '').trim(),
          clinician: String(t.staffName || '').trim(),
          time: String(t.startTime || '').trim(),
          surveyUrl: String(t.surveyUrl),
        }))
        .filter(t => t.name && t.surveyUrl)
    } else {
      surveyError = `Survey list unavailable (${res.status})`
    }
  } catch {
    // A tablet in a clinic should degrade to "not available right now" rather
    // than a blank screen when the other hub is slow or down.
    surveyError = 'Survey list unavailable right now'
  }

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
    const ttl = p0?.status === 'COMPLETED' ? COMPLETED_TTL_MS : CHECKOUT_TTL_MS
    const fresh = row && Date.now() - new Date(row.updatedAt).getTime() < ttl
    if (row?.active && fresh) {
      const p = p0
      // Match this patient against today's invitations, so a completed sale can
      // ask them directly instead of making them find their own name in a list.
      // The CRM id is authoritative; the name is a fallback for walk-ins typed
      // in by hand, normalised because O'CONNOR and OCONNOR are one person.
      const norm = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z]/g, '')
      const pid = String(p?.patientId ?? '')
      const pname = norm(p?.patientName)
      const invite =
        (pid && invitations.find(i => i.patientId && i.patientId === pid)) ||
        (pname && invitations.find(i => norm(i.name) === pname)) ||
        null
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
