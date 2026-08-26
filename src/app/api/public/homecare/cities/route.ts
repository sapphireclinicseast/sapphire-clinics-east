// GET /api/public/homecare/cities — active homecare cities and which branches
// currently have upcoming open travel dates for each. Drives the first two
// steps of the /homecare flow (pick city → pick nearer branch).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { preflight, withCors } from '../../_cors'
import { remainingCapacity, type ShortBranch } from '@/lib/homecare'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const cities = await prisma.homecareCity.findMany({
    where: { active: true },
    orderBy: [{ name: 'asc' }],
    include: {
      openDays: {
        where: { disabled: false, date: { gte: today } },
        orderBy: { date: 'asc' },
      },
    },
  })

  const result = await Promise.all(
    cities.map(async (c) => {
      // A branch is offered for a city only if it has at least one upcoming
      // open day with a free seat.
      const branchSet = new Set<ShortBranch>()
      let nextDate: string | null = null
      for (const d of c.openDays) {
        const seats = await remainingCapacity(d.id, d.capacity)
        if (seats > 0) {
          branchSet.add(d.branch as ShortBranch)
          const iso = d.date.toISOString().slice(0, 10)
          if (!nextDate || iso < nextDate) nextDate = iso
        }
      }
      return {
        id: c.id,
        name: c.name,
        province: c.province,
        branches: Array.from(branchSet),
        nextDate,
      }
    }),
  )

  return withCors(NextResponse.json({ cities: result }), origin)
}
