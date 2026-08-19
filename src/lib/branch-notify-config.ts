/**
 * Shared per-branch config for clinic-schedule patient/clinician email
 * templates (send-absent-email, send-reminder, send-clinician-email).
 *
 * These three routes used to each hardcode their own near-identical
 * BRANCH_CONFIG object — which had already drifted (each carried its own
 * copy of the CC email, phone, and address text). This reads from the
 * synced HrBranch cache (see /api/branches/sync) instead, so branch
 * contact info only needs to be corrected once, in HR Platform, and
 * flows to every email template on the next sync.
 *
 * FALLBACK below is a last-resort default if the sync cache is empty or
 * the branch isn't found — keeps these emails working even before the
 * first "Sync Branches" click, or if HR Platform is briefly unreachable.
 * It intentionally carries the same values these files hardcoded before
 * this change, so behavior doesn't shift purely because of this refactor.
 */
import { prisma } from '@/lib/prisma'

export interface BranchNotifyConfig {
  ccEmail: string
  location: string
  phone: string
  teamName: string   // e.g. "The Aura Health Rehab – East Team"
  branchName: string // e.g. "East Branch"
  brandShort: string // e.g. "East" — for subject lines ("Aura Health Rehab East")
  brandName: string  // e.g. "Aura Health Rehab – East" — raw, unwrapped
}

const FALLBACK: Record<string, BranchNotifyConfig> = {
  SBEA: {
    ccEmail: 'east@sapphireclinicseast.org',
    location: 'Aura Health Rehab – East Branch, Level 4, Robinsons MetroEast, Marcos Highway, Brgy. Dela Paz, Pasig City',
    phone: '0917 118 9289 | (02) 5310-4991',
    teamName: 'The Aura Health Rehab – East Team',
    branchName: 'East Branch',
    brandShort: 'East',
    brandName: 'Aura Health Rehab – East',
  },
  SBGH: {
    ccEmail: 'greenhills@sapphireclinicseast.org',
    location: 'Aura Health Rehab – Greenhills Branch, Unit 8L, GH Tower Offices at Greenhills, South Drive, Brgy. Greenhills, Ortigas Avenue, San Juan City',
    phone: '0917 770 1686 | (02) 8529-1590',
    teamName: 'The Aura Health Rehab – Greenhills Team',
    branchName: 'Greenhills Branch',
    brandShort: 'Greenhills',
    brandName: 'Aura Health Rehab – Greenhills',
  },
}

export async function getBranchNotifyConfig(branch: string): Promise<BranchNotifyConfig> {
  const fallback = FALLBACK[branch] ?? FALLBACK['SBEA']
  try {
    const hr = await prisma.hrBranch.findFirst({ where: { shortCode: branch } })
    if (!hr) return fallback

    // brandName is e.g. "Aura Health Rehab – East" — strip the trailing
    // "– <short>" to get "Aura Health Rehab", then rebuild the specific
    // phrasings each template wants.
    const brandShort = hr.brandName?.split('–').pop()?.trim() || fallback.brandShort
    const brandBase = hr.brandName?.split('–')[0]?.trim() || 'Aura Health Rehab'

    return {
      ccEmail: hr.emailMain || fallback.ccEmail,
      location: hr.address ? `${hr.brandName ?? brandBase} Branch, ${hr.address}` : fallback.location,
      phone: hr.phone || fallback.phone,
      teamName: hr.brandName ? `The ${hr.brandName} Team` : fallback.teamName,
      branchName: `${brandShort} Branch`,
      brandShort,
      brandName: hr.brandName || fallback.brandName,
    }
  } catch (err) {
    console.error('[branch-notify-config] Failed to read HrBranch, using fallback:', err)
    return fallback
  }
}

/**
 * The Gmail account a branch's patient/clinician emails should be sent FROM.
 *
 * HR Platform's Branches page is the source of truth for a branch's main
 * email (synced into HrBranch.emailMain by /api/branches/sync, surfaced above
 * as ccEmail), so changing it there changes who these emails come from on the
 * next sync — no code change, no reconnecting anything here.
 *
 * Falls back to any connected account so a branch whose mailbox has not been
 * OAuth-connected yet still gets its schedule emails out rather than silently
 * dropping them; the caller logs when that happens.
 */
export async function getBranchSender(
  cfg: BranchNotifyConfig,
): Promise<{ email: string; refreshToken: string; isBranchMailbox: boolean } | null> {
  const branded = await prisma.gmailAccount.findUnique({ where: { email: cfg.ccEmail } })
  if (branded) return { ...branded, isBranchMailbox: true }
  const any = await prisma.gmailAccount.findFirst()
  return any ? { ...any, isBranchMailbox: false } : null
}

/** CC the branch mailbox only when it isn't already the sender — a message
 *  from east@ CC'd to east@ just lands in that inbox twice. */
export function branchCc(cfg: BranchNotifyConfig, fromEmail: string): string {
  return fromEmail.toLowerCase() === cfg.ccEmail.toLowerCase() ? '' : cfg.ccEmail
}
