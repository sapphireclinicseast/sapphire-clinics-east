/**
 * One-way pings from the Accounting Hub to the HR Platform.
 *
 * notifyHrDividendRelease — fired right after a dividend is marked released
 * here (a preferred payout recorded via "Record selected", or a common
 * release finalized). HR's Shareholders › Dividend Release tab reacts by
 * pulling /api/internal/dividend-releases and emailing each newly released
 * shareholder a thank-you note. The ping only says "something changed"; HR
 * re-reads the authoritative list itself, so a lost ping costs nothing but
 * delay — HR also polls on a schedule as a safety net.
 *
 * Fire-and-forget on purpose: the release is already committed by the time
 * this runs, and an HR outage must never turn a recorded dividend into an
 * error for the accountant. Same env + key conventions as the other
 * HR/Accounting internal calls (HR_PLATFORM_URL, ACCOUNTING_INTERNAL_KEY).
 */
const HR_PLATFORM_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const INTERNAL_KEY = process.env.ACCOUNTING_INTERNAL_KEY || process.env.HR_INTERNAL_KEY || ''

export function notifyHrDividendRelease(kind: 'common' | 'preferred', releaseId: string): void {
  if (!INTERNAL_KEY) { console.warn('[hr-notify] ACCOUNTING_INTERNAL_KEY not set — HR not pinged (HR still polls every 10 min)'); return }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  fetch(`${HR_PLATFORM_URL}/shareholders/dividend-thanks/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': INTERNAL_KEY },
    body: JSON.stringify({ kind, releaseId, source: 'accounting-hub' }),
    signal: ctrl.signal,
  })
    .then((r) => { if (!r.ok) console.warn(`[hr-notify] dividend-release ping returned ${r.status}`) })
    .catch((e) => console.warn('[hr-notify] dividend-release ping failed:', e instanceof Error ? e.message : e))
    .finally(() => clearTimeout(timer))
}
