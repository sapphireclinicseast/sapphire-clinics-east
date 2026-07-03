import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

// Assets in scope for an audit: branch match (or ALL) + department intersection
// (or all departments when none are selected).
async function scopedAssets(branch: string, departments: string[]) {
  const where = branch && branch !== 'ALL' ? { branch: branch as never } : {}
  const assets = await prisma.asset.findMany({ where, orderBy: { controlNumber: 'asc' } })
  if (!departments.length) return assets
  const sel = new Set(departments)
  return assets.filter(a => {
    const deps = Array.isArray(a.departments) ? (a.departments as string[]) : []
    return deps.some(d => sel.has(d))
  })
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (id) {
    const a = await prisma.assetAudit.findUnique({ where: { id }, include: { items: { orderBy: { controlNumber: 'asc' } } } })
    if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // Attach each asset's current main photo (live lookup, so it works for older
    // audits too) to make the classification grid easier to fill out.
    const assets = await prisma.asset.findMany({ where: { id: { in: a.items.map(i => i.assetId) } }, select: { id: true, photoUrl: true, photoUrls: true } })
    const photoBy = new Map(assets.map(x => [x.id, (Array.isArray(x.photoUrls) && x.photoUrls.length ? (x.photoUrls as string[])[0] : x.photoUrl) || null]))
    return NextResponse.json({ ...a, items: a.items.map(i => ({ ...i, photoUrl: photoBy.get(i.assetId) || null })) })
  }
  const audits = await prisma.assetAudit.findMany({ orderBy: { createdAt: 'desc' }, include: { items: { select: { needsReplacement: true, usable: true } } } })
  return NextResponse.json(audits.map(a => ({
    id: a.id, refNumber: a.refNumber, dateFrom: a.dateFrom, dateTo: a.dateTo, auditorName: a.auditorName,
    branch: a.branch, departments: a.departments, status: a.status, finalizedAt: a.finalizedAt, createdAt: a.createdAt,
    itemCount: a.items.length,
    replacementCount: a.items.filter(i => i.needsReplacement).length,
    assessedCount: a.items.filter(i => i.usable !== null).length,
  })))
}

// POST — create a new audit; snapshots the in-scope assets as items.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { dateFrom, dateTo, auditorName, branch, departments } = await req.json()
    if (!dateFrom || !dateTo || !auditorName?.trim() || !branch) {
      return NextResponse.json({ error: 'Date range, auditor and branch are required' }, { status: 400 })
    }
    const deps: string[] = Array.isArray(departments) ? departments : []
    const assets = await scopedAssets(branch, deps)
    if (assets.length === 0) return NextResponse.json({ error: 'No assets match those filters' }, { status: 400 })

    const created = await prisma.$transaction(async (tx) => {
      const yy = new Date().getFullYear() % 100
      const prefix = `AUDIT-${yy}-`
      const last = await tx.assetAudit.findFirst({ where: { refNumber: { startsWith: prefix } }, orderBy: { refSeq: 'desc' } })
      const seq = (last?.refSeq || 0) + 1
      const refNumber = `${prefix}${String(seq).padStart(4, '0')}`
      return tx.assetAudit.create({
        data: {
          refNumber, refSeq: seq, dateFrom: new Date(dateFrom), dateTo: new Date(dateTo),
          auditorName: auditorName.trim(), branch, departments: deps, createdById: session.user!.id ?? null,
          items: {
            create: assets.map(a => ({
              assetId: a.id, assetName: a.name, controlNumber: a.controlNumber,
              classification: a.classification, accountableName: a.accountableName,
            })),
          },
        },
        include: { items: true },
      })
    })
    return NextResponse.json(created)
  } catch (e) {
    console.error('Asset audit create error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create audit' }, { status: 500 })
  }
}

// PUT ?id= — save progress, or finalize (action:'finalize').
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    const audit = await prisma.assetAudit.findUnique({ where: { id } })
    if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (audit.status === 'FINALIZED') return NextResponse.json({ error: 'This audit is finalized and locked' }, { status: 409 })

    const body = await req.json()
    const { items, proofUrls, auditorName, action } = body

    if (Array.isArray(items)) {
      for (const it of items) {
        if (!it.id) continue
        await prisma.assetAuditItem.update({
          where: { id: it.id },
          data: {
            usable: it.usable === null || it.usable === undefined ? null : !!it.usable,
            needsReplacement: !!it.needsReplacement,
            remarks: it.remarks?.trim() || null,
          },
        })
      }
    }
    await prisma.assetAudit.update({
      where: { id },
      data: {
        proofUrls: Array.isArray(proofUrls) ? proofUrls : undefined,
        auditorName: auditorName?.trim() || audit.auditorName,
        ...(action === 'finalize' ? { status: 'FINALIZED', finalizedAt: new Date() } : {}),
      },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Asset audit update error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to save' }, { status: 500 })
  }
}

// DELETE ?id= — remove a draft audit.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const audit = await prisma.assetAudit.findUnique({ where: { id } })
  if (audit?.status === 'FINALIZED') return NextResponse.json({ error: 'Cannot delete a finalized audit' }, { status: 409 })
  await prisma.assetAudit.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
