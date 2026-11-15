// POS ↔ ledger posting check (Hannah 2026-11-15: "build both").
//
// Every POS order is booked by a one-shot side effect: completing writes a
// POS_ORDER journal entry, voiding/reopening writes a mirrored
// POS_ORDER_REVERSAL, re-completing writes a fresh POS_ORDER. When one of those
// writes misfired (a double-clicked Reopen, a centavo-unbalanced old entry, an
// edit whose payments no longer covered the total) the order still saved and
// the error only reached the server log — nothing ever compared the orders
// with the books afterwards, so revenue silently went missing or double.
//
// This module is that comparison. One SQL pass (≈0.2 s for all of 2026) gives
// every order whose ledger standing disagrees with its status:
//   · fixable — the app's own posting routines can settle it with no judgment:
//       NOT_POSTED / NEVER_POSTED (completed, books carry nothing) → postOrderJournal
//       VOID_STILL_POSTED (voided, books still carry the sale)     → reverseOrderJournal
//   · needs a person — never touched automatically:
//       PAYMENTS_DONT_MATCH, POSTED_TWICE, OVER_CANCELLED, LEFT_REOPENED
// The nightly cron (POST /api/posting-check with x-internal-secret) runs the
// fixes; Posting Check (/posting-check) and the bell show what is left.
// Run history lives in AuditLog (action POS_GL_CHECK) — no schema change.

import type { PrismaClient } from '@prisma/client'
import { postOrderJournal, reverseOrderJournal, orderGlNetCents, type PostOrderResult } from './post-order'

/** Orders before 2026 are QB-era (QB_IMPORT_JE), not posted per order. */
const SINCE = new Date('2026-01-01T00:00:00.000Z')
/** A reopened order left this long without being completed or voided is flagged. */
const REOPENED_GRACE_HOURS = 48
/** Orders with no posting at all are only looked for this far back (older
 *  ones are the Jan–Apr migration gap the reports engine synthesizes). */
const NEVER_POSTED_DAYS = 60

export type PosGlKind =
  | 'NOT_POSTED' | 'NEVER_POSTED' | 'VOID_STILL_POSTED'
  | 'PAYMENTS_DONT_MATCH' | 'POSTED_TWICE' | 'OVER_CANCELLED' | 'LEFT_REOPENED'

export interface PosGlIssue {
  orderId: string
  orderNumber: string
  branch: string
  transactionDate: string
  patientName: string | null
  netAmount: number
  paid: number
  kind: PosGlKind
  fixable: boolean
  /** Plain-words description for the page and the bell. */
  detail: string
  /** Peso size of the gap in the books (the sale missing, doubled, or over-cancelled). */
  gap: number
  /** When the last attempt to fix it failed: why. */
  failure?: string
}

export interface PosGlRun {
  runAt: string
  fixed: { orderId: string; orderNumber: string; branch: string; kind: PosGlKind; amount: number }[]
  failed: { orderId: string; orderNumber: string; kind: PosGlKind; reason: string }[]
  exceptionKeys: string[]
}

/** Reasons postOrderJournal gives for an order that correctly has no entry. */
export const BENIGN_POST_REASONS = ['MD pass-through', 'no postable lines', 'ENABLE_GL_POSTING flag is off']
export const isBenignReason = (r?: string) => !!r && BENIGN_POST_REASONS.some(b => r.startsWith(b))

export const BRANCH_LABEL: Record<string, string> = {
  SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills', VERDANA_STORE: 'Verdana', AURA_INSTITUTE: 'AHI',
}
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const ymd = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10) // Manila date

interface ScanRow {
  id: string
  orderNumber: string | null
  branch: string
  status: string
  paymentStatus: string
  transactionDate: Date
  updatedAt: Date
  patientName: string | null
  netAmount: number
  paid: number
  hasJe: boolean
  netCents: number
  lastFwdCents: number
}

