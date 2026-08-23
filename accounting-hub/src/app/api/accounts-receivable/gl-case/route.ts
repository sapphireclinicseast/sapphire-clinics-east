import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * PATCH /api/accounts-receivable/gl-case
 *
 * Saves the case-tracking fields behind a Guarantee Letter — the paper trail
 * that used to live in the OPGL spreadsheet. Deliberately narrow: it touches
 * only these fields on a GL wallet, so it can never move a balance, an approved
 * amount or an account. Those stay with the wallet endpoints that already
 * guard them.
 */
// Branch front desk are included: they are the ones who chase the documents,
// file the SOA and know the release dates, so they maintain this sheet. It stays
// safe to hand them because the fields here are the paper trail only — this route
// cannot move a balance, an approved amount or an account, and recording a payment
// against an agency is a separate permission they do not have.
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN',
  'HMO_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

const DATE_FIELDS = ['glDocsSubmittedAt', 'glReleasedAt', 'soaSubmittedAt'] as const
const MONEY_FIELDS = ['glRequestedAmount', 'soaAmount', 'soaCommissionRate'] as const
const TEXT_FIELDS = ['guardianName', 'payoutBatch', 'qbEntry'] as const

// A standalone GlCase carries two fields a wallet-backed row reads from
// elsewhere: the approved amount (wallet: totalGlAmount) and the cheque date
// (wallet: its ARPayments). Both only apply while the case is untagged.
const CASE_DATE_FIELDS = [...DATE_FIELDS, 'paidAt'] as const
const CASE_MONEY_FIELDS = [...MONEY_FIELDS, 'approvedAmount'] as const
const CASE_TEXT_FIELDS = [...TEXT_FIELDS, 'notes'] as const

const asDate = (v: unknown) =>
  v ? new Date(`${String(v).slice(0, 10)}T00:00:00+08:00`) : null

/**
 * An SOA submission date in the future is a plan, not a filing, and letting one
 * be saved is what put ARSHIE RAE F. TARONA on the sheet as "SOA submitted YES"
 * with a negative AR running days. Rejected so the real date is entered once it
 * happens.
 *
 * Only this field. A payment date IS legitimately future-dated — that is what a
 * post-dated cheque is — and a GL release date is recorded after the fact.
 */
