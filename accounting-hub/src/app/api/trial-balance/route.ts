import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeTrialBalance } from '@/lib/accounting/trial-balance'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

/**
 * GET /api/trial-balance
 *   Query params (mutually exclusive forms):
 *     asOf=YYYY-MM-DD            point-in-time, includes opening balances of that year
 *     from=YYYY-MM-DD&to=YYYY-MM-DD   period (movements only — opening included if same year as `from`)
 *     branch=ALL|SANDBOX_EAST|SANDBOX_GREENHILLS|VERDANA_STORE
 *     includeZero=true           show every active COA line, even zero-movement
 *
 *   Default: as-of end-of-current-year (full-year cumulative).
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const asOfRaw  = searchParams.get('asOf')
  const fromRaw  = searchParams.get('from')
  const toRaw    = searchParams.get('to')
  const branch   = searchParams.get('branch') || 'ALL'
  const includeZero = searchParams.get('includeZero') === 'true'

  const opts: Parameters<typeof computeTrialBalance>[1] = { branch, includeZeroLines: includeZero }
  if (asOfRaw) {
    opts.asOf = new Date(`${asOfRaw}T23:59:59.999Z`)
  } else if (fromRaw || toRaw) {
    if (fromRaw) opts.from = new Date(`${fromRaw}T00:00:00.000Z`)
    if (toRaw)   opts.to   = new Date(`${toRaw}T23:59:59.999Z`)
  } else {
    // Default: as-of end of current year
    opts.asOf = new Date(`${new Date().getUTCFullYear()}-12-31T23:59:59.999Z`)
  }

  try {
    const tb = await computeTrialBalance(prisma, opts)
    return NextResponse.json(tb)
  } catch (err) {
    console.error('[GET /api/trial-balance]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
