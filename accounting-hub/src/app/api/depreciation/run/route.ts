import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runDepreciationCatchUp } from '@/lib/accounting/post-depreciation'

const RUN_ROLES = ['ADMIN', 'ACCOUNTANT']

/**
 * POST /api/depreciation/run
 *   body: { fromYear, fromMonth, toYear, toMonth, branch? }
 *
 * Idempotent depreciation catch-up. Posts one JE per (asset, month) for every
 * asset active during the period, skipping months already posted. Safe to run
 * any time; safe to run twice.
 *
 * Defaults: from = current year & month, to = same.
 *
 * Requires ENABLE_GL_POSTING=true (otherwise returns a no-op summary).
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !RUN_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      fromYear?: number; fromMonth?: number
      toYear?: number; toMonth?: number
      branch?: string
    }
    const now = new Date()
    const fromYear  = body.fromYear  ?? now.getUTCFullYear()
    const fromMonth = body.fromMonth ?? (now.getUTCMonth() + 1)
    const toYear    = body.toYear    ?? fromYear
    const toMonth   = body.toMonth   ?? fromMonth
    const branch    = body.branch    || 'ALL'

    const summary = await runDepreciationCatchUp(
      prisma,
      { year: fromYear, month: fromMonth },
      { year: toYear,   month: toMonth   },
      session.user.id,
      branch,
    )

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DEPRECIATION_RUN',
        entity: 'depreciation',
        details: {
          fromYear, fromMonth, toYear, toMonth, branch,
          monthsProcessed: summary.monthsProcessed,
          assetsProcessed: summary.assetsProcessed,
          posted: summary.posted,
          alreadyPosted: summary.alreadyPosted,
          skipped: summary.skipped,
          failureCount: summary.failures.length,
        },
      },
    })

    return NextResponse.json({
      enabled: process.env.ENABLE_GL_POSTING === 'true',
      from: { year: fromYear, month: fromMonth },
      to:   { year: toYear,   month: toMonth   },
      branch,
      ...summary,
    })
  } catch (err) {
    console.error('[POST /api/depreciation/run]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
