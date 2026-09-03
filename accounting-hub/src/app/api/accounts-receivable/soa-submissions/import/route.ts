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

// Multi-letter name tokens ("MA." and middle initials drop out).
const nameTokens = (s: string) =>
  (s || '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(t => t.length > 1)

// "BAUTISTA, CHRISTINE" ⊆ "CHRISTINE VICTORIA BAUTISTA": every token of the
// shorter name appears in the longer one, with at least two in common.
const nameSubset = (a: string[], b: string[]) => {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= 2 && short.every(t => long.includes(t))
}

const dayDiff = (a: string, b: string) => Math.abs((+new Date(a) - +new Date(b)) / 86400000)

export async function POST(req: Request) {
  const internalSecret = process.env.NEXTAUTH_SECRET
  if (!internalSecret || req.headers.get('x-internal-secret') !== internalSecret) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { dryRun, mode, batches } = await req.json() as {
      dryRun?: boolean
      mode?: 'clinicians'
      batches: { walletName: string; branch?: string; submittedDate: string; rows: { patient: string; amount: number; dates: string[]; clinician?: string }[] }[]
    }
    if (!Array.isArray(batches) || batches.length === 0) {
      return NextResponse.json({ error: 'batches required' }, { status: 400 })
    }
    if (mode === 'clinicians') return backfillClinicians(batches, !!dryRun)

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
      // Early QB imports stored the payment account ("HMO - INTELLICARE") as
      // the patient name — those orders can only pair by date + amount.
      const walletToken = normName(wallet.patientName).split(' ')[0] || ''
      const pool = candidates.map(o => {
        const raw = (o.patientName || '').trim()
        const name = normName(raw)
        return {
          id: o.id,
          name,
          tokens: nameTokens(raw),
          generic: !raw || /^HMO\b/i.test(raw) || (!!walletToken && name.includes(walletToken)),
          date: new Date(o.transactionDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
          amount: o.payments.reduce((s, p) => s + Number(p.amount), 0),
          tagged: o.soaSubmissionItems.length > 0,
          used: false,
        }
      })

      const matchedIds: string[] = []
      let alreadyTagged = 0
      const unmatched: { patient: string; amount: number; dates: string[] }[] = []
      const unique = <T,>(arr: T[]) => (arr.length === 1 ? arr[0] : undefined)
      for (const row of batch.rows) {
        const rn = normName(row.patient)
        const rTokens = nameTokens(row.patient)
        const amountOk = (o: { amount: number }) => Math.abs(o.amount - row.amount) < 0.51
        const hit =
          // 1. exact normalized name + service date + amount
          pool.find(o => !o.used && !o.generic && o.name === rn && row.dates.includes(o.date) && amountOk(o))
          // 2. exact name + date, amount drifted — only when unambiguous
          || unique(pool.filter(o => !o.used && !o.generic && o.name === rn && row.dates.includes(o.date)))
          // 3. name-subset (middle names / initials differ) + date + amount, unambiguous
          || unique(pool.filter(o => !o.used && !o.generic && nameSubset(rTokens, o.tokens) && row.dates.includes(o.date) && amountOk(o)))
          // 4. name-subset + amount within ±3 days (workbook carries the LOA
          //    approval date, sessions land a few days later), unambiguous
          || unique(pool.filter(o => !o.used && !o.generic && nameSubset(rTokens, o.tokens) && amountOk(o) && row.dates.some(d => dayDiff(d, o.date) <= 3)))
          // 5. generic-name pool (patient unknown in the DB): same provider,
          //    same service date, same amount — interchangeable, pair greedily.
          || pool.find(o => !o.used && o.generic && row.dates.includes(o.date) && amountOk(o))
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

/* ── Clinician backfill ─────────────────────────────────────────────────
 * The dashlabs/QB import never stored the clinician (it lived in the source
 * documents' TAGS), so historical orders show no clinician. The HMO tracker
 * workbooks carry THERAPIST/PHYSICIAN per row: match rows to orders the same
 * way the submission import does and fill clinicianName where it is empty.
 * Workbook short forms ("PT DENISE", "DR. DE CASTRO") resolve to the full
 * names the POS already uses when the token match is unambiguous. */
async function backfillClinicians(
  batches: { walletName: string; rows: { patient: string; amount: number; dates: string[]; clinician?: string }[] }[],
  dryRun: boolean,
) {
  const wallets = await prisma.digitalWallet.findMany({
    where: { walletType: 'HMO' },
    select: { id: true, patientName: true },
  })
  const walletByName = new Map(wallets.map(w => [w.patientName.trim().toUpperCase(), w]))

  // Known full clinician names from POS orders, for short-form resolution.
  const known = (await prisma.order.findMany({
    where: { clinicianName: { not: null } },
    select: { clinicianName: true },
    distinct: ['clinicianName'],
  })).map(o => (o.clinicianName || '').trim()).filter(Boolean)
  const resolveClinician = (raw: string): string => {
    const tokens = (raw || '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/)
      .filter(t => t.length > 1 && !['PT', 'OT', 'DR', 'SLP', 'MD'].includes(t))
    if (tokens.length === 0) return raw.trim()
    const hits = known.filter(k => {
      const kt = nameTokens(k)
      return tokens.every(t => kt.includes(t))
    })
    return hits.length === 1 ? hits[0] : raw.trim()
  }

  const report: unknown[] = []
  let totalUpdated = 0
  for (const batch of batches) {
    const wallet = walletByName.get((batch.walletName || '').trim().toUpperCase())
    if (!wallet) { report.push({ walletName: batch.walletName, error: 'wallet not found' }); continue }
    const rows = batch.rows.filter(r => r.patient && r.clinician && r.dates?.length)
    if (rows.length === 0) { report.push({ walletName: batch.walletName, error: 'no usable rows' }); continue }
    const allDates = rows.flatMap(r => r.dates).sort()
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
        id: true, patientName: true, clinicianName: true, transactionDate: true,
        payments: { where: { method: 'HMO', walletId: wallet.id }, select: { amount: true } },
      },
    })
    const walletToken = normName(wallet.patientName).split(' ')[0] || ''
    const pool = candidates.map(o => {
      const raw = (o.patientName || '').trim()
      const name = normName(raw)
      return {
        id: o.id, name, tokens: nameTokens(raw),
        generic: !raw || /^HMO\b/i.test(raw) || (!!walletToken && name.includes(walletToken)),
        date: new Date(o.transactionDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
        amount: o.payments.reduce((s, p) => s + Number(p.amount), 0),
        hasClinician: !!(o.clinicianName || '').trim(),
        used: false,
      }
    })
    const unique = <T,>(arr: T[]) => (arr.length === 1 ? arr[0] : undefined)
    let matched = 0, updated = 0, skippedHasClinician = 0, unmatchedCount = 0
    const updates = new Map<string, string>()
    for (const row of rows) {
      const rn = normName(row.patient)
      const rTokens = nameTokens(row.patient)
      const amountOk = (o: { amount: number }) => Math.abs(o.amount - row.amount) < 0.51
      const hit =
        pool.find(o => !o.used && !o.generic && o.name === rn && row.dates.includes(o.date) && amountOk(o))
        || unique(pool.filter(o => !o.used && !o.generic && o.name === rn && row.dates.includes(o.date)))
        || unique(pool.filter(o => !o.used && !o.generic && nameSubset(rTokens, o.tokens) && row.dates.includes(o.date) && amountOk(o)))
        || unique(pool.filter(o => !o.used && !o.generic && nameSubset(rTokens, o.tokens) && amountOk(o) && row.dates.some(d => dayDiff(d, o.date) <= 3)))
        || pool.find(o => !o.used && o.generic && row.dates.includes(o.date) && amountOk(o))
      if (!hit) { unmatchedCount++; continue }
      hit.used = true
      matched++
      if (hit.hasClinician) { skippedHasClinician++; continue }
      updates.set(hit.id, resolveClinician(row.clinician as string))
    }
    if (!dryRun && updates.size > 0) {
      for (const [orderId, clinicianName] of updates) {
        await prisma.order.update({ where: { id: orderId }, data: { clinicianName } })
      }
    }
    updated = updates.size
    totalUpdated += updated
    report.push({ walletName: wallet.patientName, rows: rows.length, matched, updated, skippedHasClinician, unmatchedCount })
  }
  return NextResponse.json({ dryRun, mode: 'clinicians', totalUpdated, batches: report })
}
