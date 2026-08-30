import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import AdminNav from '../AdminNav'
import DoctorActions from './DoctorActions'
import OpenAttachment from '@/components/OpenAttachment'

export const metadata = { title: 'Doctors' }
export const dynamic = 'force-dynamic'

const STATUS: Record<string, string> = { VERIFIED: 'bg-emerald-50 text-emerald-700', PENDING: 'bg-amber-100 text-amber-800', REJECTED: 'bg-red-50 text-red-700', UNVERIFIED: 'bg-slate-100 text-slate-600' }
const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`

export default async function AdminDoctors() {
  if (!(await isAdmin())) redirect('/admin/login')
  const doctors = await prisma.doctor.findMany({ orderBy: [{ createdAt: 'desc' }], include: { _count: { select: { consults: true } } } })

  return (
    <div className="animate-fade-up mx-auto max-w-5xl">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">JUO Operations · Superadmin</div>
      <h1 className="mb-4 text-[22px] font-semibold text-[color:var(--ink)]">Rehab doctors</h1>
      <AdminNav />

      <div className="card p-0">
        <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
            <th className="px-5 py-2 font-semibold">Name</th><th className="px-3 py-2 font-semibold">Email / PRC</th><th className="px-3 py-2 font-semibold">Documents</th><th className="px-3 py-2 font-semibold">Fee</th><th className="px-3 py-2 font-semibold">Status</th><th className="px-3 py-2 font-semibold">Consults</th><th></th></tr></thead>
          <tbody>
            {doctors.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-[13px] text-[color:var(--slate)]">No doctors yet.</td></tr>}
            {doctors.map((d) => (
              <tr key={d.id} className="border-t border-[color:var(--line)]">
                <td className="px-5 py-3"><b className="text-[color:var(--ink)]">Dr. {d.firstName} {d.lastName}</b>{d.postNominals ? `, ${d.postNominals}` : ''}{!d.active && <span className="ml-2 rounded bg-red-50 px-1.5 text-[11px] font-semibold text-red-700">suspended</span>}</td>
                <td className="px-3 py-3 text-[color:var(--slate)]">{d.email}<br /><span className="text-[11px] text-[color:var(--muted)]">PRC {d.prcNumber ?? '—'}</span></td>
                <td className="px-3 py-3 text-[12px]">
                  <div className="flex flex-col gap-1">
                    {d.prcLicenseFile ? <OpenAttachment src={d.prcLicenseFile} className="text-left font-semibold text-[color:var(--steel)] hover:underline">View PRC</OpenAttachment> : <span className="text-[color:var(--muted)]">No PRC</span>}
                    {d.governmentIdFile ? <OpenAttachment src={d.governmentIdFile} className="text-left font-semibold text-[color:var(--steel)] hover:underline">View ID</OpenAttachment> : <span className="text-[color:var(--muted)]">No ID</span>}
                  </div>
                </td>
                <td className="px-3 py-3 tabular-nums">{d.consultFee != null ? peso(Number(d.consultFee)) : '—'}</td>
                <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${STATUS[d.verificationStatus]}`}>{d.verificationStatus.toLowerCase()}</span></td>
                <td className="px-3 py-3 tabular-nums">{d._count.consults}</td>
                <td className="px-5 py-3"><DoctorActions doctorId={d.id} status={d.verificationStatus} active={d.active} /></td>
              </tr>
            ))}
          </tbody></table></div>
      </div>
    </div>
  )
}
