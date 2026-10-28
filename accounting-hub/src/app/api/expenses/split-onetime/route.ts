import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchAllowed } from '@/lib/branch-scope'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
// CEO is excluded on purpose: CEO entries settle against the branch petty-cash
// floats via allocations, the wrong shape for a bank-paid shared purchase.
const SPLIT_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
const SHORT: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERDANA', AURA_INSTITUTE: 'AHI' }
// Same numbering shape the entries POST uses for ONE_TIME rows (no "-NN" sub).
const PCV_BRANCH_CODE: Record<string, string> = { SANDBOX_EAST: 'AHEA', SANDBOX_GREENHILLS: 'AHGH', VERDANA_STORE: 'VERD', CEO: 'CEO' }
const pcvNumber = (branch: string, seq: number) =>
  `${PCV_BRANCH_CODE[branch] || branch}-PCV${new Date().getFullYear() % 100}-${String(seq).padStart(6, '0')}`

// POST /api/expenses/split-onetime
// One shared purchase (e.g. a supplier TT paid from the AUB CNY account) split
// EQUALLY across the ticked branches: creates one ONE_TIME entry per branch,
// each with its branch's next PCV number and an equal share of the total (the
// rounding centavos land on the first branch). Optionally stamps every entry
// paid in the same call, so the pieces carry one TT reference for bank rec.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const branches: string[] = [...new Set<string>((Array.isArray(body.branches) ? body.branches : []).map(String))]
    if (branches.length < 2) return NextResponse.json({ error: 'Tick at least two branches — a single-branch purchase is an ordinary Add Row.' }, { status: 400 })
    if (branches.some(b => !SPLIT_BRANCHES.includes(b))) return NextResponse.json({ error: 'Invalid branch.' }, { status: 400 })
    const uBranch = (session.user as { branch?: string }).branch
    for (const b of branches) {
      if (!branchAllowed(uBranch, b)) return NextResponse.json({ error: `Access denied for ${SHORT[b] || b}.` }, { status: 403 })
    }
    const totalCents = Math.round(Number(body.totalAmount) * 100)
    if (!Number.isFinite(totalCents) || totalCents <= 0) return NextResponse.json({ error: 'Enter the total amount.' }, { status: 400 })
    const date = body.date ? new Date(`${String(body.date).slice(0, 10)}T00:00:00.000Z`) : new Date()
    if (isNaN(date.getTime())) return NextResponse.json({ error: 'Invalid date.' }, { status: 400 })

    const str = (v: unknown) => (v != null && String(v).trim() !== '' ? String(v).trim() : null)
    const vatable = ['VAT', 'NV'].includes(body.vatable) ? body.vatable : null
    const splitNote = `split across ${branches.map(b => SHORT[b] || b).join(' + ')}`
    const description = str(body.description) ? `${str(body.description)} — ${splitNote}` : `Shared purchase — ${splitNote}`

    // Optional payment stamp, same fields/semantics as /api/expenses/pay.
    const pay = body.payment && str(body.payment.paymentMethod) ? {
      paidAt: body.payment.datePaid ? new Date(`${String(body.payment.datePaid).slice(0, 10)}T00:00:00.000Z`) : new Date(),
      paymentMethod: str(body.payment.paymentMethod),
      checkNumber: str(body.payment.checkNumber),
      paymentBankAccount: str(body.payment.paymentBankAccount),
    } : null
    if (pay && isNaN(pay.paidAt.getTime())) return NextResponse.json({ error: 'Invalid payment date.' }, { status: 400 })

    // Equal split in centavos; the remainder goes to the first ticked branch.
    const share = Math.floor(totalCents / branches.length)
    const shares = branches.map((b, i) => ({ branch: b, cents: share + (i === 0 ? totalCents - share * branches.length : 0) }))

    const created = await prisma.$transaction(async (tx) => {
      const out: { id: string; branch: string; pcvNumber: string; grossAmount: number }[] = []
      for (const s of shares) {
        let settings = await tx.pettyCashSettings.findUnique({ where: { branch: s.branch } })
        if (!settings) settings = await tx.pettyCashSettings.create({ data: { branch: s.branch, nextPcvSeq: 1 } })
        // Continuous per branch, derived from the actual highest sequence in
        // use (same rule as the ordinary Add Row), counter kept in sync.
        const maxAgg = await tx.pettyCashEntry.aggregate({ where: { branch: s.branch }, _max: { pcvSeq: true } })
        const seq = (maxAgg._max.pcvSeq || 0) + 1
        await tx.pettyCashSettings.update({ where: { branch: s.branch }, data: { nextPcvSeq: seq + 1 } })
        const e = await tx.pettyCashEntry.create({
          data: {
            branch: s.branch,
            recordType: 'ONE_TIME',
            pcvNumber: pcvNumber(s.branch, seq),
            pcvSeq: seq,
            pcvSub: 1,
            date,
            description,
            vatable,
            siNumber: str(body.siNumber),
            tinNumber: str(body.tinNumber),
            registeredName: str(body.registeredName),
            registeredAddress: str(body.registeredAddress),
            requestor: str(body.requestor),
            accountTitle: str(body.accountTitle),
            grossAmount: s.cents / 100,
            ...(pay || {}),
            createdById: session.user!.id ?? null,
          },
        })
        out.push({ id: e.id, branch: s.branch, pcvNumber: e.pcvNumber, grossAmount: s.cents / 100 })
      }
      return out
    })
    return NextResponse.json({ ok: true, entries: created })
  } catch (e) {
    console.error('Split one-time create error:', e)
    return NextResponse.json({ error: 'Failed to create the split entries' }, { status: 500 })
  }
}
