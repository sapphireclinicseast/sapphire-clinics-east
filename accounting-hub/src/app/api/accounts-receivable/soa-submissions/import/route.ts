import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { nextSoaReferenceNo, soaBranchCode, soaHmoCode } from '@/lib/soa-ref'

/**
 * POST /api/accounts-receivable/soa-submissions/import
 *
 * One-shot backfill of historical SOA submissions from the HMO tracker
 * workbooks. Internal-ops gated (x-internal-secret), same tier as
 * /api/backfill/run. Idempotent-ish: orders already tagged in any submission
 * are skipped, and an identical (wallet, submittedDate, 'Imported…' note)
 * batch is reused rather than duplicated.
 *
 * Body: {
 *   dryRun?: boolean
 *   batches: Array<{
 *     walletName: string            // provider wallet patientName (exact, case-insensitive)
 *     branch?: string               // SANDBOX_EAST | SANDBOX_GREENHILLS
 *     submittedDate: string         // YYYY-MM-DD
 *     rows: Array<{ patient: string; amount: number; dates: string[] }>  // dates = candidate YYYY-MM-DD service dates
 *   }>
 * }
 */

const IMPORT_NOTE = 'Imported from HMO tracker workbook'

const normName = (s: string) =>
  (s || '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ')

export async function POST(req: Request) {
  const internalSecret = process.env.NEXTAUTH_SECRET
  if (!internalSecret || req.headers.get('x-internal-secret') !== internalSecret) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { dryRun, batches } = await req.json() as {
      dryRun?: boolean
      batches: { walletName: string; branch?: string; submittedDate: string; rows: { patient: string; amount: number; dates: string[] }[] }[]
    }
    if (!Array.isArray(batches) || batches.length === 0) {
      return NextResponse.json({ error: 'batches required' }, { status: 400 })
    }

    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })
    if (!admin) return NextResponse.json({ error: 'no admin user' }, { status: 500 })
    const settings = await prisma.soaSettings.findUnique({ where: { id: 'singleton' }, select: { hmoCodes: true } })
    const wallets = await prisma.digitalWallet.findMany({
      where: { walletType: 'HMO' },
      select: { id: true, patientName: true, branch: true },
    })
    const walletByName = new Map(wallets.map(w => [w.patientName.trim().toUpperCase(), w]))

    const report: unknown[] = []
    for (const batch of batches) {
      const wallet = walletByName.get((batch.walletName || '').trim().toUpperCase())
      if (!wallet) {
        report.push({ walletName: batch.walletName, submittedDate: batch.submittedDate, error: 'wallet not found' })
        continue
      }
      const allDates = batch.rows.flatMap(r => r.dates).filter(Boolean).sort()
      if (batch.rows.length === 0 || allDates.length === 0) {
        report.push({ walletName: batch.walletName, submittedDate: batch.submittedDate, error: 'no usable rows' })
        continue
      }
      // Candidate orders for this provider across the batch's whole date span.
      const candidates = await prisma.order.findMany({
        where: {
          status: { not: 'VOIDED' },
          payments: { some: { method: 'HMO', walletId: wallet.id } },
          transactionDate: {
            gte: new Date(`${allDates[0]}T00:00:00+08:00`),
            lte: new Date(`${allDates[allDates.length - 1]}T23:59:59.999+08:00`),
          },
        },
        select: {
          id: true, patientName: true, transactionDate: true,
          payments: { where: { method: 'HMO', walletId: wallet.id }, select: { amount: true } },
          soaSubmissionItems: { select: { id: true } },
        },
      })
      const pool = candidates.map(o => ({
        id: o.id,
        name: normName(o.patientName || ''),
        date: new Date(o.transactionDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
        amount: o.payments.reduce((s, p) => s + Number(p.amount), 0),
        tagged: o.soaSubmissionItems.length > 0,
        used: false,
      }))

      const matchedIds: string[] = []
      let alreadyTagged = 0
      const unmatched: { patient: string; amount: number; dates: string[] }[] = []
      for (const row of batch.rows) {
        const rn = normName(row.patient)
        const hit = pool.find(o =>
          !o.used && o.name === rn && row.dates.includes(o.date) && Math.abs(o.amount - row.amount) < 0.51)
          // Amount drifts (partial areas, rounding) shouldn't orphan a clearly
          // identified session: fall back to name+date alone if unambiguous.
          || (() => {
            const byDay = pool.filter(o => !o.used && o.name === rn && row.dates.includes(o.date))
            return byDay.length === 1 ? byDay[0] : undefined
          })()
        if (!hit) { unmatched.push(row); continue }
        hit.used = true
        if (hit.tagged) { alreadyTagged++; continue }
        matchedIds.push(hit.id)
      }

      let referenceNo: string | null = null
      let submissionId: string | null = null
      if (!dryRun && matchedIds.length > 0) {
        // Reuse an identical imported batch instead of duplicating on re-run.
        const existing = await prisma.soaSubmission.findFirst({
          where: { walletId: wallet.id, submittedDate: new Date(`${batch.submittedDate}T00:00:00+08:00`), notes: IMPORT_NOTE },
          select: { id: true, referenceNo: true },
        })
        if (existing) {
          await prisma.soaSubmissionItem.createMany({
            data: matchedIds.map(orderId => ({ submissionId: existing.id, orderId })),
            skipDuplicates: true,
          })
          referenceNo = existing.referenceNo
          submissionId = existing.id
        } else {
          const created = await prisma.$transaction(async (tx) => {
            const refNo = await nextSoaReferenceNo(
              tx,
              soaBranchCode(batch.branch || wallet.branch),
              new Date(`${batch.submittedDate}T00:00:00+08:00`),
              soaHmoCode(settings?.hmoCodes, wallet.id, wallet.patientName),
            )
            return tx.soaSubmission.create({
              data: {
                referenceNo: refNo,
                walletId: wallet.id,
                submittedDate: new Date(`${batch.submittedDate}T00:00:00+08:00`),
                notes: IMPORT_NOTE,
                branch: batch.branch || wallet.branch || null,
                createdById: admin.id,
                items: { create: matchedIds.map(orderId => ({ orderId })) },
              },
              select: { id: true, referenceNo: true },
            })
          })
          referenceNo = created.referenceNo
          submissionId = created.id
        }
      }

      report.push({
        walletName: wallet.patientName,
        submittedDate: batch.submittedDate,
        rows: batch.rows.length,
        matched: matchedIds.length,
        alreadyTagged,
        unmatchedCount: unmatched.length,
        unmatched: unmatched.slice(0, 8),
        referenceNo,
        submissionId,
      })
    }
    return NextResponse.json({ dryRun: !!dryRun, batches: report })
  } catch (e) {
    console.error('SOA submissions import failed', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal server error' }, { status: 500 })
  }
}
