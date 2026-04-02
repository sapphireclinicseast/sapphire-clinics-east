import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// TEMPORARY diagnostic endpoint — remove after fixing auth
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')

  // Simple protection so only we can access this
  if (key !== 'scei-diag-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        passwordHash: true,
        lastLoginAt: true,
        createdAt: true,
      },
    })

    // Test password verification for each user
    const results = await Promise.all(
      users.map(async (u) => {
        const hashPrefix = u.passwordHash.substring(0, 20) + '...'
        const hashLength = u.passwordHash.length
        const matchesSCEI = await bcrypt.compare('SCEI', u.passwordHash)
        const matchesSCEIAccounting = await bcrypt.compare(
          'SCEIAccounting2026!',
          u.passwordHash
        )
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          hashPrefix,
          hashLength,
          matchesSCEI,
          matchesSCEIAccounting,
          lastLoginAt: u.lastLoginAt,
          createdAt: u.createdAt,
        }
      })
    )

    // Also check DB connectivity and table structure
    const tableInfo = await prisma.$queryRaw`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'User'
      ORDER BY ordinal_position
    `

    return NextResponse.json({
      status: 'ok',
      userCount: users.length,
      users: results,
      tableColumns: tableInfo,
      timestamp: new Date().toISOString(),
    })
  } catch (e: unknown) {
    return NextResponse.json(
      {
        status: 'error',
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      },
      { status: 500 }
    )
  }
}
