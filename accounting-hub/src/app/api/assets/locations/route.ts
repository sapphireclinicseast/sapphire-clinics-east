import { NextResponse } from 'next/server'
import { Branch, Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cleanLocation, type AssetUnit } from '@/lib/asset-units'

// Rooms per branch for the asset Location dropdown (Asset Management → Location
// Settings). Hannah, 2026-11-02.
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const ROOM_BRANCHES: Branch[] = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
// Branch admins set only their own branch's rooms.
const OWN_BRANCH: Record<string, Branch> = { AHEA_ADMIN: 'SANDBOX_EAST', AHGH_ADMIN: 'SANDBOX_GREENHILLS', VERDANA_ADMIN: 'VERDANA_STORE' }

const roomKey = (branch: string, name: string) => `${branch}|${name.toLowerCase()}`

// How many assets (or pieces) sit in each room — a room in use cannot be deleted.
async function roomUsage(branches: Branch[]) {
  const assets = await prisma.asset.findMany({ where: { branch: { in: branches } }, select: { branch: true, location: true, units: true } })
  const usage: Record<string, number> = {}
  for (const a of assets) {
    const rooms = new Set<string>()
    if (a.location) rooms.add(a.location)
    for (const u of (Array.isArray(a.units) ? a.units : []) as AssetUnit[]) if (u?.location) rooms.add(u.location)
    for (const r of rooms) usage[roomKey(a.branch, r)] = (usage[roomKey(a.branch, r)] ?? 0) + 1
  }
  return usage
}

/** GET /api/assets/locations → { locations: [{ id, branch, name, sortOrder, used }] } */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [rows, usage] = await Promise.all([
    prisma.assetLocation.findMany({ orderBy: [{ branch: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] }),
    roomUsage(ROOM_BRANCHES),
  ])
  return NextResponse.json({
    locations: rows.map(r => ({ id: r.id, branch: r.branch, name: r.name, sortOrder: r.sortOrder, used: usage[roomKey(r.branch, r.name)] ?? 0 })),
  })
}

/**
 * PUT /api/assets/locations
 * Body: { branch, rooms: [{ id?, name }] } — the branch's whole list, in order.
 * New rows are added, missing rows deleted (refused while an asset is still in
 * that room), and a renamed room is renamed on every asset and piece in it.
 */
export async function PUT(req: Request) {
  const session = await auth()
  const role = session?.user?.role as string
  if (!session?.user || !WRITE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json().catch(() => null) as { branch?: string; rooms?: { id?: string; name?: string }[] } | null
  const branch = body?.branch as Branch
  if (!ROOM_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Pick a branch' }, { status: 400 })
  if (OWN_BRANCH[role] && OWN_BRANCH[role] !== branch) {
    return NextResponse.json({ error: 'You can only set the rooms of your own branch' }, { status: 403 })
  }

  const rooms = (Array.isArray(body?.rooms) ? body!.rooms : [])
    .map(r => ({ id: typeof r?.id === 'string' ? r.id : null, name: cleanLocation(r?.name) }))
    .filter((r): r is { id: string | null; name: string } => !!r.name)
  const seen = new Set<string>()
  for (const r of rooms) {
    if (seen.has(r.name.toLowerCase())) return NextResponse.json({ error: `"${r.name}" is listed twice` }, { status: 400 })
    seen.add(r.name.toLowerCase())
  }

  const existing = await prisma.assetLocation.findMany({ where: { branch } })
  const byId = new Map(existing.map(r => [r.id, r]))
  const keepIds = new Set(rooms.map(r => r.id).filter(Boolean) as string[])
  const removed = existing.filter(r => !keepIds.has(r.id))
  const renames = new Map<string, string>() // old name → new name
  for (const r of rooms) {
    const old = r.id ? byId.get(r.id) : undefined
    if (old && old.name !== r.name) renames.set(old.name, r.name)
  }

  if (removed.length) {
    const usage = await roomUsage([branch])
    const inUse = removed.filter(r => (usage[roomKey(branch, r.name)] ?? 0) > 0)
    if (inUse.length) {
      return NextResponse.json({
        error: inUse.map(r => `"${r.name}" still has ${usage[roomKey(branch, r.name)]} asset(s)`).join('; ') + ' — move them to another room first.',
      }, { status: 409 })
    }
  }

  // Assets and pieces in a renamed room follow it (all renames at once, so swapping two names is safe).
  const assetUpdates: Prisma.PrismaPromise<unknown>[] = []
  if (renames.size) {
    const assets = await prisma.asset.findMany({ where: { branch }, select: { id: true, location: true, units: true } })
    for (const a of assets) {
      const location = a.location && renames.has(a.location) ? renames.get(a.location)! : a.location
      const units = Array.isArray(a.units) ? (a.units as AssetUnit[]) : null
      const unitsMoved = !!units?.some(u => u?.location && renames.has(u.location))
      if (location === a.location && !unitsMoved) continue
      assetUpdates.push(prisma.asset.update({
        where: { id: a.id },
        data: {
          location,
          ...(unitsMoved ? { units: units!.map(u => (u?.location && renames.has(u.location) ? { ...u, location: renames.get(u.location)! } : u)) as Prisma.InputJsonValue } : {}),
        },
      }))
    }
  }

  await prisma.$transaction([
    prisma.assetLocation.deleteMany({ where: { id: { in: removed.map(r => r.id) } } }),
    // Park every kept row on a unique name first so reordered/swapped names never collide.
    ...rooms.filter(r => r.id && byId.has(r.id)).map(r => prisma.assetLocation.update({ where: { id: r.id! }, data: { name: `__moving__${r.id}` } })),
    ...rooms.map((r, i) => r.id && byId.has(r.id)
      ? prisma.assetLocation.update({ where: { id: r.id }, data: { name: r.name, sortOrder: i } })
      : prisma.assetLocation.create({ data: { branch, name: r.name, sortOrder: i } })),
    ...assetUpdates,
  ])

  return GET()
}
