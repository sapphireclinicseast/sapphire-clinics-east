import { getSessionProvider } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeSplit } from '@/lib/earnings'
import { payoutSummary, nextPayoutRun } from '@/lib/payout-summary'

export const dynamic = 'force-dynamic'

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`
const fmt = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
const fmtLong = (d: Date) => d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })
const netOf = (b: { amount: unknown; providerNet: unknown }) => b.providerNet != null ? Number(b.providerNet) : computeSplit(Number(b.amount)).net

const LEDGER_LABEL: Record<string, string> = { EARNING: 'Session completed', PAYOUT: 'Paid out', ADJUSTMENT: 'Adjustment' }

export default async function SettlementsPage() {
  const provider = await getSessionProvider()
  if (!provider) return null

  const [escrowRows, pendingAgg, txns] = await Promise.all([
    // Paid but not yet completed → money held, not yet earned.
    prisma.booking.findMany({ where: { providerId: provider.id, status: { in: ['PAID', 'CONFIRMED'] }, paidAt: { not: null }, refundedAt: null }, select: { amount: true, providerNet: true } }),
    prisma.booking.aggregate({ where: { providerId: provider.id, status: 'PENDING' }, _sum: { amount: true } }),
    prisma.walletTransaction.findMany({ where: { providerId: provider.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
  ])

  const summary = await payoutSummary({ providerId: provider.id })
  const nextRun = nextPayoutRun()
  const inEscrow = escrowRows.reduce((s, b) => s + netOf(b), 0)
  const pendingClearing = Number(pendingAgg._sum.amount ?? 0)
  const paidOut = txns.filter((t) => t.type === 'PAYOUT').reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

  const bank = provider.bankName ? `${provider.bankName} ${provider.bankAccountNo ? '•••• ' + String(provider.bankAccountNo).slice(-4) : ''}` : provider.gcashNumber ? `GCash •••• ${String(provider.gcashNumber).slice(-4)}` : 'not set'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold text-[color:var(--ink)]">Your Nickel wallet</h1>
        <p className="mt-0.5 text-[13px] text-[color:var(--slate)]">Nickel is currently <b>free to use</b> — you receive your full rate, <b>net of PayMongo payment fees only</b> (these vary by how the patient paid — see the calculator in Settings). Your net is <b>released to your wallet once you mark a visit completed</b>, then paid out to <b>{bank}</b>.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card"><div className="text-[12px] font-semibold text-[color:var(--muted)]">Available now</div><div className="mt-1 text-[26px] font-bold text-[color:var(--steel)]">{peso(summary.available)}</div><div className="text-[12px] text-[color:var(--slate)]">matured — pays out next run</div></div>
        <div className="card"><div className="text-[12px] font-semibold text-[color:var(--muted)]">Maturing</div><div className="mt-1 text-[26px] font-bold text-[color:var(--ink)]">{peso(summary.maturing)}</div><div className="text-[12px] text-[color:var(--slate)]">{summary.nextEligibleAt ? `available from ${fmt(summary.nextEligibleAt)}` : 'clearing period'}</div></div>
        <div className="card"><div className="text-[12px] font-semibold text-[color:var(--muted)]">Held (awaiting visit)</div><div className="mt-1 text-[26px] font-bold text-[color:var(--ink)]">{peso(inEscrow)}</div><div className="text-[12px] text-[color:var(--slate)]">paid, releases when completed</div></div>
      </div>

      <div className="card flex flex-wrap items-center gap-3 border-[color:var(--sky)] bg-[color:var(--mist)]">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[color:var(--steel)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-[color:var(--ink)]">Next payout · {fmtLong(nextRun)}</div>
          <div className="text-[12.5px] text-[color:var(--slate)]">
            {summary.available > 0
              ? <><b className="text-[color:var(--ink)]">{peso(summary.available)}</b> will be sent to your {provider.payoutMethod === 'gcash' ? 'GCash' : 'bank account'}.</>
              : 'No matured earnings yet — completed sessions become payable about 10 days after completion (payment settlement + a short hold).'}
            {summary.maturing > 0 && <> {peso(summary.maturing)} more is still maturing.</>}
          </div>
        </div>
      </div>

      {(pendingClearing > 0 || paidOut > 0) && (
        <p className="text-[12px] text-[color:var(--muted)]">{paidOut > 0 && <>Paid out all-time: {peso(paidOut)}. </>}{pendingClearing > 0 && <>Plus {peso(pendingClearing)} in visits still awaiting patient payment.</>}</p>
      )}

      <div className="card p-0">
        <div className="border-b border-[color:var(--line)] px-5 py-3.5"><b className="text-[color:var(--ink)]">Wallet activity</b></div>
        {txns.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-[color:var(--slate)]">No activity yet. When you complete a visit, your net earnings appear here.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
              <th className="px-5 py-2 font-semibold">Date</th><th className="px-3 py-2 font-semibold">Activity</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th><th className="px-3 py-2 text-right font-semibold">Balance</th></tr></thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id} className="border-t border-[color:var(--line)]">
                  <td className="px-5 py-3 tabular-nums text-[color:var(--slate)]">{fmt(t.createdAt)}</td>
                  <td className="px-3 py-3">{t.note || LEDGER_LABEL[t.type] || t.type}</td>
                  <td className={`px-3 py-3 text-right font-semibold tabular-nums ${Number(t.amount) < 0 ? 'text-[color:var(--slate)]' : 'text-emerald-700'}`}>{Number(t.amount) < 0 ? '−' : '+'}{peso(Math.abs(Number(t.amount)))}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[color:var(--slate)]">{t.balance != null ? peso(Number(t.balance)) : ''}</td>
                </tr>
              ))}
            </tbody></table></div>
        )}
      </div>
    </div>
  )
}
