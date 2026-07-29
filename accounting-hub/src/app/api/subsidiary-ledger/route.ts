/**
 * Subsidiary Ledger — GET /api/subsidiary-ledger
 *
 * Per-account transaction breakdown for a date range: opening balance, every
 * posting that hit the account (with its counter-account "split"), and the
 * closing balance. Backs the /subsidiary-ledger page.
 *
 *   Query params:
 *     from=YYYY-MM-DD          range start, inclusive  (default: 1st of current month)
 *     to=YYYY-MM-DD            range end,   inclusive  (default: today)
 *     accountType=ALL|ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE
 *     accountIds=id1,id2       restrict to specific accounts
 *     branch=ALL|SANDBOX_EAST|SANDBOX_GREENHILLS|VERDANA_STORE|AURA_INSTITUTE
 *     refType=POS_ORDER|...    restrict to one transaction type
 *     search=text              account number/title, memo, description or reference
 *     includeInactive=true     include deactivated COA accounts
 *     includeEmpty=true        include accounts with no opening balance and no movement
 *     limit=5000               detail-line cap (max 20000; totals stay exact)
 *
 * Branch-locked users are forced onto their own branch regardless of `branch`.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enforceBranch } from '@/lib/branch-scope'
import { computeSubsidiaryLedger, MAX_LIMIT } from '@/lib/accounting/subsidiary-ledger'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

const VALID_TYPES = ['ALL', 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
const VALID_BRANCHES = ['ALL', 'SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = new URL(req.url).searchParams

  const today = new Date()
  const fromRaw = sp.get('from') || `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-01`
  const toRaw   = sp.get('to')   || today.toISOString().slice(0, 10)

  const from = new Date(`${fromRaw}T00:00:00.000Z`)
  // `to` is inclusive for the user, exclusive for the query.
  const to   = new Date(`${toRaw}T00:00:00.000Z`)
  to.setUTCDate(to.getUTCDate() + 1)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }
  if (to <= from) {
    return NextResponse.json({ error: '"to" must be on or after "from"' }, { status: 400 })
  }

  const accountType = sp.get('accountType') || 'ALL'
  if (!VALID_TYPES.includes(accountType)) {
    return NextResponse.json({ error: 'Invalid accountType' }, { status: 400 })
  }

  const requestedBranch = sp.get('branch') || 'ALL'
  if (!VALID_BRANCHES.includes(requestedBranch)) {
    return NextResponse.json({ error: 'Invalid branch' }, { status: 400 })
  }
  const user = session.user as { branch?: string; branches?: string[] }
  const branch = enforceBranch(user.branch, user.branches, requestedBranch) ?? requestedBranch

  const accountIds = (sp.get('accountIds') || '').split(',').map(s => s.trim()).filter(Boolean)
  const limitRaw = parseInt(sp.get('limit') || '', 10)

  try {
    const ledger = await computeSubsidiaryLedger(prisma, {
      from, to, branch, accountType,
      accountIds: accountIds.length ? accountIds : undefined,
      refType: sp.get('refType') || undefined,
      search: sp.get('search') || undefined,
      includeInactive: sp.get('includeInactive') === 'true',
      includeEmpty: sp.get('includeEmpty') === 'true',
      limit: Number.isFinite(limitRaw) ? Math.min(limitRaw, MAX_LIMIT) : undefined,
    })
    return NextResponse.json({ ...ledger, branchLocked: branch !== requestedBranch })
  } catch (err) {
    console.error('[GET /api/subsidiary-ledger]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