/** Live scan: every 2026 order whose ledger standing disagrees with its status. */
export async function scanPosGl(prisma: PrismaClient): Promise<PosGlIssue[]> {
  const now = Date.now()
  const reopenedBefore = new Date(now - REOPENED_GRACE_HOURS * 3600_000)
  const neverPostedSince = new Date(now - NEVER_POSTED_DAYS * 86_400_000)
  const settledBefore = new Date(now - 15 * 60_000) // leave orders saved in the last 15 minutes alone
  const rows = await prisma.$queryRaw<ScanRow[]>`
    WITH je AS (
      SELECT j."referenceId" AS oid, j."referenceType" AS rt, j."createdAt" AS ca,
             GREATEST(SUM(ROUND(l.debit * 100)), SUM(ROUND(l.credit * 100))) AS sz
      FROM "JournalEntry" j JOIN "JournalEntryLine" l ON l."journalEntryId" = j.id
      WHERE j."referenceType" IN ('POS_ORDER', 'POS_ORDER_REVERSAL')
      GROUP BY j.id),
    agg AS (
      SELECT oid, SUM(CASE WHEN rt = 'POS_ORDER' THEN sz ELSE -sz END) AS net,
             (ARRAY_AGG(sz ORDER BY ca DESC) FILTER (WHERE rt = 'POS_ORDER'))[1] AS lastf
      FROM je GROUP BY oid),
    pay AS (SELECT "orderId", SUM(amount) AS paid FROM "OrderPayment" GROUP BY 1),
    md AS (
      SELECT oi."orderId", BOOL_AND(COALESCE(s."hmoPaysClinicianDirect", false)) AS all_md
      FROM "OrderItem" oi LEFT JOIN "Service" s ON s.id = oi."serviceId" GROUP BY 1)
    SELECT o.id, o."orderNumber"::text AS "orderNumber", o.branch::text AS branch, o.status::text AS status,
           o."paymentStatus" AS "paymentStatus", o."transactionDate", o."updatedAt", o."patientName",
           o."netAmount"::float8 AS "netAmount", COALESCE(p.paid, 0)::float8 AS paid,
           (a.oid IS NOT NULL) AS "hasJe", COALESCE(a.net, 0)::float8 AS "netCents", COALESCE(a.lastf, 0)::float8 AS "lastFwdCents"
    FROM "Order" o
    LEFT JOIN agg a ON a.oid = o.id
    LEFT JOIN pay p ON p."orderId" = o.id
    LEFT JOIN md m ON m."orderId" = o.id
    WHERE o."transactionDate" >= ${SINCE} AND (
         (o.status = 'COMPLETED' AND o."paymentStatus" <> 'UNPAID' AND a.oid IS NOT NULL AND a.net <= 0)
      OR (o.status = 'COMPLETED' AND a.net > a.lastf + 2)
      OR (o.status = 'VOIDED' AND ABS(a.net) > 2)
      OR (o.status = 'REOPENED' AND o."updatedAt" < ${reopenedBefore})
      OR (o.status = 'COMPLETED' AND o."paymentStatus" <> 'UNPAID' AND a.oid IS NULL AND o."netAmount" > 0
          AND o."transactionDate" >= ${neverPostedSince}
          AND o."createdAt" < ${settledBefore}
          AND NOT (COALESCE(m.all_md, false) AND NOT o."hmoCoursedThroughClinic"))
    )
    ORDER BY o."transactionDate"`

  const issues: PosGlIssue[] = []
  for (const r of rows) {
    const base = {
      orderId: r.id, orderNumber: r.orderNumber || r.id, branch: r.branch,
      transactionDate: ymd(r.transactionDate), patientName: r.patientName,
      netAmount: Number(r.netAmount), paid: Number(r.paid),
    }
    const paymentsOk = Math.abs(base.paid - base.netAmount) <= 0.05
    const net = Number(r.netCents) / 100
    if (r.status === 'COMPLETED' && r.paymentStatus !== 'UNPAID' && (net <= 0 || !r.hasJe)) {
      if (!paymentsOk) {
        issues.push({ ...base, kind: 'PAYMENTS_DONT_MATCH', fixable: false, gap: base.netAmount,
          detail: `Not in the books: its payments total ${peso(base.paid)} but the order total is ${peso(base.netAmount)}. Fix the payment lines in POS (reopen → correct → complete); it posts by itself after that.` })
      } else {
        const kind: PosGlKind = r.hasJe ? 'NOT_POSTED' : 'NEVER_POSTED'
        issues.push({ ...base, kind, fixable: true, gap: base.netAmount,
          detail: r.hasJe ? 'Completed, but its posting was cancelled and never re-posted.' : 'Completed, but never posted to the books.' })
      }
    } else if (r.status === 'COMPLETED' && net > Number(r.lastFwdCents) / 100 + 0.02) {
      issues.push({ ...base, kind: 'POSTED_TWICE', fixable: false, gap: net - Number(r.lastFwdCents) / 100,
        detail: `Posted more than once — the books carry ${peso(net)} for it. The extra entry needs to be removed.` })
    } else if (r.status === 'VOIDED' && net > 0) {
      issues.push({ ...base, kind: 'VOID_STILL_POSTED', fixable: true, gap: net,
        detail: 'Voided, but its sale is still in the books.' })
    } else if (r.status === 'VOIDED' && net < 0) {
      issues.push({ ...base, kind: 'OVER_CANCELLED', fixable: false, gap: -net,
        detail: `Voided, but cancelled more times than it was posted — the books are ${peso(-net)} short. The extra cancellation needs to be removed.` })
    } else if (r.status === 'REOPENED') {
      const unpaid = r.paymentStatus === 'UNPAID'
      const books = net > 0 ? 'Its old posting still stands. ' : unpaid ? '' : 'Its sale is out of the books while it stays open. '
      issues.push({ ...base, kind: 'LEFT_REOPENED', fixable: false, gap: net > 0 || unpaid ? 0 : base.netAmount,
        detail: `Reopened on ${ymd(r.updatedAt)} and never completed or voided${unpaid ? ' (unpaid)' : ''}. ${books}Complete or void it in POS.` })
    }
  }
  return issues
}

