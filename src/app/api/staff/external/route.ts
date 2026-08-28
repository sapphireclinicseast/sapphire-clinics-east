/**
 * External Staff API — Bearer token auth
 *
 * Used by Accounting Hub POS to search clinicians/therapists.
 * Env: EXTERNAL_API_KEY — shared secret token
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim()
  const branch = searchParams.get('branch')?.toUpperCase()
  // includeHR=true signals a full-sync request (no result cap) rather than a search-autocomplete call
  const isFullSync = searchParams.get('includeHR') === 'true'

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
        firstName: true,
        lastName: true,
        department: true,
        branch: true,
        jobTitle: true,
        employmentType: true,
        email: true,
        phone: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      // Full-sync calls (includeHR=true) get all records with no cap.
      // Autocomplete searches are capped at 20.
      ...(isFullSync ? {} : { take: search ? 20 : 100 }),
    })

    return NextResponse.json({ staff })
  } catch (err) {
    console.error('[external-staff] Query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
