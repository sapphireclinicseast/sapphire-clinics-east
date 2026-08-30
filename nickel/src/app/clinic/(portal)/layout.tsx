import { redirect } from 'next/navigation'
import { getSessionClinic } from '@/lib/auth'
import ClinicNav from './ClinicNav'

export default async function ClinicPortalLayout({ children }: { children: React.ReactNode }) {
  const clinic = await getSessionClinic()
  if (!clinic) redirect('/clinic/login')

  const status = clinic.verificationStatus
  const banner = status === 'VERIFIED' ? null
    : status === 'PENDING'
      ? { tone: 'info', title: 'Your partnership is under review', body: 'We’re reviewing your business documents (usually 1–2 business days). You can add your details now; you’ll be able to onboard patients and therapists once approved.' }
    : status === 'REJECTED'
      ? { tone: 'bad', title: 'Your submission needs another look', body: (clinic.rejectionReason ? `${clinic.rejectionReason} ` : '') + 'Please review and resubmit your documents.' }
      : { tone: 'warn', title: 'Submit your business documents to get verified', body: 'Upload your registration documents so SCEI can approve your clinic partnership.' }
  const toneCls: Record<string, string> = { info: 'border-sky-200 bg-sky-50 text-sky-900', warn: 'border-amber-200 bg-amber-50 text-amber-900', bad: 'border-red-200 bg-red-50 text-red-800' }

  return (
    <div className="animate-fade-up mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">Clinic partner portal</div>
          <div className="text-[18px] font-semibold text-[color:var(--ink)]">{clinic.name}</div>
        </div>
        <form action="/api/clinic/logout" method="post"><button className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[13px] text-[color:var(--slate)] hover:bg-white">Log out</button></form>
      </div>
      {banner && (
        <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${toneCls[banner.tone]}`}>
          <div className="min-w-0 flex-1"><div className="text-[13.5px] font-semibold">{banner.title}</div><div className="text-[12.5px] opacity-90">{banner.body}</div></div>
          {status !== 'PENDING' && <a href="/clinic/verify" className="shrink-0 rounded-lg bg-[color:var(--steel)] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[color:var(--steel-deep)]">Submit documents</a>}
        </div>
      )}
      <ClinicNav />
      <div className="mt-4">{children}</div>
    </div>
  )
}
