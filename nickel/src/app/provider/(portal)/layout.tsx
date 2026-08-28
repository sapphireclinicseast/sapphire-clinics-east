import { redirect } from 'next/navigation'
import { getSessionProvider } from '@/lib/auth'
import ProviderNav from './ProviderNav'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const provider = await getSessionProvider()
  if (!provider) redirect('/provider/login')
  // Account is unusable until SCEI verifies the therapist's identity & credentials.
  if (provider.verificationStatus !== 'VERIFIED') redirect('/provider/verify')

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

      <ProviderNav />

      <div className="mt-4">{children}</div>
    </div>
  )
}
