import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { promises as fs } from 'fs'
import path from 'path'

/**
 * Payroll → Service Invoice → BIR 2307 Generator (migrated from the HR hub).
 *
 *   GET  ?mode=settings                 → per-branch payor settings (defaults baked in)
 *   POST { branch, ...fields }          → upsert one branch's payor settings
 *   GET  ?mode=amounts&consultantId=&from=YYYY-MM-DD&to=YYYY-MM-DD
 *        → per-month gross/EWT from finalized payroll entries in the period
 *          (the generator pre-fills the income table with these; the user can
 *          override every figure before generating the PDF)
 *   GET  ?mode=asset&name=template|signature
 *        → the BIR 2307 form template / signatory e-signature. Served HERE,
 *          behind auth, instead of from public/ — the signatory's e-signature
 *          must never be fetchable without a session.
 */

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

// Served until a branch's row is first saved — carried over from the HR hub's
// 2307 Payor Settings so the generator works day one.
const DEFAULTS: Record<string, { payorName: string; payorTin: string; payorAddress: string; payorZip: string; signatoryName: string; signatoryTitle: string }> = {
  SBEA: {
    payorName: 'SAPPHIRE CLINICS EAST INCORPORATED', payorTin: '010-817-642-00000',
    payorAddress: 'UNITS L4205, L4203, L4201, L4199, L4168, L4166, L4164 4TH FLOOR ROBINSONS METRO EAST MARCOS HIGHWAY DELA PAZ CITY OF PASIG',
    payorZip: '1600', signatoryName: 'HANNAH JARA', signatoryTitle: '(CEO AND PRESIDENT)',
  },
  SBGH: {
    payorName: 'SAPPHIRE CLINICS EAST INCORPORATED', payorTin: '010-817-642-00001',
    payorAddress: 'GHT1-08L LEVEL A GH TOWER OFFICES SOUTH DRIVE ORTIGAS AVE GREENHILLS SAN JUAN CITY',
    payorZip: '1502', signatoryName: 'HANNAH JARA', signatoryTitle: '(CEO AND PRESIDENT)',
  },
  VERDANA: {
    payorName: 'SAPPHIRE CLINICS EAST INCORPORATED', payorTin: '010-817-642-00000',
    payorAddress: 'UNITS L4205, L4203, L4201, L4199, L4168, L4166, L4164 4TH FLOOR ROBINSONS METRO EAST MARCOS HIGHWAY DELA PAZ CITY OF PASIG',
    payorZip: '1600', signatoryName: 'HANNAH JARA', signatoryTitle: '(CEO AND PRESIDENT)',
  },
}
const BRANCH_KEYS = Object.keys(DEFAULTS)

const ASSETS: Record<string, { file: string; type: string }> = {
  template: { file: 'bir2307-template.pdf', type: 'application/pdf' },
  signature: { file: 'bir2307-signature.png', type: 'image/png' },
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') || 'settings'

  if (mode === 'asset') {
    const asset = ASSETS[url.searchParams.get('name') || '']
    if (!asset) return NextResponse.json({ error: 'Unknown asset' }, { status: 404 })
    try {
      const bytes = await fs.readFile(path.join(process.cwd(), 'server-assets', asset.file))
      return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': asset.type, 'Cache-Control': 'private, max-age=3600' } })
    } catch {
      return NextResponse.json({ error: 'Asset not found on server' }, { status: 404 })
    }
  }

  if (mode === 'amounts') {
    const consultantId = url.searchParams.get('consultantId') || ''
    const from = url.searchParams.get('from') || ''
    const to = url.searchParams.get('to') || ''
    if (!consultantId || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: 'consultantId, from and to are required' }, { status: 400 })
    }
    // The months the period touches, oldest first, capped at the form's three columns.
    const months: string[] = []
    let [y, m] = [parseInt(from.slice(0, 4)), parseInt(from.slice(5, 7))]
    const endKey = to.slice(0, 7)
    while (months.length < 3) {
      const key = `${y}-${String(m).padStart(2, '0')}`
      months.push(key)
      if (key >= endKey) break
      m++; if (m > 12) { m = 1; y++ }
    }
    // Finalized figures only — the certificate must state what payroll actually withheld.
    const entries = await prisma.payrollEntry.findMany({
      where: {
        consultantId,
        status: { in: ['LOCKED', 'FINAL'] },
        OR: months.map(k => ({ cutoffPeriod: { startsWith: k } })),
      },
      select: { cutoffPeriod: true, grossPay: true, taxAmount: true },
    })
    const byMonth = months.map(k => {
      const rows = entries.filter(e => e.cutoffPeriod.startsWith(k))
      return {
        month: k,
        gross: Math.round(rows.reduce((s, e) => s + Number(e.grossPay), 0) * 100) / 100,
        tax: Math.round(rows.reduce((s, e) => s + Number(e.taxAmount), 0) * 100) / 100,
        entries: rows.length,
      }
    })
    return NextResponse.json({ months: byMonth })
  }

  // mode=settings
  const rows = await prisma.bir2307Settings.findMany()
  const byBranch = new Map(rows.map(r => [r.branch, r]))
  const settings = Object.fromEntries(BRANCH_KEYS.map(b => {
    const r = byBranch.get(b)
    const d = DEFAULTS[b]
    return [b, {
      payorName: r?.payorName ?? d.payorName,
      payorTin: r?.payorTin ?? d.payorTin,
      payorAddress: r?.payorAddress ?? d.payorAddress,
      payorZip: r?.payorZip ?? d.payorZip,
      signatoryName: r?.signatoryName ?? d.signatoryName,
      signatoryTitle: r?.signatoryTitle ?? d.signatoryTitle,
    }]
  }))
  return NextResponse.json({ settings })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const b = await req.json()
  const branch = String(b.branch || '')
  if (!BRANCH_KEYS.includes(branch)) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
  const data = {
    payorName: String(b.payorName || '').trim() || null,
    payorTin: String(b.payorTin || '').trim() || null,
    payorAddress: String(b.payorAddress || '').trim() || null,
    payorZip: String(b.payorZip || '').trim() || null,
    signatoryName: String(b.signatoryName || '').trim() || null,
    signatoryTitle: String(b.signatoryTitle || '').trim() || null,
  }
  const row = await prisma.bir2307Settings.upsert({ where: { branch }, update: data, create: { branch, ...data } })
  return NextResponse.json({ ok: true, settings: row })
}
