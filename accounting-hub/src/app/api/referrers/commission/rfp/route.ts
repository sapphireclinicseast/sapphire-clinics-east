import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { commissionFloor, computeDoctorCommissions } from '@/lib/referral-commission'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH' }
// Fallback when no expense account is configured in the payout settings —
// referral commissions are a patient-acquisition cost.
const DEFAULT_COMMISSION_ACCOUNT = '8120 Marketing and Advertising Expense'

// POST { branch, upTo } → one EXPENSE RFP per EXTERNAL commissioned referrer
// (outside doctor, law firm, partner school) covering their unclaimed sessions
// from the scheme start through `upTo`. External referrers are not staff, so
// payroll can't pay them — instead each one gets an audited one-time expense
// entry (so the P&L books the cost, under the account chosen in the payout
// settings) wrapped in a standard RFP (so payment, cheques and bank rec all
// work), payable to the referrer. The sessions are stamped in the claim
// ledger against the RFP, so they can never pay again — not here, not in
// payroll. Deleting the RFP (expenses/rfp DELETE) removes its auto-entry and
// releases the sessions for the next run.
// (First built 2026-10-07, rolled back the next day on Hannah's call;
// reinstated 2026-10-16 on her call, widened to law firms/schools with the
// expense account configurable.)
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, upTo } = await req.json()
    if (!BRANCH_CODE[branch]) return NextResponse.json({ error: 'branch must be SANDBOX_EAST or SANDBOX_GREENHILLS (the branch disbursing the payout)' }, { status: 400 })
    const to = upTo ? new Date(`${upTo}T23:59:59.999+08:00`) : new Date()
    if (isNaN(to.getTime())) return NextResponse.json({ error: 'upTo must be YYYY-MM-DD' }, { status: 400 })

    const [rows, incentive] = await Promise.all([
      computeDoctorCommissions(prisma, { from: commissionFloor(), to, onlyUnclaimed: true }),
      prisma.referralIncentiveSettings.findUnique({ where: { id: 'MAIN' } }),
    ])
    const account = incentive?.commissionExpenseAccount?.trim() || DEFAULT_COMMISSION_ACCOUNT
    const externals = rows.filter(r => !r.isInhouse && r.rate != null && r.rate > 0 && r.sessions.length > 0)
    if (!externals.length) return NextResponse.json({ created: [], note: 'No unpaid commission sessions for external referrers in that window.' })

    const yy = new Date().getFullYear() % 100
    const created: { referrer: string; refNumber: string; sessions: number; amount: number }[] = []

    for (const ref of externals) {
      const rate = ref.rate as number
      const total = ref.sessions.length * rate
      const upToLabel = to.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })

      const refNumber = await prisma.$transaction(async (tx) => {
        let settings = await tx.pettyCashSettings.findUnique({ where: { branch } })
        if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch, nextPcvSeq: 1 } })

        // Expense entry numbering: same continuous-per-branch rule as the grid.
        const maxAgg = await tx.pettyCashEntry.aggregate({ where: { branch }, _max: { pcvSeq: true } })
        const pcvSeq = (maxAgg._max.pcvSeq || 0) + 1
        const entry = await tx.pettyCashEntry.create({
          data: {
            branch,
            recordType: 'ONE_TIME',
            pcvNumber: `${BRANCH_CODE[branch]}-PCV${yy}-${String(pcvSeq).padStart(6, '0')}`,
            pcvSeq,
            pcvSub: 1,
            date: new Date(),
            requestor: ref.name,
            description: `Referral commission — ${ref.sessions.length} session${ref.sessions.length === 1 ? '' : 's'} × ₱${rate.toLocaleString('en-PH')} (through ${upToLabel})`,
            accountTitle: account,
            vatable: 'Non-VAT',
            validity: 'Valid',
            audited: true,
            grossAmount: total,
            createdById: session.user.id ?? null,
          },
        })

        // RFP on the shared per-branch running number, exactly like the grid's
        // Generate RFP (payableTo = the referrer; one member entry).
        const seq = Math.max(settings.nextReimbSeq, 1)
        await tx.pettyCashSettings.update({ where: { branch }, data: { nextPcvSeq: Math.max(settings.nextPcvSeq, pcvSeq + 1), nextReimbSeq: seq + 1 } })
        const refNo = `${BRANCH_CODE[branch]}-RFP${yy}-${String(seq).padStart(6, '0')}-VAL`
        const rfp = await tx.reimbursementReport.create({
          data: {
            branch, refNumber: refNo, refSeq: seq, grossTotal: total, kind: 'VALID', module: 'EXPENSE',
            payableTo: ref.name,
            meta: { source: 'REFERRAL_COMMISSION', referrerId: ref.referrerId, sessions: ref.sessions.length, rate, upTo: upTo || null, account },
            createdById: session.user.id ?? null,
          },
        })
        await tx.pettyCashEntry.update({ where: { id: entry.id }, data: { reimbursementId: rfp.id } })

        // Stamp every paid session against this RFP — a session another payout
        // or payroll already claimed stays theirs (unique per order).
        await tx.referralCommissionItem.createMany({
          data: ref.sessions.map(s => ({ kind: 'DOCTOR', orderId: s.orderId, referrerId: ref.referrerId, amount: rate, cutoffPeriod: `RFP:${refNo}`, rfpId: rfp.id })),
          skipDuplicates: true,
        })
        return refNo
      })
      created.push({ referrer: ref.name, refNumber, sessions: ref.sessions.length, amount: total })
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'referral-commission-rfp',
        details: { branch, upTo: upTo || null, account, created },
      },
    })

    return NextResponse.json({ created })
  } catch (e) {
    console.error('Commission RFP payout error:', e)
    return NextResponse.json({ error: 'Failed to generate commission RFPs' }, { status: 500 })
  }
}
