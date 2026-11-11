// GL letters as the Detailed GL sheet sees them, shared with the AR Dashboard
// so both show the same "AR running days" (Hannah 2026-11-11: the dashboard's
// AR Days (Overall) and Detailed GL's Avg AR running days must agree).
// Pure functions, no React or Prisma: the page and the Detailed GL tab both import them.

export const num = (v: unknown) => Number(v ?? 0) || 0

/** One GL letter, as the AR endpoint returns it. */
export interface GlCaseWallet {
  id: string
  patientName: string
  branch?: string | null
  /**
   * NOT the POS balance for GL: the AR endpoint overwrites this with the approved
   * amount, because a GL receivable is approved-amount based. The real remaining
   * balance has to be rebuilt from consumedOutstanding — see posBalanceOf().
   */
  balance?: number | string | null
  /** Approved minus the remaining POS balance, computed server-side. */
  consumedOutstanding?: number
  totalGlAmount?: number | string | null
  paidTotal?: number
  writtenOffTotal?: number
  lastPaymentDate?: string | null
  monthsToPay?: number | null
  soaStatus?: string | null
  /** Proof files uploaded against the letter in POS (JSON array of URLs). */
  attachmentUrls?: unknown
  attachmentUrl?: string | null
  glRequestedAmount?: number | string | null
  glDocsSubmittedAt?: string | null
  glReleasedAt?: string | null
  soaAmount?: number | string | null
  soaSubmittedAt?: string | null
  soaResubmittedAt?: string | null
  guardianName?: string | null
  soaCommissionRate?: number | string | null
  payoutBatch?: string | null
  qbEntry?: string | null
  glStage?: string | null
  /** True when any order has been billed against the letter. */
  hasOrders?: boolean
  dateObtained?: string | null
  createdAt?: string | null
}

/**
 * A Detailed GL entry accounting created itself, which may have no POS wallet
 * behind it yet. Tagging one to a wallet makes the live figures — balance drawn
 * down, payments — come from that wallet instead of being retyped here.
 */
export interface GlCaseRow {
  id: string
  walletId?: string | null
  patientName: string
  branch?: string | null
  glRequestedAmount?: number | string | null
  glDocsSubmittedAt?: string | null
  glReleasedAt?: string | null
  approvedAmount?: number | string | null
  soaAmount?: number | string | null
  soaSubmittedAt?: string | null
  soaResubmittedAt?: string | null
  guardianName?: string | null
  soaCommissionRate?: number | string | null
  payoutBatch?: string | null
  qbEntry?: string | null
  paidAt?: string | null
  notes?: string | null
  glStage?: string | null
}

export function fileUrls(w: GlCaseWallet): string[] {
  const out: string[] = []
  if (Array.isArray(w.attachmentUrls)) out.push(...w.attachmentUrls.filter((u): u is string => typeof u === 'string' && !!u))
  else if (typeof w.attachmentUrls === 'string' && w.attachmentUrls) {
    try { const p = JSON.parse(w.attachmentUrls); if (Array.isArray(p)) out.push(...p.filter((u: unknown): u is string => typeof u === 'string' && !!u)) }
    catch { out.push(w.attachmentUrls) }
  }
  if (w.attachmentUrl && !out.includes(w.attachmentUrl)) out.push(w.attachmentUrl)
  return out
}

/**
 * One line of the sheet, from either source, with every field already resolved.
 * A tagged case takes its live figures from the wallet and its paper trail from
 * itself; an untagged one has only what was typed into it.
 */
