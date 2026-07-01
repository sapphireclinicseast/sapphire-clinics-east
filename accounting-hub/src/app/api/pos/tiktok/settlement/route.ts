import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

// POST { rows:[{orderId, settlement, totalFees, cwt, settledDate}], feesAccountId,
//        cwtAccountId, bankAccountId, clearingAccountId, branch }
// Books each TikTok settlement: Dr Bank (net) + Dr Marketplace Fees + Dr CWT ;
// Cr TikTok Clearing (gross = what the sale lodged). Also drops a matched bank
// transaction so bank reconciliation sees the deposit. Idempotent per order.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { rows, cwtRows, feesAccountId, cwtAccountId, bankAccountId, clearingAccountId, branch } = await req.json()
    if ((!Array.isArray(rows) || rows.length === 0) && (!Array.isArray(cwtRows) || cwtRows.length === 0)) return NextResponse.json({ error: 'No settlement rows' }, { status: 400 })
    if (!feesAccountId || !bankAccountId || !clearingAccountId) return NextResponse.json({ error: 'Marketplace Fees, Bank, and Clearing accounts are required' }, { status: 400 })

    let created = 0, skipped = 0, cwtBooked = 0
    const errors: string[] = []

    // Withholding-tax adjustment rows (Transaction type "Withholding tax"): Dr CWT / Cr Bank.
    for (const w of (Array.isArray(cwtRows) ? cwtRows : [])) {
      const adjId = String(w.adjId || '').trim()
      const amt = Math.abs(Number(w.amount) || 0)
      if (!adjId || amt <= 0) continue
      if (!cwtAccountId) { errors.push(`${adjId}: withholding tax present but no CWT account chosen`); continue }
      try {
        const ex = await prisma.journalEntry.findFirst({ where: { referenceType: 'TIKTOK_WHT', referenceId: adjId }, select: { id: true } })
        if (ex) { skipped++; continue }
        const d = w.settledDate ? new Date(w.settledDate) : new Date()
        await prisma.$transaction(async (tx) => {
          await tx.journalEntry.create({ data: {
            entryDate: d, description: `TikTok creditable withholding tax — ${adjId}`, referenceType: 'TIKTOK_WHT', referenceId: adjId,
            totalAmount: amt, branch: branch || 'VERDANA_STORE', createdById: session.user!.id as string,
            lines: { create: [ { accountId: cwtAccountId, debit: amt, credit: 0, description: 'Creditable withholding tax (TikTok)' }, { accountId: bankAccountId, debit: 0, credit: amt, description: 'TikTok withholding — reduced payout' } ] },
          } })
          await tx.bankTransaction.create({ data: { bankAccountId, date: d, description: `TikTok withholding tax · ${adjId}`, spent: amt, received: 0, status: 'POSTED', matchType: 'TIKTOK_WHT', matchId: adjId, matchLabel: `TikTok WHT ${adjId}`, fromToName: 'TikTok Shop', createdById: session.user!.id ?? null } })
        })
        cwtBooked++
      } catch (e) { errors.push(`${adjId}: ${e instanceof Error ? e.message : 'failed'}`) }
    }
    for (const r of (Array.isArray(rows) ? rows : [])) {
      const orderId = String(r.orderId || '').trim()
      if (!orderId) continue
      const settlement = Number(r.settlement) || 0
      const fees = Number(r.totalFees) || 0     // positive magnitude
      const cwt = Number(r.cwt) || 0            // positive magnitude
      const gross = settlement + fees + cwt
      if (gross <= 0) { skipped++; continue }
      if (cwt > 0 && !cwtAccountId) { errors.push(`${orderId}: CWT present but no CWT account chosen`); continue }
      try {
        const exists = await prisma.journalEntry.findFirst({ where: { referenceType: 'TIKTOK_SETTLEMENT', referenceId: orderId }, select: { id: true } })
        if (exists) { skipped++; continue }
        const entryDate = r.settledDate ? new Date(r.settledDate) : new Date()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lines: any[] = [
          { accountId: bankAccountId, debit: settlement, credit: 0, description: 'TikTok settlement deposit' },
          { accountId: feesAccountId, debit: fees, credit: 0, description: 'TikTok marketplace fees' },
        ]
        if (cwt > 0) lines.push({ accountId: cwtAccountId, debit: cwt, credit: 0, description: 'Creditable withholding tax (TikTok)' })
        lines.push({ accountId: clearingAccountId, debit: 0, credit: gross, description: 'TikTok clearing (order proceeds)' })
        await prisma.$transaction(async (tx) => {
          await tx.journalEntry.create({
            data: {
              entryDate, description: `TikTok settlement — order ${orderId}`, referenceType: 'TIKTOK_SETTLEMENT', referenceId: orderId,
              totalAmount: gross, branch: branch || 'VERDANA_STORE', createdById: session.user!.id as string,
              lines: { create: lines.filter(l => l.debit > 0 || l.credit > 0) },
            },
          })
          await tx.bankTransaction.create({
            data: {
              bankAccountId, date: entryDate, description: `TikTok settlement · order ${orderId}`,
              spent: 0, received: settlement, status: 'POSTED', matchType: 'TIKTOK_SETTLEMENT', matchId: orderId,
              matchLabel: `TikTok order ${orderId}`, fromToName: 'TikTok Shop', createdById: session.user!.id ?? null,
            },
          })
        })
        created++
      } catch (e) { errors.push(`${orderId}: ${e instanceof Error ? e.message : 'failed'}`) }
    }
    return NextResponse.json({ created, skipped, cwtBooked, errors })
  } catch (e) {
    console.error('TikTok settlement error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
