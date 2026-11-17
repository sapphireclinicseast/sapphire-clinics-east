// ── Mark payslips paid when the payment is already in the books ─────────────
// The normal pay flow (POST /api/payroll/salary-payments) posts DR Salaries
// Payable / CR Bank. Some pay is already booked another way: the April 2026
// QuickBooks payroll import (apr26paye1/apr26paye2, DR 4060 / CR BDO), or a
// manual journal. Recording those through the pay flow would book the money a
// second time, so their payslips stayed "unpaid" (Hannah 2026-11-17, East Apr-2).
//
// This records a SalaryPayment with status BOOKED and NO journal entry, links
// the payslips to it and marks them remitted. Bank Rec never offers a BOOKED
// payment as a match (candidates are COMPLETED only), and the expense report
// skips it, since the entry that booked it already carries the money.
// Undo is the payment's "Reverse remittance" in Payment History. It deletes
// the record and un-marks only the payslips linked to it; with no journal
// entry, nothing else changes.
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { rollupSalaryPayable } from '@/lib/payroll/salary-rfp-remit'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

type Row = { id: string; branch: string; cutoffPeriod: string; netPay: number; name: string }

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const payrollEntryIds: string[] = Array.isArray(body.payrollEntryIds) ? body.payrollEntryIds.map(String) : []
    const employeePayslipIds: string[] = Array.isArray(body.employeePayslipIds) ? body.employeePayslipIds.map(String) : []
    const paymentDate = String(body.paymentDate || '')
    const fromAccountId = String(body.fromAccountId || '')
    const bookedBy = String(body.bookedBy || '').trim()
    const note = String(body.notes || '').trim()

    if (!payrollEntryIds.length && !employeePayslipIds.length) return NextResponse.json({ error: 'Select at least one payslip.' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return NextResponse.json({ error: 'Enter the date the pay went out.' }, { status: 400 })
    if (!fromAccountId) return NextResponse.json({ error: 'Choose the bank account the pay went out of.' }, { status: 400 })
    if (bookedBy.length < 4) return NextResponse.json({ error: 'Say which entry already booked this pay (e.g. the QB import or journal reference).' }, { status: 400 })
    const acct = await prisma.account.findUnique({ where: { id: fromAccountId }, select: { id: true } })
    if (!acct) return NextResponse.json({ error: 'That bank account was not found.' }, { status: 400 })

    // Every ticked payslip must be eligible; nothing is skipped quietly.
    const [entries, slips] = await Promise.all([
      payrollEntryIds.length ? prisma.payrollEntry.findMany({
        where: { id: { in: payrollEntryIds } },
        select: { id: true, branch: true, cutoffPeriod: true, netPay: true, status: true, salariesRemitted: true, salaryRfpId: true, consultant: { select: { name: true } } },
      }) : [],
      employeePayslipIds.length ? prisma.employeePayslip.findMany({
        where: { id: { in: employeePayslipIds } },
        select: { id: true, branch: true, cutoffPeriod: true, netPay: true, status: true, salariesRemitted: true, salaryRfpId: true, employee: { select: { firstName: true, lastName: true } } },
      }) : [],
    ])
    const problems: string[] = []
    if (entries.length !== new Set(payrollEntryIds).size || slips.length !== new Set(employeePayslipIds).size) problems.push('some payslips no longer exist')
    const cons: Row[] = []
    for (const e of entries) {
      const name = e.consultant?.name || '—'
      if (e.salariesRemitted) problems.push(`${name} (${e.cutoffPeriod}) is already paid`)
      else if (e.salaryRfpId) problems.push(`${name} (${e.cutoffPeriod}) is in a salary RFP; pay it through the RFP`)
      else if (!['LOCKED', 'FINAL'].includes(e.status)) problems.push(`${name} (${e.cutoffPeriod}) is not locked yet`)
      else cons.push({ id: e.id, branch: e.branch, cutoffPeriod: e.cutoffPeriod, netPay: Number(e.netPay), name })
    }
    const emps: Row[] = []
    for (const p of slips) {
      const name = `${p.employee.lastName}, ${p.employee.firstName}`
      if (p.salariesRemitted) problems.push(`${name} (${p.cutoffPeriod}) is already paid`)
      else if (p.salaryRfpId) problems.push(`${name} (${p.cutoffPeriod}) is in a salary RFP; pay it through the RFP`)
      else if (p.status !== 'LOCKED') problems.push(`${name} (${p.cutoffPeriod}) is not locked yet`)
      else emps.push({ id: p.id, branch: p.branch, cutoffPeriod: p.cutoffPeriod, netPay: Number(p.netPay), name })
    }
    if (problems.length) {
      return NextResponse.json({ error: `Nothing was marked: ${problems.slice(0, 6).join('; ')}${problems.length > 6 ? ` and ${problems.length - 6} more` : ''}.` }, { status: 409 })
    }

    // One record per payslip kind and branch, like a payroll bank batch.
    const groups = new Map<string, { kind: 'CONSULTANT' | 'EMPLOYEE'; branch: string; rows: Row[] }>()
    for (const [kind, rows] of [['CONSULTANT', cons], ['EMPLOYEE', emps]] as const) {
      for (const r of rows) {
        const k = `${kind}|${r.branch}`
        if (!groups.has(k)) groups.set(k, { kind, branch: r.branch, rows: [] })
        groups.get(k)!.rows.push(r)
      }
    }

    const notes = `Already booked — ${bookedBy}${note ? ` | ${note}` : ''}`
    const created = await prisma.$transaction(async (tx) => {
      const out: { id: string; kind: string; branch: string; count: number; total: number }[] = []
      for (const g of groups.values()) {
        const total = Math.round(g.rows.reduce((s, r) => s + r.netPay, 0) * 100) / 100
        const cutoffs = [...new Set(g.rows.map(r => r.cutoffPeriod))].sort()
        const payment = await tx.salaryPayment.create({
          data: {
            paymentDate: new Date(paymentDate),
            totalAmount: total,
            fromAccountId,
            notes,
            paymentType: g.kind,
            cutoffPeriod: cutoffs.join(', '),
            branch: g.branch,
            journalEntryId: null,
            status: 'BOOKED',
            createdById: session.user!.id as string,
          },
        })
        const ids = g.rows.map(r => r.id)
        const where = { id: { in: ids }, salariesRemitted: false, salaryPaymentId: null, salaryRfpId: null }
        const n = g.kind === 'CONSULTANT'
          ? (await tx.payrollEntry.updateMany({ where, data: { salariesRemitted: true, salaryPaymentId: payment.id } })).count
          : (await tx.employeePayslip.updateMany({ where, data: { salariesRemitted: true, salaryPaymentId: payment.id } })).count
        // A payslip paid in the meantime by someone else fails the whole mark.
        if (n !== ids.length) throw new Error('CHANGED')
        for (const c of cutoffs) await rollupSalaryPayable(tx, c, g.branch, g.kind, payment.id)
        out.push({ id: payment.id, kind: g.kind, branch: g.branch, count: n, total })
      }
      return out
    })
    return NextResponse.json({ success: true, payments: created }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'CHANGED') {
      return NextResponse.json({ error: 'Some payslips changed while marking. Nothing was marked. Refresh and try again.' }, { status: 409 })
    }
    console.error('Mark booked error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
