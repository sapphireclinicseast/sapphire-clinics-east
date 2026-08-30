import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeSplit } from '@/lib/earnings'
import AdminNav from '../AdminNav'

export const metadata = { title: 'Admin overview' }
export const dynamic = 'force-dynamic'
const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`

export default async function AdminOverview() {
  if (!(await isAdmin())) redirect('/admin/login')

  const [provCounts, patients, bkCounts, earnedRows, payoutAgg, pendingPayoutRows] = await Promise.all([
    prisma.provider.groupBy({ by: ['verificationStatus'], _count: true }),
    prisma.patient.count(),
    prisma.booking.groupBy({ by: ['status'], _count: true }),
    prisma.booking.findMany({ where: { status: { in: ['PAID', 'CONFIRMED', 'COMPLETED'] } }, select: { amount: true, platformFee: true, providerNet: true } }),
    prisma.payout.aggregate({ _sum: { amount: true } }),
    prisma.booking.findMany({ where: { status: { in: ['PAID', 'CONFIRMED', 'COMPLETED'] }, payoutStatus: 'PENDING' }, select: { amount: true, providerNet: true } }),
  ])
  const pc = (s: string) => provCounts.find((c) => c.verificationStatus === s)?._count ?? 0
  const bc = (s: string) => bkCounts.find((c) => c.status === s)?._count ?? 0

  let gmv = 0, fees = 0
  for (const b of earnedRows) { gmv += Number(b.amount); fees += b.platformFee != null ? Number(b.platformFee) : computeSplit(Number(b.amount)).fee }
  const paidOut = Number(payoutAgg._sum.amount ?? 0)
  const pendingPayout = pendingPayoutRows.reduce((s, b) => s + (b.providerNet != null ? Number(b.providerNet) : computeSplit(Number(b.amount)).net), 0)

  const Tile = ({ k, v, d, accent }: { k: string; v: string; d?: string; accent?: string }) => (
    <div className="card"><div className="text-[12px] font-semibold text-[color:var(--muted)]">{k}</div>
      <div className="mt-1 text-[26px] font-bold" style={{ color: accent ?? 'var(--ink)' }}>{v}</div>
      {d && <div className="text-[12px] text-[color:var(--slate)]">{d}</div>}</div>
  )

  return (
    <div className="animate-fade-up mx-auto max-w-4xl">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">SCEI Operations · Superadmin</div>
      <h1 className="mb-4 text-[22px] font-semibold text-[color:var(--ink)]">Platform overview</h1>
      <AdminNav />

      <div className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">Money</div>
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Tile k="Gross bookings (GMV)" v={peso(gmv)} accent="var(--steel)" />
        <Tile k="Platform fees (15%)" v={peso(fees)} d="SCEI + Jara share" />
        <Tile k="Paid out to providers" v={peso(paidOut)} />
        <Tile k="Pending payout" v={peso(pendingPayout)} accent="var(--warn,#c9871a)" />
      </div>

      <div className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">Professionals</div>
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Tile k="Verified" v={String(pc('VERIFIED'))} accent="var(--steel)" d="live on marketplace" />
        <Tile k="Pending review" v={String(pc('PENDING'))} accent="var(--warn,#c9871a)" />
        <Tile k="Unverified" v={String(pc('UNVERIFIED'))} />
        <Tile k="Rejected" v={String(pc('REJECTED'))} />
      </div>

      <div className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">Patients & bookings</div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile k="Patients" v={String(patients)} />
        <Tile k="Paid · awaiting" v={String(bc('PAID'))} />
        <Tile k="Confirmed" v={String(bc('CONFIRMED'))} accent="var(--steel)" />
        <Tile k="Completed" v={String(bc('COMPLETED'))} />
      </div>
    </div>
  )
}
