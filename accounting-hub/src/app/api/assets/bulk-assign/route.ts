import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cleanLocation, type AssetUnit } from '@/lib/asset-units'

// POST { ids: string[], location?, accountableName?, departments? }
// Put the ticked records under one room, one custodian and/or the same departments
// (Hannah 2026-11-04). What is left out stays as it is. It applies to every item of
// a multi-piece record, so an item's own room, custodian or departments give way.
// Custody only: no cost, depreciation or journal entry changes. Something marked
// Missing has no room, so it keeps none.

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const OWN_BRANCH: Record<string, string> = { AHEA_ADMIN: 'SANDBOX_EAST', AHGH_ADMIN: 'SANDBOX_GREENHILLS', VERDANA_ADMIN: 'VERDANA_STORE' }

export async function POST(req: Request) {
  const session = await auth()
  const role = session?.user?.role as string
  if (!session?.user || !WRITE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const ids: string[] = Array.isArray(body.ids) ? [...new Set<string>(body.ids.filter((x: unknown) => typeof x === 'string'))] : []
    const location = cleanLocation(body.location)
    const accountableName = typeof body.accountableName === 'string' ? body.accountableName.trim().slice(0, 200) : ''
    const departments: string[] = Array.isArray(body.departments)
      ? [...new Set<string>(body.departments.filter((d: unknown): d is string => typeof d === 'string').map((d: string) => d.trim()).filter(Boolean))].slice(0, 20)
      : []
    if (ids.length === 0) return NextResponse.json({ error: 'Tick at least one record.' }, { status: 400 })
    if (!location && !accountableName && departments.length === 0) {
      return NextResponse.json({ error: 'Pick a location, an accountable person or departments.' }, { status: 400 })
    }

    const assets = await prisma.asset.findMany({ where: { id: { in: ids } } })
    if (assets.length !== ids.length) return NextResponse.json({ error: 'Some of those assets no longer exist. Refresh and try again.' }, { status: 404 })
    const own = OWN_BRANCH[role]
    if (own && assets.some(a => a.branch !== own)) return NextResponse.json({ error: 'You can only change your own branch\'s assets.' }, { status: 403 })

    // Rooms are per branch: the room must exist at every ticked record's branch.
    if (location) {
      const branches = [...new Set<string>(assets.map(a => a.branch))]
      const rooms = await prisma.assetLocation.findMany({ where: { branch: { in: branches as never[] } }, select: { branch: true, name: true } })
      const lacking = branches.filter(b => !rooms.some(r => r.branch === b && r.name.toUpperCase() === location))
      if (lacking.length) return NextResponse.json({ error: `${location} is not a room of every ticked record's branch.` }, { status: 400 })
    }

    let roomSkipped = 0
    await prisma.$transaction(assets.flatMap(a => {
      const data: Prisma.AssetUpdateInput = {}
      const setRoom = !!location && !a.isMissing
      if (location && a.isMissing) roomSkipped++
      if (setRoom) data.location = location
      if (accountableName) data.accountableName = accountableName
      if (departments.length) data.departments = departments
      if (a.quantity > 1 && Array.isArray(a.units)) {
        data.units = (a.units as unknown as AssetUnit[]).map(u => ({
          ...u,
          ...(setRoom ? { location: null } : {}),
          ...(accountableName ? { accountableName } : {}),
          ...(departments.length ? { departments: null } : {}),
        })) as unknown as Prisma.InputJsonValue
      }
      if (Object.keys(data).length === 0) return []
      return [
        prisma.asset.update({ where: { id: a.id }, data }),
        prisma.auditLog.create({
          data: {
            userId: session.user!.id as string, action: 'BULK_ASSIGN', entity: 'asset', entityId: a.id,
            details: { name: a.name, ...(setRoom ? { location, was: a.location } : {}), ...(accountableName ? { accountableName, wasAccountable: a.accountableName } : {}), ...(departments.length ? { departments, wasDepartments: a.departments as Prisma.InputJsonValue } : {}) },
          },
        }),
      ]
    }))
    return NextResponse.json({ ok: true, updated: assets.length, roomSkipped })
  } catch (e) {
    console.error('Asset bulk assign error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to update the assets' }, { status: 500 })
  }
}
