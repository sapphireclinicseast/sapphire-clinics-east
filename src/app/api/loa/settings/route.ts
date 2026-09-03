// GET  /api/loa/settings — the HMO names and services the LOA form offers.
// POST /api/loa/settings — add / rename / retire an entry (admin only).
//
// Two settings-managed lists rather than hardcoded arrays, so the clinic adds a
// provider or a service without a deploy. Branches are deliberately NOT here:
// they come from the HrBranch registry, which syncs from HR Platform, so a new
// clinic appears on its own (see @/lib/branch-options).

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBranchOptions } from '@/lib/branch-options'

const EDIT_ROLES = ['ADMIN', 'MARKETING_ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN']

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Retired entries are still returned to editors so an existing letter that
  // names one keeps rendering its label; the form filters to active itself.
  const [hmos, services, branches] = await Promise.all([
    // Alphabetical, not insertion order: this list is scanned to find a
    // provider by name, and sortOrder only recorded the order rows happened
    // to be created in — seeded ones first, then whatever the wallet sync
    // appended, which reads as unsorted.
    prisma.hmoProvider.findMany({ orderBy: { name: 'asc' } }),
    prisma.loaServiceOption.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    getBranchOptions(),
  ])

  return NextResponse.json({ hmos, services, branches })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!EDIT_ROLES.includes(role))
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { kind, id, name, active, sortOrder } = body as {
    kind?: 'hmo' | 'service'; id?: string; name?: string; active?: boolean; sortOrder?: number
  }
  if (kind !== 'hmo' && kind !== 'service')
    return NextResponse.json({ error: 'kind must be "hmo" or "service"' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model: any = kind === 'hmo' ? prisma.hmoProvider : prisma.loaServiceOption

  try {
    if (id) {
      const data: Record<string, unknown> = {}
      if (typeof name === 'string' && name.trim()) data.name = name.trim()
      if (typeof active === 'boolean') data.active = active
      if (typeof sortOrder === 'number') data.sortOrder = sortOrder
      if (Object.keys(data).length === 0)
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
      return NextResponse.json(await model.update({ where: { id }, data }))
    }

    if (typeof name !== 'string' || !name.trim())
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    // Sort new entries to the end rather than interleaving them by name — the
    // list is ordered the way the clinic reads it, not alphabetically.
    const last = await model.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } })
    return NextResponse.json(await model.create({
      data: { name: name.trim(), sortOrder: (last?.sortOrder ?? 0) + 10 },
    }))
  } catch (err) {
    // The unique index on name is the guard against a duplicate provider
    // appearing twice in the picker; report it as a conflict, not a 500.
    if ((err as { code?: string }).code === 'P2002')
      return NextResponse.json({ error: 'That name already exists' }, { status: 409 })
    console.error('[loa/settings]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
