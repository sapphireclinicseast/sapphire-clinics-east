// Scholars — approved fellowship scholars pulled LIVE from the scholarship
// portal, with award/disbursement terms managed here.
//   GET  → { scholars (roster ⋈ local award terms), matrix, filters, portalError? }
//   POST → upsert an award's terms (keyed by portalScholarId)
// Access: ADMIN / ACCOUNTANT / BOOKKEEPER.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { reverseEquityJournal } from '@/lib/accounting/equity'
import { scheduleMonths, endMonth, mkLabel } from '@/lib/scholars'

export const dynamic = 'force-dynamic'

const ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const num = (v: unknown) => Number(v || 0)
const SCHOLARSHIP_URL = (process.env.SCHOLARSHIP_URL || process.env.MARKETING_HUB_URL || 'https://scholarship.sapphireclinicseast.org').replace(/\/$/, '')
const KEY = process.env.EXTERNAL_API_KEY || ''

type PortalScholar = { id: string; fullName: string; school: string | null; program: string | null; preferredField: string | null; email: string | null; expectedGraduationYear: number | null; status: string }

async function fetchPortalScholars(): Promise<{ scholars: PortalScholar[]; error: string | null }> {
  try {
    const r = await fetch(`${SCHOLARSHIP_URL}/api/scholars/external`, {
      headers: { Authorization: `Bearer ${KEY}` },
      cache: 'no-store',
    })
    if (!r.ok) return { scholars: [], error: `Portal responded ${r.status}` }
    const j = await r.json()
    return { scholars: Array.isArray(j.scholars) ? j.scholars : [], error: null }
  } catch (e) {
    return { scholars: [], error: e instanceof Error ? e.message : 'Portal unreachable' }
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const [{ scholars: portal, error: portalError }, awards, releases] = await Promise.all([
    fetchPortalScholars(),
    prisma.scholarAward.findMany(),
    prisma.scholarRelease.findMany({ orderBy: { date: 'desc' } }),
  ])

  const awardByPortal = new Map(awards.map(a => [a.portalScholarId, a]))
  const relByAward = new Map<string, typeof releases>()
  for (const r of releases) { const arr = relByAward.get(r.awardId) || []; arr.push(r); relByAward.set(r.awardId, arr) }

  // Primary rows = live portal roster. Append any local award whose portal
  // scholar has since been removed (so recorded history is never lost).
  const seen = new Set<string>()
  const rows = portal.map(p => {
    seen.add(p.id)
    const a = awardByPortal.get(p.id)
    return buildRow(p.id, p.fullName, p.school, p.email, p, a, a ? relByAward.get(a.id) || [] : [])
  })
  for (const a of awards) {
    if (seen.has(a.portalScholarId)) continue
    rows.push(buildRow(a.portalScholarId, a.scholarName, a.school, a.email, null, a, relByAward.get(a.id) || []))
  }

  // Per-month completion matrix across all awards' schedules.
  const dueBy = new Map<string, Set<string>>()   // monthKey -> set of awardIds due
  const paidBy = new Map<string, Set<string>>()  // monthKey -> set of awardIds paid
  for (const a of awards) {
    for (const mk of scheduleMonths(a.startMonth, a.numberOfMonths)) { if (!dueBy.has(mk)) dueBy.set(mk, new Set()); dueBy.get(mk)!.add(a.id) }
  }
  for (const r of releases) { if (!paidBy.has(r.monthKey)) paidBy.set(r.monthKey, new Set()); paidBy.get(r.monthKey)!.add(r.awardId) }
  const monthKeys = [...new Set([...dueBy.keys(), ...paidBy.keys()])].sort()
  const matrix = monthKeys.map(mk => ({
    monthKey: mk, label: mkLabel(mk),
    due: dueBy.get(mk)?.size || 0,
    paid: [...(paidBy.get(mk) || [])].filter(id => dueBy.get(mk)?.has(id) ?? true).length,
  }))

  const filters = {
    academicYears: [...new Set(awards.map(a => a.academicYear).filter(Boolean))].sort(),
    schools: [...new Set(rows.map(r => r.school).filter(Boolean))].sort() as string[],
    types: [...new Set(awards.map(a => a.scholarshipType).filter(Boolean))].sort() as string[],
  }

  return NextResponse.json({ scholars: rows, matrix, filters, portalError, portalConnected: !portalError })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildRow(portalScholarId: string, name: string, school: string | null, email: string | null, p: PortalScholar | null, a: any, rels: any[]) {
  return {
    portalScholarId,
    awardId: a?.id || null,
    name,
    school: school || a?.school || null,
    program: p?.program || null,
    email: email || a?.email || null,
    inPortal: !!p,
    academicYear: a?.academicYear || null,
    scholarshipType: a?.scholarshipType || null,
    amountAwarded: num(a?.amountAwarded),
    monthlyAmount: num(a?.monthlyAmount),
    startMonth: a?.startMonth || null,
    releaseDay: a?.releaseDay ?? null,
    numberOfMonths: a?.numberOfMonths ?? null,
    endMonth: endMonth(a?.startMonth, a?.numberOfMonths),
    signedRsaUrls: (a?.signedRsaUrls as string[] | null) || [],
    bankAccountId: a?.bankAccountId || null,
    expenseAccountId: a?.expenseAccountId || null,
    releasedMonths: rels.map(r => r.monthKey),
    releasedCount: rels.length,
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const b = await req.json()
    const portalScholarId = String(b.portalScholarId || '')
    if (!portalScholarId) return NextResponse.json({ error: 'portalScholarId required' }, { status: 400 })

    const data = {
      scholarName: String(b.scholarName || b.name || ''),
      school: b.school ?? null,
      email: b.email ?? null,
      academicYear: b.academicYear ? String(b.academicYear).trim() : null,
      scholarshipType: b.scholarshipType ? String(b.scholarshipType).trim() : null,
      amountAwarded: num(b.amountAwarded),
      monthlyAmount: num(b.monthlyAmount),
      startMonth: b.startMonth || null,
      releaseDay: b.releaseDay != null && b.releaseDay !== '' ? Math.max(1, Math.min(31, Number(b.releaseDay))) : null,
      numberOfMonths: b.numberOfMonths != null && b.numberOfMonths !== '' ? Math.max(0, Number(b.numberOfMonths)) : null,
      signedRsaUrls: Array.isArray(b.signedRsaUrls) ? b.signedRsaUrls : undefined,
      bankAccountId: b.bankAccountId || null,
      expenseAccountId: b.expenseAccountId || null,
    }

    const saved = await prisma.scholarAward.upsert({
      where: { portalScholarId },
      create: { portalScholarId, ...data, createdById: session.user.id ?? null },
      update: data,
    })
    return NextResponse.json({ id: saved.id })
  } catch (e) {
    console.error('Scholar award upsert error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

// Remove an award's terms + all its recorded releases (JEs reversed). Accepts
// ?id= (awardId) or ?portalScholarId=. The scholar stays in the portal roster.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const sp = new URL(req.url).searchParams
  const id = sp.get('id') || ''
  const portalScholarId = sp.get('portalScholarId') || ''
  if (!id && !portalScholarId) return NextResponse.json({ error: 'id or portalScholarId required' }, { status: 400 })
  const award = await prisma.scholarAward.findFirst({ where: id ? { id } : { portalScholarId }, include: { releases: { select: { id: true } } } })
  if (!award) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.$transaction(async (tx) => {
    for (const r of award.releases) await reverseEquityJournal(tx, 'SCHOLAR_RELEASE', r.id)
    await tx.scholarAward.delete({ where: { id: award.id } }) // releases cascade
  })
  return NextResponse.json({ success: true })
}
