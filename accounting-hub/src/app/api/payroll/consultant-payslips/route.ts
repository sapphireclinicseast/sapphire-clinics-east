import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

function allowedBranches(role: string): string[] | null {
  if (role === 'SBEA_ADMIN') return ['SBEA', 'VERDANA']
  if (role === 'SBGH_ADMIN') return ['SBGH', 'VERDANA']
  if (role === 'VERDANA_ADMIN') return ['VERDANA']
  return null
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const consultantId = searchParams.get('consultantId') || ''
  const branch = searchParams.get('branch') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (consultantId) where.consultantId = consultantId

  const allowed = allowedBranches(session.user.role as string)
  if (branch) {
    if (allowed && !allowed.includes(branch)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    where.branch = branch
  } else if (allowed) {
    where.branch = { in: allowed }
  }

  const entries = await prisma.payrollEntry.findMany({
    where,
    include: {
      consultant: { select: { id: true, name: true, department: true, branch: true } },
    },
    orderBy: { cutoffPeriod: 'desc' },
    take: 100,
  })

  return NextResponse.json(entries)
}