export interface GlLetterRow {
  key: string
  /** Set when this line is a standalone entry — the only kind that can be deleted. */
  caseId: string | null
  /** The wallet backing this line, if any. Untagged entries have none. */
  wallet: GlCaseWallet | null
  source: GlCaseRow | null
  patientName: string
  branch?: string | null
  glRequestedAmount?: number | string | null
  glDocsSubmittedAt?: string | null
  glReleasedAt?: string | null
  approved: number
  soaAmount?: number | string | null
  soaSubmittedAt?: string | null
  soaResubmittedAt?: string | null
  guardianName?: string | null
  soaCommissionRate?: number | string | null
  payoutBatch?: string | null
  qbEntry?: string | null
  /** Where the letter is in the OP's payment process (STAR OFFICE → PAID). */
  glStage?: string | null
  /** Remaining on the tagged wallet in POS; null when nothing is tagged. */
  posBalance: number | null
  /** Has the letter actually been drawn down — balance below the approved amount. */
  rendered: boolean
  paid: boolean
  /** Cash that came in. An untagged entry has no payments, only a date of payment, so its SOA stands in. */
  received: number
  /** Given up as uncollectible; closes the letter without any cash. */
  writtenOff: number
  lastPaymentDate?: string | null
  monthsToPay?: number | null
  files: string[]
}

/**
 * "Rendered service?" means the letter has actually been consumed, so it reads
 * the balance rather than the presence of an order: an order billed at zero, or
 * fully discounted, leaves the letter untouched and should still say NO. An
 * untagged entry has no wallet to draw down, so it is always NO.
 */
/**
 * What POS still has on the letter. The AR endpoint replaces `balance` with the
 * approved amount for GL wallets, so reading it directly reports the letter as
 * untouched however much has been consumed — ARKEEN MIGUEL TAG-AT showed
 * P49,280 left and "Rendered service? NO" while POS showed P10,840 remaining
 * against P38,440 consumed. consumedOutstanding survives that substitution.
 */
export function posBalanceOf(w: GlCaseWallet | null): number | null {
  if (!w) return null
  const approved = num(w.totalGlAmount)
  // Per-session agencies have no approved amount to draw down; their `balance`
  // is the outstanding figure the endpoint computed, and is already correct.
  if (approved <= 0) return w.balance != null ? num(w.balance) : null
  return approved - num(w.consumedOutstanding)
}

export function drawnDown(w: GlCaseWallet | null): boolean {
  if (!w) return false
  if (num(w.totalGlAmount) <= 0) return false
  return num(w.consumedOutstanding) > 0
}

export function rowOf(c: GlCaseRow | null, w: GlCaseWallet | null): GlLetterRow {
  // A case's own paper trail wins over the wallet's — it is the record staff
  // maintain — but the live figures below always come from the wallet.
  const pick = <T,>(a: T | null | undefined, b: T | null | undefined) => (a ?? b ?? null)
  const paid = w ? num(w.paidTotal) > 0 : !!c?.paidAt
  return {
    key: c ? `case:${c.id}` : `wallet:${w!.id}`,
    caseId: c?.id ?? null,
    wallet: w,
    source: c,
    // House convention: patient names read in caps throughout. Applied on the way
    // into the row so the table, the search, the filters and both exports agree —
    // uppercasing only in the cell would leave a lowercase name unsearchable by
    // its capitalised form.
    patientName: (c?.patientName ?? w!.patientName).toUpperCase(),
    branch: pick(c?.branch, w?.branch),
    glRequestedAmount: pick(c?.glRequestedAmount, w?.glRequestedAmount),
    glDocsSubmittedAt: pick(c?.glDocsSubmittedAt, w?.glDocsSubmittedAt),
    glReleasedAt: pick(c?.glReleasedAt, w?.glReleasedAt),
    approved: w ? num(w.totalGlAmount) : num(c?.approvedAmount),
    soaAmount: pick(c?.soaAmount, w?.soaAmount),
    soaSubmittedAt: pick(c?.soaSubmittedAt, w?.soaSubmittedAt),
    soaResubmittedAt: pick(c?.soaResubmittedAt, w?.soaResubmittedAt),
    guardianName: pick(c?.guardianName, w?.guardianName),
    soaCommissionRate: pick(c?.soaCommissionRate, w?.soaCommissionRate),
    payoutBatch: pick(c?.payoutBatch, w?.payoutBatch),
    qbEntry: pick(c?.qbEntry, w?.qbEntry),
    // A recorded payment settles the stage. The stored stage stays underneath, so
    // undoing the payment puts the letter back where it was.
    glStage: paid ? 'PAID' : pick(c?.glStage, w?.glStage),
    posBalance: posBalanceOf(w),
    rendered: drawnDown(w),
    paid,
    received: w ? num(w.paidTotal) : c?.paidAt ? num(c.soaAmount ?? c.approvedAmount) : 0,
    writtenOff: num(w?.writtenOffTotal),
    lastPaymentDate: w ? (w.lastPaymentDate ?? null) : (c?.paidAt ?? null),
    monthsToPay: w?.monthsToPay ?? null,
    files: w ? fileUrls(w) : [],
  }
}