function futureSoa(v: unknown): boolean {
  const d = asDate(v)
  if (!d) return false
  // Compare against the end of today in Manila, so entering today's date passes.
  const endOfToday = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })}T23:59:59+08:00`)
  return d.getTime() > endOfToday.getTime()
}
const FUTURE_SOA_ERROR =
  'The SOA submission date is in the future. Record it once the SOA has actually been submitted — '
  + 'until then leave it blank, and the letter counts as not yet submitted.'

/** Shared money parse: blank clears, anything non-numeric or negative is rejected. */
function parseMoney(v: unknown): { ok: true; value: number | null } | { ok: false } {
  if (v === '' || v === null || v === undefined) return { ok: true, value: null }
  const n = Number(v)
  if (!isFinite(n) || n < 0) return { ok: false }
  return { ok: true, value: n }
}

/**
 * Guard the wallet a case is being tagged to: it has to exist, be a Guarantee
 * Letter, and not already be claimed by a different case — the unique index
 * would reject that anyway, but a 400 explains it better than a 500.
 */
async function checkWalletLink(walletId: string, selfCaseId?: string) {
  const wallet = await prisma.digitalWallet.findUnique({
    where: { id: walletId },
    select: { id: true, walletType: true, glCase: { select: { id: true } } },
  })
  if (!wallet) return 'That GL wallet no longer exists'
  if (wallet.walletType !== 'GL') return 'Only Guarantee Letter wallets can be tagged'
  if (wallet.glCase && wallet.glCase.id !== selfCaseId) {
    return 'That wallet is already tagged to another Detailed GL entry'
  }
  return null
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const wallet = await prisma.digitalWallet.findUnique({ where: { id }, select: { walletType: true } })
    if (!wallet) return NextResponse.json({ error: 'Letter not found' }, { status: 404 })
    if (wallet.walletType !== 'GL') {
      return NextResponse.json({ error: 'Case tracking applies to Guarantee Letters only' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if ('soaSubmittedAt' in body && futureSoa(body.soaSubmittedAt)) {
      return NextResponse.json({ error: FUTURE_SOA_ERROR }, { status: 400 })
    }
    for (const f of DATE_FIELDS) {
      if (!(f in body)) continue
      const v = body[f]
      // Blank clears the field rather than being ignored — a date entered by
      // mistake has to be removable.
      data[f] = v ? new Date(`${String(v).slice(0, 10)}T00:00:00+08:00`) : null
    }
    for (const f of MONEY_FIELDS) {
      if (!(f in body)) continue
      const v = body[f]
      if (v === '' || v === null || v === undefined) { data[f] = null; continue }
      const n = Number(v)
      if (!isFinite(n) || n < 0) return NextResponse.json({ error: `${f} must be a positive number` }, { status: 400 })
      data[f] = n
    }
    for (const f of TEXT_FIELDS) {
      if (!(f in body)) continue
      data[f] = String(body[f] ?? '').trim() || null
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const updated = await prisma.digitalWallet.update({
      where: { id },
      data,
      select: {
        id: true, glRequestedAmount: true, glDocsSubmittedAt: true, glReleasedAt: true,
        soaAmount: true, soaSubmittedAt: true, guardianName: true,
        soaCommissionRate: true, payoutBatch: true, qbEntry: true,
      },
    })
    return NextResponse.json(updated)
  } catch (e) {
    console.error('GL case update error:', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}

const CASE_SELECT = {
  id: true, walletId: true, patientName: true, branch: true,
  glRequestedAmount: true, glDocsSubmittedAt: true, glReleasedAt: true,
  approvedAmount: true, soaAmount: true, soaSubmittedAt: true,
  guardianName: true, soaCommissionRate: true, payoutBatch: true,
  qbEntry: true, paidAt: true, notes: true, createdAt: true,
  processorRfpId: true, processorPaidAt: true, processorProofUrl: true,
} as const

/**
 * POST /api/accounts-receivable/gl-case
 *
 * Creates a Detailed GL entry that does not need a POS wallet behind it — a
 * second application filed before the wallet exists, or a letter still awaiting
 * approval. Tagging a wallet is optional here and can be done later.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    // Stored in caps, matching how the sheet reads and how every wallet name is
    // written. Normalising here rather than only on display keeps the database
    // consistent for anything that searches or matches on the name.
    const patientName = String(body.patientName ?? '').trim().toUpperCase()
    if (!patientName) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const walletId = body.walletId ? String(body.walletId) : null
    if (walletId) {
      const problem = await checkWalletLink(walletId)
      if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {
      patientName,
      branch: String(body.branch ?? 'ALL').trim() || 'ALL',
      walletId,
      createdById: session.user.id as string,
    }
    if ('soaSubmittedAt' in body && futureSoa(body.soaSubmittedAt)) {
      return NextResponse.json({ error: FUTURE_SOA_ERROR }, { status: 400 })
    }
    for (const f of CASE_DATE_FIELDS) if (f in body) data[f] = asDate(body[f])
    for (const f of CASE_MONEY_FIELDS) {
      if (!(f in body)) continue
      const p = parseMoney(body[f])
      if (!p.ok) return NextResponse.json({ error: `${f} must be a positive number` }, { status: 400 })
      data[f] = p.value
    }
    for (const f of CASE_TEXT_FIELDS) if (f in body) data[f] = String(body[f] ?? '').trim() || null

    const created = await prisma.glCase.create({ data, select: CASE_SELECT })
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    console.error('GL case create error:', e)
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
  }
}

/**
 * PUT /api/accounts-receivable/gl-case
 *
 * Updates a standalone entry, including tagging or untagging its wallet.
 * Separate from PATCH because PATCH addresses wallets by id and this addresses
 * cases — sharing one verb would make `id` mean two different things.
 */
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const caseId = String(body.caseId ?? '')
    if (!caseId) return NextResponse.json({ error: 'caseId is required' }, { status: 400 })

    const existing = await prisma.glCase.findUnique({ where: { id: caseId }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if ('patientName' in body) {
      const n = String(body.patientName ?? '').trim().toUpperCase()
      if (!n) return NextResponse.json({ error: 'Name cannot be blank' }, { status: 400 })
      data.patientName = n
    }
    if ('branch' in body) data.branch = String(body.branch ?? 'ALL').trim() || 'ALL'
    if ('walletId' in body) {
      const walletId = body.walletId ? String(body.walletId) : null
      if (walletId) {
        const problem = await checkWalletLink(walletId, caseId)
        if (problem) return NextResponse.json({ error: problem }, { status: 400 })
      }
      data.walletId = walletId
    }
    if ('soaSubmittedAt' in body && futureSoa(body.soaSubmittedAt)) {
      return NextResponse.json({ error: FUTURE_SOA_ERROR }, { status: 400 })
    }
    for (const f of CASE_DATE_FIELDS) if (f in body) data[f] = asDate(body[f])
    for (const f of CASE_MONEY_FIELDS) {
      if (!(f in body)) continue
      const p = parseMoney(body[f])
      if (!p.ok) return NextResponse.json({ error: `${f} must be a positive number` }, { status: 400 })
      data[f] = p.value
    }
    for (const f of CASE_TEXT_FIELDS) if (f in body) data[f] = String(body[f] ?? '').trim() || null

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }
    const updated = await prisma.glCase.update({ where: { id: caseId }, data, select: CASE_SELECT })
    return NextResponse.json(updated)
  } catch (e) {
    console.error('GL case save error:', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}

/**
 * DELETE /api/accounts-receivable/gl-case?caseId=…
 *
 * Only removes standalone entries. A wallet-backed row is not a GlCase and has
 * no delete path here — deleting a Guarantee Letter wallet is a POS action with
 * its own guards.
 */
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const caseId = new URL(req.url).searchParams.get('caseId')
    if (!caseId) return NextResponse.json({ error: 'caseId is required' }, { status: 400 })
    const existing = await prisma.glCase.findUnique({ where: { id: caseId }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    await prisma.glCase.delete({ where: { id: caseId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('GL case delete error:', e)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
