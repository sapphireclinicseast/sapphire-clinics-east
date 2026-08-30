import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import AdminNav from '../AdminNav'

export const metadata = { title: 'Patients' }
export const dynamic = 'force-dynamic'

export default async function AdminPatients({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (!(await isAdmin())) redirect('/admin/login')
  const { q } = await searchParams
  const query = (q ?? '').trim()

  const patients = await prisma.patient.findMany({
    where: query ? { OR: [{ firstName: { contains: query, mode: 'insensitive' } }, { lastName: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }] } : undefined,
    orderBy: [{ createdAt: 'desc' }],
    include: { _count: { select: { bookings: true } } },
  })

  return (
    <div className="animate-fade-up mx-auto max-w-4xl">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">JUO Operations · Superadmin</div>
      <h1 className="mb-4 text-[22px] font-semibold text-[color:var(--ink)]">Patients</h1>
      <AdminNav />

      <form className="mb-3" action="/admin/patients"><input name="q" defaultValue={query} className="input max-w-xs" placeholder="Search name or email…" /></form>

      <div className="card p-0">
        <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
            <th className="px-5 py-2 font-semibold">Name</th><th className="px-3 py-2 font-semibold">Email</th><th className="px-3 py-2 font-semibold">Phone</th><th className="px-3 py-2 font-semibold">City</th><th className="px-3 py-2 font-semibold">Bookings</th></tr></thead>
          <tbody>
            {patients.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-[13px] text-[color:var(--slate)]">No patients found.</td></tr>}
            {patients.map((p) => (
              <tr key={p.id} className="border-t border-[color:var(--line)]">
                <td className="px-5 py-3"><b className="text-[color:var(--ink)]">{p.firstName} {p.lastName}</b></td>
                <td className="px-3 py-3 text-[color:var(--slate)]">{p.email}</td>
                <td className="px-3 py-3 text-[color:var(--slate)]">{p.phone ?? '—'}</td>
                <td className="px-3 py-3 text-[color:var(--slate)]">{p.city ?? '—'}</td>
                <td className="px-3 py-3 tabular-nums text-[color:var(--slate)]">{p._count.bookings}</td>
              </tr>
            ))}
          </tbody></table></div>
      </div>
    </div>
  )
}