/**
 * Every case, plus the wallets no case has claimed. Tagging a case to a wallet
 * therefore replaces that wallet's line rather than adding a second one.
 */
export function buildRows(wallets: GlCaseWallet[], cases: GlCaseRow[]): GlLetterRow[] {
  const byId = new Map(wallets.map(w => [w.id, w]))
  const claimed = new Set(cases.map(c => c.walletId).filter((v): v is string => !!v))
  return [
    ...cases.map(c => rowOf(c, c.walletId ? byId.get(c.walletId) ?? null : null)),
    ...wallets.filter(w => !claimed.has(w.id)).map(w => rowOf(null, w)),
  ]
}

/** Whole days between SOA submission and payment — the sheet's "AR running days". */
/**
 * SOA submission to payment. The clock stops at the payment date only once that
 * date has actually arrived: this column is "Date of Payment (in check)", and a
 * post-dated cheque is a promise, not a settlement — stopping the clock on it
 * would report a letter as settled faster than it was, and in the case of a
 * cheque dated next month, report a span shorter than the days already elapsed.
 * Until then, and for letters with no payment at all, the days keep running.
 */
export function arRunningDays(r: GlLetterRow): number | null {
  const now = Date.now()
  // Once the SOA is filed the clock runs from it. Before that the letter is
  // still ageing — from the day the GL was released — so the days keep counting
  // rather than showing blank. A letter with neither date has no clock at all.
  const start = soaSubmittedOn(r)
    ?? (r.glReleasedAt && new Date(r.glReleasedAt).getTime() <= now ? r.glReleasedAt : null)
  if (!start) return null
  const paidAt = r.lastPaymentDate ? new Date(r.lastPaymentDate).getTime() : null
  const end = paidAt != null && paidAt <= now ? paidAt : now
  // Floor, not round: stored dates are midnight, so a letter still running would
  // otherwise gain its next day at noon rather than at midnight, and the figure
  // would change under the reader mid-afternoon. Completed days only.
  return Math.floor((end - new Date(start).getTime()) / 86_400_000)
}

/**
 * The SOA submission date, but only once it has arrived. A date in the future is
 * a plan, not a filing: ARSHIE RAE F. TARONA carries 2026-09-17, which made the
 * sheet read "SOA submitted YES" and gave AR running days a negative span,
 * because the clock was started from a day that has not happened.
 */
export function soaSubmittedOn(r: GlLetterRow): string | null {
  if (!r.soaSubmittedAt) return null
  return new Date(r.soaSubmittedAt).getTime() <= Date.now() ? r.soaSubmittedAt : null
}

/**
 * Average AR running days over the letters where the clock has started (an SOA
 * submitted, or the GL released). Letters with no clock are left out rather
 * than counted as zero. Each letter counts once, paid ones included (their
 * clock stopped at the payment).
 */
export function avgArRunningDays(rows: GlLetterRow[]): { avg: number; n: number; of: number } | null {
  const days = rows.map(arRunningDays).filter((d): d is number => d != null)
  return days.length ? { avg: days.reduce((a, b) => a + b, 0) / days.length, n: days.length, of: rows.length } : null
}
