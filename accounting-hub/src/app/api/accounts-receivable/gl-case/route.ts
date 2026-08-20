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
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']

const DATE_FIELDS = ['glDocsSubmittedAt', 'glReleasedAt', 'soaSubmittedAt'] as const
const MONEY_FIELDS = ['glRequestedAmount', 'soaAmount', 'soaCommissionRate'] as const
const TEXT_FIELDS = ['guardianName', 'payoutBatch', 'qbEntry'] as const

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
