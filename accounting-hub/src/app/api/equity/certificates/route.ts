import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ADMIN = ['ADMIN']
const num = (v: unknown) => Number(v || 0)

/** GET /api/equity/certificates — the stock certificate registry.
 *
 * One row per certificate number, across common (SCEIC), founders (SCEIF) and
 * preferred (SCEIP) series: who holds it, how it got there (original issuance
 * or a deed transfer), and its status. Per series it also reports the numbers
 * that were SKIPPED (never used up to the highest issued) and any DUPLICATES —
 * the two things a paper registry gets wrong first.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user || !ADMIN.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const [commons, preferreds] = await Promise.all([
    prisma.commonShare.findMany({
      include: {
        shareholder: { select: { shNumber: true, name: true } },
        buybacks: { select: { shares: true } },
        transfersOut: { select: { shares: true } },
        transferIn: { include: { fromCommonShare: { include: { shareholder: { select: { shNumber: true, name: true } } } } } },
      },
    }),
    prisma.preferredShare.findMany({
      include: { shareholder: { select: { shNumber: true, name: true } } },
    }),
  ])

  interface CertRow {
    certNo: string; series: string; seq: number | null
    kind: 'COMMON' | 'PREFERRED'
    shNumber: string; holder: string
    shares: number; netShares: number
    shareClass: string | null; dateAcquired: Date
    status: 'ACTIVE' | 'RETIRED' | 'RESCINDED'
    viaTransferFrom: string | null
  }
  const parse = (certNo: string) => {
    const m = certNo.trim().toUpperCase().match(/^([A-Z]+)[-\s]?(\d+)$/)
    return m ? { series: m[1], seq: parseInt(m[2], 10) } : { series: 'OTHER', seq: null as number | null }
  }

  const certs: CertRow[] = []
  let uncertifiedCommon = 0, uncertifiedPreferred = 0
  for (const c of commons) {
    const net = num(c.numberOfShares)
      - c.buybacks.reduce((s, b) => s + num(b.shares), 0)
      - c.transfersOut.reduce((s, t) => s + num(t.shares), 0)
    if (!c.stockCertNumber?.trim()) { if (!c.rescinded && net > 1e-9) uncertifiedCommon++; continue }
    const { series, seq } = parse(c.stockCertNumber)
    certs.push({
      certNo: c.stockCertNumber.trim(), series, seq, kind: 'COMMON',
      shNumber: c.shareholder.shNumber, holder: c.shareholder.name,
      shares: num(c.numberOfShares), netShares: net,
      shareClass: c.shareClass, dateAcquired: c.dateAcquired,
      status: c.rescinded ? 'RESCINDED' : net <= 1e-9 ? 'RETIRED' : 'ACTIVE',
      viaTransferFrom: c.transferIn ? `${c.transferIn.fromCommonShare.shareholder.shNumber} ${c.transferIn.fromCommonShare.shareholder.name}` : null,
    })
  }
  for (const p of preferreds) {
    const net = num(p.numberOfShares) - num(p.retiredShares)
    if (!p.stockCertNumber?.trim()) { if (net > 1e-9) uncertifiedPreferred++; continue }
    const { series, seq } = parse(p.stockCertNumber)
    certs.push({
      certNo: p.stockCertNumber.trim(), series, seq, kind: 'PREFERRED',
      shNumber: p.shareholder.shNumber, holder: p.shareholder.name,
      shares: num(p.numberOfShares), netShares: net,
      shareClass: p.shareClass, dateAcquired: p.dateAcquired,
      status: net <= 1e-9 ? 'RETIRED' : 'ACTIVE',
      viaTransferFrom: null,
    })
  }

  const SERIES_LABEL: Record<string, string> = {
    SCEIC: 'Common (SCEIC)', SCEIF: 'Founders (SCEIF)', SCEIP: 'Preferred (SCEIP)', OTHER: 'Other formats',
  }
  const bySeries = new Map<string, CertRow[]>()
  for (const c of certs) {
    if (!bySeries.has(c.series)) bySeries.set(c.series, [])
    bySeries.get(c.series)!.push(c)
  }
  const series = [...bySeries.entries()].map(([code, rows]) => {
    rows.sort((a, b) => (a.seq ?? 1e9) - (b.seq ?? 1e9) || a.certNo.localeCompare(b.certNo))
    const seqs = rows.map(r => r.seq).filter((v): v is number => v != null)
    const maxSeq = seqs.length ? Math.max(...seqs) : 0
    const present = new Set(seqs)
    const missing: number[] = []
    for (let i = 1; i <= maxSeq; i++) if (!present.has(i)) missing.push(i)
    const counts = new Map<number, number>()
    for (const q of seqs) counts.set(q, (counts.get(q) || 0) + 1)
    const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([q]) => q).sort((a, b) => a - b)
    // The number to put on the next certificate in this series. Gaps below the
    // highest are deliberately NOT reused — a skipped number may belong to a
    // cancelled or unrecorded paper cert.
    const nextNo = `${code}-${String(maxSeq + 1).padStart(4, '0')}`
    return { code, label: SERIES_LABEL[code] || code, count: rows.length, maxSeq, missing, duplicates, nextNo, certs: rows }
  }).sort((a, b) => a.code.localeCompare(b.code))

  return NextResponse.json({ series, uncertifiedCommon, uncertifiedPreferred })
}
