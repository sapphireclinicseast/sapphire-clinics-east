import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { commissionFloor, computeDoctorCommissions } from '@/lib/referral-commission'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH' }
// Referral commissions are a patient-acquisition cost; no dedicated COA line
// exists, so they book under Marketing until Hannah carves one out.
const COMMISSION_ACCOUNT = '8120 Marketing and Advertising Expense'

// POST { branch, upTo } → one EXPENSE RFP per EXTERNAL commissioned doctor
// covering their unclaimed sessions from the scheme start through `upTo`.
// External doctors are not staff, so payroll can't pay them — instead each
// doctor gets an audited one-time expense entry (so the P&L books the cost)
// wrapped in a standard RFP (so payment, cheques and bank rec all work),
// payable to the doctor. The sessions are stamped in the claim ledger against
// the RFP, so they can never pay again — not here, not in payroll. Deleting
// the RFP (expenses/rfp DELETE) removes its auto-entry and releases the
// sessions for the next run.
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

    const rows = await computeDoctorCommissions(prisma, { from: commissionFloor(), to, onlyUnclaimed: true })
    const externals = rows.filter(r => !r.isInhouse && r.rate != null && r.rate > 0 && r.sessions.length > 0)
    if (!externals.length) return NextResponse.json({ created: [], note: 'No unpaid commission sessions for external doctors in that window.' })

    const yy = new Date().getFullYear() % 100
    const created: { doctor: string; refNumber: string; sessions: number; amount: number }[] = []

    for (const doc of externals) {
      const rate = doc.rate as number
      const total = doc.sessions.length * rate
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
            requestor: doc.name,
            description: `Referral commission — ${doc.sessions.length} session${doc.sessions.length === 1 ? '' : 's'} × ₱${rate.toLocaleString('en-PH')} (through ${upToLabel})`,
            accountTitle: COMMISSION_ACCOUNT,
            vatable: 'Non-VAT',
            validity: 'Valid',
            audited: true,
            grossAmount: total,
            createdById: session.user.id ?? null,
          },
        })

        // RFP on the shared per-branch running number, exactly like the grid's
        // Generate RFP (payableTo = the doctor; one member entry).
        const seq = Math.max(settings.nextReimbSeq, 1)
        await tx.pettyCashSettings.update({ where: { branch }, data: { nextPcvSeq: Math.max(settings.nextPcvSeq, pcvSeq + 1), nextReimbSeq: seq + 1 } })
        const ref = `${BRANCH_CODE[branch]}-RFP${yy}-${String(seq).padStart(6, '0')}-VAL`
        const rfp = await tx.reimbursementReport.create({
          data: {
            branch, refNumber: ref, refSeq: seq, grossTotal: total, kind: 'VALID', module: 'EXPENSE',
            payableTo: doc.name,
            meta: { source: 'REFERRAL_COMMISSION', referrerId: doc.referrerId, sessions: doc.sessions.length, rate, upTo: upTo || null },
            createdById: session.user.id ?? null,
          },
        })
        await tx.pettyCashEntry.update({ where: { id: entry.id }, data: { reimbursementId: rfp.id } })

        // Stamp every paid session against this RFP — a session another payout
        // or payroll already claimed stays theirs (unique per order).
        await tx.referralCommissionItem.createMany({
          data: doc.sessions.map(s => ({ kind: 'DOCTOR', orderId: s.orderId, referrerId: doc.referrerId, amount: rate, cutoffPeriod: `RFP:${ref}`, rfpId: rfp.id })),
          skipDuplicates: true,
        })
        return ref
      })
      created.push({ doctor: doc.name, refNumber, sessions: doc.sessions.length, amount: total })
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entity: 'referral-commission-rfp',
        details: { branch, upTo: upTo || null, created },
      },
    })

    return NextResponse.json({ created })
  } catch (e) {
    console.error('Commission RFP payout error:', e)
    return NextResponse.json({ error: 'Failed to generate commission RFPs' }, { status: 500 })
  }
}