/** Fix the fixable issues with the app's own posting routines. */
async function fixIssues(prisma: PrismaClient, actorId: string, issues: PosGlIssue[]) {
  const fixed: PosGlRun['fixed'] = []
  const failed: PosGlRun['failed'] = []
  for (const i of issues.filter(x => x.fixable)) {
    try {
      let last: PostOrderResult | null = null
      if (i.kind === 'VOID_STILL_POSTED') {
        // reverse while the sale still stands (twice for a double-posted void)
        for (let n = 0; n < 3 && (await orderGlNetCents(prisma, i.orderId)) > 0; n++) {
          last = await reverseOrderJournal(prisma, i.orderId, actorId, 'order voided — nightly posting check')
          if (!last.posted) break
        }
        if ((await orderGlNetCents(prisma, i.orderId)) <= 0) fixed.push({ orderId: i.orderId, orderNumber: i.orderNumber, branch: i.branch, kind: i.kind, amount: i.gap })
        else failed.push({ orderId: i.orderId, orderNumber: i.orderNumber, kind: i.kind, reason: last?.reason || 'reversal did not take' })
      } else {
        // a net-negative set needs two forwards: one to zero, one to stand
        for (let n = 0; n < 2 && (await orderGlNetCents(prisma, i.orderId)) <= 0; n++) {
          last = await postOrderJournal(prisma, i.orderId, actorId)
          if (!last.posted) break
        }
        if ((await orderGlNetCents(prisma, i.orderId)) > 0) fixed.push({ orderId: i.orderId, orderNumber: i.orderNumber, branch: i.branch, kind: i.kind, amount: i.netAmount })
        else if (last && isBenignReason(last.reason)) { /* correctly unposted (e.g. MD pass-through) */ }
        else failed.push({ orderId: i.orderId, orderNumber: i.orderNumber, kind: i.kind, reason: last?.reason || 'posting did not take' })
      }
    } catch (e) {
      failed.push({ orderId: i.orderId, orderNumber: i.orderNumber, kind: i.kind, reason: e instanceof Error ? e.message : String(e) })
    }
  }
  return { fixed, failed }
}

const issueKey = (i: { kind: string; orderId: string }) => `${i.kind}:${i.orderId}`

