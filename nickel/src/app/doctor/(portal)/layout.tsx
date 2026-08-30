import { redirect } from 'next/navigation'
import { getSessionDoctor } from '@/lib/auth'
import DoctorNav from './DoctorNav'

export default async function DoctorPortalLayout({ children }: { children: React.ReactNode }) {
  const doctor = await getSessionDoctor()
  if (!doctor) redirect('/doctor/login')

  const status = doctor.verificationStatus
  const banner = status === 'VERIFIED' ? null
    : status === 'PENDING'
      ? { tone: 'info', title: 'Your account is under review', body: 'Set your consult fee and availability now. You’ll become bookable once SCEI approves you (usually 24–48 hours).' }
    : status === 'REJECTED'
      ? { tone: 'bad', title: 'Your verification needs another look', body: (doctor.rejectionReason ? `${doctor.rejectionReason} ` : '') + 'Please contact SCEI to resubmit.' }
      : { tone: 'warn', title: 'Complete your profile to go live', body: 'You won’t appear to patients or receive consults until SCEI verifies you.' }

  const toneCls: Record<string, string> = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    bad: 'border-red-200 bg-red-50 text-red-800',
  }

  return (
    <div className="animate-fade-up mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">Rehab doctor portal</div>
          <div className="text-[18px] font-semibold text-[color:var(--ink)]">Dr. {doctor.firstName} {doctor.lastName}</div>
        </div>
        <form action="/api/doctor/logout" method="post">
          <button className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[13px] text-[color:var(--slate)] hover:bg-white">Log out</button>
        </form>
      </div>

      {banner && (
        <div className={`mb-4 rounded-xl border px-4 py-3 ${toneCls[banner.tone]}`}>
          <div className="text-[13.5px] font-semibold">{banner.title}</div>
          <div className="text-[12.5px] opacity-90">{banner.body}</div>
        </div>
      )}

      <DoctorNav />
      <div className="mt-4">{children}</div>
    </div>
  )
}
