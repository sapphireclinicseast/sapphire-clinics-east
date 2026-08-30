import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import AdminNav from '../AdminNav'

export const metadata = { title: 'Bookings' }
export const dynamic = 'force-dynamic'
const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`
const STATUS: Record<string, string> = { PENDING: 'bg-amber-100 text-amber-800', PAID: 'bg-sky-100 text-sky-800', CONFIRMED: 'bg-emerald-50 text-emerald-700', COMPLETED: 'bg-emerald-50 text-emerald-700', CANCELLED: 'bg-red-50 text-red-700' }

export default async function AdminBookings({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (!(await isAdmin())) redirect('/admin/login')
  const { status } = await searchParams
  const filter = status && status !== 'ALL' ? { status: status as never } : {}

  const bookings = await prisma.booking.findMany({
    where: filter, orderBy: [{ date: 'desc' }, { startTime: 'desc' }], take: 100,
    include: { provider: { select: { firstName: true, lastName: true } }, patient: { select: { firstName: true, lastName: true } } },
  })

  const tabs = ['ALL', 'PENDING', 'PAID', 'CONFIRMED', 'COMPLETED', 'CANCELLED']
  const cur = status || 'ALL'

  return (
    <div className="animate-fade-up mx-auto max-w-5xl">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">SCEI Operations · Superadmin</div>
      <h1 className="mb-4 text-[22px] font-semibold text-[color:var(--ink)]">Bookings</h1>
      <AdminNav />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <a key={t} href={t === 'ALL' ? '/admin/bookings' : `/admin/bookings?status=${t}`}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium ${cur === t ? 'bg-[color:var(--steel)] text-white' : 'border border-[color:var(--line-2)] text-[color:var(--slate)] hover:bg-[color:var(--mist)]'}`}>{t[0] + t.slice(1).toLowerCase()}</a>
        ))}
      </div>

      <div className="card p-0">
        <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
            <th className="px-5 py-2 font-semibold">Date</th><th className="px-3 py-2 font-semibold">Patient</th><th className="px-3 py-2 font-semibold">Therapist</th><th className="px-3 py-2 font-semibold">City</th><th className="px-3 py-2 font-semibold">Status</th><th className="px-3 py-2 text-right font-semibold">Amount</th></tr></thead>
          <tbody>
            {bookings.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-[13px] text-[color:var(--slate)]">No bookings.</td></tr>}
            {bookings.map((b) => (
              <tr key={b.id} className="border-t border-[color:var(--line)]">
                <td className="px-5 py-3 tabular-nums text-[color:var(--slate)]">{b.date.toISOString().slice(0, 10)} · {b.startTime}</td>
                <td className="px-3 py-3 text-[color:var(--ink)]">{b.patient.firstName} {b.patient.lastName}</td>
                <td className="px-3 py-3 text-[color:var(--ink)]">{b.provider.firstName} {b.provider.lastName}</td>
                <td className="px-3 py-3 text-[color:var(--slate)]">{b.city}</td>
                <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${STATUS[b.status] ?? ''}`}>{b.status}</span></td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{peso(Number(b.amount))}</td>
              </tr>
            ))}
          </tbody></table></div>
      </div>
      <p className="mt-2 text-[12px] text-[color:var(--muted)]">Showing up to 100 most recent{cur !== 'ALL' ? ` · ${cur.toLowerCase()}` : ''}.</p>
    </div>
  )
}
