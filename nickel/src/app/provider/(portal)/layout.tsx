import { redirect } from 'next/navigation'
import { getSessionProvider } from '@/lib/auth'
import ProviderNav from './ProviderNav'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const provider = await getSessionProvider()
  if (!provider) redirect('/provider/login')

  // Providers can use the whole portal while under review — they just aren't
  // shown on the marketplace or bookable until VERIFIED (enforced in the
  // patient-facing APIs). Show a status banner instead of blocking access.
  const status = provider.verificationStatus
  const banner = status === 'VERIFIED' ? null
    : status === 'PENDING'
      ? { tone: 'info', title: 'Your account is under review', body: 'You can set up your profile, availability and rates now. You’ll appear to patients and become bookable once SCEI approves you (usually 24–48 hours).', cta: 'View status' }
    : status === 'REJECTED'
      ? { tone: 'bad', title: 'Your verification needs another look', body: (provider.rejectionReason ? `${provider.rejectionReason} ` : '') + 'Please review and resubmit your documents.', cta: 'Resubmit' }
      : { tone: 'warn', title: 'Finish verifying your identity to go live', body: 'You can explore and set up your account now, but you won’t appear to patients or receive bookings until you complete identity verification.', cta: 'Verify now' }

  const toneCls: Record<string, string> = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    bad: 'border-red-200 bg-red-50 text-red-800',
  }

  return (
    <div className="animate-fade-up mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">Provider portal</div>
          <div className="text-[18px] font-semibold text-[color:var(--ink)]">
            {provider.firstName} {provider.lastName}
          </div>
        </div>
        <form action="/api/provider/logout" method="post">
          <button className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[13px] text-[color:var(--slate)] hover:bg-white">Log out</button>
        </form>
      </div>

      {banner && (
        <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${toneCls[banner.tone]}`}>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold">{banner.title}</div>
            <div className="text-[12.5px] opacity-90">{banner.body}</div>
          </div>
          <a href="/provider/verify" className="shrink-0 rounded-lg bg-[color:var(--steel)] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[color:var(--steel-deep)]">{banner.cta}</a>
        </div>
      )}

      <ProviderNav />

      <div className="mt-4">{children}</div>
    </div>
  )
}
