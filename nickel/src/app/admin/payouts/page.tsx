import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeSplit } from '@/lib/earnings'
import PayoutButton from './PayoutButton'

export const metadata = { title: 'Payouts' }
export const dynamic = 'force-dynamic'

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`

export default async function AdminPayouts() {
  if (!(await isAdmin())) redirect('/admin/login')

  const due = await prisma.booking.findMany({
    where: { status: { in: ['PAID', 'CONFIRMED', 'COMPLETED'] }, payoutStatus: 'PENDING' },
    select: { providerId: true, amount: true, providerNet: true, provider: { select: { firstName: true, lastName: true, bankName: true, bankAccountNo: true, gcashNumber: true } } },
  })

  const byProvider = new Map<string, { name: string; method: string; sessions: number; net: number }>()
  for (const b of due) {
    const net = b.providerNet != null ? Number(b.providerNet) : computeSplit(Number(b.amount)).net
    const method = b.provider.bankName ? `${b.provider.bankName} •••• ${String(b.provider.bankAccountNo ?? '').slice(-4)}` : b.provider.gcashNumber ? `GCash •••• ${String(b.provider.gcashNumber).slice(-4)}` : '— no payout details —'
    const cur = byProvider.get(b.providerId) ?? { name: `${b.provider.firstName} ${b.provider.lastName}`, method, sessions: 0, net: 0 }
    cur.sessions++; cur.net += net
    byProvider.set(b.providerId, cur)
  }
  const rows = [...byProvider.entries()].sort((a, b) => b[1].net - a[1].net)
  const total = rows.reduce((s, [, r]) => s + r.net, 0)

  const recent = await prisma.payout.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { provider: { select: { firstName: true, lastName: true } } } })

  return (
    <div className="animate-fade-up mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">SCEI Operations · Admin</div>
          <h1 className="text-[22px] font-semibold text-[color:var(--ink)]">Payout run</h1>
        </div>
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-[13px] text-[color:var(--steel)] hover:underline">Queue</a>
          <form action="/api/admin/logout" method="post"><button className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[13px] text-[color:var(--slate)] hover:bg-white">Log out</button></form>
        </div>
      </div>

      <div className="card mb-4 flex items-center justify-between">
        <div><div className="text-[12px] font-semibold text-[color:var(--muted)]">Total pending payout</div><div className="mt-1 text-[26px] font-bold text-[color:var(--steel)]">{peso(total)}</div></div>
        <p className="max-w-xs text-[12px] text-[color:var(--slate)]">Payments pool in the Verdana PayMongo account. Transfer each provider&apos;s net to their bank/GCash, then mark it paid here to close the ledger.</p>
      </div>

      <div className="card p-0">
        <div className="border-b border-[color:var(--line)] px-5 py-3.5"><b className="text-[color:var(--ink)]">Providers with a balance due</b></div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-[color:var(--slate)]">No pending payouts. All caught up.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
              <th className="px-5 py-2 font-semibold">Provider</th><th className="px-3 py-2 font-semibold">Send to</th><th className="px-3 py-2 font-semibold">Sessions</th><th className="px-3 py-2 text-right font-semibold">Net due</th><th></th></tr></thead>
            <tbody>
              {rows.map(([id, r]) => (
                <tr key={id} className="border-t border-[color:var(--line)]">
                  <td className="px-5 py-3"><b className="text-[color:var(--ink)]">{r.name}</b></td>
                  <td className="px-3 py-3 text-[color:var(--slate)]">{r.method}</td>
                  <td className="px-3 py-3 tabular-nums">{r.sessions}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{peso(r.net)}</td>
                  <td className="px-5 py-3 text-right"><PayoutButton providerId={id} amount={r.net} /></td>
                </tr>
              ))}
            </tbody></table></div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="card mt-4 p-0">
          <div className="border-b border-[color:var(--line)] px-5 py-3.5"><b className="text-[color:var(--ink)]">Recent payouts</b></div>
          <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
            <tbody>
              {recent.map((p) => (
                <tr key={p.id} className="border-t border-[color:var(--line)] first:border-t-0">
                  <td className="px-5 py-2.5"><b className="text-[color:var(--ink)]">{p.provider.firstName} {p.provider.lastName}</b></td>
                  <td className="px-3 py-2.5 text-[color:var(--slate)]">{p.method ?? ''}{p.reference ? ` · ${p.reference}` : ''}</td>
                  <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{peso(Number(p.amount))}</td>
                </tr>
              ))}
            </tbody></table></div>
        </div>
      )}
    </div>
  )
}
