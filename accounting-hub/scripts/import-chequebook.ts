/**
 * Load a transcribed chequebook into the cheque register.
 *
 * Columns: page,date,cheque_no,payee_particulars,withdrawal,confidence,note
 * The `note` column carries the status the transcription recorded — CANCELLED,
 * UNUSED, or blank for an ordinary issuance.
 *
 *   npx tsx scripts/import-chequebook.ts <csv> <bank account number> [--apply]
 *
 * Without --apply it reports what it would do and writes nothing.
 */
import fs from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { chequeDigits } from '../src/lib/cheque-number'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) })

const [csvPath, acctNumber] = process.argv.slice(2)
const APPLY = process.argv.includes('--apply')

/** Splits a CSV line, honouring "quoted, fields". */
function cells(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (c === ',' && !q) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur); return out
}

/** The transcription's note column decides the leaf's status. */
function statusOf(payee: string, note: string): 'ISSUED' | 'CANCELLED' | 'UNUSED' {
  if (/^UNUSED$/i.test(payee.trim())) return 'UNUSED'
  if (/CANCELLED/i.test(note) || /^CANCELLED/i.test(payee.trim())) return 'CANCELLED'
  return 'ISSUED'
}

/** "2024-09", "2024-10/11" and "2024-09-2?" are all partial — take what is certain. */
function dateOf(raw: string): Date | null {
  const s = (raw || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00.000Z`)
  const m = s.match(/^(\d{4})-(\d{2})/)
  return m ? new Date(`${m[1]}-${m[2]}-01T00:00:00.000Z`) : null
}

async function main() {
  if (!csvPath || !acctNumber) { console.error('usage: import-chequebook.ts <csv> <accountNumber> [--apply]'); process.exit(1) }
  const account = await prisma.account.findFirst({ where: { accountNumber: acctNumber }, select: { id: true, accountNumber: true, accountTitle: true } })
  if (!account) { console.error(`No account ${acctNumber}`); process.exit(1) }

  const lines = fs.readFileSync(csvPath, 'utf8').split('\n').filter(l => l.trim())
  const rows = lines.slice(1).map(cells)

  type Plan = { checkNumber: string; date: Date | null; payee: string; amount: number; status: string; note: string }
  const plans: Plan[] = []
  const skipped: string[] = []

  for (const r of rows) {
    const [, date, chequeNo, payee, withdrawal, , note] = r
    const digits = chequeDigits(chequeNo)
    if (!digits) { skipped.push(`${chequeNo} — not a cheque number`); continue }
    plans.push({
      checkNumber: digits,
      date: dateOf(date),
      payee: (payee || '').trim(),
      amount: Number(withdrawal || 0) || 0,
      status: statusOf(payee || '', note || ''),
      note: (note || '').trim(),
    })
  }

  // The register holds one row per leaf; a repeated number in the source is a
  // transcription problem, not two cheques, so it is reported rather than merged.
  const seen = new Map<string, number>()
  for (const p of plans) seen.set(p.checkNumber, (seen.get(p.checkNumber) || 0) + 1)
  const dupes = [...seen].filter(([, n]) => n > 1)

  const existing = await prisma.issuedCheque.count({ where: { accountId: account.id } })
  const byStatus = plans.reduce<Record<string, number>>((a, p) => ({ ...a, [p.status]: (a[p.status] || 0) + 1 }), {})

  console.log(`account          : ${account.accountNumber} ${account.accountTitle}`)
  console.log(`rows in file     : ${rows.length}`)
  console.log(`to import        : ${plans.length}`)
  console.log(`  by status      : ${Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  console.log(`  total value    : PHP ${plans.reduce((s, p) => s + p.amount, 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`)
  console.log(`skipped          : ${skipped.length}${skipped.length ? ' — ' + skipped.slice(0, 5).join('; ') : ''}`)
  console.log(`duplicate numbers: ${dupes.length}${dupes.length ? ' — ' + dupes.map(([n, c]) => `${n} x${c}`).join(', ') : ''}`)
  console.log(`already in register for this account: ${existing}`)

  if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); return }
  if (dupes.length) { console.error('\nRefusing to import: the file repeats a cheque number. Fix the source first.'); process.exitCode = 1; return }

  let created = 0, updated = 0
  for (const p of plans) {
    const res = await prisma.issuedCheque.upsert({
      where: { accountId_checkNumber: { accountId: account.id, checkNumber: p.checkNumber } },
      update: { date: p.date, payee: p.payee, amount: p.amount, status: p.status, note: p.note || null, source: 'chequebook import' },
      create: { accountId: account.id, checkNumber: p.checkNumber, date: p.date, payee: p.payee, amount: p.amount, status: p.status, note: p.note || null, source: 'chequebook import' },
    })
    if (res.createdAt.getTime() === res.updatedAt.getTime()) created++; else updated++
  }
  console.log(`\nimported: ${created} new, ${updated} updated`)
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
