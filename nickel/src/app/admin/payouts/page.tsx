import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PayoutButton from './PayoutButton'
import DoctorPayoutButton from './DoctorPayoutButton'
import PayoutBatch from './PayoutBatch'
import AdminNav from '../AdminNav'

export const metadata = { title: 'Payouts' }
export const dynamic = 'force-dynamic'

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`

export default async function AdminPayouts() {
  if (!(await isAdmin())) redirect('/admin/login')

  // Providers with earned, un-settled wallet balance (net released on completion).
  const providers = await prisma.provider.findMany({
    where: { walletBalance: { gt: 0 } },
    select: { id: true, firstName: true, lastName: true, walletBalance: true, bankName: true, bankAccountNo: true, gcashNumber: true, _count: { select: { bookings: { where: { status: 'COMPLETED', payoutStatus: 'PENDING' } } } } },
  })

  const rows = providers
    .map((p) => [p.id, {
      name: `${p.firstName} ${p.lastName}`,
      method: p.bankName ? `${p.bankName} •••• ${String(p.bankAccountNo ?? '').slice(-4)}` : p.gcashNumber ? `GCash •••• ${String(p.gcashNumber).slice(-4)}` : '— no payout details —',
      sessions: p._count.bookings,
      net: Number(p.walletBalance),
    }] as const)
    .sort((a, b) => b[1].net - a[1].net)
  const total = rows.reduce((s, [, r]) => s + r.net, 0)

  const recent = await prisma.payout.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { provider: { select: { firstName: true, lastName: true } }, doctor: { select: { firstName: true, lastName: true } } } })

  // Rehab doctors with earned, un-settled wallet balance.
  const doctors = await prisma.doctor.findMany({
    where: { walletBalance: { gt: 0 } },
    select: { id: true, firstName: true, lastName: true, walletBalance: true, bankName: true, bankAccountNo: true, gcashNumber: true, _count: { select: { consults: { where: { status: 'COMPLETED', payoutStatus: 'PENDING' } } } } },
  })
  const docRows = doctors
    .map((d) => [d.id, {
      name: `Dr. ${d.firstName} ${d.lastName}`,
      method: d.bankName ? `${d.bankName} •••• ${String(d.bankAccountNo ?? '').slice(-4)}` : d.gcashNumber ? `GCash •••• ${String(d.gcashNumber).slice(-4)}` : '— no payout details —',
      sessions: d._count.consults, net: Number(d.walletBalance),
    }] as const)
    .sort((a, b) => b[1].net - a[1].net)

  return (
    <div className="animate-fade-up mx-auto max-w-4xl">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">JUO Operations · Superadmin</div>
      <h1 className="mb-4 text-[22px] font-semibold text-[color:var(--ink)]">Payout run</h1>
      <AdminNav />

      <PayoutBatch />

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

      <div className="card mt-4 p-0">
        <div className="border-b border-[color:var(--line)] px-5 py-3.5"><b className="text-[color:var(--ink)]">Rehab doctors with a balance due</b></div>
        {docRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-[color:var(--slate)]">No pending doctor payouts.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
              <th className="px-5 py-2 font-semibold">Doctor</th><th className="px-3 py-2 font-semibold">Send to</th><th className="px-3 py-2 font-semibold">Consults</th><th className="px-3 py-2 text-right font-semibold">Net due</th><th></th></tr></thead>
            <tbody>
              {docRows.map(([id, r]) => (
                <tr key={id} className="border-t border-[color:var(--line)]">
                  <td className="px-5 py-3"><b className="text-[color:var(--ink)]">{r.name}</b></td>
                  <td className="px-3 py-3 text-[color:var(--slate)]">{r.method}</td>
                  <td className="px-3 py-3 tabular-nums">{r.sessions}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{peso(r.net)}</td>
                  <td className="px-5 py-3 text-right"><DoctorPayoutButton doctorId={id} amount={r.net} /></td>
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
                  <td className="px-5 py-2.5"><b className="text-[color:var(--ink)]">{p.provider ? `${p.provider.firstName} ${p.provider.lastName}` : p.doctor ? `Dr. ${p.doctor.firstName} ${p.doctor.lastName}` : '—'}</b></td>
                  <td className="px-3 py-2.5 text-[color:var(--slate)]">{p.method ?? ''}{p.reference ? ` · ${p.reference}` : ''}</td>
                  <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{p.status === 'PAID' ? 'Paid' : 'Pending'}</span></td>
                  <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{peso(Number(p.amount))}</td>
                </tr>
              ))}
            </tbody></table></div>
        </div>
      )}
    </div>
  )
}
