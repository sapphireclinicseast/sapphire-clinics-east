// GET /api/public/homecare/cities — active homecare cities and which branches
// currently have upcoming open weekly slots (with free seats) for each. Drives
// the first two steps of the /homecare flow (pick city → pick nearer branch).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { preflight, withCors } from '../../_cors'
import { upcomingOccurrences, type ShortBranch } from '@/lib/homecare'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const cities = await prisma.homecareCity.findMany({ where: { active: true }, orderBy: [{ name: 'asc' }] })

  const result = await Promise.all(
    cities.map(async (c) => {
      const avail = (await upcomingOccurrences(c.id)).filter((o) => o.remaining > 0)
      const branches = Array.from(new Set(avail.map((o) => o.branch))) as ShortBranch[]
      return {
        id: c.id,
        name: c.name,
        province: c.province,
        branches,
        nextDate: avail.length ? avail[0].date : null, // sorted by date
      }
    }),
  )

  return withCors(NextResponse.json({ cities: result }), origin)
}
