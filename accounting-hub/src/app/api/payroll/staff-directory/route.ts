import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Accounting's own copy of the staff feed — who we have ever synced, and who has since left.
 *
 * ?status=resigned  only those the feed has dropped or flagged inactive
 * ?status=current   only those still listed
 * ?branch=SBEA      one branch
 */

const READ_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

function allowedBranches(role: string): string[] | null {
  if (role === 'AHEA_ADMIN') return ['SBEA', 'VERDANA']
  if (role === 'AHGH_ADMIN') return ['SBGH', 'VERDANA']
  if (role === 'VERDANA_ADMIN') return ['VERDANA']
  return null
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''
  const branch = searchParams.get('branch') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (status === 'resigned') where.OR = [{ resignedAt: { not: null } }, { activeUpstream: false }]
  if (status === 'current') where.AND = [{ resignedAt: null }, { activeUpstream: true }]

  const allowed = allowedBranches(session.user.role as string)
  if (branch) {
    if (allowed && !allowed.includes(branch)) {
      return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
    }
    where.branch = branch
  } else if (allowed) {
    where.branch = { in: allowed }
  }

  const staff = await prisma.staffDirectory.findMany({
    where,
    orderBy: [{ resignedAt: 'desc' }, { name: 'asc' }],
    take: 500,
  })

  return NextResponse.json(staff)
}
