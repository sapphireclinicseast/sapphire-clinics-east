import { getSessionProvider } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeSplit, weekLabel } from '@/lib/earnings'

export const dynamic = 'force-dynamic'

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`

export default async function SettlementsPage() {
  const provider = await getSessionProvider()
  if (!provider) return null

  const [paid, pendingAgg] = await Promise.all([
    prisma.booking.findMany({
      where: { providerId: provider.id, status: 'PAID', paidAt: { not: null } },
      orderBy: { paidAt: 'desc' },
    }),
    prisma.booking.aggregate({ where: { providerId: provider.id, status: 'PENDING' }, _sum: { amount: true } }),
  ])

  const split = (b: { amount: unknown; providerNet: unknown; platformFee: unknown; withholdingTax: unknown }) => {
    if (b.providerNet != null) return { gross: Number(b.amount), fee: Number(b.platformFee ?? 0), cwt: Number(b.withholdingTax ?? 0), net: Number(b.providerNet) }
    return computeSplit(Number(b.amount))
  }

  let available = 0, paidOut = 0
  const weeks = new Map<string, { label: string; sessions: number; gross: number; fee: number; cwt: number; net: number; allPaid: boolean }>()
  for (const b of paid) {
    const s = split(b)
    if (b.payoutStatus === 'PAID') paidOut += s.net; else available += s.net
    const { key, label } = weekLabel(b.paidAt as Date)
    const w = weeks.get(key) ?? { label, sessions: 0, gross: 0, fee: 0, cwt: 0, net: 0, allPaid: true }
    w.sessions++; w.gross += s.gross; w.fee += s.fee; w.cwt += s.cwt; w.net += s.net
    if (b.payoutStatus !== 'PAID') w.allPaid = false
    weeks.set(key, w)
  }
  const weekRows = [...weeks.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([, w]) => w)
  const pendingClearing = Number(pendingAgg._sum.amount ?? 0)

  const bank = provider.bankName ? `${provider.bankName} ${provider.bankAccountNo ? '•••• ' + String(provider.bankAccountNo).slice(-4) : ''}` : provider.gcashNumber ? `GCash •••• ${String(provider.gcashNumber).slice(-4)}` : 'not set'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold text-[color:var(--ink)]">Your wallet &amp; payouts</h1>
        <p className="mt-0.5 text-[13px] text-[color:var(--slate)]">Nickel keeps 15%, and 5% creditable withholding tax is withheld (BIR 2307 issued). You&apos;re paid the rest, weekly, to <b>{bank}</b>.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card"><div className="text-[12px] font-semibold text-[color:var(--muted)]">Available balance</div><div className="mt-1 text-[26px] font-bold text-[color:var(--steel)]">{peso(available)}</div><div className="text-[12px] text-[color:var(--slate)]">from paid, un-settled visits</div></div>
        <div className="card"><div className="text-[12px] font-semibold text-[color:var(--muted)]">Pending clearing</div><div className="mt-1 text-[26px] font-bold text-[color:var(--ink)]">{peso(pendingClearing)}</div><div className="text-[12px] text-[color:var(--slate)]">awaiting patient payment</div></div>
        <div className="card"><div className="text-[12px] font-semibold text-[color:var(--muted)]">Paid out (all time)</div><div className="mt-1 text-[26px] font-bold text-[color:var(--ink)]">{peso(paidOut)}</div><div className="text-[12px] text-[color:var(--slate)]">settled to your account</div></div>
      </div>

      <div className="card p-0">
        <div className="border-b border-[color:var(--line)] px-5 py-3.5"><b className="text-[color:var(--ink)]">Weekly settlements</b></div>
        {weekRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-[color:var(--slate)]">No earnings yet. Once a patient pays for a visit, it shows here.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
              <th className="px-5 py-2 font-semibold">Period</th><th className="px-3 py-2 font-semibold">Sessions</th>
              <th className="px-3 py-2 text-right font-semibold">Gross</th><th className="px-3 py-2 text-right font-semibold">Fee 15%</th>
              <th className="px-3 py-2 text-right font-semibold">CWT 5%</th><th className="px-3 py-2 text-right font-semibold">Net</th><th className="px-3 py-2 font-semibold">Status</th></tr></thead>
            <tbody>
              {weekRows.map((w, i) => (
                <tr key={i} className="border-t border-[color:var(--line)]">
                  <td className="px-5 py-3 tabular-nums">{w.label}</td>
                  <td className="px-3 py-3 tabular-nums">{w.sessions}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{peso(w.gross)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[color:var(--slate)]">{peso(w.fee)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[color:var(--slate)]">{peso(w.cwt)}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{peso(w.net)}</td>
                  <td className="px-3 py-3">{w.allPaid
                    ? <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-700">Paid</span>
                    : <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[12px] font-semibold text-amber-800">Scheduled</span>}</td>
                </tr>
              ))}
            </tbody></table></div>
        )}
      </div>
    </div>
  )
}
