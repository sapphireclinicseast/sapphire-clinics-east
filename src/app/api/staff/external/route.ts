/**
 * External Staff API — Bearer token auth
 *
 * Used by Accounting Hub POS to search clinicians/therapists.
 * Also fetches gov IDs from HR platform for employee sync.
 * Env: EXTERNAL_API_KEY — shared secret token
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY
const HR_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim()
  const branch = searchParams.get('branch')?.toUpperCase()
  const includeHR = searchParams.get('includeHR') === 'true'

  try {
    const staff = await prisma.staff.findMany({
      where: {
        ...(branch ? { branch } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        department: true,
        branch: true,
        jobTitle: true,
        hrPlatformId: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: search ? 20 : 100,
    })

    // If includeHR is requested, fetch gov IDs from HR platform
    if (includeHR && HR_KEY) {
      try {
        const hrRes = await fetch(`${HR_URL}/staff/external`, {
          headers: { Authorization: `Bearer ${HR_KEY}` },
          cache: 'no-store',
        })
        if (hrRes.ok) {
          const hrData = await hrRes.json()
          const hrStaff = hrData.staff || []
          // Build lookup by firstName+lastName
          const hrByName = new Map<string, Record<string, unknown>>()
          for (const h of hrStaff) {
            const key = `${String(h.firstName || '').toUpperCase()}|${String(h.lastName || '').toUpperCase()}`
            hrByName.set(key, h)
          }
          // Merge HR data into staff results
          const enriched = staff.map(s => {
            const key = `${s.firstName.toUpperCase()}|${s.lastName.toUpperCase()}`
            const hr = hrByName.get(key)
            return {
              ...s,
              sss: hr?.sss || null,
              philhealth: hr?.philhealth || null,
              pagibig: hr?.pagibig || null,
              tin: hr?.tin || null,
              hrJobTitle: hr?.jobTitle || null,
              hrEmployeeId: hr?.employeeId || null,
            }
          })
          return NextResponse.json({ staff: enriched })
        }
      } catch (hrErr) {
        console.error('[external-staff] HR fetch error (non-fatal):', hrErr)
      }
    }

    return NextResponse.json({ staff })
  } catch (err) {
    console.error('[external-staff] Query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
