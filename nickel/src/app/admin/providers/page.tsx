import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import AdminNav from '../AdminNav'
import ActiveToggle from './ActiveToggle'

export const metadata = { title: 'Providers' }
export const dynamic = 'force-dynamic'

const PROF: Record<string, string> = { PT: 'Physical Therapist', OT: 'Occupational Therapist', SLP: 'Speech-Language Pathologist', SPED: 'Special Education', PSYCHOLOGY: 'Psychologist', MD: 'Medical Doctor', ORTHOSIS: 'Orthosis / Prosthesis' }
const STATUS: Record<string, string> = { VERIFIED: 'bg-emerald-50 text-emerald-700', PENDING: 'bg-amber-100 text-amber-800', REJECTED: 'bg-red-50 text-red-700', UNVERIFIED: 'bg-slate-100 text-slate-600' }

export default async function AdminProviders({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (!(await isAdmin())) redirect('/admin/login')
  const { q } = await searchParams
  const query = (q ?? '').trim()

  const providers = await prisma.provider.findMany({
    where: query ? { OR: [{ firstName: { contains: query, mode: 'insensitive' } }, { lastName: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }] } : undefined,
    orderBy: [{ createdAt: 'desc' }],
    include: { _count: { select: { bookings: true } } },
  })

  return (
    <div className="animate-fade-up mx-auto max-w-5xl">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">JUO Operations · Superadmin</div>
      <h1 className="mb-4 text-[22px] font-semibold text-[color:var(--ink)]">Providers</h1>
      <AdminNav />

      <form className="mb-3" action="/admin/providers"><input name="q" defaultValue={query} className="input max-w-xs" placeholder="Search name or email…" /></form>

      <div className="card p-0">
        <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
            <th className="px-5 py-2 font-semibold">Name</th><th className="px-3 py-2 font-semibold">Profession</th><th className="px-3 py-2 font-semibold">Cities</th><th className="px-3 py-2 font-semibold">Status</th><th className="px-3 py-2 font-semibold">Rate</th><th className="px-3 py-2 font-semibold">Bookings</th><th></th></tr></thead>
          <tbody>
            {providers.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-[13px] text-[color:var(--slate)]">No providers found.</td></tr>}
            {providers.map((p) => (
              <tr key={p.id} className="border-t border-[color:var(--line)]">
                <td className="px-5 py-3">
                  <b className="text-[color:var(--ink)]">{p.firstName} {p.lastName}{p.postNominals ? `, ${p.postNominals}` : ''}</b>
                  <div className="text-[12px] text-[color:var(--muted)]">{p.email}{!p.active && <span className="ml-1 rounded bg-red-50 px-1.5 text-[11px] font-semibold text-red-700">suspended</span>}</div>
                </td>
                <td className="px-3 py-3 text-[color:var(--slate)]">{PROF[p.profession] ?? p.profession}</td>
                <td className="px-3 py-3 text-[12px] text-[color:var(--slate)]">{(p.citiesCovered ?? []).slice(0, 3).join(', ') || '—'}</td>
                <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${STATUS[p.verificationStatus] ?? ''}`}>{p.verificationStatus}</span>{p.specializedRateApproved && <span className="ml-1 rounded-full bg-[color:var(--teal-soft,#e2f5f2)] px-2 py-0.5 text-[11px] font-semibold" style={{ color: 'var(--teal,#12a594)' }}>spec ✓</span>}</td>
                <td className="px-3 py-3 tabular-nums text-[color:var(--slate)]">{p.rate != null ? `₱${Number(p.rate).toLocaleString('en-PH')}` : '—'}</td>
                <td className="px-3 py-3 tabular-nums text-[color:var(--slate)]">{p._count.bookings}</td>
                <td className="px-5 py-3"><div className="flex justify-end gap-2"><a href={`/admin/${p.id}`} className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[12.5px] font-medium text-[color:var(--slate)] hover:bg-[color:var(--mist)]">Review</a><ActiveToggle providerId={p.id} active={p.active} /></div></td>
              </tr>
            ))}
          </tbody></table></div>
      </div>
    </div>
  )
}