/** Nightly / on-demand run: scan, fix what is safe, record the run. */
export async function runPosGlCheck(prisma: PrismaClient, actorId: string) {
  const before = await scanPosGl(prisma)
  const { fixed, failed } = await fixIssues(prisma, actorId, before)
  const after = await scanPosGl(prisma)
  const failedIds = new Set(failed.map(f => f.orderId))
  const needsPerson = after.filter(i => !i.fixable || failedIds.has(i.orderId))
  const prev = await lastRun(prisma)
  const prevKeys = new Set(prev?.exceptionKeys || [])
  const exceptionKeys = needsPerson.map(issueKey)
  const run: PosGlRun = { runAt: new Date().toISOString(), fixed, failed, exceptionKeys }
  await prisma.auditLog.create({
    data: { userId: actorId, action: 'POS_GL_CHECK', entity: 'PosGlCheck', details: run as unknown as object },
  })
  cache = null
  return {
    ...run,
    exceptions: needsPerson.length,
    newExceptions: needsPerson.filter(i => !prevKeys.has(issueKey(i))).map(i => ({ ...i, failure: failed.find(f => f.orderId === i.orderId)?.reason })),
  }
}

async function lastRun(prisma: PrismaClient): Promise<PosGlRun | null> {
  const row = await prisma.auditLog.findFirst({ where: { action: 'POS_GL_CHECK', entity: 'PosGlCheck' }, orderBy: { createdAt: 'desc' }, select: { details: true } })
  return (row?.details as unknown as PosGlRun) || null
}

/** A POS action whose posting misfired: noted at once so the order shows on
 *  Posting Check / the bell for the accountants (the cashier sees nothing). */
export async function noteGlFailure(
  prisma: PrismaClient,
  p: { orderId: string; userId: string; step: 'create' | 'payment' | 'void' | 'reopen' | 'return' | 'edit'; result?: PostOrderResult | null; error?: unknown },
) {
  const reason = p.error ? (p.error instanceof Error ? p.error.message : String(p.error)) : p.result?.reason
  if (!p.error && (!p.result || p.result.posted || p.result.alreadyPosted || isBenignReason(reason) || reason === 'no forward JE to reverse')) return
  try {
    await prisma.auditLog.create({ data: { userId: p.userId, action: 'POS_GL_FAILED', entity: 'Order', entityId: p.orderId, details: { step: p.step, reason: reason || 'unknown' } } })
    cache = null
  } catch (e) { console.error('[posting-check] could not note GL failure', e) }
}

export interface PosGlStatus {
  checkedAt: string
  lastRun: PosGlRun | null
  /** Needs a person. */
  exceptions: PosGlIssue[]
  /** Will be fixed by the next nightly run (or "Run check now"). */
  pending: PosGlIssue[]
}

let cache: { at: number; data: PosGlStatus } | null = null
const CACHE_MS = 60_000

/** Live status for the page and the bell (cached a minute). */
export async function posGlStatus(prisma: PrismaClient, fresh = false): Promise<PosGlStatus> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.data
  const [issues, run] = await Promise.all([scanPosGl(prisma), lastRun(prisma)])
  // Failures noted since the last run (or the last week when none ran yet).
  const since = run ? new Date(run.runAt) : new Date(Date.now() - 7 * 86_400_000)
  const notes = await prisma.auditLog.findMany({
    where: { action: 'POS_GL_FAILED', entity: 'Order', createdAt: { gte: since }, entityId: { in: issues.map(i => i.orderId) } },
    select: { entityId: true, details: true }, orderBy: { createdAt: 'desc' },
  })
  const failure = new Map<string, string>()
  for (const f of run?.failed || []) failure.set(f.orderId, `Tonight's automatic fix failed: ${f.reason}`)
  for (const n of notes) {
    const d = n.details as { step?: string; reason?: string } | null
    if (n.entityId && !failure.has(n.entityId)) failure.set(n.entityId, `Posting failed at ${d?.step || 'save'}: ${d?.reason || 'unknown'}`)
  }
  const exceptions: PosGlIssue[] = []
  const pending: PosGlIssue[] = []
  for (const i of issues) {
    const f = failure.get(i.orderId)
    if (!i.fixable) exceptions.push(f ? { ...i, failure: f } : i)
    else if (f) exceptions.push({ ...i, failure: f })
    else pending.push(i)
  }
  const data: PosGlStatus = { checkedAt: new Date().toISOString(), lastRun: run, exceptions, pending }
  cache = { at: Date.now(), data }
  return data
}
