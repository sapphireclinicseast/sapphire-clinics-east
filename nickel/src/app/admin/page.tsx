import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const metadata = { title: 'Verification queue' }
export const dynamic = 'force-dynamic'

const PROF: Record<string, string> = { PT: 'Physical Therapist', OT: 'Occupational Therapist', SLP: 'Speech-Language Pathologist', SPED: 'Special Education', PSYCHOLOGY: 'Psychologist', MD: 'Medical Doctor', ORTHOSIS: 'Orthosis / Prosthesis' }
const initials = (f: string, l: string) => ((f[0] ?? '') + (l[0] ?? '')).toUpperCase()
const ago = (d: Date | null) => {
  if (!d) return '—'
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600000)
  if (h < 1) return 'just now'; if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default async function AdminQueue() {
  if (!(await isAdmin())) redirect('/admin/login')

  const [pending, recent, counts] = await Promise.all([
    prisma.provider.findMany({ where: { verificationStatus: 'PENDING' }, orderBy: { verificationSubmittedAt: 'asc' } }),
    prisma.provider.findMany({ where: { verificationStatus: { in: ['VERIFIED', 'REJECTED'] } }, orderBy: { verifiedAt: 'desc' }, take: 8 }),
    prisma.provider.groupBy({ by: ['verificationStatus'], _count: true }),
  ])
  const count = (s: string) => counts.find((c) => c.verificationStatus === s)?._count ?? 0
  const docCount = (p: { facePhoto: string | null; prcHoldingPhoto: string | null; diplomaScan: string | null; torScan: string | null }) =>
    [p.facePhoto, p.prcHoldingPhoto, p.diplomaScan, p.torScan].filter(Boolean).length

  return (
    <div className="animate-fade-up mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">SCEI Operations · Admin</div>
          <h1 className="text-[22px] font-semibold text-[color:var(--ink)]">Professionals awaiting approval</h1>
        </div>
        <div className="flex items-center gap-3">
          <a href="/admin/payouts" className="text-[13px] font-semibold text-[color:var(--steel)] hover:underline">Payouts →</a>
          <form action="/api/admin/logout" method="post"><button className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[13px] text-[color:var(--slate)] hover:bg-white">Log out</button></form>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[['Pending', count('PENDING'), 'var(--warn,#c9871a)'], ['Verified', count('VERIFIED'), 'var(--steel)'], ['Rejected', count('REJECTED'), 'var(--slate)']].map(([k, v, c]) => (
          <div key={k as string} className="card">
            <div className="text-[12px] font-semibold text-[color:var(--muted)]">{k}</div>
            <div className="mt-1 text-[26px] font-bold" style={{ color: c as string }}>{v as number}</div>
          </div>
        ))}
      </div>

      <div className="card p-0">
        <div className="flex items-center justify-between border-b border-[color:var(--line)] px-5 py-3.5">
          <b className="text-[color:var(--ink)]">Pending review</b>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[12px] font-semibold text-amber-800">{pending.length} waiting · SLA 24–48h</span>
        </div>
        {pending.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-[color:var(--slate)]">No pending applications right now.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
              <th className="px-5 py-2 font-semibold">Applicant</th><th className="px-3 py-2 font-semibold">Profession</th><th className="px-3 py-2 font-semibold">Submitted</th><th className="px-3 py-2 font-semibold">Docs</th><th className="px-3 py-2 font-semibold">Specialized?</th><th></th></tr></thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.id} className="border-t border-[color:var(--line)]">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--mist-2)] text-[12px] font-semibold text-[color:var(--steel)]">{initials(p.firstName, p.lastName)}</span>
                      <div><b className="text-[color:var(--ink)]">{p.firstName} {p.lastName}</b><div className="text-[12px] text-[color:var(--muted)]">PRC {p.prcNumber || '—'}</div></div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[color:var(--slate)]">{PROF[p.profession] ?? p.profession}</td>
                  <td className="px-3 py-3 text-[color:var(--slate)]">{ago(p.verificationSubmittedAt)}</td>
                  <td className="px-3 py-3 tabular-nums text-[color:var(--slate)]">{docCount(p)}/4</td>
                  <td className="px-3 py-3">{p.specialization ? <span className="rounded-full bg-[color:var(--teal-soft,#e2f5f2)] px-2.5 py-0.5 text-[12px] font-semibold" style={{ color: 'var(--teal,#12a594)' }}>requested</span> : <span className="text-[color:var(--muted)]">—</span>}</td>
                  <td className="px-5 py-3 text-right"><a href={`/admin/${p.id}`} className="btn-primary !px-4 !py-1.5 !text-[13px]">Review</a></td>
                </tr>
              ))}
            </tbody></table></div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="card mt-4 p-0">
          <div className="border-b border-[color:var(--line)] px-5 py-3.5"><b className="text-[color:var(--ink)]">Recently reviewed</b></div>
          <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
            <tbody>
              {recent.map((p) => (
                <tr key={p.id} className="border-t border-[color:var(--line)] first:border-t-0">
                  <td className="px-5 py-2.5"><b className="text-[color:var(--ink)]">{p.firstName} {p.lastName}</b> <span className="text-[color:var(--muted)]">· {PROF[p.profession] ?? p.profession}</span></td>
                  <td className="px-3 py-2.5">{p.verificationStatus === 'VERIFIED'
                    ? <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-700">Verified</span>
                    : <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[12px] font-semibold text-red-700">Rejected</span>}</td>
                  <td className="px-5 py-2.5 text-right"><a href={`/admin/${p.id}`} className="text-[13px] font-semibold text-[color:var(--steel)] hover:underline">Open</a></td>
                </tr>
              ))}
            </tbody></table></div>
        </div>
      )}
    </div>
  )
}
