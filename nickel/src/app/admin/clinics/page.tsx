import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import AdminNav from '../AdminNav'
import ClinicActions from './ClinicActions'
import OpenAttachment from '@/components/OpenAttachment'

export const metadata = { title: 'Clinics' }
export const dynamic = 'force-dynamic'

const STATUS: Record<string, string> = { VERIFIED: 'bg-emerald-50 text-emerald-700', PENDING: 'bg-amber-100 text-amber-800', REJECTED: 'bg-red-50 text-red-700', UNVERIFIED: 'bg-slate-100 text-slate-600' }
const TYPE: Record<string, string> = { SOLE_PROP: 'Sole prop', PARTNERSHIP: 'Partnership', CORPORATION: 'Corporation' }

export default async function AdminClinics() {
  if (!(await isAdmin())) redirect('/admin/login')
  const clinics = await prisma.clinic.findMany({ orderBy: [{ createdAt: 'desc' }], include: { _count: { select: { patients: true, providers: true } } } })

  return (
    <div className="animate-fade-up mx-auto max-w-5xl">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">JUO Operations · Superadmin</div>
      <h1 className="mb-4 text-[22px] font-semibold text-[color:var(--ink)]">Clinic / hospital partners</h1>
      <AdminNav />
      <div className="card p-0">
        <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
            <th className="px-5 py-2 font-semibold">Clinic</th><th className="px-3 py-2 font-semibold">Type</th><th className="px-3 py-2 font-semibold">Documents</th><th className="px-3 py-2 font-semibold">People</th><th className="px-3 py-2 font-semibold">Status</th><th></th></tr></thead>
          <tbody>
            {clinics.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-[13px] text-[color:var(--slate)]">No clinic partners yet.</td></tr>}
            {clinics.map((c) => (
              <tr key={c.id} className="border-t border-[color:var(--line)] align-top">
                <td className="px-5 py-3"><b className="text-[color:var(--ink)]">{c.name}</b>{!c.active && <span className="ml-2 rounded bg-red-50 px-1.5 text-[11px] font-semibold text-red-700">suspended</span>}<div className="text-[12px] text-[color:var(--slate)]">{c.email}</div><div className="text-[11px] text-[color:var(--muted)]">{c.contactPerson ?? ''}{c.city ? ` · ${c.city}` : ''}{c.tin ? ` · TIN ${c.tin}` : ''}</div></td>
                <td className="px-3 py-3 text-[12px] text-[color:var(--slate)]">{TYPE[c.businessType] ?? c.businessType}</td>
                <td className="px-3 py-3 text-[12px]">
                  <div className="flex flex-col gap-0.5">
                    {c.secDtiFile ? <OpenAttachment src={c.secDtiFile} className="text-left font-semibold text-[color:var(--steel)] hover:underline">SEC/DTI</OpenAttachment> : <span className="text-[color:var(--muted)]">No SEC/DTI</span>}
                    {c.bir2303File ? <OpenAttachment src={c.bir2303File} className="text-left font-semibold text-[color:var(--steel)] hover:underline">BIR 2303</OpenAttachment> : <span className="text-[color:var(--muted)]">No BIR</span>}
                    {c.businessPermitFile ? <OpenAttachment src={c.businessPermitFile} className="text-left font-semibold text-[color:var(--steel)] hover:underline">Permit</OpenAttachment> : <span className="text-[color:var(--muted)]">No permit</span>}
                    {c.aoiFile && <OpenAttachment src={c.aoiFile} className="text-left font-semibold text-[color:var(--steel)] hover:underline">AOI</OpenAttachment>}
                    {c.byLawsFile && <OpenAttachment src={c.byLawsFile} className="text-left font-semibold text-[color:var(--steel)] hover:underline">By-Laws</OpenAttachment>}
                  </div>
                </td>
                <td className="px-3 py-3 text-[12px] text-[color:var(--slate)]">{c._count.patients} pt · {c._count.providers} th</td>
                <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${STATUS[c.verificationStatus]}`}>{c.verificationStatus.toLowerCase()}</span></td>
                <td className="px-5 py-3"><ClinicActions clinicId={c.id} status={c.verificationStatus} active={c.active} /></td>
              </tr>
            ))}
          </tbody></table></div>
      </div>
    </div>
  )
}
