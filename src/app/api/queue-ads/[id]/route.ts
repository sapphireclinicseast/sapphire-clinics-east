import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { unlink } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads')

// ── DELETE — remove an ad ─────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const ad = await prisma.queueAd.findUnique({ where: { id } })
  if (!ad) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Delete from filesystem
  try { await unlink(path.join(UPLOAD_DIR, ad.filePath)) } catch { /* ignore if already gone */ }

  await prisma.queueAd.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

// ── PATCH — reorder (move up/down) OR update branch ──────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  // Branch update
  if (body.branch !== undefined) {
    await prisma.queueAd.update({ where: { id }, data: { branch: body.branch } })
    return NextResponse.json({ ok: true })
  }

  // Reorder (move up/down)
  const { direction } = body // 'up' | 'down'
  const all = await prisma.queueAd.findMany({ orderBy: { order: 'asc' } })
  const idx = all.findIndex(a => a.id === id)
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= all.length) return NextResponse.json({ ok: true }) // nothing to do

  // Swap order values
  await prisma.$transaction([
    prisma.queueAd.update({ where: { id: all[idx].id },     data: { order: all[swapIdx].order } }),
    prisma.queueAd.update({ where: { id: all[swapIdx].id }, data: { order: all[idx].order } }),
  ])

  return NextResponse.json({ ok: true })
}
